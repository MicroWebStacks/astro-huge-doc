import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = join(engineRoot, '.tmp', 'lite-frontmatter-image-spaces-test');
const contentDir = join(fixtureRoot, 'content');
const imageDir = join(contentDir, 'nested images');

rmSync(fixtureRoot, {recursive: true, force: true});
mkdirSync(imageDir, {recursive: true});
writeFileSync(join(contentDir, 'card.md'), [
    '---',
    'title: Card',
    'image: ./nested images/card image.png',
    '---',
    '',
    '# Card',
    ''
].join('\n'));
writeFileSync(
    join(imageDir, 'card image.png'),
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XqQ7WQAAAABJRU5ErkJggg==', 'base64')
);

process.env.DOCS_PROFILE = 'lite';
process.env.DOCS_BACKEND = 'json';
process.env.MICROWEBSTACKS_DOTENV_OVERRIDE = 'false';
process.env.MICROWEBSTACKS_ENGINE_ROOT = engineRoot;
process.env.MICROWEBSTACKS_WORKSPACE_ROOT = fixtureRoot;
process.env.MICROWEBSTACKS_MANIFEST_PATH = join(fixtureRoot, 'manifest.yaml');
process.env.MICROWEBSTACKS_DOCS_ROOT = contentDir;
process.env.MICROWEBSTACKS_STORE_PATH = join(fixtureRoot, 'store');

const structureDb = await import('../src/libs/structure-db.js');

test('lite collector resolves frontmatter images whose paths contain spaces', async () => {
    const entry = await structureDb.getEntry({url: 'card'});
    assert.equal(entry.found, true);

    const document = structureDb.getDocument({url: 'card'});
    assert.match(document.meta_data.image, /^card\.image-/);
    assert.ok(structureDb.getAssetUrl(document.meta_data.image));
    assert.equal(
        entry.items.some((item) => item.body_text === 'mws-meta-image'),
        false,
        'the synthetic metadata image must not render in the document body'
    );
});

test.after(() => {
    rmSync(fixtureRoot, {recursive: true, force: true});
});
