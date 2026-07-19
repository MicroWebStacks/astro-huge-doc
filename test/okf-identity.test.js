import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {iterate_documents, set_config} from '../packages/content-structure/src/collect.js';

async function collectEntries(contentDir) {
    const originalCwd = process.cwd();
    try {
        set_config({rootdir: contentDir, contentdir: contentDir, folder_single_doc: false});
        process.chdir(contentDir);
        const entries = [];
        for await (const source of iterate_documents()) {
            entries.push(source.entry);
        }
        return entries;
    } finally {
        process.chdir(originalCwd);
    }
}

function makeContentDir(prefix) {
    return mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('path segments are slugified for identity; title never affects the url', async () => {
    const contentDir = makeContentDir('okf-identity-');
    try {
        mkdirSync(path.join(contentDir, 'My Folder'));
        writeFileSync(path.join(contentDir, 'My Folder', 'Data File.md'), '---\ntitle: Completely Different Title\n---\n\n# Body');

        const entries = await collectEntries(contentDir);

        assert.equal(entries.length, 1);
        assert.equal(entries[0].url, 'my-folder/data-file');
        assert.equal(entries[0].title, 'Completely Different Title');
    } finally {
        rmSync(contentDir, {recursive: true, force: true});
    }
});

test('frontmatter slug stays an explicit identity override', async () => {
    const contentDir = makeContentDir('okf-identity-slug-');
    try {
        writeFileSync(path.join(contentDir, 'page one.md'), '---\nslug: custom-route\n---\n\n# Body');

        const entries = await collectEntries(contentDir);

        assert.equal(entries[0].url, 'custom-route');
    } finally {
        rmSync(contentDir, {recursive: true, force: true});
    }
});

test('landing priority: index.md wins over readme.md, readme.md is demoted to a child page', async () => {
    const contentDir = makeContentDir('okf-landing-both-');
    try {
        mkdirSync(path.join(contentDir, 'knowledge'));
        writeFileSync(path.join(contentDir, 'knowledge', 'index.md'), '# Landing');
        writeFileSync(path.join(contentDir, 'knowledge', 'readme.md'), '# Readme');

        const entries = await collectEntries(contentDir);
        const byPath = new Map(entries.map((entry) => [entry.path, entry]));

        assert.equal(byPath.get('knowledge/index.md').url_type, 'dir');
        assert.equal(byPath.get('knowledge/index.md').url, 'knowledge');
        assert.equal(byPath.get('knowledge/readme.md').url_type, 'file');
        assert.equal(byPath.get('knowledge/readme.md').url, 'knowledge/readme');
    } finally {
        rmSync(contentDir, {recursive: true, force: true});
    }
});

test('landing priority: readme.md keeps the landing role when alone', async () => {
    const contentDir = makeContentDir('okf-landing-readme-');
    try {
        mkdirSync(path.join(contentDir, 'guides'));
        writeFileSync(path.join(contentDir, 'guides', 'readme.md'), '# Readme');
        writeFileSync(path.join(contentDir, 'guides', 'other.md'), '# Other');

        const entries = await collectEntries(contentDir);
        const byPath = new Map(entries.map((entry) => [entry.path, entry]));

        assert.equal(byPath.get('guides/readme.md').url_type, 'dir');
        assert.equal(byPath.get('guides/readme.md').url, 'guides');
        assert.equal(byPath.get('guides/other.md').url_type, 'file');
    } finally {
        rmSync(contentDir, {recursive: true, force: true});
    }
});

test('landing priority: index.md alone takes the landing role, beating same-name-as-parent', async () => {
    const contentDir = makeContentDir('okf-landing-index-');
    try {
        mkdirSync(path.join(contentDir, 'topic'));
        writeFileSync(path.join(contentDir, 'topic', 'index.md'), '# Landing');
        writeFileSync(path.join(contentDir, 'topic', 'topic.md'), '# Same name');

        const entries = await collectEntries(contentDir);
        const byPath = new Map(entries.map((entry) => [entry.path, entry]));

        assert.equal(byPath.get('topic/index.md').url_type, 'dir');
        assert.equal(byPath.get('topic/topic.md').url_type, 'file');
    } finally {
        rmSync(contentDir, {recursive: true, force: true});
    }
});

test('same-name-as-parent still lands the folder when no reserved file exists', async () => {
    const contentDir = makeContentDir('okf-landing-parent-');
    try {
        mkdirSync(path.join(contentDir, 'widget'));
        writeFileSync(path.join(contentDir, 'widget', 'widget.md'), '# Widget');

        const entries = await collectEntries(contentDir);

        assert.equal(entries[0].url_type, 'dir');
        assert.equal(entries[0].url, 'widget');
    } finally {
        rmSync(contentDir, {recursive: true, force: true});
    }
});

test('OKF frontmatter fields land on the entry; timestamp maps to date; unknown fields stay meta', async () => {
    const contentDir = makeContentDir('okf-fields-');
    try {
        writeFileSync(path.join(contentDir, 'concept.md'), [
            '---',
            'type: metric',
            'description: A described concept',
            'resource: https://example.com/dash',
            'timestamp: "2026-07-12"',
            'owner: Data team',
            '---',
            '',
            '# Concept'
        ].join('\n'));

        const entries = await collectEntries(contentDir);
        const entry = entries[0];

        assert.equal(entry.type, 'metric');
        assert.equal(entry.description, 'A described concept');
        assert.equal(entry.resource, 'https://example.com/dash');
        assert.equal(entry.date, '2026-07-12');
        assert.deepEqual(JSON.parse(entry.meta_data), {owner: 'Data team'});
    } finally {
        rmSync(contentDir, {recursive: true, force: true});
    }
});
