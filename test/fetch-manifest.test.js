/*
 * Phase 3 (WP-13) cover for the fetch manifest's file-level entries.
 *
 * The manifest must pull three loose files that sit directly in the source
 * repository's public/ — favicon.svg, favicon.png and .nojekyll — next to the
 * public/images, public/design and public/data folders it already pulls. Folder
 * entries reset their destination before copying, so a `folders: [public]`
 * entry would have deleted the sibling fetches. `files:` exists to be additive,
 * and the rules asserted here are (1) file entries never reset the
 * destination, (2) a folder entry may not be reset over a destination another
 * entry populates, and (3) the two forms stay mutually exclusive per entry so
 * the reset semantics of a destination are never ambiguous.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {normalizeGithubConfigs, moveRequestedContent} from '../scripts/fetch.js';

const REPO = 'Owner/repo';

function makeTree() {
    const root = mkdtempSync(path.join(os.tmpdir(), 'fetch-wp13-'));
    mkdirSync(path.join(root, 'public', 'data'), {recursive: true});
    writeFileSync(path.join(root, 'public', 'data', 'firmware.zip'), 'zip');
    writeFileSync(path.join(root, 'public', 'favicon.svg'), '<svg/>');
    writeFileSync(path.join(root, 'public', '.nojekyll'), '');
    return root;
}

test('a file entry copies named files without resetting the destination', async t => {
    const extractedRoot = makeTree();
    const destPath = mkdtempSync(path.join(os.tmpdir(), 'fetch-wp13-dest-'));
    t.after(() => {
        rmSync(extractedRoot, {recursive: true, force: true});
        rmSync(destPath, {recursive: true, force: true});
    });

    // Stand in for public/images and public/design: populated by other entries.
    mkdirSync(path.join(destPath, 'images'));
    writeFileSync(path.join(destPath, 'images', 'kept.webp'), 'bytes');

    await moveRequestedContent({
        extractedRoot,
        folders: [],
        files: ['public/favicon.svg', 'public/.nojekyll'],
        destPath
    });

    assert.equal(readFileSync(path.join(destPath, 'favicon.svg'), 'utf8'), '<svg/>');
    assert.ok(existsSync(path.join(destPath, '.nojekyll')), 'dotfiles are copied');
    assert.ok(existsSync(path.join(destPath, 'images', 'kept.webp')), 'sibling fetch survives');
});

test('a folder entry still resets its destination', async t => {
    const extractedRoot = makeTree();
    const destPath = mkdtempSync(path.join(os.tmpdir(), 'fetch-wp13-dest-'));
    t.after(() => {
        rmSync(extractedRoot, {recursive: true, force: true});
        rmSync(destPath, {recursive: true, force: true});
    });

    writeFileSync(path.join(destPath, 'stale.zip'), 'old');

    await moveRequestedContent({
        extractedRoot,
        folders: ['public/data'],
        files: [],
        destPath
    });

    assert.ok(existsSync(path.join(destPath, 'firmware.zip')));
    assert.ok(!existsSync(path.join(destPath, 'stale.zip')), 'folder entries replace the destination');
});

test('a file entry names a missing file or a directory honestly', async t => {
    const extractedRoot = makeTree();
    const destPath = mkdtempSync(path.join(os.tmpdir(), 'fetch-wp13-dest-'));
    t.after(() => {
        rmSync(extractedRoot, {recursive: true, force: true});
        rmSync(destPath, {recursive: true, force: true});
    });

    await assert.rejects(
        moveRequestedContent({extractedRoot, folders: [], files: ['public/favicon.png'], destPath}),
        /not found in downloaded repository/
    );
    await assert.rejects(
        moveRequestedContent({extractedRoot, folders: [], files: ['public/data'], destPath}),
        /list it under folders instead of files/
    );
});

test('an entry cannot declare both folders and files', () => {
    assert.throws(
        () => normalizeGithubConfigs({
            github: [{repo: REPO, folders: ['public/data'], files: ['public/favicon.svg'], dest: 'public'}]
        }),
        /declares both folders and files/
    );
});

test('a reset destination may not contain another entry destination', () => {
    assert.throws(
        () => normalizeGithubConfigs({
            github: [
                {repo: REPO, folders: ['public'], dest: 'public'},
                {repo: REPO, folders: ['public/images'], dest: 'public/images'}
            ]
        }),
        /is reset before copying and contains/
    );

    // The shipped shape: only the additive file entry sits above the others.
    assert.doesNotThrow(() => normalizeGithubConfigs({
        github: [
            {repo: REPO, folders: ['public/images'], dest: 'public/images'},
            {repo: REPO, folders: ['public/data'], dest: 'public/data'},
            {repo: REPO, files: ['public/favicon.svg'], dest: 'public'}
        ]
    }));
});

test('file paths are validated like folder paths', () => {
    // Embedded traversal is rejected. The split is on both separators: on
    // Windows path.sep is '\', so splitting a forward-slash manifest path on it
    // alone let 'public/../secrets' through unexamined.
    assert.throws(
        () => normalizeGithubConfigs({github: [{repo: REPO, files: ['public/../../secrets'], dest: 'public'}]}),
        /fetch\.github\.files cannot contain '\.\.'/
    );
    assert.throws(
        () => normalizeGithubConfigs({github: [{repo: REPO, folders: ['public/../../secrets'], dest: 'public'}]}),
        /fetch\.github\.folders cannot contain '\.\.'/
    );
    assert.throws(
        () => normalizeGithubConfigs({github: [{repo: REPO, files: [42], dest: 'public'}]}),
        /fetch\.github\.files entries must be strings/
    );

    // A leading './' or '../' is stripped rather than rejected, as it always was.
    const [entry] = normalizeGithubConfigs({github: [{repo: REPO, files: ['../public/favicon.svg'], dest: 'public'}]});
    assert.deepEqual(entry.files, ['public/favicon.svg']);
});

test('the shipped manifest fetches the public assets the artifact needs', async () => {
    const {config} = await import('../config.js');
    const entries = normalizeGithubConfigs(config.fetch);
    const destinations = entries.map(entry => path.basename(entry.destPath));
    assert.ok(destinations.includes('data'), 'public/data supplies the download buttons');

    const fileEntry = entries.find(entry => entry.files.length);
    assert.ok(fileEntry, 'a file entry exists');
    assert.deepEqual(
        fileEntry.files.map(file => path.basename(file)).sort(),
        ['.nojekyll', 'favicon.png', 'favicon.svg']
    );
});
