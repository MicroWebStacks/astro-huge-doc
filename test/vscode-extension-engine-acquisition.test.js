import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const extensionSource = readFileSync(resolve('packages/vscode-extension/extension.js'), 'utf8');
const manifest = JSON.parse(readFileSync(resolve('packages/vscode-extension/package.json'), 'utf8'));

test('installed extension has no registry engine acquisition path', () => {
  assert.doesNotMatch(extensionSource, /registry\.npmjs\.org/);
  assert.doesNotMatch(extensionSource, /function\s+installEngine\s*\(/);
  assert.doesNotMatch(extensionSource, /function\s+fetchBuffer\s*\(/);
  assert.doesNotMatch(extensionSource, /require\(['"]https['"]\)/);
  assert.equal(
    manifest.contributes.configuration.properties['microwebstacks.preview.engineSource'],
    undefined
  );
});

test('bundled engine resolution reports cold hydration and cache timing', () => {
  assert.match(extensionSource, /First-use bundled engine activation started/);
  assert.match(extensionSource, /no network request/);
  assert.match(extensionSource, /First-use bundled engine timing:/);
  assert.match(extensionSource, /Bundled engine cache hit/);
});
