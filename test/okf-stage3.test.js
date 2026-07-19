import test from 'node:test';
import assert from 'node:assert/strict';
import {remark} from 'remark';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildSectionMenuFromIndexNav} from '../src/layout/authored_navigation.js';
import {findAuthoredIndexEntry} from '../src/layout/source_navigation.js';
import {resetDiagnostics, recordDiagnostic, getDiagnostics} from '../packages/content-structure/src/diagnostics.js';
import {collect} from '../packages/content-structure/index.js';

const sourceEntries = [
    {path: 'knowledge', parent_path: '', name: 'knowledge', entry_type: 'dir', document_url: 'knowledge', document_title: 'Knowledge'},
    {path: 'knowledge/release.md', parent_path: 'knowledge', name: 'release.md', entry_type: 'file', document_url: 'knowledge/release', document_title: 'Release'},
    {path: 'knowledge/readme.md', parent_path: 'knowledge', name: 'readme.md', entry_type: 'file', document_url: 'knowledge/readme', document_title: 'README'}
];
const documents = [
    {path: 'knowledge/index.md', url: 'knowledge', title: 'Knowledge', level: 1, order: 1},
    {path: 'knowledge/release.md', url: 'knowledge/release', title: 'Release', level: 2, order: 1},
    {path: 'knowledge/readme.md', url: 'knowledge/readme', title: 'README', level: 2, order: 2}
];

test('nearest index.md is selected even when its file is folded into a directory source entry', () => {
    const selected = findAuthoredIndexEntry(sourceEntries, '/knowledge/release', '/', null, documents);
    assert.equal(selected?.path, 'knowledge/index.md');
    assert.equal(selected?.document_url, 'knowledge');
});

test('authored index navigation preserves list hierarchy and marks omitted pages as synthesized', () => {
    const ast = remark().parse(`
- [Release guide](./release.md)
- Guides
  - [External](https://example.com/docs)
`);
    const menu = buildSectionMenuFromIndexNav(
        ast,
        {path: 'knowledge/index.md', document_url: 'knowledge'},
        '/knowledge/release',
        sourceEntries,
        '/'
    );
    assert.equal(menu[0].label, 'Release guide');
    assert.equal(menu[0].link, '/knowledge/release');
    assert.equal(menu[0].active, true);
    assert.equal(menu[1].label, 'Guides');
    assert.equal(menu[1].synthesized, true);
    assert.equal(menu[1].items[0].link, 'https://example.com/docs');
    const supplement = menu.find((entry) => entry.link === '/knowledge/readme');
    assert.equal(supplement?.synthesized, true);
});

test('collection diagnostics reset cleanly and retain related paths', () => {
    resetDiagnostics();
    recordDiagnostic('duplicate_identity', 'second.md', 'duplicate route', 'first.md');
    assert.deepEqual(getDiagnostics(), [{
        kind: 'duplicate_identity',
        path: 'second.md',
        related_path: 'first.md',
        message: 'duplicate route'
    }]);
    resetDiagnostics();
    assert.deepEqual(getDiagnostics(), []);
});

test('JSON collection persists malformed-frontmatter and duplicate-identity diagnostics', async () => {
    const root = mkdtempSync(join(tmpdir(), 'okf-stage3-diagnostics-'));
    const contentdir = join(root, 'content');
    const outdir = join(root, 'store');
    const jsonDir = join(outdir, 'json');
    try {
        await import('node:fs/promises').then(({mkdir}) => mkdir(contentdir, {recursive: true}));
        writeFileSync(join(contentdir, 'A B.md'), '# First');
        writeFileSync(join(contentdir, 'a-b.md'), '# Duplicate');
        writeFileSync(join(contentdir, 'broken.md'), '---\ntitle: Recovered\nbad: *\n---\n# Body');
        await collect({
            rootdir: root,
            contentdir,
            outdir,
            json_dir: jsonDir,
            format: 'json',
            folder_single_doc: false,
            file_link_ext: [],
            file_compress_ext: [],
            external_storage_kb: 512,
            inline_compression_kb: 32
        });
        const dataset = JSON.parse(readFileSync(join(jsonDir, 'content.json'), 'utf8'));
        assert.deepEqual(
            dataset.diagnostics.map((entry) => entry.kind).sort(),
            ['duplicate_identity', 'malformed_frontmatter']
        );
        assert.equal(dataset.documents.length, 2);
    } finally {
        rmSync(root, {recursive: true, force: true});
    }
});

test('lite line scanner skips frontmatter and fences while resolving inline and reference links', async () => {
    const {scanMarkdownRelations} = await import('../src/libs/structure-db-lazy.js');
    const source = {sid: 'a', path: 'guide/a.md'};
    const target = {sid: 'b', path: 'guide/b.md'};
    const markdown = `---
description: "[not a link](./missing.md)"
---
# Links
[B](./b.md)
[B again][b-ref]
[b-ref]: ./b.md
\`\`\`md
[ignored](./missing.md)
\`\`\`
[Web](https://example.com)
`;
    const rows = scanMarkdownRelations(source, markdown, new Map([[target.path, target]]));
    assert.deepEqual(rows.map((row) => row.status), ['resolved', 'resolved', 'external']);
    assert.deepEqual(rows.map((row) => row.source_heading), ['links', 'links', 'links']);
    assert.equal(rows.some((row) => row.target_raw === './missing.md'), false);
});
