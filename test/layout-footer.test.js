import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..');
const layoutSource = readFileSync(join(root, 'src/layout/Layout.astro'), 'utf8');
const footerSource = readFileSync(join(root, 'src/layout/RelationsFooter.astro'), 'utf8');
const previewSource = readFileSync(join(root, 'src/layout/link_preview.js'), 'utf8');

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

test('preview loading feedback cannot create scrollable overflow', () => {
    const loadingRule = layoutSource.match(/\.article-slot\s+:global\(a\.link-preview-loading\)\s*\{([^}]*)\}/s);
    assert.ok(loadingRule, 'expected a loading-state rule');
    assert.match(loadingRule[1], /background-size:/);
    assert.doesNotMatch(loadingRule[1], /position:\s*absolute|right:\s*-/);
    assert.doesNotMatch(layoutSource, /a\.link-preview-loading::after/);
});
