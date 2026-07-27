import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {utils, write} from 'xlsx';
import {classifyLinkComponent, extensionFromUrl} from '../src/components/markdown/link-components.js';
import {normalizeIframeSrc} from '../src/components/markdown/directive/iframe.js';
import {
    resolveXlsxPath,
    rowsToTableModel,
    workbookBufferToTableModel
} from '../src/components/markdown/table/xlsx-table.js';

test('iframe URLs map YouTube share and watch URLs to embeds', () => {
    assert.equal(
        normalizeIframeSrc('https://youtu.be/TfBXTf1QenI?si=abc'),
        'https://www.youtube.com/embed/TfBXTf1QenI'
    );
    assert.equal(
        normalizeIframeSrc('https://www.youtube.com/watch?v=-Qnhs4Jbu7k&t=2'),
        'https://www.youtube.com/embed/-Qnhs4Jbu7k'
    );
    assert.equal(normalizeIframeSrc('/local/embed.html'), '/local/embed.html');
});

test('GLB stays full-only while XLSX links render as tables in both profiles', () => {
    const glb = 'https://raw.githubusercontent.com/example/model.glb?download=1';
    assert.equal(extensionFromUrl(glb), 'glb');
    assert.equal(classifyLinkComponent({url: glb, profile: 'full'}).model3d, true);
    assert.equal(classifyLinkComponent({url: glb, profile: 'lite'}).link, true);

    const xlsx = './images/pinout.xlsx';
    assert.equal(classifyLinkComponent({url: xlsx, profile: 'full'}).table, true);
    assert.equal(classifyLinkComponent({url: xlsx, profile: 'lite'}).table, true);
    assert.equal(classifyLinkComponent({url: xlsx, profile: 'lite'}).link, false);
    assert.equal(classifyLinkComponent({url: 'https://example.com/', profile: 'full'}).link, true);
});

test('XLSX assets classify as tables from the collected extension alone', () => {
    // Lite items carry no link ast; the workbook is identified by asset ext.
    const result = classifyLinkComponent({
        url: undefined,
        assetExt: '.xlsx',
        hasAsset: true,
        profile: 'lite'
    });
    assert.equal(result.table, true);
    assert.equal(result.link, false);
});

test('diagram assets retain priority over ordinary links', () => {
    const result = classifyLinkComponent({
        url: './architecture.puml',
        assetExt: '.puml',
        hasAsset: true,
        profile: 'full',
        diagram: true
    });
    assert.equal(result.diagram, true);
    assert.equal(result.link, false);
});

test('XLSX paths resolve beside the source document and cannot escape content', () => {
    const root = mkdtempSync(join(tmpdir(), 'phase2-xlsx-'));
    try {
        mkdirSync(join(root, 'guides', 'files'), {recursive: true});
        const expected = join(root, 'guides', 'files', 'pinout.xlsx');
        writeFileSync(expected, 'fixture');
        assert.equal(resolveXlsxPath(root, 'guides/page.md', './files/pinout.xlsx'), expected);
        assert.equal(resolveXlsxPath(root, 'guides/page.md', '../../outside.xlsx'), null);
        assert.equal(resolveXlsxPath(root, 'guides/page.md', 'https://example.com/table.xlsx'), null);
    } finally {
        rmSync(root, {recursive: true, force: true});
    }
});

test('XLSX first sheet becomes the current rich table model', () => {
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([
        ['Pin', 'Function'],
        [1, '3V3'],
        [2, 'GND']
    ]), 'Pins');
    const buffer = write(workbook, {type: 'buffer', bookType: 'xlsx'});
    assert.deepEqual(workbookBufferToTableModel(buffer), rowsToTableModel([
        ['Pin', 'Function'],
        ['1', '3V3'],
        ['2', 'GND']
    ]));
});

test('directive dispatch includes iframe and inline details, and Tag is gone', () => {
    const directive = readFileSync(
        new URL('../src/components/markdown/directive/Directive.astro', import.meta.url),
        'utf8'
    );
    const markdown = readFileSync(
        new URL('../src/components/markdown/AstroMarkdown.astro', import.meta.url),
        'utf8'
    );
    assert.match(directive, /IframeDirective/);
    assert.match(directive, /DetailsDirective/);
    assert.match(directive, /otherSuffix/);
    assert.doesNotMatch(directive, /<div>\{name\}/);
    assert.doesNotMatch(markdown, /Tag\.astro/);
});
