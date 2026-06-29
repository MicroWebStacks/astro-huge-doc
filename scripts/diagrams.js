#!/usr/bin/env node
import {createHash} from 'crypto';
import {existsSync, readFileSync} from 'fs';
import {mkdir, readFile, writeFile} from 'fs/promises';
import {join} from 'path';
import {gunzipSync} from 'zlib';
import {config} from '../config.js';
import {blobFileName} from '../src/libs/blob-files.js';

const diagramTypeMap = {
    codeblock: 'code_diagram',
    code_block: 'code_diagram',
    linked_file: 'file_diagram'
};
const diagramConfig = config.diagram ?? {};
const diagramLanguages = diagramConfig.languages ?? {plantuml: 'kroki', blockdiag: 'kroki', mermaid: 'kroki'};
const diagramExts = new Set(Object.keys(diagramLanguages));
const languageAliases = diagramConfig.aliases ?? {puml: 'plantuml', mmd: 'mermaid'};

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

function parseBlobUid(blobUid) {
    const value = parseInt(String(blobUid ?? ''), 16);
    return Number.isFinite(value) ? value : 0;
}

function nextBlobUid(rows) {
    let max = 0;
    for (const row of rows ?? []) {
        max = Math.max(max, parseBlobUid(row?.blob_uid));
    }
    return (max + 1).toString(16);
}

