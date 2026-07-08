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
// (plans/2026-07/05-vscode-node-free-bootstrap OP-002). Pass --no-vendor to
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
// Runtime files the lite engine needs to collect, render, and serve docs.
const RUNTIME_PATHS = ['config.js', 'server', 'scripts', 'src/libs', 'src/assets', 'dist'];
// Dependencies that only matter to full-site, fetch/auth, native, or heavy
// client paths. The VS Code engine runs DOCS_PROFILE=lite + DOCS_BACKEND=json.
const EXCLUDED_DEPS = new Set([
  '@google/model-viewer',
  '@octokit/rest',
  'adm-zip',
  'better-sqlite3',
  'express-session',
  'passport',
  'passport-github',
  'sharp',
  'three',
  'xlsx'
]);

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

async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'));
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

  const dependencies = {};
  for (const [name, range] of Object.entries(rootPkg.dependencies ?? {})) {
    if (EXCLUDED_DEPS.has(name)) {
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
    description: 'Markdown documentation rendering engine for the MicroWebStacks Docs Preview extension.',
    type: 'module',
    private: false,
    license: rootPkg.license ?? 'UNLICENSED',
    files: stagedFiles,
    dependencies,
    engines: {node: '>=18'},
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
    console.log(`Vendored dependencies into ${path.join(outDir, VENDOR_DIR_NAME)}.`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
