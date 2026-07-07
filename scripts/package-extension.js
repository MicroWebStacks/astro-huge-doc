import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import AdmZip from 'adm-zip';

import {buildArtifactMetadata, formatBuildMetadata, writeBuildMetadata} from './build-metadata.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const extSourceDir = path.join(repoRoot, 'packages', 'vscode-extension');
const defaultVsixPath = path.join(extSourceDir, 'markdown-site-preview.vsix');
const VSIX_NAME = 'markdown-site-preview.vsix';
const BUNDLED_ENGINE_DIR = 'bundled-engine';
const AUTO_STAGE_PREFIX = 'mws-extension-package-';

function parseArgs(argv) {
  const args = {
    out: null,
    vsix: defaultVsixPath,
    stageOnly: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') {
      args.out = argv[++i];
    } else if (argv[i] === '--vsix') {
      args.vsix = argv[++i];
    } else if (argv[i] === '--stage-only') {
      args.stageOnly = true;
    }
  }
  return args;
}

function run(command, cliArgs, options = {}) {
  console.log(`\n> ${command} ${cliArgs.join(' ')}`);
  const result = spawnSync(command, cliArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`command failed: ${command} ${cliArgs.join(' ')}`);
  }
}

async function resolveStageDir(outArg) {
  if (outArg) {
    return {
      stageDir: path.isAbsolute(outArg) ? outArg : path.join(repoRoot, outArg),
      cleanupWhenDone: false
    };
  }

  return {
    stageDir: await fsp.mkdtemp(path.join(os.tmpdir(), AUTO_STAGE_PREFIX)),
    cleanupWhenDone: true
  };
}

async function copyExtensionSource(stageDir) {
  await fsp.rm(stageDir, {recursive: true, force: true});
  await fsp.mkdir(stageDir, {recursive: true});
  await fsp.cp(extSourceDir, stageDir, {
    recursive: true,
    filter: (source) => path.basename(source) !== VSIX_NAME
  });
}

async function injectBuildMetadata(stageDir) {
  const pkgPath = path.join(stageDir, 'package.json');
  const pkg = JSON.parse(await fsp.readFile(pkgPath, 'utf8'));
  const metadata = buildArtifactMetadata({
    repoRoot,
    kind: 'vscode-extension',
    version: pkg.version,
    engineVersion: pkg.engineVersion
  });

  pkg.buildMetadata = metadata;
  await fsp.writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  await writeBuildMetadata(path.join(stageDir, 'build-meta.json'), metadata);

  return {pkg, metadata};
}

function stageBundledEngine(stageDir, engineVersion) {
  const bundledDir = path.join(stageDir, BUNDLED_ENGINE_DIR);
  run(process.execPath, [path.join('scripts', 'stage-engine.js'), '--out', bundledDir, '--version', engineVersion], {
    cwd: repoRoot,
    shell: false
  });
}

function verifyVsixBundledEngine(vsixPath) {
  const zip = new AdmZip(vsixPath);
  const entryNames = zip.getEntries().map((entry) => entry.entryName.replace(/\\/g, '/'));
  const packageEntry = `extension/${BUNDLED_ENGINE_DIR}/package.json`;
  const vendoredPrefix = `extension/${BUNDLED_ENGINE_DIR}/_modules/`;
  const vendoredEntries = entryNames.filter((entry) => entry.startsWith(vendoredPrefix)).length;

  if (!entryNames.includes(packageEntry) || vendoredEntries === 0) {
    throw new Error(
      `VSIX at ${vsixPath} is missing the bundled engine payload. ` +
      'Packaging must include extension/bundled-engine/package.json and vendored _modules entries.'
    );
  }

  console.log(`Verified bundled engine payload in ${vsixPath} (${vendoredEntries} vendored entries).`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const {stageDir, cleanupWhenDone} = await resolveStageDir(args.out);
  const vsixPath = path.isAbsolute(args.vsix) ? args.vsix : path.join(repoRoot, args.vsix);

  if (!fs.existsSync(path.join(extSourceDir, 'package.json'))) {
    throw new Error(`Missing extension source at ${extSourceDir}`);
  }

  try {
    await copyExtensionSource(stageDir);
    const {pkg, metadata} = await injectBuildMetadata(stageDir);
    stageBundledEngine(stageDir, pkg.engineVersion);

    console.log(`Staged ${pkg.publisher}.${pkg.name} in ${stageDir}`);
    console.log(`Build stamp: ${formatBuildMetadata(metadata)}`);

    if (args.stageOnly) {
      return;
    }

    await fsp.mkdir(path.dirname(vsixPath), {recursive: true});
    run('npm', ['exec', '--yes', '@vscode/vsce', '--', 'package', '--no-dependencies', '-o', vsixPath], {
      cwd: stageDir
    });
    verifyVsixBundledEngine(vsixPath);

    console.log(`\nWrote ${vsixPath}`);
  } finally {
    if (cleanupWhenDone && !args.stageOnly) {
      await fsp.rm(stageDir, {recursive: true, force: true});
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