async function writeStaticBlob(blobsDir, hash, ext, buffer) {
    if (!hash || !buffer) {
        return null;
    }
    await mkdir(blobsDir, {recursive: true});
    const fileName = blobFileName(hash, ext);
    await writeFile(join(blobsDir, fileName), buffer);
    return fileName;
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

function resolveSqliteBlobBuffer(configOutdir, row) {
    let buffer = null;
    if (row?.payload) {
        buffer = Buffer.from(row.payload);
    } else if (row?.path && row?.hash) {
        try {
            buffer = readFileSync(join(configOutdir, 'blobs', row.path, row.hash));
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
            /* leave as-is if it was not actually gzip-compressed */
        }
    }
    return buffer;
}

async function runSqlite() {
    const {default: Database} = await import('better-sqlite3');
    const db = new Database(config.collect.db_path, {readonly: false});
    const blobsDir = join(config.collect.outdir, 'blobs');

    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');

    const loadBlob = (blobUid) => {
        if (!blobUid) {
            return null;
        }
        const row = db
            .prepare('SELECT blob_uid, hash, path, payload, compression FROM blob_store WHERE blob_uid = ?')
            .get(blobUid);
        if (!row) {
            return null;
        }
        return {...row, buffer: resolveSqliteBlobBuffer(config.collect.outdir, row)};
    };

    const getDocSid = (parentDocUid) => {
        if (!parentDocUid) {
            return null;
        }
        const row = db.prepare('SELECT sid FROM documents WHERE uid = ?').get(parentDocUid);
        return row?.sid ?? null;
    };

    const resolveBlobUidForHash = (hash) => {
        const row = db.prepare('SELECT blob_uid FROM blob_store WHERE hash = ?').get(hash);
        return row?.blob_uid ?? null;
    };

    const clearHtmlCache = () => {
        try {
            db.prepare("DELETE FROM html_cache WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'html_cache')").run();
            console.log('html-cache: cleared');
        } catch (error) {
            if (!String(error?.message ?? '').includes('no such table')) {
                console.warn(`html-cache: clear skipped ${error.message}`);
            }
        }
    };

    try {
        const versionRow = db.prepare('SELECT version_id FROM versions ORDER BY version_id DESC LIMIT 1').get();
        const versionId = versionRow?.version_id ?? 'manual';
        const diagramSources = db
            .prepare(
                "SELECT uid, blob_uid, parent_doc_uid, ext, type FROM asset_info WHERE type IN ('codeblock', 'code_block', 'linked_file')"
            )
            .all();
        if (!diagramSources.length) {
            console.log('No diagram-capable assets found; nothing to render.');
            clearHtmlCache();
            return;
        }

        let nextId = nextBlobUid(db.prepare('SELECT blob_uid FROM blob_store').all());
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
                insertBlob.run(payload.blobUid, payload.hash, payload.now, payload.now, payload.size, 0, payload.buffer);
            }
            if (payload.insertAssetInfo) {
                insertAssetInfo.run(payload.diagramUid, payload.diagramType, payload.blobUid, payload.parentDocUid, 'svg', payload.now, payload.now);
            }
            if (payload.insertAssetLink && payload.docSid) {
                insertAssetLink.run(payload.diagramUid, versionId, payload.docSid, payload.blobUid, payload.diagramType);
            }
        });

        for (const asset of diagramSources) {
            const diagramType = diagramTypeMap[asset.type];
            const ext = normalizeLanguage(asset.ext);
            if (!diagramType || !diagramExts.has(ext)) {
                continue;
            }

            const diagramUid = `${asset.uid}.svg`;
            const existing = db
                .prepare('SELECT uid, blob_uid, ext FROM asset_info WHERE uid = ? ORDER BY id DESC LIMIT 1')
                .get(diagramUid);
            const existingLink = db
                .prepare('SELECT asset_uid FROM assets WHERE asset_uid = ? AND version_id = ?')
                .get(diagramUid, versionId);
            const docSid = getDocSid(asset.parent_doc_uid);

            if (existing?.blob_uid) {
                const existingBlob = loadBlob(existing.blob_uid);
                await writeStaticBlob(blobsDir, existingBlob?.hash, existing.ext ?? 'svg', existingBlob?.buffer);
                if (existingLink) {
                    console.log(`Skipping existing diagram ${diagramUid} for version ${versionId}`);
                    continue;
                }
                writeDiagram({
                    insertBlob: false,
                    insertAssetInfo: false,
                    insertAssetLink: true,
                    blobUid: existing.blob_uid,
                    now: new Date().toISOString(),
                    diagramUid,
                    docSid,
                    diagramType
                });
                console.log(`${diagramUid} [${diagramType}]: linked existing blob ${existing.blob_uid}`);
                continue;
            }

            const codeBlob = loadBlob(asset.blob_uid);
            if (!codeBlob?.buffer) {
                console.warn(`Skipping ${asset.uid}: missing code payload`);
                continue;
            }

            let svgText;
            try {
                svgText = await renderDiagram(ext, codeBlob.buffer.toString('utf-8'));
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
                blobUid = nextId;
                nextId = (parseInt(nextId, 16) + 1).toString(16);
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
            await writeStaticBlob(blobsDir, hash, 'svg', svgBuffer);

            console.log(
                `${diagramUid} [${diagramType}]: ${insertedBlob ? 'generated' : 'reused'} blob ${blobUid} (hash ${hash.slice(0, 8)})`
            );
        }
        clearHtmlCache();
    } finally {
        db.close();
    }
}

function loadJsonBlobBuffer(dataset, blobByUid, asset, blobsDir) {
    const blob = blobByUid.get(String(asset?.blob_uid));
    if (!blob) {
        return null;
    }
    const candidates = [];
    if (blob.hash) {
        candidates.push(blobFileName(blob.hash, asset.ext));
    }
    candidates.push(String(asset.blob_uid));
    for (const fileName of candidates) {
        try {
            return readFileSync(join(blobsDir, fileName));
        } catch {
            /* try the next compatibility path */
        }
    }
    return null;
}

function getJsonDocSid(dataset, parentDocUid) {
    return (dataset.documents ?? []).find((doc) => doc.uid === parentDocUid)?.sid ?? null;
}

