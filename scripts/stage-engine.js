// Stages the @microwebstacks/md-render engine package from this repo.
//
// Assembles the runtime files the VS Code extension needs (config, server,
// scripts, built SSR output) plus a generated package.json into a staging
// directory, without moving any source files. Native modules and dist/ are
// produced by `pnpm build`; this script validates the build then copies it.
//
// Also vendors the package's production dependency tree into the staged
// output (see vendorDependencies below), so the VS Code extension can install
// the published tarball with a plain HTTPS fetch instead of running npm
// (plans/2026-07/05/vscode-node-free-bootstrap OP-002). Pass --no-vendor to
// skip this and stage a source-only package instead (npm's packer runs a real
// dependency install; this needs npm on PATH here on the maintainer's
// machine, same as `pnpm build` already does).
//
// Usage:
//   node scripts/stage-engine.js [--out <dir>] [--version <semver>] [--no-vendor]
// Defaults: --out packages/md-render, --version from root package.json version.

import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

import {buildArtifactMetadata, formatBuildMetadata, writeBuildMetadata} from './build-metadata.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const PACKAGE_NAME = '@microwebstacks/md-render';
// npm's packer (npm-packlist) always excludes any directory literally named
// "node_modules" from a published tarball, even when listed in "files". To
// ship a self-contained install, the vendored tree is materialized as
// node_modules and then renamed to this name before packing; the extension's
// installer renames it back after extracting (see extension.js installEngine).
const VENDOR_DIR_NAME = '_modules';
// Runtime files the lite engine needs to collect, render, and serve docs,
// plus (bin, src/pages, src/layout, src/components, the two static astro
// configs, tsconfig.json) what `md-render build` needs to run a fresh `astro
// build` against a consumer's own content from the published package
// (specification/reusable-render/spec.md). astro.config.mjs (the Node-adapter
// SSR config) is deliberately not staged: the extension only ever runs
// prebuilt `dist/`, and the render command is fixed to output=static.
//
// `public/` is deliberately NOT here. It belongs to the workspace, not the
// engine (specification/engine-profiles/spec.md, "Artifact ownership"), and
// astro.config.shared.mjs now resolves publicDir against workspaceRoot. Staging
// it is what put 86.8 MB of one content set's images into the 0.0.20 tarball -
// twice, since `dist/client` is a copy of it - and got the publish rejected.
const RUNTIME_PATHS = [
  'CHANGELOG.md',
  'config.js',
  'server',
  'scripts',
  'bin',
  'src/libs',
  'src/assets',
  'src/pages',
  'src/layout',
  'src/components',
  'astro.config.shared.mjs',
  'astro.config.static.mjs',
  'tsconfig.json',
  'dist'
];
// Upper bound on the staged tree, checked before the tarball is ever offered to
// npm. Every other check in this pipeline is a lower bound ("these files must
// be present"), which is why 181 MB of stowaway content passed staging and
// packaging clean and only failed at the registry PUT - after a full build and
// a spent OTP. Sized off the published baselines: 0.0.19 staged ~404 MB and
// published fine, 0.0.20 reached 602 MB and was rejected E413. This is a
// tripwire for content leaking back in, not a budget to tune against; if a real
// dependency pushes the engine past it, raise it deliberately in the same
// commit that adds the dependency.
const MAX_STAGED_MB = 460;
// Dependencies that only matter to full-site fetch/auth or native paths that
// neither the extension (DOCS_PROFILE=lite + DOCS_BACKEND=json) nor the
// render command (DOCS_PROFILE=full + DOCS_BACKEND=json, per OP-008) exercise
// at collect/diagrams/astro-build time.
//
// '@google/model-viewer' is NOT in this set, even though the extension never
// uses it: Link.astro/Code.astro import ModelViewer(Code).astro
// unconditionally, so Vite's client-script bundling pulls in
// '@google/model-viewer' for *every* full-profile static build regardless of
// whether any actual content embeds a 3D model - it is not an optional,
// content-gated dependency like the ones below. Its own `three` peer
// dependency is left out of our declared deps (npm's default peer-dep
// auto-install resolves a compatible version on demand) rather than pinned
// here, since our own `three` range is older than what model-viewer expects.
//
// 'xlsx' is NOT in this set either, for the same structural reason: Link.astro
// imports TableXLSX.astro unconditionally and Vite leaves `xlsx` external in
// the SSR build, so the prebuilt `dist/server` chunk that carries every page's
// footer does `import {read, utils} from 'xlsx'` at load time. Both the
// extension preview (which now renders workbook tables in lite too) and a
// fresh `md-render build` need it resolvable.
const EXCLUDED_DEPS = new Set([
  '@octokit/rest',
  'adm-zip',
  'better-sqlite3',
  'express-session',
  'passport',
  'passport-github',
  'sharp',
  'three'
]);
// content-structure lives in this repo as a private workspace package
// (packages/content-structure, adopted per
// plans/2026-07/13/extension-performance OP-003) and is never published, so
// npm cannot resolve it during vendoring. It is dropped from the staged
// dependency list, its own runtime dependencies are merged in instead, and
// the vendor step copies the workspace source into the vendored modules tree.
const WORKSPACE_LIB_NAME = 'content-structure';
const WORKSPACE_LIB_DIR = path.join('packages', 'content-structure');

