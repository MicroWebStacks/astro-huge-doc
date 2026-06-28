#!/usr/bin/env node
import {join} from 'path';
import {readFileSync} from 'fs';
import {gunzipSync} from 'zlib';
import {createHash} from 'crypto';
import {config} from '../config.js';
import Database from 'better-sqlite3';

const diagramTypeMap = {codeblock: 'code_diagram', linked_file: 'file_diagram'};
const diagramConfig = config.diagram ?? {};
const diagramLanguages = diagramConfig.languages ?? {plantuml: 'kroki', blockdiag: 'kroki', mermaid: 'kroki'};
const diagramExts = new Set(Object.keys(diagramLanguages));
const languageAliases = diagramConfig.aliases ?? {puml: 'plantuml', mmd: 'mermaid'};
const db = new Database(config.collect.db_path, {readonly: false});

db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');

function sha512(buffer) {
    return createHash('sha512').update(buffer).digest('hex');
}

function normalizeLanguage(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) {
        return '';
    }
    const trimmed = normalized.startsWith('.') ? normalized.slice(1) : normalized;
    return languageAliases[trimmed] ?? trimmed;
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
        const absPath = join(config.collect.outdir, 'blobs', row.path, row.hash);
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

function clearHtmlCache() {
    try {
        db.prepare("DELETE FROM html_cache WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'html_cache')").run();
        console.log('html-cache: cleared');
    } catch (error) {
        if (!String(error?.message ?? '').includes('no such table')) {
            console.warn(`html-cache: clear skipped ${error.message}`);
        }
    }
}

async function renderDiagram(language, code) {
    const rendererName = diagramLanguages[language] ?? diagramConfig.default_renderer;
    const renderer = diagramConfig.renderers?.[rendererName];
    const server = renderer?.server ?? renderer?.base_url ?? config.kroki_server;
    if (!server) {
        throw new Error(`No diagram renderer server configured for ${language}`);
    }
    const serverUrl = String(server).replace(/\/+$/, '');
    const response = await fetch(`${serverUrl}/${language}/svg/`, {
        method: 'POST',
        body: code,
        headers: {'Content-Type': 'text/plain'}
    });
    if (!response.ok) {
        throw new Error(`${rendererName ?? 'diagram'} render failed (${response.status})`);
    }
    return response.text();
}

async function main() {
    if (typeof fetch !== 'function') {
        throw new Error('Global fetch is not available. Run with Node 18+ or provide a fetch polyfill.');
    }
    const versionRow = db.prepare('SELECT version_id FROM versions ORDER BY version_id DESC LIMIT 1').get();
    const versionId = versionRow?.version_id ?? 'manual';
    const diagramSources = db
        .prepare(
            "SELECT uid, blob_uid, parent_doc_uid, ext, type FROM asset_info WHERE type IN ('codeblock', 'linked_file')"
        )
        .all();
    if (!diagramSources.length) {
        console.log('No diagram-capable assets found; nothing to render.');
        clearHtmlCache();
        return;
    }

    let nextBlobId = getCurrentMaxBlobId();

    const insertBlob = db.prepare(
        'INSERT INTO blob_store (blob_uid, hash, path, first_seen, last_seen, size, compression, payload) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)'
    );
    const insertAssetInfo = db.prepare(
        'INSERT INTO asset_info (uid, type, blob_uid, parent_doc_uid, path, ext, first_seen, last_seen) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)'
    );
    const insertAssetLink = db.prepare(
        'INSERT INTO assets (asset_uid, version_id, doc_sid, blob_uid, type) VALUES (?, ?, ?, ?, ?)'
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
        if (payload.insertAssetInfo) {
            insertAssetInfo.run(
                payload.diagramUid,
                payload.diagramType,
                payload.blobUid,
                payload.parentDocUid,
                'svg',
                payload.now,
                payload.now
            );
        }
        if (payload.insertAssetLink && payload.docSid) {
            insertAssetLink.run(
                payload.diagramUid,
                versionId,
                payload.docSid,
                payload.blobUid,
                payload.diagramType
            );
        }
    });

    for (const asset of diagramSources) {
        const diagramType = diagramTypeMap[asset.type];
        if (!diagramType) {
            continue;
        }

        const ext = normalizeLanguage(asset.ext);
        if (!diagramExts.has(ext)) {
            continue;
        }

        const diagramUid = `${asset.uid}.svg`;
        const existing = db
            .prepare('SELECT uid, blob_uid FROM asset_info WHERE uid = ? ORDER BY id DESC LIMIT 1')
            .get(diagramUid);
        const existingLink = db
            .prepare('SELECT asset_uid FROM assets WHERE asset_uid = ? AND version_id = ?')
            .get(diagramUid, versionId);
        if (existing && existingLink) {
            console.log(`Skipping existing diagram ${diagramUid} for version ${versionId}`);
            continue;
        }

        const docSid = getDocSid(asset.parent_doc_uid);
        if (existing?.blob_uid) {
            writeDiagram({
                insertBlob: false,
                insertAssetInfo: false,
                insertAssetLink: !existingLink,
                blobUid: existing.blob_uid,
                now: new Date().toISOString(),
                diagramUid,
                docSid,
                diagramType
            });
            console.log(`${diagramUid} [${diagramType}]: linked existing blob ${existing.blob_uid}`);
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

        writeDiagram({
            insertBlob: insertedBlob,
            insertAssetInfo: true,
            insertAssetLink: !existingLink,
            blobUid,
            hash,
            now,
            size: svgBuffer.length,
            buffer: svgBuffer,
            diagramUid,
            parentDocUid: asset.parent_doc_uid,
            docSid,
            diagramType
        });

        console.log(
            `${diagramUid} [${diagramType}]: ${insertedBlob ? 'generated' : 'reused'} blob ${blobUid} (hash ${hash.slice(0, 8)})`
        );
    }
    clearHtmlCache();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
