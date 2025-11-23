#!/usr/bin/env node
import {join} from 'path';
import {readFileSync} from 'fs';
import {gunzipSync} from 'zlib';
import {createHash} from 'crypto';
import {config} from '../config.js';
import {openDatabase} from 'content-structure/src/sqlite_utils/index.js';

const diagramExts = new Set(['plantuml', 'blockdiag', 'mermaid']);
const dbPath = join(config.collect_content.outdir, 'structure.db');
const db = openDatabase(dbPath);

function sha512(buffer) {
    return createHash('sha512').update(buffer).digest('hex');
}

function normalizeLanguage(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) {
        return '';
    }
    return normalized.startsWith('.') ? normalized.slice(1) : normalized;
}

function loadBlob(blobUid) {
    if (!blobUid) {
        return null;
    }
    const row = db
        .prepare('SELECT blob_uid, hash, path, payload, compression FROM blob_store WHERE blob_uid = ?')
        .get(blobUid);
    if (!row) {
        return null;
    }
    let buffer = null;
    if (row.payload) {
        buffer = Buffer.from(row.payload);
    } else if (row.path && row.hash) {
        const absPath = join(config.collect_content.outdir, 'blobs', row.path, row.hash);
        try {
            buffer = readFileSync(absPath);
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
            /* ignore decompression errors */
        }
    }
    return buffer;
}

function getDocSid(parentDocUid) {
    if (!parentDocUid) {
        return null;
    }
    const row = db.prepare('SELECT sid FROM documents WHERE uid = ?').get(parentDocUid);
    return row?.sid ?? null;
}

function getCurrentMaxBlobId() {
    const rows = db.prepare('SELECT blob_uid FROM blob_store').all();
    let max = 0;
    for (const {blob_uid: blobUid} of rows) {
        const value = parseInt(blobUid, 16);
        if (!Number.isNaN(value) && value > max) {
            max = value;
        }
    }
    return max;
}

function resolveBlobUidForHash(hash) {
    const row = db.prepare('SELECT blob_uid FROM blob_store WHERE hash = ?').get(hash);
    return row?.blob_uid ?? null;
}

async function renderDiagram(language, code) {
    const response = await fetch(`${config.kroki_server}/${language}/svg/`, {
        method: 'POST',
        body: code,
        headers: {'Content-Type': 'text/plain'}
    });
    if (!response.ok) {
        throw new Error(`Kroki render failed (${response.status})`);
    }
    return response.text();
}

async function main() {
    if (typeof fetch !== 'function') {
        throw new Error('Global fetch is not available. Run with Node 18+ or provide a fetch polyfill.');
    }
    const codeblocks = db
        .prepare("SELECT uid, blob_uid, parent_doc_uid, ext FROM asset_info WHERE type = 'codeblock'")
        .all();
    if (!codeblocks.length) {
        console.log('No codeblocks found; nothing to render.');
        return;
    }

    const versionRow = db.prepare('SELECT version_id FROM assets LIMIT 1').get();
    const versionId = versionRow?.version_id ?? 'manual';
    let nextBlobId = getCurrentMaxBlobId();

    const insertBlob = db.prepare(
        'INSERT INTO blob_store (blob_uid, hash, path, first_seen, last_seen, size, compression, payload) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)'
    );
    const insertAssetInfo = db.prepare(
        'INSERT INTO asset_info (uid, type, blob_uid, parent_doc_uid, path, ext, first_seen, last_seen) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)'
    );
    const insertAssetLink = db.prepare(
        'INSERT INTO assets (asset_uid, version_id, doc_sid, blob_uid, role) VALUES (?, ?, ?, ?, ?)'
    );
    const writeDiagram = db.transaction((payload) => {
        if (payload.insertBlob) {
            insertBlob.run(
                payload.blobUid,
                payload.hash,
                payload.now,
                payload.now,
                payload.size,
                0,
                payload.buffer
            );
        }
        insertAssetInfo.run(
            payload.diagramUid,
            'code_diagram',
            payload.blobUid,
            payload.parentDocUid,
            'svg',
            payload.now,
            payload.now
        );
        if (payload.docSid) {
            insertAssetLink.run(payload.diagramUid, versionId, payload.docSid, payload.blobUid, 'code_diagram');
        }
    });

    for (const asset of codeblocks) {
        const ext = normalizeLanguage(asset.ext);
        if (!diagramExts.has(ext)) {
            continue;
        }

        const diagramUid = `${asset.uid}.svg`;
        const existing = db.prepare('SELECT uid FROM asset_info WHERE uid = ?').get(diagramUid);
        if (existing) {
            console.log(`Skipping existing diagram ${diagramUid}`);
            continue;
        }

        const codeBuffer = loadBlob(asset.blob_uid);
        if (!codeBuffer) {
            console.warn(`Skipping ${asset.uid}: missing code payload`);
            continue;
        }

        let svgText;
        try {
            svgText = await renderDiagram(ext, codeBuffer.toString('utf-8'));
        } catch (error) {
            console.error(`Render failed for ${asset.uid}: ${error.message}`);
            continue;
        }

        const svgBuffer = Buffer.from(svgText, 'utf-8');
        const hash = sha512(svgBuffer);
        const now = new Date().toISOString();

        let blobUid = resolveBlobUidForHash(hash);
        let insertedBlob = false;
        if (!blobUid) {
            nextBlobId += 1;
            blobUid = nextBlobId.toString(16);
            insertedBlob = true;
        }

        const docSid = getDocSid(asset.parent_doc_uid);
        writeDiagram({
            insertBlob: insertedBlob,
            blobUid,
            hash,
            now,
            size: svgBuffer.length,
            buffer: svgBuffer,
            diagramUid,
            parentDocUid: asset.parent_doc_uid,
            docSid
        });

        console.log(
            `${diagramUid}: ${insertedBlob ? 'generated' : 'reused'} blob ${blobUid} (hash ${hash.slice(0, 8)})`
        );
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
