import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

/*
 * Contract test for the /__lite/* payload builders shared by every run mode
 * (specification/run-modes/spec.md): the gate, the navigation payload built
 * from the persisted filetree.json snapshot with fallback to the live
 * backend, and the live-reload stamp payload.
 */

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const benchRoot = join(engineRoot, '.cache', 'bench', 'extension-preview-endpoints');
const contentDir = join(benchRoot, 'content');
const jsonDir = join(benchRoot, 'store', 'json');

rmSync(benchRoot, {recursive: true, force: true});
mkdirSync(contentDir, {recursive: true});
mkdirSync(jsonDir, {recursive: true});
writeFileSync(join(contentDir, 'README.md'), '# Home\n');
writeFileSync(join(contentDir, 'guide.md'), '# Guide\n');

// Same runtime shape the extension gives the engine; must be set before
// config.js / structure-db.js are imported.
process.env.DOCS_PROFILE = 'lite';
process.env.DOCS_BACKEND = 'json';
process.env.MICROWEBSTACKS_EXTENSION_MODE = 'true';
process.env.MICROWEBSTACKS_DOTENV_OVERRIDE = 'false';
process.env.MICROWEBSTACKS_ENGINE_ROOT = engineRoot;
process.env.MICROWEBSTACKS_WORKSPACE_ROOT = benchRoot;
process.env.MICROWEBSTACKS_MANIFEST_PATH = join(benchRoot, 'manifest.yaml');
process.env.MICROWEBSTACKS_DOCS_ROOT = contentDir;
process.env.MICROWEBSTACKS_STORE_PATH = join(benchRoot, 'store');

process.env.MICROWEBSTACKS_LAUNCHER = 'vscode-extension@0.0.0-test';

const {extensionPreviewEnabled, navigationPayload, sourceRoutePayload, versionPayload, runtimePayload, statsPayload} =
    await import('../src/libs/extension-preview.js');

test('the gate follows MICROWEBSTACKS_EXTENSION_MODE per call, not at import', () => {
    assert.equal(extensionPreviewEnabled(), true);
    process.env.MICROWEBSTACKS_EXTENSION_MODE = 'false';
    assert.equal(extensionPreviewEnabled(), false);
    process.env.MICROWEBSTACKS_EXTENSION_MODE = 'true';
    assert.equal(extensionPreviewEnabled(), true);
});

test('navigation payload prefers the persisted filetree.json snapshot', async () => {
    writeFileSync(join(jsonDir, 'filetree.json'), JSON.stringify({
        source_entries: [
            {path: 'README.md', parent_path: '', name: 'README.md', entry_type: 'file', document_url: '', document_title: 'README', sort_order: 1},
            {path: 'snapshot-only.md', parent_path: '', name: 'snapshot-only.md', entry_type: 'file', document_url: 'snapshot-only', document_title: 'snapshot-only', sort_order: 2}
        ]
    }));
    const payload = await navigationPayload('/');
    assert.ok(Array.isArray(payload.items));
    assert.ok(Number.isInteger(payload.ms));
    // 'snapshot-only.md' exists only in the snapshot, proving the snapshot
    // (not a live walk of contentDir) answered.
    assert.deepEqual(payload.items.map((item) => item.nodeKey), ['README.md', 'snapshot-only.md']);
});

test('source route payload resolves only canonical Markdown source entries', async () => {
    writeFileSync(join(jsonDir, 'filetree.json'), JSON.stringify({
        source_entries: [
            {path: 'README.md', entry_type: 'file', document_url: ''},
            {path: 'guides/setup.md', entry_type: 'file', document_url: 'guides/setup'},
            {path: 'guides/café notes.md', entry_type: 'file', document_url: 'guides/cafe-notes'},
            {path: 'component.mdx', entry_type: 'file', document_url: null}
        ]
    }));

    assert.deepEqual(await sourceRoutePayload('README.md'), {
        found: true, sourcePath: 'README.md', documentUrl: '', route: '/'
    });
    assert.deepEqual(await sourceRoutePayload('guides/setup.md'), {
        found: true, sourcePath: 'guides/setup.md', documentUrl: 'guides/setup', route: '/guides/setup'
    });
    assert.deepEqual(await sourceRoutePayload('guides/café notes.md'), {
        found: true, sourcePath: 'guides/café notes.md', documentUrl: 'guides/cafe-notes', route: '/guides/cafe-notes'
    });
    assert.deepEqual(await sourceRoutePayload('missing.md'), {found: false, reason: 'not-found'});
    for (const invalid of [null, '', '../secret.md', '/absolute.md', 'guides\\setup.md', 'component.mdx', 'notes.markdown', 'guides//setup.md']) {
        assert.deepEqual(await sourceRoutePayload(invalid), {found: false, reason: 'invalid-path'});
    }
});

