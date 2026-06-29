#!/usr/bin/env node
import {existsSync} from 'node:fs';
import {readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {config} from '../config.js';
import {blobFileName} from '../src/libs/blob-files.js';

const DIAGRAM_TYPES = new Set(['code_diagram', 'file_diagram']);

function isDiagramAsset(row) {
    return DIAGRAM_TYPES.has(row?.type);
}

async function removeBlobFiles(blobsDir, rows) {
    let removed = 0;
    for (const row of rows) {
        if (!row?.hash) {
            continue;
        }
        const ext = row.ext ?? 'svg';
        try {
            await rm(join(blobsDir, blobFileName(row.hash, ext)), {force: true});
            removed += 1;
        } catch {
            /* ignore missing/stale files */
        }
    }
    return removed;
}

async function cleanJson() {
    const jsonFile = join(config.collect.json_dir, 'content.json');
    const blobsDir = join(config.collect.json_dir, 'blobs');
    if (!existsSync(jsonFile)) {
        throw new Error(`Missing JSON dataset at ${jsonFile}`);
    }
    const dataset = JSON.parse(await readFile(jsonFile, 'utf-8'));
    dataset.asset_info ??= [];
    dataset.assets ??= [];
    dataset.images ??= [];
    dataset.blob_store ??= [];

    const removedAssetInfo = dataset.asset_info.filter(isDiagramAsset);
    const removedUids = new Set(removedAssetInfo.map((row) => row.uid));
    dataset.asset_info = dataset.asset_info.filter((row) => !removedUids.has(row.uid));
    const removedAssets = dataset.assets.filter((row) => removedUids.has(row.asset_uid) || DIAGRAM_TYPES.has(row.type));
    dataset.assets = dataset.assets.filter((row) => !removedUids.has(row.asset_uid) && !DIAGRAM_TYPES.has(row.type));

    const referencedBlobUids = new Set([
        ...dataset.asset_info.map((row) => row.blob_uid),
        ...dataset.assets.map((row) => row.blob_uid),
        ...dataset.images.map((row) => row.blob_uid)
    ].filter((value) => value != null).map(String));
    const removedBlobUids = new Set(removedAssetInfo.map((row) => row.blob_uid).filter((value) => value != null).map(String));
    const removableBlobs = dataset.blob_store
        .filter((row) => removedBlobUids.has(String(row.blob_uid)) && !referencedBlobUids.has(String(row.blob_uid)))
        .map((row) => ({...row, ext: removedAssetInfo.find((asset) => String(asset.blob_uid) === String(row.blob_uid))?.ext ?? 'svg'}));
    dataset.blob_store = dataset.blob_store.filter((row) => !removableBlobs.some((blob) => String(blob.blob_uid) === String(row.blob_uid)));

    const removedFiles = await removeBlobFiles(blobsDir, removableBlobs);
    await writeFile(jsonFile, JSON.stringify(dataset));
    console.log(
        `clean-diagrams(json): removed ${removedAssetInfo.length} asset_info row(s), ` +
            `${removedAssets.length} asset link(s), ${removableBlobs.length} blob row(s), ${removedFiles} file(s)`
    );
}

async function cleanSqlite() {
    const {default: Database} = await import('better-sqlite3');
    const db = new Database(config.collect.db_path, {readonly: false});
    const blobsDir = join(config.collect.outdir, 'blobs');
    try {
        const removedAssetInfo = db
            .prepare("SELECT uid, blob_uid, ext FROM asset_info WHERE type IN ('code_diagram', 'file_diagram')")
            .all();
        const removedUids = removedAssetInfo.map((row) => row.uid);
        const removedBlobUids = [...new Set(removedAssetInfo.map((row) => row.blob_uid).filter(Boolean))];
        const removedAssetsCount = removedUids.length
            ? db.prepare(`SELECT COUNT(*) AS count FROM assets WHERE asset_uid IN (${removedUids.map(() => '?').join(',')}) OR type IN ('code_diagram', 'file_diagram')`).get(...removedUids).count
            : db.prepare("SELECT COUNT(*) AS count FROM assets WHERE type IN ('code_diagram', 'file_diagram')").get().count;

        db.transaction(() => {
            db.prepare("DELETE FROM assets WHERE type IN ('code_diagram', 'file_diagram')").run();
            if (removedUids.length) {
                db.prepare(`DELETE FROM assets WHERE asset_uid IN (${removedUids.map(() => '?').join(',')})`).run(...removedUids);
            }
            db.prepare("DELETE FROM asset_info WHERE type IN ('code_diagram', 'file_diagram')").run();
        })();

        const removableBlobs = [];
        for (const blobUid of removedBlobUids) {
            const stillReferenced =
                db.prepare('SELECT 1 FROM asset_info WHERE blob_uid = ? LIMIT 1').get(blobUid) ||
                db.prepare('SELECT 1 FROM assets WHERE blob_uid = ? LIMIT 1').get(blobUid) ||
                db.prepare('SELECT 1 FROM images WHERE blob_uid = ? LIMIT 1').get(blobUid);
            if (stillReferenced) {
                continue;
            }
            const blob = db.prepare('SELECT blob_uid, hash FROM blob_store WHERE blob_uid = ?').get(blobUid);
            if (blob) {
                removableBlobs.push({
                    ...blob,
                    ext: removedAssetInfo.find((asset) => String(asset.blob_uid) === String(blobUid))?.ext ?? 'svg'
                });
            }
        }

        if (removableBlobs.length) {
            db.prepare(`DELETE FROM blob_store WHERE blob_uid IN (${removableBlobs.map(() => '?').join(',')})`)
                .run(...removableBlobs.map((row) => row.blob_uid));
        }
        try {
            db.prepare("DELETE FROM html_cache WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'html_cache')").run();
        } catch (error) {
            if (!String(error?.message ?? '').includes('no such table')) {
                console.warn(`html-cache: clear skipped ${error.message}`);
            }
        }
        const removedFiles = await removeBlobFiles(blobsDir, removableBlobs);
        console.log(
            `clean-diagrams(sqlite): removed ${removedAssetInfo.length} asset_info row(s), ` +
                `${removedAssetsCount} asset link(s), ${removableBlobs.length} blob row(s), ${removedFiles} file(s); html-cache cleared`
        );
    } finally {
        db.close();
    }
}

async function main() {
    if ((config.collect.format ?? config.dataBackend ?? 'sqlite') === 'json') {
        await cleanJson();
        return;
    }
    await cleanSqlite();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
