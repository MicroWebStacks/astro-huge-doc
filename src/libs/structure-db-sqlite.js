import {existsSync, readFileSync} from 'fs';
import {join, dirname, extname} from 'path';
import {gunzipSync} from 'zlib';
import {config} from '../../config.js';
import {blobFileUrl} from './blob-files.js';
import {log_debug, shortMD5} from './utils.js';
import {openDatabase} from 'content-structure/src/sqlite_utils/index.js';

let cachedDb;
const blobCache = new Map();

function ensureDb() {
    if (!cachedDb) {
        if (!existsSync(config.collect.db_path)) {
            throw new Error(`structure-db: missing database at ${config.collect.db_path}`);
        }
        cachedDb = openDatabase(config.collect.db_path, {readonly: true});
    }
    return cachedDb;
}

function parseJson(value, fallback = {}) {
    if (!value) {
        return fallback;
    }
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function normalizeDocumentRow(row) {
    if (!row) {
        return null;
    }
    const tags = parseJson(row.tags, []);
    const meta = parseJson(row.meta_data, {});
    const format = row.format ?? 'markdown';
    return {
        ...row,
        format,
        tags,
        meta_data: meta
    };
}

function getDocument(match, versionId = null) {
    const db = ensureDb();
    const resolvedVersion = versionId ?? config.collect.version_id ?? null;
    const fetchRow = (column, value) => {
        if (value === undefined) {
            return null;
        }
        if (resolvedVersion) {
            const row = db.prepare(`SELECT * FROM documents WHERE ${column} = ? AND version_id = ?`).get(value, resolvedVersion);
            if (row) {
                return row;
            }
        }
        return db
            .prepare(`SELECT * FROM documents WHERE ${column} = ? ORDER BY version_id DESC LIMIT 1`)
            .get(value);
    };
    let row = null;
    if (match?.uid) {
        row = fetchRow('uid', match.uid);
    } else if (match?.sid) {
        row = fetchRow('sid', match.sid);
    } else {
        const urlValue = typeof match?.url === 'string' ? match.url : '';
        row = fetchRow('url', urlValue);
    }
    return normalizeDocumentRow(row);
}

function getImageInfo(uid) {
    const db = ensureDb();
    const row = db.prepare('SELECT * FROM images WHERE uid = ?').get(uid);
    return row;
}

function getItemsForDocument(docSid, type, versionId = null) {
    const db = ensureDb();
    const resolvedVersion = versionId ?? config.collect.version_id ?? null;
    const params = [docSid];
    let sql = 'SELECT * FROM items WHERE doc_sid = ?';
    if (resolvedVersion) {
        sql += ' AND version_id = ?';
        params.push(resolvedVersion);
    }
    if (type) {
        sql += ' AND type = ?';
        params.push(type);
    }
    sql += ' ORDER BY order_index';
    let rows = db.prepare(sql).all(...params);
    if (rows.length || !resolvedVersion) {
        return rows;
    }
    const fallbackVersion = db
        .prepare('SELECT version_id FROM items WHERE doc_sid = ? ORDER BY version_id DESC LIMIT 1')
        .get(docSid);
    if (!fallbackVersion?.version_id) {
        return [];
    }
    const fallbackParams = [docSid, fallbackVersion.version_id];
    let fallbackSql = 'SELECT * FROM items WHERE doc_sid = ? AND version_id = ?';
    if (type) {
        fallbackSql += ' AND type = ?';
        fallbackParams.push(type);
    }
    fallbackSql += ' ORDER BY order_index';
    return db.prepare(fallbackSql).all(...fallbackParams);
}

function getItems(match, type, versionId = null) {
    const resolvedVersion = versionId ?? config.collect.version_id ?? null;
    if (match?.doc_sid) {
        return getItemsForDocument(match.doc_sid, type, resolvedVersion);
    }
    const document = getDocument(match, resolvedVersion);
    if (!document?.sid) {
        return [];
    }
    const items = getItemsForDocument(document.sid, type, resolvedVersion);
    return items.map((item) => {
        if (!item?.ast) {
            return item;
        }
        return {
            ...item,
            ast: safeParseAst(item.ast)
        };
    });
}

function getAssetInfo(match) {
    if (!match?.asset_uid) {
        return null;
    }
    const db = ensureDb();
    const row = db.prepare('SELECT * FROM asset_info WHERE uid = ?').get(match.asset_uid);
    return row ?? null;
}

function loadBlob(blobUid) {
    if (!blobUid) {
        return null;
    }
    if (blobCache.has(blobUid)) {
        return blobCache.get(blobUid);
    }
    const db = ensureDb();
    const row = db
        .prepare('SELECT blob_uid, hash, path, payload, compression FROM blob_store WHERE blob_uid = ?')
        .get(blobUid);
    blobCache.set(blobUid, row ?? null);
    return row ?? null;
}

function loadBlobBuffer(asset) {
    if (!asset?.blob_uid) {
        return null;
    }
    const blob = loadBlob(asset.blob_uid);
    if (!blob) {
        return null;
    }
    let buffer = null;
    if (blob.payload) {
        buffer = Buffer.from(blob.payload);
    } else if (blob.path && blob.hash) {
        const absPath = join(config.collect.outdir, 'blobs', blob.path, blob.hash);
        try {
            buffer = readFileSync(absPath);
        } catch {
            buffer = null;
        }
    }
    if (!buffer) {
        return null;
    }
    if (blob.compression) {
        try {
            buffer = gunzipSync(buffer);
        } catch {
            /* silently ignore decompression errors */
        }
    }
    return buffer;
}

function getAssetByUIDVersion(assetUid, versionId) {
    if (!assetUid || !versionId) {
        return null;
    }
    const db = ensureDb();
    const versionRow = db
        .prepare('SELECT blob_uid FROM assets WHERE asset_uid = ? AND version_id = ?')
        .get(assetUid, versionId);
    const blobUid = versionRow?.blob_uid;
    if (!blobUid) {
        return null;
    }
    const infoRow = db.prepare('SELECT * FROM asset_info WHERE uid = ? AND blob_uid = ?').get(assetUid, blobUid);
    return infoRow ?? null;
}

function getAssetInfoBlob_version(assetUid, versionId) {
    const asset = getAssetByUIDVersion(assetUid, versionId);
    if (!asset) {
        return {asset: null, buffer: null};
    }
    const buffer = loadBlobBuffer(asset);
    return {asset, buffer};
}

function getAssetInfoBlob_blob(assetUid, blobUid) {
    if (!assetUid || !blobUid) {
        return {asset: null, buffer: null};
    }
    const db = ensureDb();
    const asset = db.prepare('SELECT * FROM asset_info WHERE uid = ? AND blob_uid = ?').get(assetUid, blobUid);
    if (!asset) {
        return {asset: null, buffer: null};
    }
    const buffer = loadBlobBuffer(asset);
    return {asset, buffer};
}

function slugifyText(text) {
    const normalized = String(text ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
    return normalized || 'section';
}

function uniqueSlug(slug, tracker) {
    const count = tracker.get(slug) ?? 0;
    tracker.set(slug, count + 1);
    if (count === 0) {
        return slug;
    }
    return `${slug}-${count + 1}`;
}

function parseAssetLink(body) {
    if (typeof body !== 'string') {
        return null;
    }
    const match = /!\[([^\]]*)\]\(asset:\/\/\/([^)]+)\)/.exec(body);
    if (!match) {
        return null;
    }
    return {
        alt: match[1] || '',
        uid: match[2]
    };
}

