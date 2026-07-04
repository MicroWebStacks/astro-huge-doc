// Releases the @microwebstacks/md-render engine to npm.
//
// Runs the lite build, stages the package, and publishes it with the OTP
// passed on the command line. The version defaults to the "engineVersion"
// pinned in packages/vscode-extension/package.json so the published engine
// always matches what the extension will ask for.
//
// Usage:
//   node scripts/release-engine.js --otp <code> [--version <semver>] [--publish-only]
// --publish-only skips build+stage (use when a fresh OTP is needed after the
// build already ran).

import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const PACKAGE_NAME = '@microwebstacks/md-render';

function parseArgs(argv) {
  const args = {otp: null, version: null, publishOnly: false};
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split('=', 2);
    if (flag === '--otp') {
      args.otp = inline ?? argv[++i];
    } else if (flag === '--version') {
      args.version = inline ?? argv[++i];
    } else if (flag === '--publish-only') {
      args.publishOnly = true;
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

function capture(command, cliArgs, options = {}) {
  const result = spawnSync(command, cliArgs, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.otp) {
    throw new Error('Usage: node scripts/release-engine.js --otp <code> [--version <semver>] [--publish-only]');
  }

  const extPkg = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'packages', 'vscode-extension', 'package.json'), 'utf8')
  );
  const version = args.version ?? extPkg.engineVersion;
  if (!version) {
    throw new Error('No version: pass --version or set engineVersion in packages/vscode-extension/package.json');
  }

  if (capture('npm', ['view', `${PACKAGE_NAME}@${version}`, 'version'])) {
    throw new Error(`${PACKAGE_NAME}@${version} is already on npm - one version = one binary, bump it`);
  }
  if (!capture('npm', ['whoami'])) {
    throw new Error('Not logged in to npm - run "npm login" first, then rerun');
  }

  if (!args.publishOnly) {
    // Empty workspace root so the repo .env (DOCS_PROFILE=full, override=true)
    // cannot clobber the lite profile.
    const emptyRoot = path.join(os.tmpdir(), 'mws-empty-workspace');
    fs.mkdirSync(emptyRoot, {recursive: true});
    run('pnpm', ['build'], {
      cwd: repoRoot,
      env: {...process.env, DOCS_PROFILE: 'lite', MICROWEBSTACKS_WORKSPACE_ROOT: emptyRoot}
    });
    run('node', [path.join('scripts', 'stage-engine.js'), '--version', version], {cwd: repoRoot});
  }

  try {
    run('npm', ['publish', '--access', 'public', '--otp', args.otp], {
      cwd: path.join(repoRoot, 'packages', 'md-render')
    });
  } catch (error) {
    console.error('\nPublish failed. If the OTP expired during the build, rerun with a fresh code:');
    console.error(`  node scripts/release-engine.js --otp <fresh-code> --publish-only`);
    throw error;
  }

  const published = capture('npm', ['view', `${PACKAGE_NAME}@${version}`, 'version']);
  if (published !== version) {
    throw new Error(`published version not visible on npm yet (got "${published}")`);
  }
  console.log(`\nPublished ${PACKAGE_NAME}@${version}.`);
  console.log('Next: release the extension that pins this engineVersion (node scripts/release-extension.js).');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
