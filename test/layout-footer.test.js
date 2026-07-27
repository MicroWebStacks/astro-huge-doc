import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..');
const layoutSource = readFileSync(join(root, 'src/layout/Layout.astro'), 'utf8');
const footerSource = readFileSync(join(root, 'src/layout/RelationsFooter.astro'), 'utf8');
const previewSource = readFileSync(join(root, 'src/layout/link_preview.js'), 'utf8');
const appBarSource = readFileSync(join(root, 'src/layout/AppBar.astro'), 'utf8');
const indexBarSource = readFileSync(join(root, 'src/layout/LiteRelationIndexer.astro'), 'utf8');

test('short articles push the relations footer to the viewport bottom', () => {
    assert.match(
        layoutSource,
        /\.article-slot\s+:global\(\.relations-footer\)\s*\{[^}]*margin-top:\s*auto;/s
    );
});

test('previous and next links use a compact horizontal layout', () => {
    assert.match(
        footerSource,
        /\.prev-next a\s*\{[^}]*align-items:\s*baseline;[^}]*padding:\s*var\(--space-1\) var\(--space-3\);/s
    );
    assert.match(footerSource, /\.prev-next \.next\s*\{[^}]*flex-direction:\s*row-reverse;/s);
});

test('relations navigation opts out of hover previews', () => {
    assert.match(footerSource, /<footer class="relations-footer" data-link-preview="off">/);
    assert.match(previewSource, /anchor\.closest\('\[data-link-preview="off"\]'\)/);
});

/* The closing band carries prev/next and nothing else: references live in the
   neighborhood graph, which is an app-bar icon rather than a footer button. A
   two-link row has nothing worth collapsing, so it keeps no arrow either. */
test('the relations footer holds prev/next only', () => {
    assert.doesNotMatch(footerSource, /CollapsibleBand/);
    assert.doesNotMatch(footerSource, /getBacklinks|class="backlinks"/);
    assert.doesNotMatch(footerSource, /open-graph/);
});

test('the neighborhood graph opens from the app bar, with its modal in the same root', () => {
    assert.match(appBarSource, /data-graph-root[^>]*data-graph-sid=\{graphSid\}/s);
    assert.match(appBarSource, /class="nav-toggle" data-action="open-graph"/);
    const entry = appBarSource.match(/<li class="nav-toggle-item graph-entry"(.*?)<\/li>/s);
    assert.ok(entry, 'expected the graph entry to be one <li>');
    assert.match(entry[1], /graph-render-target/);
    assert.match(entry[1], /<PanZoomModal/);
    assert.match(layoutSource, /graphSid=\{graphSid\}/);
});

/* .nav-toggle sets display:flex, which outranks the UA's [hidden] rule — the
   preview lock hides itself outside the webview and would otherwise sit there
   visible and dead. */
test('app bar toggles honour the hidden attribute', () => {
    assert.match(appBarSource, /\.nav-toggle\[hidden\]\s*\{\s*display:\s*none;?\s*\}/s);
});

/* Hide and show are one control that travels with the bar: a handle on the
   bar's top edge, so the same button rides the slide in both directions
   instead of a chevron vanishing and a tab appearing where it stood. */
test('the index status bar has a single handle riding its top edge', () => {
    assert.doesNotMatch(indexBarSource, /data-index-collapse|data-index-reopen/);
    assert.equal(indexBarSource.match(/data-index-toggle/g)?.length, 1);
    const handle = indexBarSource.match(/\n\.index-handle\s*\{([^}]*)\}/s);
    assert.ok(handle, 'expected an .index-handle rule');
    assert.match(handle[1], /position:\s*absolute/);
    assert.match(handle[1], /bottom:\s*calc\(100% - 1px\)/);
    assert.match(handle[1], /right:\s*var\(--index-toggle-inset\)/);
    assert.match(handle[1], /width:\s*var\(--index-toggle-width\)/);
    assert.match(handle[1], /height:\s*var\(--index-toggle-height\)/);
    // The bar travels its full height; only the handle is left on screen, so
    // nothing may make the collapsed bar unclickable or invisible wholesale.
    const collapsed = indexBarSource.match(/\[data-collapsed="true"\]\s*\{([^}]*)\}/s);
    assert.match(collapsed[1], /transform:\s*translateY\(100%\)/);
    assert.doesNotMatch(collapsed[1], /visibility|pointer-events/);
});

test('the collapsed bar stays out of the accessibility tree', () => {
    assert.match(indexBarSource, /\[data-collapsed="true"\] \.index-body\s*\{\s*visibility:\s*hidden;?\s*\}/s);
});

/* The bar is fixed to the viewport bottom: without a reserve it would sit on
   top of the last lines of the article and the prev/next row. */
test('a showing index status bar reserves its height in the article scroller', () => {
    assert.match(
        layoutSource,
        /body:has\(\.lite-index-status:not\(\[data-collapsed="true"\]\)\)\)\s*\.content\s*\{[^}]*padding-bottom:\s*calc\(var\(--article-pad\) \+ var\(--index-status-height\) \+ var\(--index-status-handle\)\)/s
    );
    assert.match(indexBarSource, /min-height:\s*var\(--index-status-height\)/);
});

test('preview loading feedback cannot create scrollable overflow', () => {
    const loadingRule = layoutSource.match(/\.article-slot\s+:global\(a\.link-preview-loading\)\s*\{([^}]*)\}/s);
    assert.ok(loadingRule, 'expected a loading-state rule');
    assert.match(loadingRule[1], /background-size:/);
    assert.doesNotMatch(loadingRule[1], /position:\s*absolute|right:\s*-/);
    assert.doesNotMatch(layoutSource, /a\.link-preview-loading::after/);
});