function parseCodePayload(text, asset) {
    const content = String(text ?? '');
    return {
        lang: asset?.ext ?? null,
        meta: asset?.params ?? null,
        value: content
    };
}

function buildTableNode(dataRows) {
    const rows = Array.isArray(dataRows) ? dataRows : [];
    if (rows.length === 0) {
        return null;
    }
    const headers = Object.keys(rows[0] ?? {});
    const normalizedRows = rows.map((row) => headers.map((header) => row?.[header] ?? ''));
    const tableChildren = [headers, ...normalizedRows].map((cells) => ({
        type: 'tableRow',
        children: cells.map((value) => ({
            type: 'tableCell',
            children: [{type: 'text', value: String(value)}]
        }))
    }));
    return {type: 'table', children: tableChildren};
}

function bufferToDataUrl(buffer, ext) {
    if (!buffer) {
        return null;
    }
    const extension = ext ?? '';
    let mime = 'application/octet-stream';
    const normalizedExt = extension.startsWith('.') ? extension.slice(1) : extension;
    if (normalizedExt) {
        const lower = normalizedExt.toLowerCase();
        const mapping = {
            svg: 'image/svg+xml',
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            webp: 'image/webp',
            gif: 'image/gif',
            bmp: 'image/bmp'
        };
        mime = mapping[lower] ?? mime;
    }
    const base64 = buffer.toString('base64');
    return `data:${mime};base64,${base64}`;
}

