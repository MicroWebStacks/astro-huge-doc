import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {computeDetailsContentWidth} from '../src/components/markdown/directive/details_width.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const detailsSource = readFileSync(
    join(root, 'src/components/markdown/directive/DetailsDirective.astro'),
    'utf8'
);
const highlighterSource = readFileSync(
    join(root, 'src/components/markdown/code/Highlighter.astro'),
    'utf8'
);
const codeControlsSource = readFileSync(
    join(root, 'src/components/markdown/code/code_controls.js'),
    'utf8'
);
const layoutSource = readFileSync(join(root, 'src/layout/Layout.astro'), 'utf8');

function cssBlock(source, selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = source.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
    assert.ok(match, `missing CSS block for ${selector}`);
    return match[1];
}

test('details uses a standard column and a measured open-state width', () => {
    const details = cssBlock(detailsSource, 'details');
    const wideDetails = cssBlock(detailsSource, 'details[open][data-wide-code="true"]');

    assert.match(details, /--details-standard-width:\s*calc\(var\(--prose-measure\)/);
    assert.match(details, /width:\s*min\(100%,\s*var\(--details-standard-width\)\)\s*;/);
    assert.match(details, /max-width:\s*100%\s*;/);
    assert.match(details, /box-sizing:\s*border-box\s*;/);
    assert.match(wideDetails, /var\(--details-content-width,\s*0px\)/);
    assert.doesNotMatch(details, /min-width:\s*98%/);
    assert.doesNotMatch(details, /overflow(?:-x)?:\s*auto/);
});

test('details descendants can shrink while code owns long-line scrolling', () => {
    const body = cssBlock(detailsSource, '.details-body');
    const nestedCodeShell = cssBlock(detailsSource, '.details-body :global(.code-shell:not(.embedded))');
    const codeShell = cssBlock(highlighterSource, '.code-shell');
    const highlighter = cssBlock(highlighterSource, '.highlighter.container');
    const content = cssBlock(layoutSource, '.content');

    assert.match(body, /min-width:\s*0\s*;/);
    assert.match(body, /max-width:\s*100%\s*;/);
    assert.match(nestedCodeShell, /width:\s*100%\s*;/);
    assert.match(codeShell, /max-width:\s*100%\s*;/);
    assert.match(highlighter, /min-width:\s*0\s*;/);
    assert.match(content, /min-width:\s*0\s*;/);
    assert.match(highlighterSource, /overflow-x:\s*auto\s*;/);
});

test('measured width adds only real code overflow to the standard shell', () => {
    assert.equal(computeDetailsContentWidth(720, 980, 680), 1020);
    assert.equal(computeDetailsContentWidth(500, 1180, 460), 1220);
    assert.equal(computeDetailsContentWidth(720, 680, 680), null);
    assert.equal(computeDetailsContentWidth(720, 680.5, 680), null);
    assert.equal(computeDetailsContentWidth(Number.NaN, 900, 680), null);
});

test('code controls resync details width for open state and wrap changes', () => {
    assert.match(codeControlsSource, /addEventListener\('toggle',[\s\S]*syncDetailsContentWidth/);
    assert.match(codeControlsSource, /data-wrap-lines/);
    assert.match(codeControlsSource, /code\.scrollWidth/);
    assert.match(codeControlsSource, /code\.clientWidth/);
    assert.match(codeControlsSource, /--details-content-width/);
    assert.match(codeControlsSource, /removeProperty\('--details-content-width'\)/);
    assert.match(codeControlsSource, /setAttribute\('data-wide-code',\s*'true'\)/);
    assert.match(highlighterSource, /<script>\s*import '\.\/code_controls\.js';\s*<\/script>/);
});
