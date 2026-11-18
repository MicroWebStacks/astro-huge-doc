import {createHash, randomUUID} from 'node:crypto';
import {readFile, writeFile, mkdir, rename, rm, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {blobFileName, normalizeBlobExt} from '../src/libs/blob-files.js';
import {previewDirectory} from '../src/libs/image-previews.js';

const SETTINGS = {pipeline: 1, widths: [320, 640, 1280], quality: 75, format: 'webp'};
const supported = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif', 'tif', 'tiff', 'gif']);
const imageExtensions = new Set([...supported, 'svg', 'apng', 'bmp', 'ico']);
const hash = (value) => createHash('sha256').update(value).digest('hex');

async function atomicWrite(file, bytes) {
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporary, bytes);
        await rename(temporary, file);
    } finally {
        await rm(temporary, {force: true});
    }
}

// One invocation processes each source once and coalesces identical transforms.
// Bounded workers prevent many large originals being decoded simultaneously.
export async function prepareImagePreviews({sources, directory, settings = SETTINGS,
    sharpLoader = () => import('sharp').then((module) => module.default), log = console.log}) {
    const started = performance.now();
    await mkdir(directory, {recursive: true});
    let previous;
    try { previous = JSON.parse(await readFile(join(directory, 'index.json'), 'utf8')); }
    catch { previous = {sources: {}}; }
    const index = {settings, sources: {}};
    const counts = {sources: sources.length, generated: 0, regenerated: 0, reused: 0,
        skipped: 0, failed: 0, files: 0, bytes: 0};
    const transforms = new Map();
    const referenced = new Map();
    const failures = [];
    let sharpPromise;
    const getSharp = () => sharpPromise ??= sharpLoader();
    let cursor = 0;
    async function processSource(source) {
        if (!supported.has(normalizeBlobExt(source.ext))) { counts.skipped++; return; }
        try {
            const sharp = await getSharp();
            const bytes = await source.load();
            const sourceHash = hash(bytes);
            const metadata = await sharp(bytes).metadata();
            if ((metadata.pages ?? 1) > 1) { counts.skipped++; return; }
            const swapped = [5, 6, 7, 8].includes(metadata.orientation);
            const width = swapped ? metadata.height : metadata.width;
            const height = swapped ? metadata.width : metadata.height;
            if (!width || !height) throw new Error('missing image dimensions');
            const old = previous.sources?.[source.name] ?? Object.values(previous.sources ?? {})
                .find((entry) => entry.ids?.some((id) => source.ids.includes(id)));
            const variants = [];
            // Small images get one correctly labeled, non-upscaled candidate.
            const widths = [...new Set(settings.widths.map((value) => Math.min(value, width)))];
            for (const targetWidth of widths) {
                const file = `${hash(JSON.stringify({sourceHash, ...settings, width: targetWidth}))}.webp`;
                if (!transforms.has(file)) {
                    transforms.set(file, (async () => {
                        const prior = previous.sources?.[source.name]?.variants?.find((item) => item.file === file);
                        if (prior) {
                            try {
                                const actual = await stat(join(directory, file));
                                if (actual.size === prior.bytes && actual.size > 0) {
                                    counts.reused++;
                                    return prior;
                                }
                            } catch { /* missing file: rebuild */ }
                        }
                        const {data, info} = await sharp(bytes).rotate()
                            .resize({width: targetWidth, withoutEnlargement: true})
                            .webp({quality: settings.quality}).toBuffer({resolveWithObject: true});
                        await atomicWrite(join(directory, file), data);
                        if (old?.variants?.some((variant) => variant.width === targetWidth)) counts.regenerated++;
                        else counts.generated++;
                        return {file, width: info.width, height: info.height, bytes: data.length};
                    })());
                }
                const variant = await transforms.get(file);
                variants.push(variant);
            }
            index.sources[source.name] = {sourceHash, ids: source.ids, width, height, variants};
            for (const variant of variants) referenced.set(variant.file, variant.bytes);
        } catch (error) {
            counts.failed++;
            if (failures.length < 3) failures.push(String(error.message).replace(/[\r\n]+/g, ' ').slice(0, 180));
        }
    }
    await Promise.all(Array.from({length: Math.min(2, sources.length)}, async () => {
        while (cursor < sources.length) await processSource(sources[cursor++]);
    }));
    await atomicWrite(join(directory, 'index.json'), `${JSON.stringify(index)}\n`);
    counts.files = referenced.size;
    counts.bytes = [...referenced.values()].reduce((sum, bytes) => sum + bytes, 0);
    log(`Image previews: ${counts.sources} source images; ${counts.generated} generated, ${counts.regenerated} regenerated, ${counts.reused} reused`);
    log(`Image previews: ${counts.skipped} skipped sources, ${counts.failed} failed sources; originals retained`);
    log(`Image previews: ${counts.files} preview files, ${(counts.bytes / 1e6).toFixed(2)} MB total (${counts.bytes} bytes); ${((performance.now() - started) / 1000).toFixed(1)}s`);
    if (failures.length) log(`Image previews warning: ${failures.join('; ')}${counts.failed > failures.length ? '; further failures omitted' : ''}`);
    return {index, counts};
}

export async function prepareCollectedImagePreviews(config) {
    if (config.profile === 'lite') {
        console.log('Image previews: skipped (lite profile; originals retained)');
        return;
    }
    const grouped = new Map();
    function add(asset, load) {
        const ext = normalizeBlobExt(asset.ext);
        if (!imageExtensions.has(ext) || !asset.hash) return;
        const name = blobFileName(asset.hash, ext);
        if (!grouped.has(name)) grouped.set(name, {name, ext, ids: [], load});
        grouped.get(name).ids.push(asset.uid);
    }
    let db;
    try {
        if (config.dataBackend === 'json') {
            const dataset = JSON.parse(await readFile(join(config.collect.json_dir, 'content.json'), 'utf8'));
            const blobs = new Map(dataset.blob_store.map((blob) => [String(blob.blob_uid), blob]));
            for (const asset of dataset.asset_info) {
                const blob = blobs.get(String(asset.blob_uid));
                if (!blob) continue;
                const name = blobFileName(blob.hash, asset.ext);
                add({...asset, hash: blob.hash}, () => readFile(join(config.collect.json_dir, 'blobs', name)));
            }
        } else {
            const {default: Database} = await import('better-sqlite3');
            db = new Database(config.collect.db_path, {readonly: true});
            const assets = db.prepare(`SELECT DISTINCT ai.uid, ai.ext, b.blob_uid, b.hash
                FROM asset_info ai JOIN blob_store b ON b.blob_uid = ai.blob_uid
                JOIN assets a ON a.asset_uid = ai.uid AND a.blob_uid = ai.blob_uid`).all();
            const loadBlob = db.prepare('SELECT * FROM blob_store WHERE blob_uid = ?');
            for (const asset of assets) {
                add(asset, async () => {
                    const blob = loadBlob.get(asset.blob_uid);
                    const bytes = blob.payload ? Buffer.from(blob.payload)
                        : await readFile(join(config.collect.outdir, 'blobs', blob.path, blob.hash));
                    return blob.compression ? gunzipSync(bytes) : bytes;
                });
            }
        }
        return await prepareImagePreviews({sources: [...grouped.values()], directory: previewDirectory(config)});
    } finally { db?.close(); }
}
