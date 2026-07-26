/*
 * Phase 5 (WP-19 / DD-007) cover for the render-parity harness.
 *
 * The harness exists so that a component silently ceasing to render is caught
 * by a check instead of rediscovered months later by a person comparing pages
 * side by side. Two layers are tested here:
 *
 *   1. The metric extractor and the regression rule, on inline fixtures. These
 *      always run and are what actually encode the contract — a page may gain
 *      content freely, but losing a heading, image, iframe, model viewer,
 *      table or gallery image is a regression, as is a new dangling link, a
 *      changed title, or any raw directive text reaching the page.
 *   2. The recorded baseline against a real artifact, when one is present.
 *      Building takes ~40 s, so this layer is skipped rather than triggered
 *      from a unit test; CI runs `node scripts/parity-metrics.js` after the
 *      build, and pages.yml gates the publish on it.
 *
 * Under R-7 nothing here compares URLs with the reference site: our urls are
 * deliberately allowed to differ. Only what a page renders is compared.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {collectMetrics, compareToBaseline, pageMetrics, routeOf, danglingLinks, BASELINE_PATH} from '../scripts/parity-metrics.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const RICH_PAGE = `<html><head><title>C3 Dev Kit M1</title><style>.heading{}</style></head>
<body>
<h1 class="heading bar">C3 Dev Kit M1</h1>
<img src="/blobs/a.webp">
<iframe src="https://www.youtube-nocookie.com/embed/x"></iframe>
<model-viewer src="https://example.invalid/a.glb"></model-viewer>
<table><tr><td>1</td></tr></table>
<div class="pswp-gallery container grid"><a data-pswp-width="800"></a><a data-pswp-width="600"></a></div>
<a href="/microcontrollers/esp32">ok</a>
<a href="/networks/nrf/">dead</a>
</body></html>`;

test('pageMetrics counts what a page renders, ignoring the head', () => {
    const metrics = pageMetrics(RICH_PAGE);
    assert.equal(metrics.title, 'C3 Dev Kit M1');
    assert.equal(metrics.headings, 1, 'the .heading rule in <style> must not be counted');
    assert.equal(metrics.images, 1);
    assert.equal(metrics.iframes, 1);
    assert.equal(metrics.modelViewers, 1);
    assert.equal(metrics.tables, 1);
    assert.equal(metrics.galleries, 1);
    assert.equal(metrics.galleryImages, 2);
    assert.equal(metrics.rawDirectives, 0);
});

test('raw directive text is detected as a defect', () => {
    const leaked = '<html><head><title>t</title></head><body><p>:iframe[]{src="x" title="y"}</p></body></html>';
    assert.equal(pageMetrics(leaked).rawDirectives, 1);
});

test('routeOf maps emitted files to routes', () => {
    assert.equal(routeOf('index.html'), '/');
    assert.equal(routeOf('microcontrollers/esp32/index.html'), '/microcontrollers/esp32');
    // Only index.html folds into its directory; a standalone page keeps its
    // filename, which is also how the host serves it.
    assert.equal(routeOf('404.html'), '/404.html');
});

test('danglingLinks reports only unresolvable internal targets', () => {
    const files = new Set(['microcontrollers/esp32/index.html', 'data/firmware.zip']);
    const routes = new Set(['/microcontrollers/esp32']);
    const html = [
        '<a href="/microcontrollers/esp32">resolves as a route</a>',
        '<a href="/data/firmware.zip">resolves as a file</a>',
        '<a href="https://example.invalid/x">external</a>',
        '<a href="#section">fragment</a>',
        '<a href="relative/page">relative</a>',
        '<a href="/networks/nrf/">dead</a>'
    ].join('');
    assert.deepEqual(danglingLinks(html, {files, routes, base: '/'}), ['/networks/nrf/']);
});

test('danglingLinks strips a sub-path base before resolving (R-9)', () => {
    const files = new Set(['microcontrollers/esp32/index.html']);
    const routes = new Set(['/microcontrollers/esp32']);
    const html = '<a href="/astro-huge-doc/microcontrollers/esp32">based</a>';
    assert.deepEqual(danglingLinks(html, {files, routes, base: '/astro-huge-doc/'}), []);
});

test('danglingLinks decodes percent-encoded targets', () => {
    const files = new Set(['data/tag four ping.zip']);
    const html = '<a href="/data/tag%20four%20ping.zip">encoded</a>';
    assert.deepEqual(danglingLinks(html, {files, routes: new Set(), base: '/'}), []);
});

test('compareToBaseline fails on loss and tolerates gain', () => {
    const baseline = {pages: {'/a': {title: 'A', headings: 3, images: 2, iframes: 1, danglingLinks: 1}}};

    const unchanged = {pages: {'/a': {title: 'A', headings: 3, images: 2, iframes: 1, danglingLinks: 1, rawDirectives: 0}}};
    assert.deepEqual(compareToBaseline(unchanged, baseline), []);

    const grown = {pages: {'/a': {title: 'A', headings: 9, images: 4, iframes: 1, danglingLinks: 0, rawDirectives: 0}}};
    assert.deepEqual(compareToBaseline(grown, baseline), [], 'a page that gained content is not a regression');

    const lost = {pages: {'/a': {title: 'A', headings: 3, images: 2, iframes: 0, danglingLinks: 1, rawDirectives: 0}}};
    assert.deepEqual(
        compareToBaseline(lost, baseline),
        [{route: '/a', metric: 'iframes', expected: 1, actual: 0}]
    );

    const dropped = {pages: {}};
    assert.deepEqual(
        compareToBaseline(dropped, baseline),
        [{route: '/a', metric: 'page', expected: 'present', actual: 'missing'}]
    );
});

test('compareToBaseline fails on a new dangling link, a changed title, or raw directives', () => {
    const baseline = {pages: {'/a': {title: 'A', headings: 1, danglingLinks: 0}}};
    const worse = {pages: {'/a': {title: 'A', headings: 1, danglingLinks: 2, rawDirectives: 0}}};
    assert.deepEqual(compareToBaseline(worse, baseline), [{route: '/a', metric: 'danglingLinks', expected: 0, actual: 2}]);

    const renamed = {pages: {'/a': {title: 'B', headings: 1, danglingLinks: 0, rawDirectives: 0}}};
    assert.deepEqual(compareToBaseline(renamed, baseline), [{route: '/a', metric: 'title', expected: 'A', actual: 'B'}]);

    const leaked = {pages: {'/a': {title: 'A', headings: 1, danglingLinks: 0, rawDirectives: 1}}};
    assert.deepEqual(compareToBaseline(leaked, baseline), [{route: '/a', metric: 'rawDirectives', expected: 0, actual: 1}]);
});

test('the recorded baseline covers the parity features Phase 2 landed', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    assert.equal(baseline.totals.pages, 115);
    assert.equal(baseline.totals.iframes, 2, 'two YouTube embeds');
    assert.equal(baseline.totals.modelViewers, 12, 'twelve external GLB viewers');
    assert.equal(baseline.totals.galleries, 9);
    assert.equal(baseline.totals.galleryImages, 130);
    assert.equal(baseline.totals.rawDirectives, 0);
    assert.ok(baseline.pages['/microcontrollers/esp32/esp32-c3-devkitm-1'].tables >= 1, 'the C3 XLSX pinout renders as a table');
});

test('a present full artifact matches the recorded baseline', {skip: artifactSkipReason()}, () => {
    const current = collectMetrics(path.join(ROOT_DIR, 'dist'));
    assert.deepEqual(compareToBaseline(current, JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))), []);
});

/* The lite artifact emits 76 of the 115 pages, so comparing it to the full
 * baseline would report 39 phantom regressions. Only run against an artifact
 * that is the publish target (R-1). */
function artifactSkipReason() {
    const dist = path.join(ROOT_DIR, 'dist');
    if (!fs.existsSync(path.join(dist, 'index.html'))) return 'no built artifact in dist/';
    const pages = collectMetrics(dist).totals.pages;
    const expected = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')).totals.pages;
    return pages === expected ? false : `dist/ holds ${pages} pages, not the ${expected}-page full artifact`;
}
