const fs = require('fs');
const fsp = require('fs/promises');
const Module = require('module');
const path = require('path');
const zlib = require('zlib');

const repoRoot = path.resolve(__dirname, '..');
const scratchRoot = path.join(repoRoot, '.tmp', 'extension-hydration-diagnostic');
const originalLoad = Module._load;
const outputLines = [];

Module._load = function(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      window: {createOutputChannel: () => ({appendLine: (line) => outputLines.push(line), show() {}, dispose() {}})},
      commands: {registerCommand: () => ({dispose() {}})},
      workspace: {}
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

function octal(value, width) {
  return `${value.toString(8).padStart(width - 1, '0')}\0`;
}

function tar(entries) {
  const blocks = [];
  for (const [name, value] of entries) {
    const data = Buffer.from(value);
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, 'utf8');
    header.write('0000777\0', 100, 8, 'ascii');
    header.write('0000000\0', 108, 8, 'ascii');
    header.write('0000000\0', 116, 8, 'ascii');
    header.write(octal(data.length, 12), 124, 12, 'ascii');
    header.write(octal(Math.floor(Date.now() / 1000), 12), 136, 12, 'ascii');
    header.fill(0x20, 148, 156);
    header[156] = '0'.charCodeAt(0);
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');
    header.write(octal([...header].reduce((sum, byte) => sum + byte, 0), 8), 148, 8, 'ascii');
    blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

function report(name, passed, detail = '') {
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'} - ${name}${detail ? ` (${detail})` : ''}\n`);
  return passed;
}

async function main() {
  await fsp.rm(scratchRoot, {recursive: true, force: true});
  await fsp.mkdir(scratchRoot, {recursive: true});
  const extension = require(path.join(repoRoot, 'packages', 'vscode-extension', 'extension.js'));
  extension.activate({subscriptions: {push() {}}});
  const internals = extension.__testInternals;
  const extensionPackage = require(path.join(repoRoot, 'packages', 'vscode-extension', 'package.json'));
  const pkg = {name: '@microwebstacks/md-render', version: extensionPackage.engineVersion, vendoredModulesDir: '_modules'};
  const payload = zlib.gzipSync(tar([
    ['package/package.json', JSON.stringify(pkg)],
    ['package/config.js', 'module.exports = {};'],
    ['package/server/server.js', ''],
    ['package/scripts/collect.js', ''],
    ['package/dist/server/entry.mjs', ''],
    ['package/_modules/diagnostic-package/index.js', 'module.exports = true;']
  ]));
  const installRoot = path.join(scratchRoot, 'activated-engine');
  let ok = true;
  try {
    await internals.extractAndActivateEngine({tarballBuffer: payload, expectedPackage: pkg.name, expectedVersion: pkg.version, installRoot, sourceLabel: 'diagnostic engine'});
    ok = report('engine activation', fs.existsSync(installRoot)) && ok;
    ok = report('direct node_modules extraction', fs.existsSync(path.join(installRoot, 'node_modules', 'diagnostic-package', 'index.js'))) && ok;
    ok = report('no vendored alias remains', !fs.existsSync(path.join(installRoot, '_modules'))) && ok;
    ok = report('usable engine validation', internals.isUsableInstalledEngine(installRoot)) && ok;
  } catch (error) {
    report('engine activation', false, error.code || error.message);
    ok = false;
  }

  await internals.runActivationDiagnostics({error: Object.assign(new Error('simulated'), {code: 'EPERM'}), stage: 'diagnostic probe', tempRoot: installRoot, installRoot: path.join(scratchRoot, 'diagnostic-target'), vendoredModulesDir: '_modules'});
  ok = report('automatic PASS/FAIL diagnostic output', outputLines.some((line) => line.includes('PASS - global storage directory rename'))) && ok;
  process.exitCode = ok ? 0 : 1;
}

process.env.MWS_TEST_INTERNALS = '1';
main().finally(async () => {
  Module._load = originalLoad;
  await fsp.rm(scratchRoot, {recursive: true, force: true}).catch(() => {});
});
