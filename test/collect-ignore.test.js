import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { DEFAULT_IGNORE, iterate_documents, set_config } from '../packages/content-structure/src/collect.js';

// `md-render preview` points the content root at whatever folder the user is
// standing in, which is routinely a repository with dependency and build
// trees beside the notes. Those must never become documents.
function makeMixedWorkspace() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'content-structure-ignore-'));
  const write = (relativePath, body) => {
    const target = path.join(root, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, body);
  };
  write('README.md', '# Notes\n');
  write('guide/setup.md', '# Setup\n');
  write('node_modules/left-pad/readme.md', '# left-pad\n');
  write('.git/COMMIT_EDITMSG.md', 'wip\n');
  write('.venv/lib/pkg.md', '# venv\n');
  write('dist/index.md', '# built\n');
  write('build/notes.md', '# built\n');
  write('out/notes.md', '# built\n');
  write('target/doc/crate.md', '# rust\n');
  write('vendor/lib/readme.md', '# vendored\n');
  write('__pycache__/cache.md', '# pyc\n');
  write('coverage/report.md', '# coverage\n');
  return root;
}

async function collectedPaths(contentDir, ignore) {
  const originalCwd = process.cwd();
  try {
    set_config({ rootdir: contentDir, contentdir: contentDir, folder_single_doc: false, ignore });
    process.chdir(contentDir);
    const paths = [];
    for await (const source of iterate_documents()) {
      paths.push(source.entry.path);
    }
    return paths.sort();
  } finally {
    process.chdir(originalCwd);
  }
}

test('collection skips dependency and build directories from every ecosystem', async () => {
  const contentDir = makeMixedWorkspace();
  try {
    assert.deepEqual(await collectedPaths(contentDir), ['README.md', 'guide/setup.md']);
  } finally {
    rmSync(contentDir, { recursive: true, force: true });
  }
});

test('a workspace can override the ignore list through collect.ignore', async () => {
  const contentDir = makeMixedWorkspace();
  try {
    // Keeping only the node_modules rule lets a workspace that really does
    // author documents under build/ say so.
    const paths = await collectedPaths(contentDir, ['**/node_modules/**', '**/.git/**']);
    assert.ok(paths.includes('build/notes.md'), 'an overridden list must stop ignoring build/');
    assert.ok(!paths.includes('node_modules/left-pad/readme.md'), 'the override still excludes node_modules');
  } finally {
    rmSync(contentDir, { recursive: true, force: true });
  }
});

test('the default ignore list names the non-hidden trees; glob skips hidden ones already', () => {
  assert.ok(DEFAULT_IGNORE.includes('**/node_modules/**'));
  assert.ok(DEFAULT_IGNORE.includes('**/target/**'));
  assert.ok(!DEFAULT_IGNORE.some((pattern) => pattern.includes('.*')), 'hidden directories need no rule (glob dot:false)');
});
