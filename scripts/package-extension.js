import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import zlib from 'node:zlib';
import AdmZip from 'adm-zip';

import {buildArtifactMetadata, formatBuildMetadata, writeBuildMetadata} from './build-metadata.js';
import {parseTarEntries} from './lib/tar-entries.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const extSourceDir = path.join(repoRoot, 'packages', 'vscode-extension');
const defaultVsixPath = path.join(extSourceDir, 'markdown-site-preview.vsix');
const VSIX_NAME = 'markdown-site-preview.vsix';
const BUNDLED_ENGINE_DIR = 'bundled-engine';
const AUTO_STAGE_PREFIX = 'mws-extension-package-';
const ENGINE_PACKAGE_NAME = '@microwebstacks/md-render';
// Matches scripts/stage-engine.js's VENDOR_DIR_NAME - the name the vendored
// node_modules tree is disguised as inside the packed tarball.
const VENDOR_DIR_NAME = '_modules';
const BUNDLED_MANIFEST_FILE = 'manifest.json';
const BUNDLED_TARBALL_FILE = 'engine.tgz';
const BUNDLED_MANIFEST_SCHEMA_VERSION = 1;
// Below this many package/_modules/* file entries, the nested tarball's
// vendored dependency tree is considered suspiciously thin rather than a
// real production install (the real tree runs in the tens of thousands).
const MIN_VENDORED_ENTRIES = 50;
// Files the bundled engine must contain for the runtime to function; see
// AD-004 in plans/2026-07/09/vsix-packaging-performance/plan.md.
const REQUIRED_TARBALL_PATHS = [
  'package/package.json',
  'package/build-meta.json',
  'package/config.js',
  'package/server/server.js',
  'package/scripts/collect.js',
  'package/dist/server/entry.mjs'
];

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A directory npm/node just finished writing into can be briefly held open
// on Windows (Defender/indexer scanning the new files) - same class of
// transient lock as scripts/stage-engine.js's own vendoring-time EPERM.
// Best-effort: retries, then warns and leaves the temp dir behind rather than
// letting a leftover OS-temp folder mask a real packaging error via a thrown
// `finally`.
async function bestEffortRm(target, {attempts = 6, delayMs = 500} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await fsp.rm(target, {recursive: true, force: true});
      return;
    } catch (error) {
      const retryable = error.code === 'EPERM' || error.code === 'EBUSY';
      if (!retryable || attempt === attempts) {
        console.warn(`Could not remove temporary directory ${target} (${error.message}); leaving it for manual cleanup.`);
        return;
      }
      await sleep(delayMs);
    }
  }
}

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Verifies the exact bytes of a nested engine.tgz against its manifest: size,
// digest, and the tarball's own contents (required runtime files, a
// non-trivial vendored dependency tree, and matching package metadata). Used
// both right after packing (stage-time) and against the bytes actually
// extracted from the final VSIX (AD-004), so a corrupt archive write can't
// slip through undetected in either direction.
function verifyEngineTarballBytes(tarballBytes, manifest, {label}) {
  if (tarballBytes.length !== manifest.byteLength) {
    throw new Error(`${label}: engine.tgz is ${tarballBytes.length} bytes but the manifest expects ${manifest.byteLength}.`);
  }
  const actualDigest = sha256Hex(tarballBytes);
  if (actualDigest !== manifest.sha256) {
    throw new Error(`${label}: engine.tgz failed digest verification (expected ${manifest.sha256}, got ${actualDigest}).`);
  }

  let tarBuffer;
  try {
    tarBuffer = zlib.gunzipSync(tarballBytes);
  } catch (error) {
    throw new Error(`${label}: engine.tgz is not valid gzip data (${error.message}).`);
  }
  const entries = parseTarEntries(tarBuffer);
  const fileNames = new Set(entries.filter((entry) => entry.type === 'file').map((entry) => entry.name));

  const missing = REQUIRED_TARBALL_PATHS.filter((required) => !fileNames.has(required));
  if (missing.length > 0) {
    throw new Error(`${label}: engine.tgz is missing required paths: ${missing.join(', ')}.`);
  }

  const vendoredEntryCount = entries.filter(
    (entry) => entry.type === 'file' && entry.name.startsWith(`package/${VENDOR_DIR_NAME}/`)
  ).length;
  if (vendoredEntryCount < MIN_VENDORED_ENTRIES) {
    throw new Error(
      `${label}: engine.tgz has only ${vendoredEntryCount} package/${VENDOR_DIR_NAME}/ file entries ` +
      `(expected a non-trivial vendored dependency tree, >= ${MIN_VENDORED_ENTRIES}).`
    );
  }

  const packageJsonEntry = entries.find((entry) => entry.name === 'package/package.json');
  const packageJson = JSON.parse(packageJsonEntry.data.toString('utf8'));
  if (packageJson.name !== manifest.package) {
    throw new Error(`${label}: nested package.json name "${packageJson.name}" does not match manifest package "${manifest.package}".`);
  }
  if (packageJson.version !== manifest.version) {
    throw new Error(`${label}: nested package.json version "${packageJson.version}" does not match manifest version "${manifest.version}".`);
  }
  if (packageJson.vendoredModulesDir !== VENDOR_DIR_NAME) {
    throw new Error(`${label}: nested package.json vendoredModulesDir is "${packageJson.vendoredModulesDir}", expected "${VENDOR_DIR_NAME}".`);
  }

  return {vendoredEntryCount, packageJson};
}