function normalizeAssetPath(assetPath, documentPath) {
    if (!assetPath || !documentPath) {
        return assetPath ?? null;
    }
    const docDir = dirname(documentPath);
    if (!docDir || docDir === '.' || assetPath.startsWith('../../')) {
        return assetPath;
    }
    const normalizedDocDir = docDir.endsWith('/') ? docDir : `${docDir}/`;
    if (assetPath.startsWith(normalizedDocDir)) {
        return assetPath.slice(normalizedDocDir.length);
    }
    return assetPath;
}

function safeParseAst(astValue) {
    if (!astValue) {
        return null;
    }
    try {
        return JSON.parse(astValue);
    } catch {
        return null;
    }
}

function buildItems(items, assets, docUid, documentPath) {
    const renderItems = [];
    const headings = [];
    const slugTracker = new Map();
    let lineCounter = 1;
    for (const item of items) {
        const line = lineCounter++;
        const parsedAst = safeParseAst(item.ast);
        if (parsedAst) {
            if (item.type === 'heading') {
                const text = item.body_text ?? '';
                const slug = uniqueSlug(slugifyText(text), slugTracker);
                const uid = `${docUid}#${slug}`;
                headings.push({
                    label: text,
                    slug,
                    uid,
                    sid: shortMD5(uid),
                    depth: item.level ?? 1,
                    line
                });
            }
            renderItems.push({
                type: item.type,
                ast: parsedAst,
                position: {start: {line}}
            });
            continue;
        }

        switch (item.type) {
            case 'heading': {
                const text = item.body_text ?? '';
                const slug = uniqueSlug(slugifyText(text), slugTracker);
                const uid = `${docUid}#${slug}`;
                headings.push({
                    label: text,
                    slug,
                    uid,
                    sid: shortMD5(uid),
                    depth: item.level ?? 1,
                    line
                });
                renderItems.push({
                    type: 'heading',
                    depth: item.level ?? 1,
                    children: [{type: 'text', value: text}],
                    position: {start: {line}}
                });
                break;
            }
            case 'paragraph': {
                renderItems.push({
                    type: 'paragraph',
                    children: [{type: 'text', value: item.body_text ?? ''}],
                    position: {start: {line}}
                });
                break;
            }
            case 'image': {
                const link = parseAssetLink(item.body_text);
                const asset = link ? assets.get(link.uid) : null;
                let url = asset?.path ? normalizeAssetPath(asset.path, documentPath) : null;
                if (!url && asset) {
                    const buffer = loadBlobBuffer(asset);
                    url = bufferToDataUrl(buffer, asset.ext ?? (asset.path ? extname(asset.path) : null));
                }
                renderItems.push({
                    type: 'image',
                    url: url ?? '',
                    alt: link?.alt ?? 'image',
                    title: asset?.title ?? null,
                    position: {start: {line}}
                });
                break;
            }
            case 'code': {
                const link = parseAssetLink(item.body_text);
                const asset = link ? assets.get(link.uid) : null;
                const buffer = asset ? loadBlobBuffer(asset) : null;
                const codeText = buffer ? buffer.toString('utf-8') : '';
                const parsed = parseCodePayload(codeText, asset);
                renderItems.push({
                    type: 'code',
                    lang: parsed.lang ?? undefined,
                    meta: parsed.meta ?? undefined,
                    value: parsed.value ?? '',
                    asset_uid: asset?.uid ?? undefined,
                    diagram_uid: asset?.uid ? `${asset.uid}.svg` : undefined,
                    position: {start: {line}}
                });
                break;
            }
            case 'link': {
                const link = parseAssetLink(item.body_text);
                const asset = link ? assets.get(link.uid) : null;
                let url = asset?.path ? normalizeAssetPath(asset.path, documentPath) : '';
                if (!url && asset) {
                    const buffer = loadBlobBuffer(asset);
                    url = bufferToDataUrl(buffer, asset.ext ?? (asset.path ? extname(asset.path) : null)) ?? '';
                }
                const label = link?.alt ?? asset?.path ?? asset?.uid ?? '';
                renderItems.push({
                    type: 'link',
                    url,
                    title: asset?.title ?? null,
                    children: [{type: 'text', value: label}],
                    position: {start: {line}}
                });
                break;
            }
            case 'table': {
                const link = parseAssetLink(item.body_text);
                const asset = link ? assets.get(link.uid) : null;
                const buffer = asset ? loadBlobBuffer(asset) : null;
                let data = [];
                if (buffer) {
                    try {
                        data = JSON.parse(buffer.toString('utf-8'));
                    } catch {
                        data = [];
                    }
                }
                const tableNode = buildTableNode(data);
                if (tableNode) {
                    tableNode.position = {start: {line}};
                    renderItems.push(tableNode);
                }
                break;
            }
            default:
                break;
        }
    }
    return {items: renderItems, headings};
}

