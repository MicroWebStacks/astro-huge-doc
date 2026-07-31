import assert from 'node:assert/strict';
import test from 'node:test';

import {process_toc_list, toc_meta_enabled} from '../src/layout/layout_utils.js';

const headings = [
    {slug: 'intro', title: 'Intro', level: 1, order_index: 0},
    {slug: 'details', title: 'Details', level: 2, order_index: 1}
];

test('outline pane shows by default when the page has headings', () => {
    const toc = process_toc_list(headings);
    assert.equal(toc.visible, true);
    assert.equal(toc.items.length, 1);
});

test('frontmatter toc:false suppresses the outline pane despite headings', () => {
    const toc = process_toc_list(headings, false);
    assert.equal(toc.visible, false);
    assert.deepEqual(toc.items, []);
});

test('frontmatter toc:true keeps the default outline pane', () => {
    assert.equal(process_toc_list(headings, true).visible, true);
});

test('toc:true cannot fabricate an outline for a page without headings', () => {
    assert.equal(process_toc_list([], true).visible, false);
});

test('string and numeric false forms from other generators are honored', () => {
    for (const value of ['false', 'False', ' no ', 'off', '0', 0]) {
        assert.equal(toc_meta_enabled(value), false, `expected ${JSON.stringify(value)} to disable the toc`);
        assert.equal(process_toc_list(headings, value).visible, false);
    }
});

test('absent or unrelated toc values leave the default untouched', () => {
    for (const value of [undefined, null, '', 'yes', 'true', 1, {}]) {
        assert.equal(toc_meta_enabled(value), true, `expected ${JSON.stringify(value)} to keep the toc`);
    }
});