// Stages the engine (scripts/stage-engine.js) into a throwaway source
// directory, packs it with `npm pack` (AD-002: written outside that source
// directory, then normalized to engine.tgz), and writes the two-file
// bundled-engine payload (AD-001) into the staged extension. Records stage
// timings into `timings` for the packaging report.
async function packBundledEngine(stageDir, engineVersion, timings) {
  const bundledDir = path.join(stageDir, BUNDLED_ENGINE_DIR);
  await fsp.mkdir(bundledDir, {recursive: true});

  const engineSrcDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mws-engine-src-'));
  const packOutDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mws-engine-pack-'));
  try {
    let start = Date.now();
    run(process.execPath, [path.join('scripts', 'stage-engine.js'), '--out', engineSrcDir, '--version', engineVersion], {
      cwd: repoRoot,
      shell: false
    });
    timings.stageEngineMs = Date.now() - start;

    const enginePkg = JSON.parse(await fsp.readFile(path.join(engineSrcDir, 'package.json'), 'utf8'));

    start = Date.now();
    // Deliberately not `--json`, and --loglevel=error to suppress npm's
    // per-packed-file "npm notice" listing: for a vendored tree this size
    // (tens of thousands of files), that listing is large enough to overflow
    // spawnSync's default 1MB stdout/stderr maxBuffer, which silently
    // truncates and corrupts error reporting. Plain `npm pack` at error
    // log-level prints just the resulting filename as its stdout output.
    const packResult = spawnSync('npm', ['pack', '--loglevel=error', '--pack-destination', packOutDir], {
      cwd: engineSrcDir,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      maxBuffer: 64 * 1024 * 1024
    });
    if (packResult.status !== 0) {
      throw new Error(`npm pack failed: ${packResult.stderr || packResult.stdout}`);
    }
    timings.npmPackMs = Date.now() - start;

    const packedFilename = packResult.stdout.trim().split(/\r?\n/).pop();
    const tarballBytes = await fsp.readFile(path.join(packOutDir, packedFilename));

    const manifest = {
      schemaVersion: BUNDLED_MANIFEST_SCHEMA_VERSION,
      package: enginePkg.name,
      version: enginePkg.version,
      tarball: BUNDLED_TARBALL_FILE,
      byteLength: tarballBytes.length,
      sha256: sha256Hex(tarballBytes)
    };

    await fsp.writeFile(path.join(bundledDir, BUNDLED_TARBALL_FILE), tarballBytes);
    await fsp.writeFile(path.join(bundledDir, BUNDLED_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    const bundledDirEntries = (await fsp.readdir(bundledDir)).sort();
    const expectedEntries = [BUNDLED_MANIFEST_FILE, BUNDLED_TARBALL_FILE].sort();
    if (bundledDirEntries.length !== expectedEntries.length || bundledDirEntries.some((entry, i) => entry !== expectedEntries[i])) {
      throw new Error(`Staged bundled-engine payload at ${bundledDir} is not the expected two-file layout (got: ${bundledDirEntries.join(', ')}).`);
    }

    verifyEngineTarballBytes(tarballBytes, manifest, {label: 'stage-time nested tarball'});

    return manifest;
  } finally {
    await bestEffortRm(engineSrcDir);
    await bestEffortRm(packOutDir);
  }
}

// AD-004: verify the completed .vsix itself, not the staging tree - parses
// the manifest, checks the nested tarball's exact bytes against it, and
// reports the counts that prove the file-count reduction actually shipped.
function verifyVsixBundledEngine(vsixPath) {
  const zip = new AdmZip(vsixPath);
  const entries = zip.getEntries();
  const entryNames = entries.map((entry) => entry.entryName.replace(/\\/g, '/'));
  const bundledPrefix = `extension/${BUNDLED_ENGINE_DIR}/`;
  const manifestEntryName = `${bundledPrefix}${BUNDLED_MANIFEST_FILE}`;
  const tarballEntryName = `${bundledPrefix}${BUNDLED_TARBALL_FILE}`;

  if (!entryNames.includes(manifestEntryName) || !entryNames.includes(tarballEntryName)) {
    throw new Error(
      `VSIX at ${vsixPath} is missing the bundled engine payload. ` +
      `Packaging must include ${manifestEntryName} and ${tarballEntryName}.`
    );
  }

  const looseTrees = [VENDOR_DIR_NAME, 'dist', 'server', 'scripts', 'src'];
  const looseEntries = entryNames.filter(
    (name) => name.startsWith(bundledPrefix) && looseTrees.some((tree) => name.startsWith(`${bundledPrefix}${tree}/`))
  );
  if (looseEntries.length > 0) {
    throw new Error(
      `VSIX at ${vsixPath} still contains loose bundled-engine payload entries (e.g. ${looseEntries[0]}); ` +
      `expected only ${BUNDLED_MANIFEST_FILE} and ${BUNDLED_TARBALL_FILE}.`
    );
  }

  const manifestEntry = entries.find((entry) => entry.entryName.replace(/\\/g, '/') === manifestEntryName);
  let manifest;
  try {
    manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
  } catch (error) {
    throw new Error(`VSIX at ${vsixPath}: ${manifestEntryName} does not parse as JSON (${error.message}).`);
  }
  if (
    manifest.schemaVersion !== BUNDLED_MANIFEST_SCHEMA_VERSION ||
    manifest.package !== ENGINE_PACKAGE_NAME ||
    !manifest.version ||
    manifest.tarball !== BUNDLED_TARBALL_FILE ||
    typeof manifest.byteLength !== 'number' ||
    !manifest.sha256
  ) {
    throw new Error(`VSIX at ${vsixPath}: ${manifestEntryName} does not name the expected package/version/tarball.`);
  }

  const tarballEntry = entries.find((entry) => entry.entryName.replace(/\\/g, '/') === tarballEntryName);
  const tarballBytes = tarballEntry.getData();
  const {vendoredEntryCount} = verifyEngineTarballBytes(tarballBytes, manifest, {label: `${vsixPath} (${tarballEntryName})`});

  const bundledEngineEntryCount = entryNames.filter((name) => name.startsWith(bundledPrefix)).length;
  const result = {
    totalVsixEntries: entryNames.length,
    bundledEngineEntryCount,
    tarballByteLength: tarballBytes.length,
    vendoredEntryCount
  };
  console.log(
    `Verified bundled engine payload in ${vsixPath}: ${result.bundledEngineEntryCount} bundled-engine VSIX entries, ` +
    `engine.tgz ${result.tarballByteLength} bytes with ${result.vendoredEntryCount} vendored dependency files, ` +
    `${result.totalVsixEntries} total VSIX entries.`
  );
  return result;
}

function logTimings(timings, totalStart, verification) {
  const totalMs = Date.now() - totalStart;
  const fmt = (ms) => (ms == null ? 'n/a' : `${(ms / 1000).toFixed(1)}s`);
  console.log('\nPackaging stage timings:');
  console.log(`  engine staging/vendoring : ${fmt(timings.stageEngineMs)}`);
  console.log(`  npm pack                 : ${fmt(timings.npmPackMs)}`);
  console.log(`  vsce package             : ${fmt(timings.vscePackageMs)}`);
  console.log(`  final verification       : ${fmt(timings.verifyMs)}`);
  console.log(`  total elapsed            : ${fmt(totalMs)}`);
  if (verification) {
    console.log(`VSIX entries: ${verification.totalVsixEntries} total, ${verification.bundledEngineEntryCount} bundled-engine.`);
  }
}

async function main() {
  const totalStart = Date.now();
  const args = parseArgs(process.argv.slice(2));
  const {stageDir, cleanupWhenDone} = await resolveStageDir(args.out);
  const vsixPath = path.isAbsolute(args.vsix) ? args.vsix : path.join(repoRoot, args.vsix);

  if (!fs.existsSync(path.join(extSourceDir, 'package.json'))) {
    throw new Error(`Missing extension source at ${extSourceDir}`);
  }

  const timings = {};
  try {
    await copyExtensionSource(stageDir);
    const {pkg, metadata} = await injectBuildMetadata(stageDir);
    const manifest = await packBundledEngine(stageDir, pkg.engineVersion, timings);

    console.log(`Staged ${pkg.publisher}.${pkg.name} in ${stageDir}`);
    console.log(`Build stamp: ${formatBuildMetadata(metadata)}`);
    console.log(`Bundled engine: ${manifest.package}@${manifest.version}, engine.tgz ${manifest.byteLength} bytes.`);

    if (args.stageOnly) {
      logTimings(timings, totalStart);
      return;
    }

    await fsp.mkdir(path.dirname(vsixPath), {recursive: true});
    let start = Date.now();
    run('npm', ['exec', '--yes', '@vscode/vsce', '--', 'package', '--no-dependencies', '-o', vsixPath], {
      cwd: stageDir
    });
    timings.vscePackageMs = Date.now() - start;

    start = Date.now();
    const verification = verifyVsixBundledEngine(vsixPath);
    timings.verifyMs = Date.now() - start;

    console.log(`\nWrote ${vsixPath}`);
    logTimings(timings, totalStart, verification);
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
