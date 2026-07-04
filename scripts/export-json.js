#!/usr/bin/env node
/*
 * export-json — derive a JSON dataset from the canonical SQLite store.
 *
 * The full website's SQLite store is the single source of truth. This script
 * exports the latest version into a self-contained JSON dataset that the "lite"
 * profile (VS Code extension) serves via structure-db-json.js with NO native
 * deps (no better-sqlite3, no zlib at read time).
 *
 * Output (under config.collect.json_dir, default dataset/json):
 *   content.json        { version_id, diagram, documents[], items[],
 *                         asset_info[], assets[], images[] }
 *   blobs/<hash>.<ext>  raw, already-decompressed bytes for every referenced blob
 *
 * Blobs are resolved exactly like structure-db-sqlite.js loadBlobBuffer
 * (inline payload, else outdir/blobs/<path>/<hash>) and gunzipped at export
 * time, so the json backend reads plain files.
 */
import {join} from 'node:path';
import {mkdirSync, writeFileSync, readFileSync, rmSync, existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import Database from 'better-sqlite3';
import {config} from '../config.js';
import {blobFileName} from '../src/libs/blob-files.js';
import {buildSourceEntries} from './source-tree.js';

const dbPath = config.collect.db_path;
const outdir = config.collect.outdir; // store root; on-disk blobs live under <outdir>/blobs
const jsonDir = config.collect.json_dir;
const blobsDir = join(jsonDir, 'blobs');

if (!existsSync(dbPath)) {
    console.error(`export-json: missing database at ${dbPath}. Run \`pnpm collect\` first.`);
    process.exit(1);
}

const db = new Database(dbPath, {readonly: true, fileMustExist: true});

function resolveBlobBuffer(row) {
    let buffer = null;
    if (row.payload) {
        buffer = Buffer.from(row.payload);
    } else if (row.path && row.hash) {
        try {
            buffer = readFileSync(join(outdir, 'blobs', row.path, row.hash));
        } catch {
            buffer = null;
        }
    }
    if (!buffer) {
        return null;
    }
    if (row.compression) {
        try {
            buffer = gunzipSync(buffer);
        } catch {
            /* leave as-is if not actually compressed */
        }
    }
    return buffer;
}

async function main() {
    const versionRow = db.prepare('SELECT version_id FROM versions ORDER BY version_id DESC LIMIT 1').get();
    const versionId = versionRow?.version_id ?? null;

    const scoped = (table) =>
        versionId
            ? db.prepare(`SELECT * FROM ${table} WHERE version_id = ?`).all(versionId)
            : db.prepare(`SELECT * FROM ${table}`).all();

    const documents = scoped('documents');
    const items = scoped('items');
    const assets = scoped('assets');
    const asset_info = db.prepare('SELECT * FROM asset_info').all();
    const images = db.prepare('SELECT * FROM images').all();
    const source_entries = await buildSourceEntries({
        contentRoot: config.collect.contentdir,
        documents
    });
    const blobRows = db
        .prepare('SELECT blob_uid, hash, path, compression, size, payload FROM blob_store')
        .all();

    // Fresh blobs dir so stale entries from a previous export never linger.
    if (existsSync(jsonDir)) {
        rmSync(blobsDir, {recursive: true, force: true});
    }
    mkdirSync(blobsDir, {recursive: true});

    const blobByUid = new Map(blobRows.map((row) => [String(row.blob_uid), row]));
    const refs = [];
    for (const asset of asset_info) {
        refs.push({blob: blobByUid.get(String(asset.blob_uid)), ext: asset.ext});
    }
    for (const image of images) {
        refs.push({blob: blobByUid.get(String(image.blob_uid)), ext: image.extension});
    }

    let written = 0;
    let missing = 0;
    const writtenFiles = new Set();
    for (const {blob, ext} of refs) {
        if (!blob?.hash) {
            continue;
        }
        const fileName = blobFileName(blob.hash, ext);
        if (writtenFiles.has(fileName)) {
            continue;
        }
        const buffer = resolveBlobBuffer(blob);
        if (!buffer) {
            missing += 1;
            continue;
        }
        writeFileSync(join(blobsDir, fileName), buffer);
        writtenFiles.add(fileName);
        written += 1;
    }

    const dataset = {
        version_id: versionId,
        diagram: config.diagram,
        documents,
        items,
        asset_info,
        assets,
        images,
        source_entries,
        blob_store: blobRows.map(({payload, ...row}) => row)
    };
    writeFileSync(join(jsonDir, 'content.json'), JSON.stringify(dataset));

    console.log(
        `export-json: version ${versionId ?? '(all)'} → ${jsonDir}\n` +
            `  documents=${documents.length} items=${items.length} ` +
            `asset_info=${asset_info.length} assets=${assets.length} images=${images.length} source_entries=${source_entries.length}\n` +
            `  blobs written=${written}${missing ? ` (missing=${missing})` : ''}`
    );
}

try {
    await main();
} finally {
    db.close();
}
