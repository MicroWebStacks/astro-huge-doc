import assert from 'node:assert/strict';
import test from 'node:test';

import {buildSectionMenuFromSourceEntries} from '../src/layout/source_navigation.js';

const entries = [
    {path: 'README.md', parent_path: '', name: 'README.md', entry_type: 'file', document_url: '', document_title: 'README', sort_order: 1},
    {path: 'loose.md', parent_path: '', name: 'loose.md', entry_type: 'file', document_url: 'loose', document_title: 'loose', sort_order: 2},
    {path: 'notes.txt', parent_path: '', name: 'notes.txt', entry_type: 'file', document_url: null, document_title: null},
    {path: 'section', parent_path: '', name: 'section', entry_type: 'dir', document_url: 'section', document_title: 'section', sort_order: 1},
    {path: 'section/topic', parent_path: 'section', name: 'topic', entry_type: 'dir', document_url: 'section/topic', document_title: 'topic', sort_order: 1},
    {path: 'section/topic/page.md', parent_path: 'section/topic', name: 'page.md', entry_type: 'file', document_url: 'section/topic/page', document_title: 'page', sort_order: 1},
    {path: 'other', parent_path: '', name: 'other', entry_type: 'dir', document_url: 'other', document_title: 'other', sort_order: 2},
    {path: 'other/page.md', parent_path: 'other', name: 'page.md', entry_type: 'file', document_url: 'other/page', document_title: 'page', sort_order: 1}
];

test('source-entry menu is scoped to the active top-level section', () => {
    const menu = buildSectionMenuFromSourceEntries(entries, '/section/topic/page');
    assert.equal(menu.length, 1);
    assert.equal(menu[0].nodeKey, 'section');
    assert.equal(menu[0].items[0].nodeKey, 'section/topic');
    assert.equal(menu[0].items[0].items[0].nodeKey, 'section/topic/page.md');
    assert.equal(menu[0].items[0].items[0].active, true);
    assert.equal(JSON.stringify(menu).includes('other'), false);
});

test('home source-entry menu contains only loose rendered root files', () => {
    const menu = buildSectionMenuFromSourceEntries(entries, '/');
    assert.deepEqual(menu.map((item) => item.nodeKey), ['README.md', 'loose.md']);
    assert.equal(menu[0].active, true);
    assert.equal(menu.some((item) => item.nodeKey === 'section'), false);
});
