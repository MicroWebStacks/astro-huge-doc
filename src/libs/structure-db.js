import {existsSync, readFileSync} from 'fs';
import {join, dirname, extname} from 'path';
import {gunzipSync} from 'zlib';
import {config} from '../../config.js';
import {shortMD5} from './utils.js';
import {openDatabase} from 'content-structure/src/sqlite_utils/index.js';

const dbPath = join(config.collect_content.outdir, 'structure.db');
let cachedDb;
const blobCache = new Map();

function ensureDb() {
    if (!cachedDb) {
        if (!existsSync(dbPath)) {
            throw new Error(`structure-db: missing database at ${dbPath}`);
        }
        cachedDb = openDatabase(dbPath, {readonly: true});
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

function getDocument(match) {
    const db = ensureDb();
    if (match?.uid) {
        const row = db.prepare('SELECT * FROM documents WHERE uid = ?').get(match.uid);
        return normalizeDocumentRow(row);
    }
    if (match?.sid) {
        const row = db.prepare('SELECT * FROM documents WHERE sid = ?').get(match.sid);
        return normalizeDocumentRow(row);
    }
    const urlValue = typeof match?.url === 'string' ? match.url : '';
    const row = db.prepare('SELECT * FROM documents WHERE url = ?').get(urlValue);
    return normalizeDocumentRow(row);
}

function getImageInfo(uid) {
    const db = ensureDb();
    const row = db.prepare('SELECT * FROM images WHERE uid = ?').get(uid);
    return row;
}

function getItemsForDocument(docSid, type) {
    const db = ensureDb();
    const params = [docSid];
    let sql = 'SELECT * FROM items WHERE doc_sid = ?';
    if (type) {
        sql += ' AND type = ?';
        params.push(type);
    }
    sql += ' ORDER BY order_index';
    return db.prepare(sql).all(...params);
}

function getItems(match, type) {
    if (match?.doc_sid) {
        return getItemsForDocument(match.doc_sid, type);
    }
    const document = getDocument(match);
    if (!document?.sid) {
        return [];
    }
    const items = getItemsForDocument(document.sid, type);
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

function getAssetsForDocument(docUid) {
    const db = ensureDb();
    const assets = db.prepare('SELECT * FROM asset_info WHERE parent_doc_uid = ?').all(docUid);
    const map = new Map();
    for (const asset of assets) {
        map.set(asset.uid, asset);
    }
    return map;
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
        const absPath = join(config.collect_content.outdir, 'blobs', blob.path, blob.hash);
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

function normalizeAssetRow(row) {
    if (!row) {
        return null;
    }
    const {info_blob_uid, asset_blob_uid, blob_uid: infoBlobUid, ...rest} = row;
    return {
        ...rest,
        blob_uid: asset_blob_uid ?? info_blob_uid ?? infoBlobUid ?? null
    };
}

function getAsset(uid) {
    if (!uid) {
        return null;
    }
    const db = ensureDb();
    const row = db
        .prepare(
            `
        SELECT ai.*, ai.blob_uid AS info_blob_uid, a.blob_uid AS asset_blob_uid
        FROM asset_info ai
        LEFT JOIN assets a ON ai.uid = a.asset_uid
        WHERE ai.uid = ?
    `
        )
        .get(uid);
    return normalizeAssetRow(row);
}

function getAssetWithBlob(uid) {
    const asset = getAsset(uid);
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

function getEntryDeprecated(match) {
    const document = getDocument(match);
    if (!document) {
        return null;
    }
    const itemsRaw = getItems(match);
    const assets = getAssetsForDocument(document.uid);
    const {items: renderItems, headings} = buildItems(itemsRaw, assets, document.uid, document.path);
    const data = {
        ...document.meta_data,
        ...document,
        headings
    };
    return {
        title: document.title ?? '',
        headings,
        items: renderItems,
        data
    };
}

function getEntry(match){
    const document = getDocument(match);
    if (!document) {
        return {title: '', headings: [], items: [], data: {}};
    }
    console.log("getEntry> document.sid=",document.sid);
    const items = getItems(match);
    let headings = document?.toc;
    if (!headings) {
        headings = items.filter((i) => i.type === 'heading');
    }
    console.log("getEntry> headings.length=",headings.length);
    const data = {
        ...document,
        ...document.meta_data
    }

    return {title: document.title, headings, items, data}
}

export {
    getEntry, 
    getAsset, 
    getAssetWithBlob, 
    getDocument, 
    getItems, 
    getAssetInfo, 
    parseAssetLink,
    getImageInfo
};