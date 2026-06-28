// Stages the @microwebstacks/md-render engine package from this repo.
//
// Assembles the runtime files the VS Code extension needs (config, server,
// scripts, built SSR output) plus a generated package.json into a staging
// directory, without moving any source files. Native modules and dist/ are
// produced by `pnpm build`; this script validates the build then copies it.
//
// Usage:
//   node scripts/stage-engine.js [--out <dir>] [--version <semver>]
// Defaults: --out packages/md-render, --version from root package.json version.

import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const PACKAGE_NAME = '@microwebstacks/md-render';
// Runtime files the engine needs to collect, render, and serve docs.
const RUNTIME_PATHS = ['config.js', 'server', 'scripts', 'dist'];
// Dependencies that only matter to repo tooling, not the runtime engine.
const EXCLUDED_DEPS = new Set([]);

function parseArgs(argv) {
  const args = {out: path.join('packages', 'md-render'), version: null};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') {
      args.out = argv[++i];
    } else if (argv[i] === '--version') {
      args.version = argv[++i];
    }
  }
  return args;
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
    await fsp.cp(from, path.join(outDir, rel), {recursive: true});
  }

  const dependencies = {};
  for (const [name, range] of Object.entries(rootPkg.dependencies ?? {})) {
    if (EXCLUDED_DEPS.has(name)) {
      continue;
    }
    dependencies[name] = range;
  }

  const enginePkg = {
    name: PACKAGE_NAME,
    version,
    description: 'Markdown documentation rendering engine for the MicroWebStacks Docs Preview extension.',
    type: 'module',
    private: false,
    license: rootPkg.license ?? 'UNLICENSED',
    files: RUNTIME_PATHS,
    dependencies,
    engines: {node: '>=18'}
  };
  await fsp.writeFile(path.join(outDir, 'package.json'), `${JSON.stringify(enginePkg, null, 2)}\n`, 'utf8');

  console.log(`Staged ${PACKAGE_NAME}@${version} -> ${outDir}`);

  const localDeps = Object.entries(dependencies).filter(([, range]) => /^(\.|file:|link:)/.test(String(range)));
  if (localDeps.length > 0) {
    console.warn('\nWARNING: local-path dependencies cannot be published to npm as-is:');
    for (const [name, range] of localDeps) {
      console.warn(`  - ${name}: ${range}  (publish or vendor before "npm publish")`);
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
