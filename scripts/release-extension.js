// Packages the VS Code extension into markdown-site-preview.vsix.
//
// Verifies first that the engine version pinned by "engineVersion" exists on
// npm (a fresh install 404s otherwise), then runs vsce package. Uploading the
// vsix to the Marketplace stays a manual step - see RELEASE.md.
//
// Usage:
//   node scripts/release-extension.js

import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

import {buildArtifactMetadata, formatBuildMetadata} from './build-metadata.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const extDir = path.join(repoRoot, 'packages', 'vscode-extension');
const ENGINE_NAME = '@microwebstacks/md-render';
const VSIX_NAME = 'markdown-site-preview.vsix';

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
  const extPkg = JSON.parse(fs.readFileSync(path.join(extDir, 'package.json'), 'utf8'));
  const {version, engineVersion, publisher, name} = extPkg;
  const buildMetadata = buildArtifactMetadata({
    repoRoot,
    kind: 'vscode-extension',
    version,
    engineVersion
  });

  const engineOnNpm = capture('npm', ['view', `${ENGINE_NAME}@${engineVersion}`, 'version']);
  if (engineOnNpm !== engineVersion) {
    throw new Error(
      `${ENGINE_NAME}@${engineVersion} is not on npm - publish the engine first:\n` +
      '  node scripts/release-engine.js --otp <code>'
    );
  }

  console.log(`Preparing release package from ${formatBuildMetadata(buildMetadata)}.`);
  run('node', [path.join('scripts', 'package-extension.js'), '--vsix', path.join('packages', 'vscode-extension', VSIX_NAME)], {
    cwd: repoRoot
  });

  console.log(`\nPackaged ${publisher}.${name} ${version} (engine ${engineVersion}).`);
  console.log('Next steps:');
  console.log('  1. Test locally: pnpm ext:install, reload VS Code, run "Markdown Site Preview: Open Preview".');
  console.log(`  2. Upload packages/vscode-extension/${VSIX_NAME} at`);
  console.log('     https://marketplace.visualstudio.com/manage/publishers/microwebstacks');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
