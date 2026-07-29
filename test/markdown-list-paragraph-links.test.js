import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDocumentContent} from '../packages/content-structure/src/md_utils.js';
import {buildDocumentRow} from '../packages/content-structure/src/structure_db.js';

async function collectItems(markdown) {
    const entry = {
        uid: 'markdown-structure',
        sid: 'markdown-structure-sid',
        path: 'markdown-structure.md'
    };
    const result = await buildDocumentContent(entry, markdown);
    return buildDocumentRow(entry, result.document, {columns: []}, {
        tree: result.tree,
        assets: result.assets,
        versionId: 'test'
    }).items;
}

test('unordered lists retain list and list-item structure', async () => {
    const items = await collectItems('* Alpha\n* Beta\n* Gamma');

    assert.deepEqual(items.map((item) => item.type), [
        'list',
        'listItem',
        'paragraph',
        'listItem',
        'paragraph',
        'listItem',
        'paragraph'
    ]);
    assert.deepEqual(JSON.parse(items[0].ast), {
        ordered: false,
        start: null,
        spread: false,
        childCount: 6
    });
    assert.equal(JSON.parse(items[1].ast).childCount, 1);
    assert.equal(JSON.parse(items[3].ast).childCount, 1);
    assert.equal(JSON.parse(items[5].ast).childCount, 1);
});

test('ordered and nested lists retain their hierarchy', async () => {
    const items = await collectItems('3. Parent\n   * Child\n4. Sibling');
    const outerList = JSON.parse(items[0].ast);
    const nestedListIndex = items.findIndex((item, index) => index > 0 && item.type === 'list');
    const nestedList = JSON.parse(items[nestedListIndex].ast);

    assert.equal(outerList.ordered, true);
    assert.equal(outerList.start, 3);
    assert.equal(outerList.childCount, items.length - 1);
    assert.ok(nestedListIndex > 0);
    assert.equal(nestedList.ordered, false);
    assert.equal(nestedList.childCount, 2);
});

test('formatted text beside a link remains inline while standalone paragraphs stay blocks', async () => {
    const items = await collectItems(
        'Before **bold** [documentation](https://example.com) after *emphasis*.\n\n' +
        'Standalone **formatted** paragraph.'
    );
    const linkIndex = items.findIndex((item) => item.type === 'link');
    const beforeAst = JSON.parse(items[linkIndex - 1].ast);
    const afterAst = JSON.parse(items[linkIndex + 1].ast);
    const standaloneAst = JSON.parse(items.at(-1).ast);

    assert.equal(beforeAst.type, 'root');
    assert.equal(afterAst.type, 'root');
    assert.equal(standaloneAst.type, 'paragraph');
    assert.equal(items[linkIndex].body_text, 'documentation');
});