async function runJson() {
    const jsonFile = join(config.collect.json_dir, 'content.json');
    const blobsDir = join(config.collect.json_dir, 'blobs');
    if (!existsSync(jsonFile)) {
        throw new Error(`diagrams(json): missing dataset at ${jsonFile}. Run \`pnpm collect\` first.`);
    }
    await mkdir(blobsDir, {recursive: true});

    const dataset = JSON.parse(await readFile(jsonFile, 'utf-8'));
    dataset.asset_info ??= [];
    dataset.assets ??= [];
    dataset.blob_store ??= [];
    const versionId = dataset.version_id ?? config.collect.version_id ?? 'manual';
    const blobByUid = new Map(dataset.blob_store.map((row) => [String(row.blob_uid), row]));
    const blobUidByHash = new Map(dataset.blob_store.filter((row) => row.hash).map((row) => [row.hash, row.blob_uid]));
    let nextId = nextBlobUid(dataset.blob_store);

    const diagramSources = dataset.asset_info.filter((asset) => diagramTypeMap[asset.type]);
    if (!diagramSources.length) {
        console.log('No diagram-capable assets found; nothing to render.');
        await writeFile(jsonFile, JSON.stringify(dataset));
        return;
    }

    for (const asset of diagramSources) {
        const diagramType = diagramTypeMap[asset.type];
        const ext = normalizeLanguage(asset.ext);
        if (!diagramType || !diagramExts.has(ext)) {
            continue;
        }

        const diagramUid = `${asset.uid}.svg`;
        const existing = dataset.asset_info.find((row) => row.uid === diagramUid);
        const existingLink = dataset.assets.find((row) => row.asset_uid === diagramUid && row.version_id === versionId);
        const docSid = getJsonDocSid(dataset, asset.parent_doc_uid);

        if (existing?.blob_uid) {
            const existingBlob = blobByUid.get(String(existing.blob_uid));
            const existingBuffer = loadJsonBlobBuffer(dataset, blobByUid, existing, blobsDir);
            await writeStaticBlob(blobsDir, existingBlob?.hash, existing.ext ?? 'svg', existingBuffer);
            if (existingLink) {
                console.log(`Skipping existing diagram ${diagramUid} for version ${versionId}`);
                continue;
            }
            dataset.assets.push({
                asset_uid: diagramUid,
                version_id: versionId,
                doc_sid: docSid,
                blob_uid: existing.blob_uid,
                type: diagramType
            });
            console.log(`${diagramUid} [${diagramType}]: linked existing blob ${existing.blob_uid}`);
            continue;
        }

        const codeBuffer = loadJsonBlobBuffer(dataset, blobByUid, asset, blobsDir);
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
        let blobUid = blobUidByHash.get(hash);
        if (!blobUid) {
            blobUid = nextId;
            nextId = (parseInt(nextId, 16) + 1).toString(16);
            const blobRow = {
                blob_uid: blobUid,
                hash,
                size: svgBuffer.length,
                path: null,
                compression: 0
            };
            dataset.blob_store.push(blobRow);
            blobByUid.set(String(blobUid), blobRow);
            blobUidByHash.set(hash, blobUid);
        }

        const now = new Date().toISOString();
        dataset.asset_info.push({
            uid: diagramUid,
            type: diagramType,
            blob_uid: blobUid,
            parent_doc_uid: asset.parent_doc_uid ?? null,
            path: null,
            ext: 'svg',
            params: null,
            meta_data: null,
            first_seen: now,
            last_seen: now
        });
        if (!existingLink) {
            dataset.assets.push({
                asset_uid: diagramUid,
                version_id: versionId,
                doc_sid: docSid,
                blob_uid: blobUid,
                type: diagramType
            });
        }
        await writeStaticBlob(blobsDir, hash, 'svg', svgBuffer);
        console.log(`${diagramUid} [${diagramType}]: generated blob ${blobUid} (hash ${hash.slice(0, 8)})`);
    }

    await writeFile(jsonFile, JSON.stringify(dataset));
}

async function main() {
    if (typeof fetch !== 'function') {
        throw new Error('Global fetch is not available. Run with Node 18+ or provide a fetch polyfill.');
    }
    if ((config.collect.format ?? config.dataBackend ?? 'sqlite') === 'json') {
        await runJson();
        return;
    }
    await runSqlite();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
