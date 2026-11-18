import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, readFile, writeFile, readdir, rm, stat} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {gzipSync} from 'node:zlib';
import sharp from 'sharp';
import {prepareImagePreviews, prepareCollectedImagePreviews} from '../scripts/image-previews.js';
import {imagePreview, previewFileName, exportImagePreviews} from '../src/libs/image-previews.js';

// All generated fixture bytes live in the sanctioned disposable directory.
import {mkdir} from 'node:fs/promises';
await mkdir('.tmp/image-preview-tests', {recursive: true});
const fixture = async (t) => {
    const directory = await mkdtemp(resolve('.tmp/image-preview-tests/run-'));
    t.after(() => rm(directory, {recursive: true, force: true}));
    return directory;
};
const png = (width, height, background = '#ff000080') =>
    sharp({create: {width, height, channels: 4, background}}).png().toBuffer();
const source = (bytes, name = 'original.png', id = 'photo') =>
    ({name, ext: name.split('.').pop(), ids: [id], load: async () => bytes});

test('real previews: dimensions, alpha, small-image dedup, reuse, missing file and source/settings invalidation', async (t) => {
    const directory = await fixture(t);
    const logs = [];
    const run = (sources, extra = {}) => prepareImagePreviews({sources, directory, log: (line) => logs.push(line), ...extra});
    const bytes = await png(800, 400);
    const first = await run([source(bytes), source(bytes, 'duplicate.png', 'duplicate')]);
    assert.equal(first.counts.generated, 3);
    assert.equal(first.counts.files, 3);
    assert.equal(logs.length, 3);
    assert.match(logs[2], /MB total \(\d+ bytes\)/);
    assert.equal(first.counts.bytes, first.index.sources['original.png'].variants.reduce((sum, item) => sum + item.bytes, 0));
    assert.deepEqual(first.index.sources['original.png'].variants.map((item) => item.width), [320, 640, 800]);
    for (const item of first.index.sources['original.png'].variants) {
        const meta = await sharp(await readFile(join(directory, item.file))).metadata();
        assert.equal(meta.width, item.width);
        assert.equal(meta.height, item.height);
        assert.equal(meta.format, 'webp');
        assert.equal(meta.hasAlpha, true);
    }
    // Stale files are excluded from the log's total.
    await writeFile(join(directory, `${'a'.repeat(64)}.webp`), 'stale');
    const second = await run([source(bytes)]);
    assert.equal(second.counts.reused, 3);
    assert.equal(second.counts.generated, 0);
    const lost = second.index.sources['original.png'].variants[0].file;
    await rm(join(directory, lost));
    const repaired = await run([source(bytes)]);
    assert.equal(repaired.counts.regenerated, 1);
    assert.equal(repaired.counts.reused, 2);
    const changed = await run([source(await png(800, 400, '#00ff0080'), 'replacement.png')]);
    assert.equal(changed.counts.regenerated, 3);
    assert.notEqual(changed.index.sources['replacement.png'].variants[0].file, lost);
    const changedSettings = await run([source(await png(800, 400, '#00ff0080'), 'replacement.png')],
        {settings: {...changed.index.settings, quality: 70, pipeline: 2}});
    assert.equal(changedSettings.counts.regenerated, 3);
    const tiny = await run([source(await png(30, 20), 'tiny.png', 'tiny')]);
    assert.equal(tiny.counts.files, 1);
    assert.equal(tiny.index.sources['tiny.png'].variants[0].width, 30);
    assert.ok((await readdir(directory)).every((file) => !file.endsWith('.tmp')));
});

test('EXIF orientation, animation/SVG pass-through and bounded failures', async (t) => {
    const directory = await fixture(t);
    const portrait = await sharp(await png(800, 400)).jpeg().withMetadata({orientation: 6}).toBuffer();
    const logs = [];
    const result = await prepareImagePreviews({directory, log: (line) => logs.push(line), sources: [
        source(portrait, 'portrait.jpg'),
        {...source(Buffer.from('<svg/>'), 'vector.svg'), load: () => {throw new Error('must not decode SVG');}},
        ...Array.from({length: 8}, (_, i) => source(Buffer.from('bad'), `broken-${i}.png`, `bad-${i}`))
    ]});
    assert.equal(result.index.sources['portrait.jpg'].width, 400);
    assert.equal(result.index.sources['portrait.jpg'].height, 800);
    assert.equal(result.counts.skipped, 1);
    assert.equal(result.counts.failed, 8);
    assert.equal(logs.length, 4);
    assert.match(logs[3], /further failures omitted/);
    // Minimal two-frame GIF with distinct red/blue pixels.
    const animation = Buffer.from('47494638396101000100800000ff00000000ff21ff0b4e45545343415045322e30030100000021f904000a0000002c000000000100010000020244010021f904000a0000002c00000000010001000002024c01003b', 'hex');
    assert.equal((await sharp(animation).metadata()).pages, 2);
    const animated = await prepareImagePreviews({directory, sources: [source(animation, 'animated.gif')], log: () => {}});
    assert.equal(animated.counts.skipped, 1);
    assert.equal(animated.counts.files, 0);
});

