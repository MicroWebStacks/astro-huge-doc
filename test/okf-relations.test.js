import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {set_config} from '../packages/content-structure/src/collect.js';
import {buildRelationRows, resolveLinkRelation} from '../packages/content-structure/src/relations.js';

function makeFixture() {
    const contentDir = mkdtempSync(path.join(os.tmpdir(), 'okf-relations-'));
    const rootDir = mkdtempSync(path.join(os.tmpdir(), 'okf-relations-root-'));
    mkdirSync(path.join(rootDir, 'public'));
    set_config({rootdir: rootDir, contentdir: contentDir, folder_single_doc: false});
    return {contentDir, rootDir};
}

test('buildRelationRows classifies relative, root-absolute, fragment, external, asset, public, and missing targets', async () => {
    const {contentDir, rootDir} = makeFixture();
    try {
        mkdirSync(path.join(contentDir, 'tables'));
        writeFileSync(path.join(contentDir, 'tables', 'customers.md'), '# Customers');
        writeFileSync(path.join(contentDir, 'metrics.md'), '# Metrics');
        writeFileSync(path.join(contentDir, 'diagram.svg'), '<svg/>');
        writeFileSync(path.join(rootDir, 'public', 'brochure.pdf'), 'pdf');

        const documents = [
            {sid: 'src1', path: 'metrics.md', links: [
                {url: './tables/customers.md', text: 'Customers', heading: 'calculation'},
                {url: '/tables/customers.md#schema', text: 'Root absolute', heading: null},
                {url: 'https://okfn.org/', text: 'External', heading: null},
                {url: './missing.md', text: 'Missing', heading: null},
                {url: './diagram.svg', text: 'Asset', heading: null},
                {url: '/brochure.pdf', text: 'Public asset', heading: null},
                {url: '#local-anchor', text: 'Anchor', heading: null}
            ]},
            {sid: 'src2', path: 'tables/customers.md', links: [
                {url: '../metrics.md', text: 'Back to metrics', heading: 'usage'}
            ]}
        ];

        const rows = await buildRelationRows({documents, versionId: 'v-test'});
        const byRaw = new Map(rows.map((row) => [row.target_raw, row]));

        assert.equal(byRaw.get('./tables/customers.md').status, 'resolved');
        assert.equal(byRaw.get('./tables/customers.md').target_sid, 'src2');
        assert.equal(byRaw.get('./tables/customers.md').source_heading, 'calculation');

        const rootAbsolute = byRaw.get('/tables/customers.md#schema');
        assert.equal(rootAbsolute.status, 'resolved');
        assert.equal(rootAbsolute.target_sid, 'src2');
        assert.equal(rootAbsolute.fragment, 'schema');

        assert.equal(byRaw.get('https://okfn.org/').status, 'external');
        assert.equal(byRaw.get('https://okfn.org/').external, true);

        assert.equal(byRaw.get('./missing.md').status, 'unresolved');
        assert.equal(byRaw.get('./diagram.svg').status, 'asset');
        assert.equal(byRaw.get('/brochure.pdf').status, 'public');

        assert.equal(byRaw.has('#local-anchor'), false, 'anchor-only links are not relations');

        const backRef = byRaw.get('../metrics.md');
        assert.equal(backRef.status, 'resolved');
        assert.equal(backRef.target_sid, 'src1');
        assert.equal(backRef.version_id, 'v-test');
    } finally {
        rmSync(contentDir, {recursive: true, force: true});
        rmSync(rootDir, {recursive: true, force: true});
    }
});

test('directory links resolve to the landing document and extension-less links try .md', async () => {
    const {contentDir, rootDir} = makeFixture();
    try {
        mkdirSync(path.join(contentDir, 'knowledge'));
        writeFileSync(path.join(contentDir, 'knowledge', 'index.md'), '# Landing');
        writeFileSync(path.join(contentDir, 'guide.md'), '# Guide');

        const documents = [
            {sid: 'landing', path: 'knowledge/index.md', url_type: 'dir', links: []},
            {sid: 'guide', path: 'guide.md', url_type: 'file', links: []},
            {sid: 'home', path: 'readme.md', url_type: 'dir', links: [
                {url: './knowledge', text: 'Folder link', heading: null},
                {url: './guide', text: 'Extension-less link', heading: null}
            ]}
        ];

        const rows = await buildRelationRows({documents, versionId: 'v-test'});
        const byRaw = new Map(rows.map((row) => [row.target_raw, row]));

        assert.equal(byRaw.get('./knowledge').status, 'resolved');
        assert.equal(byRaw.get('./knowledge').target_sid, 'landing');
        assert.equal(byRaw.get('./guide').status, 'resolved');
        assert.equal(byRaw.get('./guide').target_sid, 'guide');
    } finally {
        rmSync(contentDir, {recursive: true, force: true});
        rmSync(rootDir, {recursive: true, force: true});
    }
});

test('matching is case-sensitive and URL-decoded (OP-1)', async () => {
    const {contentDir, rootDir} = makeFixture();
    try {
        mkdirSync(path.join(contentDir, 'docs'));
        writeFileSync(path.join(contentDir, 'docs', 'My File.md'), '# Spaced name');

        const docByPath = new Map([['docs/My File.md', {sid: 'target'}]]);

        const decoded = await resolveLinkRelation({
            sourcePath: 'docs/other.md',
            rawUrl: './My%20File.md',
            docByPath
        });
        assert.equal(decoded.status, 'resolved');
        assert.equal(decoded.target_sid, 'target');

        const wrongCase = await resolveLinkRelation({
            sourcePath: 'docs/other.md',
            rawUrl: './my file.md',
            docByPath
        });
        assert.notEqual(wrongCase.status, 'resolved');
    } finally {
        rmSync(contentDir, {recursive: true, force: true});
        rmSync(rootDir, {recursive: true, force: true});
    }
});

test('targets escaping the content root are unresolved', async () => {
    const {contentDir, rootDir} = makeFixture();
    try {
        const resolution = await resolveLinkRelation({
            sourcePath: 'page.md',
            rawUrl: '../outside.md',
            docByPath: new Map()
        });
        assert.equal(resolution.status, 'unresolved');
    } finally {
        rmSync(contentDir, {recursive: true, force: true});
        rmSync(rootDir, {recursive: true, force: true});
    }
});