/* Mark each heading whose section directly contains a table, code block, or diagram so
   the TOC can show an indicator icon next to the label. The "section" of a
   heading is the run of items between it and the next heading; the nearest
   preceding heading is the one annotated. Diagrams are code blocks whose
   asset language is a configured diagram language (see config.diagram). */
function annotateHeadingSections(items) {
    const headings = items.filter((i) => i.type === 'heading');
    if (headings.length === 0) {
        return headings;
    }
    const diagramLanguages = config.diagram?.languages ?? {};
    const diagramAliases = config.diagram?.aliases ?? {};
    const normalizeLang = (ext) => {
        const value = String(ext ?? '').trim().toLowerCase();
        if (!value) {
            return '';
        }
        const trimmed = value.startsWith('.') ? value.slice(1) : value;
        return diagramAliases[trimmed] ?? trimmed;
    };
    const codeUids = items
        .filter((i) => i.type === 'code' && i.asset_uid)
        .map((i) => i.asset_uid);
    const extByUid = new Map();
    if (codeUids.length) {
        const db = ensureDb();
        const placeholders = codeUids.map(() => '?').join(',');
        const rows = db
            .prepare(`SELECT uid, ext FROM asset_info WHERE uid IN (${placeholders})`)
            .all(...codeUids);
        for (const row of rows) {
            extByUid.set(row.uid, row.ext);
        }
    }
    let current = null;
    for (const item of items) {
        if (item.type === 'heading') {
            current = item;
            continue;
        }
        if (!current) {
            continue;
        }
        if (item.type === 'table') {
            current.hasTable = true;
        } else if (item.type === 'code') {
            const lang = normalizeLang(extByUid.get(item.asset_uid));
            if (diagramLanguages[lang]) {
                current.hasDiagram = true;
            } else {
                current.hasCode = true;
            }
        }
    }
    return headings;
}

function getEntry(match){
    const versionId = match?.version_id ?? config.collect.version_id ?? null;
    const document = getDocument(match, versionId);
    if (!document) {
        if (match?.url === '' || match?.url === undefined) {
            const firstDocument = getFirstDocument(versionId);
            if (firstDocument?.url && firstDocument.url !== match?.url) {
                return getEntry({...match, url: firstDocument.url, version_id: versionId});
            }
        }
        return {found:false, title: '', headings: [], items: [], data: {}};
    }
    log_debug("  - getEntry> document.sid=",document.sid);
    const items = getItems(match, undefined, versionId);
    let headings = document?.toc;
    if (!headings) {
        headings = annotateHeadingSections(items);
    }
    const data = {
        ...document,
        ...document.meta_data
    }

    return {found:true, title: document.title, headings, items, data}
}

