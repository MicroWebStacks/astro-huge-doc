import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  parseBuildArgs,
  assertSafeOutDir,
  buildEnv,
  checkNodeVersion,
  BuildError,
  runBuildCommand
} from '../src/libs/render-build.js';

function makeFixtureWorkspace() {
  const workspace = mkdtempSync(path.join(os.tmpdir(), 'md-render-fixture-'));
  mkdirSync(path.join(workspace, 'content'), { recursive: true });
  writeFileSync(path.join(workspace, 'content', 'index.md'), '# Fixture\n');
  return workspace;
}

test('parseBuildArgs requires --workspace and --out-dir', () => {
  assert.throws(() => parseBuildArgs([]), (error) => error instanceof BuildError && error.category === 'invalid_configuration');
  assert.throws(() => parseBuildArgs(['--workspace', '/a']), BuildError);
  assert.throws(() => parseBuildArgs(['--out-dir', '/a']), BuildError);
});

test('parseBuildArgs rejects unknown flags and missing values', () => {
  assert.throws(() => parseBuildArgs(['--workspace', '/a', '--out-dir', '/b', '--bogus', 'x']), BuildError);
  assert.throws(() => parseBuildArgs(['--workspace', '--out-dir', '/b']), BuildError);
});

test('parseBuildArgs accepts all documented flags', () => {
  const args = parseBuildArgs([
    '--workspace', '/ws',
    '--out-dir', '/out',
    '--manifest', '/ws/manifest.yaml',
    '--site', 'https://example.github.io',
    '--base', '/repo/'
  ]);
  assert.deepEqual(args, {
    workspace: '/ws',
    outDir: '/out',
    manifest: '/ws/manifest.yaml',
    site: 'https://example.github.io',
    base: '/repo/'
  });
});

test('assertSafeOutDir blocks the workspace itself and its ancestors', () => {
  const workspace = path.resolve('/tmp/ws/nested');
  assert.throws(() => assertSafeOutDir(workspace, [workspace]), BuildError);
  assert.throws(() => assertSafeOutDir(path.resolve('/tmp/ws'), [workspace]), BuildError);
  assert.throws(() => assertSafeOutDir(path.parse(workspace).root, [workspace]), BuildError);
});

test('assertSafeOutDir allows an out-dir nested inside the workspace', () => {
  const workspace = path.resolve('/tmp/ws');
  assert.doesNotThrow(() => assertSafeOutDir(path.resolve('/tmp/ws/dist'), [workspace]));
});

test('buildEnv fixes the contract axes and disables workspace .env override', () => {
  const env = buildEnv({
    workspaceAbs: '/ws',
    engineRoot: '/engine',
    storeAbs: '/tmp/store',
    dbPathAbs: '/tmp/store/content.db',
    outDirAbs: '/tmp/dist'
  });
  assert.equal(env.DOCS_BACKEND, 'json');
  assert.equal(env.DOCS_PROFILE, 'full');
  assert.equal(env.DOCS_OUTPUT, 'static');
  assert.equal(env.MICROWEBSTACKS_DOTENV_OVERRIDE, 'false');
  assert.equal(env.MICROWEBSTACKS_WORKSPACE_ROOT, '/ws');
  assert.equal(env.MICROWEBSTACKS_MANIFEST_PATH, undefined);
  assert.equal(env.MICROWEBSTACKS_SITE, undefined);
});

test('buildEnv only sets manifest/site/base when explicitly provided', () => {
  const env = buildEnv({
    workspaceAbs: '/ws',
    engineRoot: '/engine',
    storeAbs: '/tmp/store',
    dbPathAbs: '/tmp/store/content.db',
    outDirAbs: '/tmp/dist',
    manifestAbs: '/ws/manifest.yaml',
    site: 'https://example.github.io',
    base: '/repo/'
  });
  assert.equal(env.MICROWEBSTACKS_MANIFEST_PATH, '/ws/manifest.yaml');
  assert.equal(env.MICROWEBSTACKS_SITE, 'https://example.github.io');
  assert.equal(env.MICROWEBSTACKS_BASE, '/repo/');
});

test('checkNodeVersion rejects pre-22 runtimes and accepts 22+', () => {
  assert.throws(() => checkNodeVersion('v18.19.0'), (error) => error instanceof BuildError && error.category === 'invalid_configuration');
  assert.doesNotThrow(() => checkNodeVersion('v22.0.0'));
  assert.doesNotThrow(() => checkNodeVersion('v24.1.0'));
});

test('runBuildCommand cleans up its temp build root and leaves out-dir untouched when a stage fails', async () => {
  const workspace = makeFixtureWorkspace();
  const outDir = path.join(workspace, '..', `md-render-outdir-${Date.now()}`);
  const tmpBefore = new Set(readdirSync(os.tmpdir()).filter((name) => name.startsWith('md-render-build-')));

  const failingSteps = [
    {
      name: 'fails-immediately',
      run: () => {
        throw new BuildError('collection_failed', 'simulated collect failure');
      }
    }
  ];

  await assert.rejects(
    runBuildCommand(['--workspace', workspace, '--out-dir', outDir], { steps: failingSteps }),
    (error) => error instanceof BuildError && error.category === 'collection_failed'
  );

  assert.equal(existsSync(outDir), false, 'out-dir must not be created when a stage fails');
  const tmpAfter = readdirSync(os.tmpdir()).filter((name) => name.startsWith('md-render-build-'));
  for (const name of tmpAfter) {
    assert.ok(tmpBefore.has(name), `leftover build temp dir was not cleaned up: ${name}`);
  }

  rmSync(workspace, { recursive: true, force: true });
});

test('runBuildCommand copies the staged static output into --out-dir on success', async () => {
  const workspace = makeFixtureWorkspace();
  const outDir = path.join(workspace, '..', `md-render-outdir-${Date.now()}`);

  const fakeSteps = [
    {
      name: 'fake-astro-build',
      run: ({ env }) => {
        const stagedOutDir = env.MICROWEBSTACKS_OUTDIR;
        mkdirSync(stagedOutDir, { recursive: true });
        writeFileSync(path.join(stagedOutDir, 'index.html'), '<html></html>');
      }
    }
  ];

  const result = await runBuildCommand(['--workspace', workspace, '--out-dir', outDir], { steps: fakeSteps });

  assert.equal(result.outDir, path.resolve(outDir));
  assert.equal(existsSync(path.join(outDir, 'index.html')), true);

  rmSync(workspace, { recursive: true, force: true });
  rmSync(outDir, { recursive: true, force: true });
});
