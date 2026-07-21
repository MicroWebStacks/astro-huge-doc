import test from 'node:test';
import assert from 'node:assert/strict';
import {remark} from '../packages/content-structure/node_modules/remark/index.js';
import remarkGfm from '../packages/content-structure/node_modules/remark-gfm/index.js';
import {buildDocumentContent} from '../packages/content-structure/src/md_utils.js';
import {buildDocumentRow} from '../packages/content-structure/src/structure_db.js';
import {buildRichTableModel} from '../src/components/markdown/table/rich-table.js';
import {astToDataTable} from '../src/components/markdown/table/table.js';
import {relationRowsFromItems, transformStoredItemLinks, visitAstLinks} from '../src/libs/ast-links.js';

function md_tree(source) {
    return remark().use(remarkGfm).parse(source);
}

const markdown = `| Kind | Link |
|---|---|
| External label | [Open Knowledge Foundation](https://okfn.org/) |
| Bare URL | https://okfn.org/ |
| Internal concept | [Frontmatter examples](./frontmatter-examples.md) |
| Unresolved concept | [Missing concept](./missing-concept.md) |`;

test('rich table model keeps text sort keys separate from resolved link tokens', () => {
    const table = md_tree(markdown).children.find((node) => node.type === 'table');
    const model = buildRichTableModel(table, (link) => ({
        href: link.url,
        className: link.url.startsWith('http') ? 'link external' : 'link concept',
        external: link.url.startsWith('http'),
        unresolved: link.url.includes('missing')
    }));

    assert.deepEqual(model.rows.map((row) => row[1].text), [
        'Open Knowledge Foundation',
        'https://okfn.org/',
        'Frontmatter examples',
        'Missing concept'
    ]);
    assert.equal(model.rows[0][1].content[0].type, 'link');
    assert.equal(model.rows[0][1].content[0].href, 'https://okfn.org/');
    assert.equal(model.rows[3][1].content[0].unresolved, true);
});

test('plain table storage conversion remains the existing string row format', () => {
    const table = md_tree('| Name | Count |\n|---|---|\n| Alpha | 2 |').children[0];
    assert.deepEqual(astToDataTable(table), [['Name', 'Count'], ['Alpha', '2']]);
});

test('collection keeps the table asset contract and stores rich table AST separately', async () => {
    const entry = {uid: 'link-table', sid: 'link-table-sid', path: 'link-examples.md'};
    const result = await buildDocumentContent(entry, markdown);
    const payload = buildDocumentRow(entry, result.document, {columns: []}, {
        tree: result.tree,
        assets: result.assets,
        versionId: 'test'
    });
    const tableAsset = result.assets.find((asset) => asset.type === 'table');
    const tableItem = payload.items.find((item) => item.type === 'table');
    const storedAst = JSON.parse(tableItem.ast);
    const storedLinks = [];
    visitAstLinks(storedAst, (link) => storedLinks.push(link.url));

    assert.equal(tableItem.asset_uid, tableAsset.uid);
    assert.ok(Array.isArray(JSON.parse(tableAsset.blob_content)));
    assert.deepEqual(storedLinks, [
        'https://okfn.org/',
        'https://okfn.org/',
        './frontmatter-examples.md',
        './missing-concept.md'
    ]);
});

test('lite stored-item traversal classifies, rewrites, and indexes links nested in table AST', async () => {
    const {classifyStoredLinkAst} = await import('../src/libs/structure-db-lazy.js');
    const source = {sid: 'links', path: 'link-examples.md'};
    const target = {sid: 'frontmatter', path: 'frontmatter-examples.md', url: 'frontmatter-examples'};
    const table = md_tree(markdown).children.find((node) => node.type === 'table');
    const item = {type: 'table', ast: JSON.stringify(table)};
    const documentsByPath = new Map([[target.path, target]]);
    item.ast = transformStoredItemLinks(
        item,
        (link) => classifyStoredLinkAst(link, source, documentsByPath)
    );
    const rows = relationRowsFromItems(source, [
        {type: 'heading', slug: 'links-inside-tables'},
        item
    ]);

    assert.deepEqual(rows.map((row) => row.status), ['external', 'external', 'resolved', 'unresolved']);
    assert.deepEqual(rows.map((row) => row.source_heading), Array(4).fill('links-inside-tables'));
    assert.equal(rows[2].target_sid, target.sid);
    const nestedLinks = [];
    visitAstLinks(JSON.parse(item.ast), (link) => nestedLinks.push(link));
    assert.equal(nestedLinks[2].url, '/frontmatter-examples');
    assert.equal(nestedLinks[3].rel.raw, './missing-concept.md');
});
