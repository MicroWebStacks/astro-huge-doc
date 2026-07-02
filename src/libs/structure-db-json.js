/*
 * structure-db JSON backend (lite profile).
 *
 * Serves content from the pre-exported JSON dataset produced by
 * scripts/export-json.js. NO native deps: reads content.json once and loads
 * blobs as plain files from <json_dir>/blobs/<hash>.<ext> (already decompressed
 * at collect/export time). The exported dataset is scoped to a single version, so
 * version filtering here is lenient (match by key; fall back across versions).
 *
 * This mirrors the public surface and behaviour of structure-db-sqlite.js.
 * It must NOT import better-sqlite3 (directly or via a module that does);
 * config.js is safe to import — its sqlite use is lazy and skipped in json mode.
 */
import {existsSync, readFileSync} from 'fs';
import {join} from 'path';
import {config} from '../../config.js';
import {blobFileName, blobFileUrl} from './blob-files.js';
import {log_debug, shortMD5} from './utils.js';

let dataset;
const indexes = {};
const blobCache = new Map();
const ASSET_KEY_SEPARATOR = '::';

function assetBlobKey(assetUid, blobUid) {
    return `${assetUid}${ASSET_KEY_SEPARATOR}${blobUid}`;
}

function load() {
    if (dataset) {
        return dataset;
    }
    const file = join(config.collect.json_dir, 'content.json');
    if (!existsSync(file)) {
        throw new Error(`structure-db-json: missing dataset at ${file}. Run a JSON collect (DOCS_BACKEND=json pnpm collect) or \`pnpm export-json\` first.`);
    }
    dataset = JSON.parse(readFileSync(file, 'utf-8'));

    indexes.docByUid = new Map();
    indexes.docBySid = new Map();
    indexes.docByUrl = new Map();
    for (const doc of dataset.documents ?? []) {
        if (doc.uid != null) indexes.docByUid.set(doc.uid, doc);
        if (doc.sid != null) indexes.docBySid.set(doc.sid, doc);
        if (doc.url != null && !indexes.docByUrl.has(doc.url)) indexes.docByUrl.set(doc.url, doc);
    }

    indexes.itemsByDocSid = new Map();
    for (const item of dataset.items ?? []) {
        const list = indexes.itemsByDocSid.get(item.doc_sid);
        if (list) list.push(item);
        else indexes.itemsByDocSid.set(item.doc_sid, [item]);
    }

    // asset_info: uid may repeat across blobs; keep all, plus a (uid,blob_uid) map.
    indexes.assetInfoByUid = new Map();
    indexes.assetInfoByUidBlob = new Map();
    for (const row of dataset.asset_info ?? []) {
        const list = indexes.assetInfoByUid.get(row.uid);
        if (list) list.push(row);
        else indexes.assetInfoByUid.set(row.uid, [row]);
        indexes.assetInfoByUidBlob.set(assetBlobKey(row.uid, row.blob_uid), row);
    }

    // assets membership: asset_uid -> rows (each carries version_id, blob_uid).
    indexes.assetsByUid = new Map();
    for (const row of dataset.assets ?? []) {
        const list = indexes.assetsByUid.get(row.asset_uid);
        if (list) list.push(row);
        else indexes.assetsByUid.set(row.asset_uid, [row]);
    }

    indexes.imageByUid = new Map();
    for (const row of dataset.images ?? []) {
        indexes.imageByUid.set(row.uid, row);
    }

    indexes.blobByUid = new Map();
    for (const row of dataset.blob_store ?? []) {
        if (row.blob_uid != null) {
            indexes.blobByUid.set(String(row.blob_uid), row);
        }
    }

    return dataset;
}

function parseJson(value, fallback = {}) {
    if (!value) {
        return fallback;
    }
    if (typeof value !== 'string') {
        return value;
    }
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function safeParseAst(astValue) {
    if (!astValue) {
        return null;
    }
    if (typeof astValue !== 'string') {
        return astValue;
    }
    try {
        return JSON.parse(astValue);
    } catch {
        return null;
    }
}

function normalizeDocumentRow(row) {
    if (!row) {
        return null;
    }
    return {
        ...row,
        format: row.format ?? 'markdown',
        tags: parseJson(row.tags, []),
        meta_data: parseJson(row.meta_data, {})
    };
}

function parseAssetLink(body) {
    if (typeof body !== 'string') {
        return null;
    }
    const match = /!\[([^\]]*)\]\(asset:\/\/\/([^)]+)\)/.exec(body);
    if (!match) {
        return null;
    }
    return {alt: match[1] || '', uid: match[2]};
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
    return count === 0 ? slug : `${slug}-${count + 1}`;
}