function getFirstDocument(versionId = null) {
    const db = ensureDb();
    const resolvedVersion = versionId ?? config.collect.version_id ?? null;
    const params = [];
    let sql = 'SELECT * FROM documents';
    if (resolvedVersion) {
        sql += ' WHERE version_id = ?';
        params.push(resolvedVersion);
    }
    sql += `
        ORDER BY
            CASE WHEN url = '' THEN 0 WHEN url = 'home' THEN 1 ELSE 2 END,
            level,
            "order",
            url
        LIMIT 1
    `;
    return normalizeDocumentRow(db.prepare(sql).get(...params));
}

/* Navigation rows for the layout menus. Scoped to the active build: the
   documents table accumulates a row per doc per version, so without the
   filter the menu would show every historical build's docs. */
function getDocuments(versionId = null) {
    const db = ensureDb();
    let resolvedVersion = versionId ?? config.collect.version_id ?? null;
    if (!resolvedVersion) {
        resolvedVersion = db
            .prepare('SELECT version_id FROM documents ORDER BY version_id DESC LIMIT 1')
            .get()?.version_id ?? null;
    }
    if (!resolvedVersion) {
        return [];
    }
    return db
        .prepare('SELECT url, title, level, "order" AS sort_order, url_type FROM documents WHERE version_id = ? ORDER BY level, sort_order, url')
        .all(resolvedVersion);
}

/* Source-tree rows for the file-tree menu (built by scripts/source-tree.js;
   sqlite backend only — the json backend returns [] and the layout falls back
   to the docs-derived menu). */
function getSourceEntries(versionId = null) {
    const db = ensureDb();
    const resolvedVersion = versionId ?? config.collect.version_id ?? null;
    try {
        const table = db
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'source_entries'")
            .get();
        if (!table) {
            return [];
        }
        return db
            .prepare(`
                SELECT
                    path,
                    parent_path,
                    name,
                    entry_type,
                    ext,
                    document_url,
                    document_title,
                    document_url_type,
                    sort_order
                FROM source_entries
                WHERE version_id = ?
                ORDER BY parent_path, entry_type, name
            `)
            .all(resolvedVersion);
    } catch (error) {
        console.warn(`source tree menu unavailable: ${error.message}`);
        return [];
    }
}

function getAssetBlob(assetUid, versionId = null) {
    if (!assetUid) {
        return null;
    }
    const db = ensureDb();
    const params = [assetUid];
    let query = 'SELECT blob_uid FROM assets WHERE asset_uid = ?';
    if (versionId) {
        query += ' AND version_id = ?';
        params.push(versionId);
    }
    const row = db.prepare(`${query} ORDER BY version_id DESC`).get(...params);
    return row?.blob_uid ?? null;
}

function getAssetUrl(assetUid, versionId = null) {
    if (!assetUid) {
        return null;
    }
    const db = ensureDb();
    const fetchRow = (resolvedVersion) => {
        const params = [assetUid];
        let sql = `
            SELECT bs.hash AS hash, ai.ext AS ext
            FROM assets a
            JOIN asset_info ai ON ai.uid = a.asset_uid AND ai.blob_uid = a.blob_uid
            JOIN blob_store bs ON bs.blob_uid = a.blob_uid
            WHERE a.asset_uid = ?
        `;
        if (resolvedVersion) {
            sql += ' AND a.version_id = ?';
            params.push(resolvedVersion);
        }
        sql += ' ORDER BY a.version_id DESC LIMIT 1';
        return db.prepare(sql).get(...params);
    };
    const row = fetchRow(versionId) ?? (versionId ? fetchRow(null) : null);
    return blobFileUrl(row?.hash, row?.ext, config.base);
}

export {
    getEntry,
    getFirstDocument,
    getDocuments,
    getSourceEntries,
    getAssetByUIDVersion,
    getAssetInfoBlob_version,
    getAssetInfoBlob_blob,
    getDocument, 
    getItems, 
    getAssetInfo, 
    parseAssetLink,
    getImageInfo,
    getAssetBlob,
    getAssetUrl
};
