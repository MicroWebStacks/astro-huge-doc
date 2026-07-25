/*
 * Phase 0 regression cover for the gallery/custom-yaml block contract.
 *
 * The bug these guard: the collector matched the fence meta exactly while the
 * renderer matched a prefix, so ```yaml gallery_dir produced no gallery items
 * yet still mounted <Gallery>, which dereferenced a null ast and aborted the
 * entire static build. The rules asserted here are (1) one shared classifier,
 * (2) both gallery forms expand identically in the dataset export, (3)
 * expand_galleries=false (the lite lazy parse) leaves them unexpanded but
 * still collects the fence as a highlightable code block, and (4) a malformed
 * block degrades instead of throwing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {codeBlockKind} from '../packages/content-structure/src/code_blocks.js';
import {collectDocument} from '../packages/content-structure/index.js';

test('codeBlockKind classifies both gallery forms as one kind', () => {
    assert.equal(codeBlockKind('yaml', 'gallery'), 'gallery');
    assert.equal(codeBlockKind('yaml', 'gallery_dir'), 'gallery');
    assert.equal(codeBlockKind('yaml', '  GALLERY_DIR  '), 'gallery');
});

test('codeBlockKind classifies the other custom-yaml components', () => {
    assert.equal(codeBlockKind('yaml', 'glb'), 'glb');
    assert.equal(codeBlockKind('yaml', 'cards'), 'cards');
});

test('codeBlockKind returns null for ordinary code blocks', () => {
    assert.equal(codeBlockKind('yaml', null), null);
    assert.equal(codeBlockKind('yaml', ''), null);
    assert.equal(codeBlockKind('python', 'gallery'), null);
    assert.equal(codeBlockKind(null, 'gallery'), null);
    assert.equal(codeBlockKind('yaml', 'not-a-known-kind'), null);
});

function makeWorkspace() {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'gallery-blocks-'));
    mkdirSync(path.join(dir, 'shots'), {recursive: true});
    // 1x1 transparent GIF — small, and a format sharp can decode.
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    writeFileSync(path.join(dir, 'shots', 'one.gif'), pixel);
    writeFileSync(path.join(dir, 'shots', 'two.gif'), pixel);
    return dir;
}

function entryFor(dir) {
    return {
        uid: 'doc',
        sid: 'doc',
        path: 'doc.md',
        base_dir: '',
        url: 'doc',
        url_type: 'file',
        slug: 'doc',
        title: 'Doc',
        version_id: 'test'
    };
}

function configFor(dir, expandGalleries) {
    return {
        rootdir: dir,
        contentdir: dir,
        expand_galleries: expandGalleries,
        folder_single_doc: false,
        file_link_ext: [],
        file_compress_ext: [],
        external_storage_kb: 512,
        inline_compression_kb: 32
    };
}

function galleryItemsOf(result) {
    const codeBlock = (result?.content?.code ?? [])[0];
    return codeBlock?.gallery_items ?? null;
}

async function collectBody(dir, body, expandGalleries) {
    const originalCwd = process.cwd();
    try {
        process.chdir(dir);
        return await collectDocument(configFor(dir, expandGalleries), {entry: entryFor(dir), markdownText: body});
    } finally {
        process.chdir(originalCwd);
    }
}

const LIST_FORM = '```yaml gallery\n- ./shots/one.gif\n- ./shots/two.gif\n```\n';
const DIR_FORM = '```yaml gallery_dir\ndir: ./shots/\n```\n';

test('the dataset export expands the gallery list form', async () => {
    const dir = makeWorkspace();
    try {
        const items = galleryItemsOf(await collectBody(dir, LIST_FORM, true));
        assert.equal(items?.length, 2);
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test('the dataset export expands the gallery_dir form to the same outcome', async () => {
    const dir = makeWorkspace();
    try {
        const items = galleryItemsOf(await collectBody(dir, DIR_FORM, true));
        assert.equal(items?.length, 2, 'dir form must list the directory and pick up both images');
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test('expand_galleries=false leaves both gallery forms unexpanded (lite parse)', async () => {
    const dir = makeWorkspace();
    try {
        assert.equal(galleryItemsOf(await collectBody(dir, LIST_FORM, false)), null);
        assert.equal(galleryItemsOf(await collectBody(dir, DIR_FORM, false)), null);
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test('a malformed gallery block collects without throwing and yields no items', async () => {
    const dir = makeWorkspace();
    try {
        const malformed = '```yaml gallery\n: : not yaml at all :\n```\n';
        const items = galleryItemsOf(await collectBody(dir, malformed, true));
        assert.equal(items, null);
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test('a gallery pointing at a missing directory collects without throwing', async () => {
    const dir = makeWorkspace();
    try {
        const missing = '```yaml gallery_dir\ndir: ./nope/\n```\n';
        const items = galleryItemsOf(await collectBody(dir, missing, true));
        assert.equal(items, null);
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});

test('the code block is still collected as a normal asset when the gallery is not expanded', async () => {
    const dir = makeWorkspace();
    try {
        const result = await collectBody(dir, DIR_FORM, false);
        const codeAsset = (result?.assets ?? []).find((asset) => asset.type === 'codeblock');
        assert.ok(codeAsset, 'the fence must still exist as a codeblock asset so it can be highlighted');
        assert.equal(codeAsset.ext, 'yaml');
        assert.equal(codeAsset.params, 'gallery_dir');
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});