function getDocument(match, versionId = null) {
    load();
    let row = null;
    if (match?.uid) {
        row = indexes.docByUid.get(match.uid) ?? null;
    } else if (match?.sid) {
        row = indexes.docBySid.get(match.sid) ?? null;
    } else {
        const urlValue = typeof match?.url === 'string' ? match.url : '';
        row = indexes.docByUrl.get(urlValue) ?? null;
    }
    return normalizeDocumentRow(row);
}

function getItemsForDocument(docSid, type) {
    load();
    let rows = indexes.itemsByDocSid.get(docSid) ?? [];
    if (type) {
        rows = rows.filter((item) => item.type === type);
    }
    return [...rows].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
}

function getItems(match, type, versionId = null) {
    if (match?.doc_sid) {
        return getItemsForDocument(match.doc_sid, type);
    }
    const document = getDocument(match, versionId);
    if (!document?.sid) {
        return [];
    }
    return getItemsForDocument(document.sid, type).map((item) => {
        if (!item?.ast) {
            return item;
        }
        return {...item, ast: safeParseAst(item.ast)};
    });
}

function getImageInfo(uid) {
    load();
    return indexes.imageByUid.get(uid);
}

function getAssetInfo(match) {
    if (!match?.asset_uid) {
        return null;
    }
    load();
    return indexes.assetInfoByUid.get(match.asset_uid)?.[0] ?? null;
}

function loadBlobBuffer(asset) {
    const blobUid = asset?.blob_uid;
    if (!blobUid) {
        return null;
    }
    if (blobCache.has(blobUid)) {
        return blobCache.get(blobUid);
    }
    let buffer = null;
    const blob = indexes.blobByUid?.get(String(blobUid));
    const fileName = blob?.hash ? blobFileName(blob.hash, asset.ext) : String(blobUid);
    const file = join(config.collect.json_dir, 'blobs', fileName);
    try {
        buffer = readFileSync(file);
    } catch {
        try {
            buffer = readFileSync(join(config.collect.json_dir, 'blobs', String(blobUid)));
        } catch {
            buffer = null;
        }
    }
    blobCache.set(blobUid, buffer);
    return buffer;
}

function findAssetRow(assetUid, versionId) {
    const rows = indexes.assetsByUid.get(assetUid);
    if (!rows?.length) {
        return null;
    }
    if (versionId) {
        const match = rows.find((row) => row.version_id === versionId);
        if (match) {
            return match;
        }
    }
    return rows[rows.length - 1];
}

function getAssetByUIDVersion(assetUid, versionId) {
    if (!assetUid || !versionId) {
        return null;
    }
    load();
    const blobUid = findAssetRow(assetUid, versionId)?.blob_uid;
    if (!blobUid) {
        return null;
    }
    return indexes.assetInfoByUidBlob.get(assetBlobKey(assetUid, blobUid)) ?? null;
}

function getAssetInfoBlob_version(assetUid, versionId) {
    const asset = getAssetByUIDVersion(assetUid, versionId);
    if (!asset) {
        return {asset: null, buffer: null};
    }
    return {asset, buffer: loadBlobBuffer(asset)};
}

function getAssetInfoBlob_blob(assetUid, blobUid) {
    if (!assetUid || !blobUid) {
        return {asset: null, buffer: null};
    }
    load();
    const asset = indexes.assetInfoByUidBlob.get(assetBlobKey(assetUid, blobUid)) ?? null;
    if (!asset) {
        return {asset: null, buffer: null};
    }
    return {asset, buffer: loadBlobBuffer(asset)};
}

function getAssetBlob(assetUid, versionId = null) {
    if (!assetUid) {
        return null;
    }
    load();
    return findAssetRow(assetUid, versionId)?.blob_uid ?? null;
}