test('navigation payload falls back to the live backend without a snapshot', async () => {
    rmSync(join(jsonDir, 'filetree.json'), {force: true});
    const payload = await navigationPayload('/');
    assert.deepEqual(payload.items.map((item) => item.nodeKey).sort(), ['README.md', 'guide.md']);
    const guide = payload.items.find((item) => item.nodeKey === 'guide.md');
    assert.equal(guide.link, '/guide');
});

test('runtime payload reports identity, launcher pass-through, and configured server', () => {
    const payload = runtimePayload({dev: true});
    assert.equal(payload.mode, 'dev-server');
    assert.equal(runtimePayload({}).mode, 'built');
    assert.equal(payload.launcher, 'vscode-extension@0.0.0-test');
    assert.equal(payload.profile, 'lite');
    assert.equal(payload.backend, 'json');
    // Engine root is this git checkout: no build-meta.json, so identity falls
    // back to package.json and says so.
    assert.equal(payload.engine.source, 'workspace');
    assert.ok(payload.engine.version);
    assert.equal(payload.workspaceRoot, benchRoot);
    assert.equal(payload.jsonDir, jsonDir);
    assert.ok(payload.configuredServer.port);
    assert.ok(payload.node.startsWith('v'));
    // Renderer routing: static config, not per-request state (spec: this is
    // why it lives on /__lite/runtime rather than /__lite/stats).
    assert.equal(payload.diagram.languages.mermaid, 'client');
    assert.equal(payload.diagram.languages.plantuml, 'client');
    assert.equal(payload.diagram.languages.blockdiag, 'kroki');
    assert.ok(payload.diagram.krokiServer);
});

test('stats payload counts workspace files and the lazy cache without content reads', async () => {
    // The live-backend fallback test above walked contentDir (README.md +
    // guide.md) and persisted filetree.json; stats read that snapshot.
    mkdirSync(join(jsonDir, 'pages'), {recursive: true});
    writeFileSync(join(jsonDir, 'pages', 'abc123.json'), JSON.stringify({hash: 'x'}));
    const payload = await statsPayload();
    assert.equal(payload.workspace.files, 2);
    assert.equal(payload.workspace.markdownDocuments, 2);
    assert.ok(payload.workspace.bytes > 0);
    assert.ok(payload.workspace.newestMtimeMs > 0);
    assert.deepEqual(payload.workspace.topExtensions[0], {ext: 'md', count: 2});
    assert.equal(payload.cache.pages.files, 1);
    assert.ok(payload.cache.pages.bytes > 0);
    assert.equal(payload.cache.blobs.files, 0);
    assert.ok(payload.memory.rss > 0);
});

test('stats payload reports session walk history and the last page load without reprocessing', async () => {
    const {getEntry} = await import('../src/libs/structure-db.js');

    const beforeWalks = (await statsPayload()).walkHistory;
    assert.ok(beforeWalks.count >= 1, 'at least one walk already happened via earlier tests');

    // First load of 'guide' must be a fresh parse (nothing cached yet for it).
    const first = await getEntry({url: 'guide'});
    assert.equal(first.found, true);
    const afterFirst = (await statsPayload()).lastPage;
    assert.equal(afterFirst.path, 'guide.md');
    assert.equal(afterFirst.hit, 'parsed');
    assert.ok(Number.isInteger(afterFirst.ms));

    // Same content, no file change: the in-memory hash check must short-circuit
    // to a memory hit, proving the record is read back, not recomputed.
    const second = await getEntry({url: 'guide'});
    assert.equal(second.found, true);
    const afterSecond = (await statsPayload()).lastPage;
    assert.equal(afterSecond.hit, 'memory');
});

test('version payload reports zeros without stamps and mtimes with them', async () => {
    const before = await versionPayload();
    assert.deepEqual(before, {reload: 0, tree: 0});
    writeFileSync(join(jsonDir, 'reload.stamp'), '');
    writeFileSync(join(jsonDir, 'tree.stamp'), '');
    const after = await versionPayload();
    assert.ok(after.reload > 0);
    assert.ok(after.tree > 0);
});
