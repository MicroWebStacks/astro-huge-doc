/*
 * Regression cover for workspace paths that contain characters the collector
 * used to re-interpret as URL escapes.
 *
 * The bug: exists_abs() and load_text_abs() percent-decoded the *whole*
 * absolute path they were handed. By that point the authored markdown target
 * had already been decoded (resolveDocumentAssetPath -> decodeAssetPath) and
 * joined onto contentdir/rootdir, so the second decode landed on the user's
 * own directory names:
 *
 *   'Docs 100% Final'  -> URIError: URI malformed, thrown out of the page
 *                         parse; the lite preview answered 500 for every page
 *                         that referenced an asset.
 *   'Docs%20Folder'    -> silently resolved to 'Docs Folder', which does not
 *                         exist; the image was dropped from the page with no
 *                         error anywhere.
 *
 * Plain spaces were always fine (nothing to decode) and are asserted here as
 * the control case, together with the encoded-authored-link case that the
 * decode was originally added for and that must keep working.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {collectDocument} from '../packages/content-structure/index.js';

// 1x1 transparent GIF — small, and a format sharp can decode.
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

function makeWorkspace(folderName, assetName = 'shot.gif') {
    const base = mkdtempSync(path.join(os.tmpdir(), 'ws-path-chars-'));
    const dir = path.join(base, folderName);
    mkdirSync(path.join(dir, 'shots'), {recursive: true});
    writeFileSync(path.join(dir, 'shots', assetName), PIXEL);
    return {base, dir};
}

function entryFor() {
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

function configFor(dir) {
    return {
        rootdir: dir,
        contentdir: dir,
        folder_single_doc: false,
        file_link_ext: [],
        file_compress_ext: [],
        external_storage_kb: 512,
        inline_compression_kb: 32
    };
}

async function collectIn(dir, body) {
    const originalCwd = process.cwd();
    try {
        process.chdir(dir);
        return await collectDocument(configFor(dir), {entry: entryFor(), markdownText: body});
    } finally {
        process.chdir(originalCwd);
    }
}

function imageAssets(result) {
    return (result?.assets ?? []).filter((asset) => asset.type === 'image');
}

const IMAGE_BODY = '# Doc\n\n![shot](./shots/shot.gif)\n';

const WORKSPACE_CASES = [
    ['plain', 'plain-workspace'],
    ['spaces', 'My Docs Workspace With Spaces'],
    ['a bare percent', 'Docs 100% Final'],
    ['a percent pair that looks like an escape', 'Docs%20Folder'],
    ['a percent-encoded slash', 'Docs%2FFolder-ish']
];

for (const [label, folderName] of WORKSPACE_CASES) {
    test(`an image resolves in a workspace whose path contains ${label}`, async () => {
        const {base, dir} = makeWorkspace(folderName);
        try {
            const result = await collectIn(dir, IMAGE_BODY);
            const images = imageAssets(result);
            assert.equal(images.length, 1, `expected the image to survive collection under '${folderName}'`);
            assert.equal(images[0].exists, true);
            // The blob is what the page actually renders; an asset that
            // "exists" but produced no blob is still a broken image.
            assert.ok(images[0].blob_uid, `expected a blob for the image under '${folderName}'`);
        } finally {
            rmSync(base, {recursive: true, force: true});
        }
    });
}

test('a percent-encoded authored image target still resolves to the spaced file on disk', async () => {
    const {base, dir} = makeWorkspace('My Docs Workspace With Spaces', 'a shot.gif');
    try {
        const result = await collectIn(dir, '# Doc\n\n![shot](./shots/a%20shot.gif)\n');
        const images = imageAssets(result);
        assert.equal(images.length, 1, 'the authored %20 must still be decoded to the real filename');
        assert.equal(images[0].exists, true);
        assert.ok(images[0].blob_uid, 'the encoded authored target must still produce a blob');
    } finally {
        rmSync(base, {recursive: true, force: true});
    }
});

test('an SVG in a percent-bearing workspace is read for its text instead of throwing', async () => {
    const {base, dir} = makeWorkspace('Docs 100% Final');
    try {
        writeFileSync(
            path.join(dir, 'shots', 'draw.svg'),
            '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><text>label</text></svg>'
        );
        const result = await collectIn(dir, '# Doc\n\n![draw](./shots/draw.svg)\n');
        assert.equal(imageAssets(result).length, 1);
        // load_text_abs() is the second half of the bug: the SVG text scan
        // opens the resolved absolute path directly.
        assert.deepEqual(
            result?.content?.images?.[0]?.text_list,
            ['label'],
            'the SVG text scan must read the real file'
        );
    } finally {
        rmSync(base, {recursive: true, force: true});
    }
});