function getAssetUrl(assetUid, versionId = null) {
    if (!assetUid) {
        return null;
    }
    load();
    const assetRow = findAssetRow(assetUid, versionId);
    if (!assetRow?.blob_uid) {
        return null;
    }
    const assetInfo = indexes.assetInfoByUidBlob.get(assetBlobKey(assetUid, assetRow.blob_uid))
        ?? indexes.assetInfoByUid.get(assetUid)?.[0]
        ?? null;
    const blob = indexes.blobByUid?.get(String(assetRow.blob_uid));
    return blobFileUrl(blob?.hash, assetInfo?.ext);
}

/* Mark each heading whose section directly contains a table or a diagram, so
   the TOC can show an indicator. Mirrors structure-db-sqlite.js but resolves
   code-block extensions from the in-memory asset_info index. */
function annotateHeadingSections(items) {
    const headings = items.filter((i) => i.type === 'heading');
    if (headings.length === 0) {
        return headings;
    }
    const diagram = config.diagram ?? dataset?.diagram ?? {};
    const diagramLanguages = diagram.languages ?? {};
    const diagramAliases = diagram.aliases ?? {};
    const normalizeLang = (ext) => {
        const value = String(ext ?? '').trim().toLowerCase();
        if (!value) {
            return '';
        }
        const trimmed = value.startsWith('.') ? value.slice(1) : value;
        return diagramAliases[trimmed] ?? trimmed;
    };
    const extByUid = new Map();
    for (const item of items) {
        if (item.type === 'code' && item.asset_uid) {
            const info = indexes.assetInfoByUid.get(item.asset_uid)?.[0];
            if (info) {
                extByUid.set(item.asset_uid, info.ext);
            }
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
            }
        }
    }
    return headings;
}

/* Navigation rows for the layout menus. The exported dataset holds a single
   version, so no version filtering is needed; mirrors the sqlite backend's
   row shape (sort_order alias) and ordering (level, sort_order, url). */
function getDocuments(versionId = null) {
    load();
    return (dataset.documents ?? [])
        .map((doc) => ({
            url: doc.url ?? '',
            title: doc.title ?? '',
            level: doc.level ?? 0,
            sort_order: doc.order ?? 0,
            url_type: doc.url_type ?? null
        }))
        .sort((a, b) => {
            const level = (a.level ?? 0) - (b.level ?? 0);
            if (level !== 0) return level;
            const order = (a.sort_order ?? 0) - (b.sort_order ?? 0);
            if (order !== 0) return order;
            return String(a.url ?? '').localeCompare(String(b.url ?? ''));
        });
}

/* The source tree index is built into SQLite only (scripts/source-tree.js is
   skipped in json mode); returning [] makes the layout fall back to the
   docs-derived section menu. */
function getSourceEntries(versionId = null) {
    return [];
}

function getFirstDocument(versionId = null) {
    load();
    const docs = [...(dataset.documents ?? [])];
    if (docs.length === 0) {
        return null;
    }
    const rank = (url) => (url === '' ? 0 : url === 'home' ? 1 : 2);
    docs.sort((a, b) => {
        const r = rank(a.url ?? '') - rank(b.url ?? '');
        if (r !== 0) return r;
        const level = (a.level ?? 0) - (b.level ?? 0);
        if (level !== 0) return level;
        const order = (a.order ?? 0) - (b.order ?? 0);
        if (order !== 0) return order;
        return String(a.url ?? '').localeCompare(String(b.url ?? ''));
    });
    return normalizeDocumentRow(docs[0]);
}

function getEntry(match) {
    load();
    const versionId = match?.version_id ?? config.collect.version_id ?? dataset.version_id ?? null;
    const document = getDocument(match, versionId);
    if (!document) {
        if (match?.url === '' || match?.url === undefined) {
            const firstDocument = getFirstDocument(versionId);
            if (firstDocument?.url && firstDocument.url !== match?.url) {
                return getEntry({...match, url: firstDocument.url, version_id: versionId});
            }
        }
        return {found: false, title: '', headings: [], items: [], data: {}};
    }
    log_debug('  - getEntry[json]> document.sid=', document.sid);
    const items = getItems(match, undefined, versionId);
    let headings = document?.toc;
    if (!headings) {
        headings = annotateHeadingSections(items);
    }
    const data = {...document, ...document.meta_data};
    return {found: true, title: document.title, headings, items, data};
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