function parseArgs(argv) {
  const args = {out: path.join('packages', 'md-render'), version: null, vendor: true};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') {
      args.out = argv[++i];
    } else if (argv[i] === '--version') {
      args.version = argv[++i];
    } else if (argv[i] === '--no-vendor') {
      args.vendor = false;
    }
  }
  return args;
}

// Installs the package's own `dependencies` with a real npm (available on the
// maintainer's machine, same requirement `pnpm build` already has) and hides
// the result from npm's packer under VENDOR_DIR_NAME. Uses npm rather than
// pnpm/the workspace install so the result is a flat, non-symlinked tree -
// pnpm's node_modules are symlinks into a local content-addressable store,
// which would not survive being packed into a tarball and unpacked elsewhere.
function vendorDependencies(outDir) {
  console.log(`\nVendoring production dependencies into ${outDir} (npm install)...`);
  const result = spawnSync('npm', ['install', '--omit=dev', '--omit=optional', '--no-audit', '--no-fund', '--no-package-lock'], {
    cwd: outDir,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (result.status !== 0) {
    throw new Error('npm install failed while vendoring dependencies for the published engine package.');
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A node_modules tree that npm install just finished writing is briefly held
// open on Windows (Defender/indexer scanning the new files), which fails the
// immediately-following rename with EPERM. Same class of transient lock as
// the engine-cleanup EBUSY fixed in extension.js; retrying a few times with a
// short backoff clears it without needing an AV exclusion.
async function retryFsOp(op, {attempts = 6, delayMs = 500} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await op();
    } catch (error) {
      const retryable = error.code === 'EPERM' || error.code === 'EBUSY';
      if (!retryable || attempt === attempts) {
        throw error;
      }
      console.warn(`  ${error.code} (attempt ${attempt}/${attempts}), retrying in ${delayMs}ms...`);
      await sleep(delayMs);
    }
  }
}

async function hideVendoredModules(outDir) {
  const nodeModules = path.join(outDir, 'node_modules');
  if (!fs.existsSync(nodeModules)) {
    throw new Error(`Expected ${nodeModules} after npm install; nothing to vendor.`);
  }
  const vendored = path.join(outDir, VENDOR_DIR_NAME);
  await retryFsOp(() => fsp.rm(vendored, {recursive: true, force: true}));
  await retryFsOp(() => fsp.rename(nodeModules, vendored));
}

// Copies the workspace-local content-structure package into the vendored
// modules tree, where Node resolution finds it after the extension's
// installer renames _modules back to node_modules. The package's own
// node_modules (pnpm symlinks) is skipped; its runtime deps are flat in the
// vendored tree already (merged into the staged dependency list).
async function vendorWorkspaceLib(outDir) {
  const from = path.join(repoRoot, WORKSPACE_LIB_DIR);
  const to = path.join(outDir, VENDOR_DIR_NAME, WORKSPACE_LIB_NAME);
  await retryFsOp(() => fsp.rm(to, {recursive: true, force: true}));
  await fsp.cp(from, to, {
    recursive: true,
    filter: (src) => !src.split(path.sep).includes('node_modules')
  });
}

async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'));
}

async function measureTree(dir) {
  let bytes = 0;
  let files = 0;
  for (const entry of await fsp.readdir(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await measureTree(full);
      bytes += nested.bytes;
      files += nested.files;
    } else if (entry.isFile()) {
      bytes += (await fsp.stat(full)).size;
      files += 1;
    }
  }
  return {bytes, files};
}

// Fails staging when the tree exceeds MAX_STAGED_MB. The residual leak path
// this guards: `dist/client` is a copy of whatever publicDir held at build
// time, so staging a `pnpm build` that ran against a populated workspace (as
// opposed to the empty root scripts/release-engine.js forces) would pull that
// workspace's assets back in through dist/ even now that public/ is unstaged.
async function assertStagedSizeWithinBudget(outDir) {
  const {bytes, files} = await measureTree(outDir);
  const mb = bytes / (1024 * 1024);
  console.log(`Staged tree: ${mb.toFixed(1)} MB across ${files} files (budget ${MAX_STAGED_MB} MB).`);
  if (mb <= MAX_STAGED_MB) {
    return;
  }

  const client = path.join(outDir, 'dist', 'client');
  const offenders = [];
  if (fs.existsSync(client)) {
    for (const entry of await fsp.readdir(client, {withFileTypes: true})) {
      if (!entry.isDirectory() || entry.name === '_astro') {
        continue;
      }
      const {bytes: size} = await measureTree(path.join(client, entry.name));
      if (size > 1024 * 1024) {
        offenders.push(`dist/client/${entry.name} (${(size / (1024 * 1024)).toFixed(1)} MB)`);
      }
    }
  }

  throw new Error(
    `Staged engine is ${mb.toFixed(1)} MB, over the ${MAX_STAGED_MB} MB budget.\n` +
    (offenders.length > 0
      ? `Workspace content appears to have been built into dist/: ${offenders.join(', ')}.\n` +
        'Rebuild against an empty workspace root (scripts/release-engine.js does this) before staging.\n'
      : 'Check what grew before publishing; npm rejects oversized tarballs at PUT time.\n')
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootPkg = await readJson(path.join(repoRoot, 'package.json'));
  const version = args.version ?? rootPkg.version ?? '0.0.0';
  const outDir = path.isAbsolute(args.out) ? args.out : path.join(repoRoot, args.out);

  const entryPath = path.join(repoRoot, 'dist', 'server', 'entry.mjs');
  if (!fs.existsSync(entryPath)) {
    throw new Error(`Missing Astro SSR build at ${entryPath}. Run "pnpm build" before staging the engine.`);
  }

  await fsp.rm(outDir, {recursive: true, force: true});
  await fsp.mkdir(outDir, {recursive: true});

  for (const rel of RUNTIME_PATHS) {
    const from = path.join(repoRoot, rel);
    if (!fs.existsSync(from)) {
      throw new Error(`Required runtime path is missing: ${from}`);
    }
    await fsp.mkdir(path.dirname(path.join(outDir, rel)), {recursive: true});
    await fsp.cp(from, path.join(outDir, rel), {recursive: true});
  }

  const libPkg = await readJson(path.join(repoRoot, WORKSPACE_LIB_DIR, 'package.json'));
  const dependencies = {};
  for (const [name, range] of Object.entries(rootPkg.dependencies ?? {})) {
    if (EXCLUDED_DEPS.has(name) || name === WORKSPACE_LIB_NAME) {
      continue;
    }
    dependencies[name] = range;
  }
  // The workspace lib's runtime deps must be installable from the registry in
  // its place (its optionalDependencies stay excluded, same as the root's).
  for (const [name, range] of Object.entries(libPkg.dependencies ?? {})) {
    if (EXCLUDED_DEPS.has(name) || dependencies[name]) {
      continue;
    }
    dependencies[name] = range;
  }

  const stagedFiles = args.vendor
    ? [...RUNTIME_PATHS, 'build-meta.json', VENDOR_DIR_NAME]
    : [...RUNTIME_PATHS, 'build-meta.json'];

  const enginePkg = {
    name: PACKAGE_NAME,
    version,
    description: 'Markdown documentation rendering engine for MicroWebStacks sites and Docs Preview.',
    type: 'module',
    private: false,
    license: rootPkg.license ?? 'UNLICENSED',
    files: stagedFiles,
    bin: {'md-render': 'bin/md-render.js'},
    dependencies,
    engines: {node: '>=22'},
    // Tells the VS Code extension's installer (extension.js installEngine)
    // this tarball has its production dependencies vendored under this name
    // and can be installed with a plain HTTPS fetch, no npm required.
    ...(args.vendor ? {vendoredModulesDir: VENDOR_DIR_NAME} : {})
  };
  const buildMetadata = buildArtifactMetadata({
    repoRoot,
    kind: 'engine',
    version
  });
  enginePkg.buildMetadata = buildMetadata;
  await fsp.writeFile(path.join(outDir, 'package.json'), `${JSON.stringify(enginePkg, null, 2)}\n`, 'utf8');
  await writeBuildMetadata(path.join(outDir, 'build-meta.json'), buildMetadata);

  console.log(`Staged ${PACKAGE_NAME}@${version} -> ${outDir}`);
  console.log(`Build stamp: ${formatBuildMetadata(buildMetadata)}`);

  const localDeps = Object.entries(dependencies).filter(([, range]) => /^(\.|file:|link:)/.test(String(range)));
  if (localDeps.length > 0) {
    console.warn('\nWARNING: local-path dependencies cannot be published to npm as-is:');
    for (const [name, range] of localDeps) {
      console.warn(`  - ${name}: ${range}  (publish or vendor before "npm publish")`);
    }
  }

  if (args.vendor) {
    vendorDependencies(outDir);
    await hideVendoredModules(outDir);
    await vendorWorkspaceLib(outDir);
    console.log(`Vendored dependencies (incl. workspace ${WORKSPACE_LIB_NAME}) into ${path.join(outDir, VENDOR_DIR_NAME)}.`);
    await assertStagedSizeWithinBudget(outDir);
  } else {
    console.warn(`\nWARNING: --no-vendor output does not include ${WORKSPACE_LIB_NAME}; it is a workspace-local package (${WORKSPACE_LIB_DIR}) not on the registry — provide it manually before installing.`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
