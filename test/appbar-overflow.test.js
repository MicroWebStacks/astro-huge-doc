import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';

import {fitAppBarItems} from '../src/layout/appbar_fit.js';

const root = join(import.meta.dirname, '..');
const appBarSource = readFileSync(join(root, 'src/layout/AppBar.astro'), 'utf8');
const overflowSource = readFileSync(join(root, 'src/layout/appbar_overflow.js'), 'utf8');
const layoutSource = readFileSync(join(root, 'src/layout/Layout.astro'), 'utf8');

test('all root sections remain inline when their rendered widths fit', () => {
    assert.deepEqual(
        fitAppBarItems([60, 80, 90], 250, {activeIndex: 1, overflowWidth: 50, safety: 8}),
        {
            visibleIndices: [0, 1, 2],
            hiddenIndices: [],
            compact: false
        }
    );
});

test('priority overflow pins active and Home before ordered siblings', () => {
    assert.deepEqual(
        fitAppBarItems([60, 80, 90, 70], 280, {activeIndex: 2, overflowWidth: 50, safety: 0}),
        {
            visibleIndices: [0, 1, 2],
            hiddenIndices: [3],
            compact: false
        }
    );
});

test('an active label that cannot share the row with More selects compact mode', () => {
    assert.deepEqual(
        fitAppBarItems([60, 180, 70], 210, {activeIndex: 1, overflowWidth: 50, safety: 8}),
        {
            visibleIndices: [],
            hiddenIndices: [0, 1, 2],
            compact: true
        }
    );
});

test('the app bar owns clipped one-row regions and accessible disclosures', () => {
    assert.match(appBarSource, /data-appbar/);
    assert.match(appBarSource, /class="section-nav"[^>]*data-section-nav/);
    assert.match(appBarSource, /\.section-nav\s*\{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;/s);
    assert.match(appBarSource, /\.navbar-left\s*\{[^}]*flex-wrap:\s*nowrap;/s);
    assert.match(appBarSource, /\.navbar-right\s*\{[^}]*flex:\s*0 0 auto;[^}]*flex-wrap:\s*nowrap;/s);
    assert.doesNotMatch(appBarSource, /\.navbar-left\s*\{[^}]*flex-wrap:\s*wrap;/s);
    assert.match(appBarSource, /aria-controls="section-overflow-panel"/);
    assert.match(appBarSource, /aria-controls="utility-overflow-panel"/);
    assert.match(appBarSource, /data-section-overflow-label>More</);
    assert.match(appBarSource, /data-utility-overflow-toggle[\s\S]*?<span>Tools<\/span>/);
    assert.match(appBarSource, /aria-current=\{item\.active_class === 'active' \? 'page' : undefined\}/);
    assert.match(
        layoutSource,
        /\.appbar-nav_content-footer\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100vw;[^}]*min-width:\s*0;/s
    );
    assert.match(layoutSource, /#wide-nav\s*\{[^}]*overflow:\s*hidden;/s);
    assert.match(layoutSource, /#toc-nav-div\s*\{[^}]*overflow:\s*hidden;/s);
    assert.match(layoutSource, /main\s*\{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;/s);
});

test('secondary tools move as their existing DOM nodes and disclosures restore focus', () => {
    assert.match(overflowSource, /utilityItems\.forEach\(\(item\) => list\.append\(item\)\)/);
    assert.match(overflowSource, /toolbar\.insertBefore\(item, returnAnchor\)/);
    assert.match(overflowSource, /event\.key !== 'Escape'/);
    assert.match(overflowSource, /closeDisclosure\(disclosure, \{restoreFocus: true\}\)/);
    assert.match(overflowSource, /document\.fonts\?\.ready\?\.then\(scheduleFit\)/);
    assert.match(overflowSource, /new ResizeObserver\(scheduleFit\)/);
});
