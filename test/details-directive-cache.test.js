import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(engineRoot, '.tmp', 'details-directive-cache-test');
const contentDir = join(fixtureRoot, 'content');
const storeDir = join(fixtureRoot, 'store');
const jsonDir = join(storeDir, 'json');
const source = [
    '# Fixture',
    '',
    '::::details{summary="build log"}',
    '```bash',
    '-- west build: generating a build system',
    '```',
    '::::',
    ''
].join('\n');

rmSync(fixtureRoot, {recursive: true, force: true});
mkdirSync(contentDir, {recursive: true});
writeFileSync(join(contentDir, 'details.md'), source);

process.env.DOCS_PROFILE = 'lite';
process.env.DOCS_BACKEND = 'json';
process.env.MICROWEBSTACKS_DOTENV_OVERRIDE = 'false';
process.env.MICROWEBSTACKS_ENGINE_ROOT = engineRoot;
process.env.MICROWEBSTACKS_WORKSPACE_ROOT = fixtureRoot;
process.env.MICROWEBSTACKS_MANIFEST_PATH = join(fixtureRoot, 'manifest.yaml');
process.env.MICROWEBSTACKS_DOCS_ROOT = contentDir;
process.env.MICROWEBSTACKS_STORE_PATH = storeDir;

const structureDb = await import('../src/libs/structure-db.js');
const [documentSummary] = structureDb.getDocuments();
const document = structureDb.getDocument({url: documentSummary?.url});

test('lite cache invalidates old container-directive records and reparses childCount', async () => {
    assert.ok(document?.sid, 'fixture document must be discovered');

    const pagesDir = join(jsonDir, 'pages');
    mkdirSync(pagesDir, {recursive: true});
    writeFileSync(join(pagesDir, `${document.sid}.json`), JSON.stringify({
        record_version: 2,
        hash: createHash('md5').update(source).digest('hex'),
        document: {
            ...document,
            version_id: 'lazy',
            title: 'Stale fixture',
            tags: '[]',
            meta_data: '{}'
        },
        items: [
            {
                version_id: 'lazy',
                doc_sid: document.sid,
                slug: 'fixture-p1',
                type: 'containerDirective',
                level: 1,
                order_index: 1,
                body_text: null,
                ast: JSON.stringify({
                    name: 'details',
                    attributes: {summary: 'build log'},
                    children: [{type: 'code', lang: 'bash', value: '-- west build'}]
                })
            },
            {
                version_id: 'lazy',
                doc_sid: document.sid,
                slug: 'code-1.bash',
                type: 'code',
                level: 1,
                order_index: 2,
                body_text: 'code(bash)',
                ast: null
            }
        ],
        assets: [],
        asset_info: [],
        images: [],
        blob_store: [],
        asset_sources: []
    }));

    const entry = await structureDb.getEntry({url: document.url});
    assert.equal(entry.found, true);
    assert.equal(structureDb.getLastPageLoad().hit, 'parsed', 'v2 cache record must not be accepted');

    const directiveIndex = entry.items.findIndex((item) => item.type === 'containerDirective');
    assert.notEqual(directiveIndex, -1);
    const directive = entry.items[directiveIndex];
    assert.deepEqual(directive.ast, {
        name: 'details',
        attributes: {summary: 'build log'},
        childCount: 1
    });
    assert.equal(Object.hasOwn(directive.ast, 'children'), false);
    assert.equal(entry.items[directiveIndex + 1]?.type, 'code');
});

test.after(() => {
    rmSync(fixtureRoot, {recursive: true, force: true});
});