test('render/export uses original hash/version, base prefix, missing-file fallback and no private index', async (t) => {
    const root = await fixture(t);
    const directory = join(root, 'image-previews');
    const result = await prepareImagePreviews({directory, sources: [source(await png(30, 20), 'v1.png'),
        source(await png(50, 20), 'v2.png')], log: () => {}});
    const config = {profile: 'full', base: '/docs/', collect: {outdir: root}};
    const one = imagePreview('/docs/blobs/v1.png', config);
    assert.equal(one.width, 30);
    assert.equal(imagePreview('/docs/blobs/v2.png', config).width, 50);
    assert.ok(one.variants[0].url.startsWith('/docs/image-previews/'));
    assert.equal(imagePreview('/blobs/v1.png', {...config, profile: 'lite'}), null);
    assert.equal(imagePreview('/blobs/unknown.png', config), null);
    const file = one.variants[0].file;
    assert.equal(previewFileName(`/docs/image-previews/${file}`, '/docs/'), file);
    for (const path of ['/docs/image-previews/index.json', '/docs/image-previews/../secret',
        '/docs/image-previews/%2e%2e', `/image-previews/${file}`]) assert.equal(previewFileName(path, '/docs/'), null);
    const target = join(root, 'dist');
    await exportImagePreviews(config, target);
    assert.equal((await readdir(target)).length, result.counts.files);
    await assert.rejects(stat(join(target, 'index.json')));
    await rm(join(directory, file));
    assert.equal(imagePreview('/blobs/v1.png', config).variants.length, 0);
});

test('missing Sharp warns and falls back; lite collection never loads it', async (t) => {
    const directory = await fixture(t);
    const result = await prepareImagePreviews({directory, sources: [source(await png(20, 20))],
        sharpLoader: async () => {throw new Error('Sharp not installed');}, log: () => {}});
    assert.equal(result.counts.failed, 1);
    assert.deepEqual(result.index.sources, {});
    await prepareCollectedImagePreviews({profile: 'lite'});
});

test('collected JSON and SQLite inputs resolve actual bytes including compressed sidecars and versions', async (t) => {
    const root = await fixture(t);
    const jsonDir = join(root, 'json');
    await mkdir(join(jsonDir, 'blobs'), {recursive: true});
    const bytes = await png(40, 20);
    await writeFile(join(jsonDir, 'blobs', '123456789012.png'), bytes);
    await writeFile(join(jsonDir, 'content.json'), JSON.stringify({
        blob_store: [{blob_uid: 1, hash: '123456789012abcdef'}],
        asset_info: [{uid: 'photo', blob_uid: 1, ext: 'png'}]
    }));
    const config = {profile: 'full', dataBackend: 'json', collect: {outdir: root, json_dir: jsonDir}};
    const json = await prepareCollectedImagePreviews(config);
    assert.equal(json.counts.generated, 1);
    assert.equal(imagePreview('/blobs/123456789012.png', config).width, 40);

    const {default: Database} = await import('better-sqlite3');
    const dbPath = join(root, 'content.db');
    const db = new Database(dbPath);
    db.exec(`CREATE TABLE blob_store (blob_uid INTEGER, hash TEXT, payload BLOB, path TEXT, compression INTEGER);
        CREATE TABLE asset_info (uid TEXT, blob_uid INTEGER, ext TEXT);
        CREATE TABLE assets (asset_uid TEXT, blob_uid INTEGER, version_id TEXT);`);
    db.prepare('INSERT INTO blob_store VALUES (?, ?, ?, ?, ?)').run(1, 'inlinehash', bytes, null, 0);
    await mkdir(join(root, 'blobs', 'sidecar'), {recursive: true});
    await writeFile(join(root, 'blobs', 'sidecar', 'sidecarhash'), gzipSync(await png(60, 30)));
    db.prepare('INSERT INTO blob_store VALUES (?, ?, ?, ?, ?)').run(2, 'sidecarhash', null, 'sidecar', 1);
    for (const [id, version] of [[1, 'v1'], [2, 'v2']]) {
        db.prepare('INSERT INTO asset_info VALUES (?, ?, ?)').run('versioned-photo', id, 'png');
        db.prepare('INSERT INTO assets VALUES (?, ?, ?)').run('versioned-photo', id, version);
    }
    db.close();
    const sqliteConfig = {...config, dataBackend: 'sqlite', collect: {...config.collect, db_path: dbPath}};
    const sqlite = await prepareCollectedImagePreviews(sqliteConfig);
    assert.equal(sqlite.counts.files, 2);
    assert.equal(imagePreview('/blobs/inlinehash.png', sqliteConfig).width, 40);
    assert.equal(imagePreview('/blobs/sidecarhash.png', sqliteConfig).width, 60);
});
