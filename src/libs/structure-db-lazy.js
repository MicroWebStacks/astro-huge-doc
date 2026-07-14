/*
 * structure-db LAZY backend (lite profile — VS Code extension).
 *
 * Implements the extension performance contract
 * (specification/engine-profiles/spec.md): resource use proportional to what
 * the user is looking at, not to workspace size.
 *
 * - Startup does a file-level walk only (no file contents are read): document
 *   identity (label, slug, url) derives from filenames, never frontmatter.
 *   The walk result is persisted as <json_dir>/filetree.json and re-derived
 *   only when <json_dir>/tree.stamp changes (the extension bumps it on file
 *   add/delete/rename — content edits never trigger a re-walk).
 * - getEntry() parses the requested page on demand through content-structure's
 *   collectDocument() and caches the result as a per-file record under
 *   <json_dir>/pages/<sid>.json, keyed by content hash. A cached page is
 *   re-parsed only when its markdown hash or a referenced asset's stat
 *   changes. Blob uids are remapped to their content hashes so records from
 *   independent parses (and previous runs) merge without collisions.
 * - In-memory state grows with visited pages only.
 *
 * The query surface mirrors structure-db-json.js over incrementally merged
 * per-page records. getEntry() is async here; callers await it (a plain value
 * comes back unchanged from the sync backends).
 * Must NOT import better-sqlite3 or sharp (directly or transitively).
 */
import {createHash} from 'crypto';
import {existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync} from 'fs';
import {join, posix} from 'path';
import {config} from '../../config.js';
import {basePrefix, blobFileName, blobFileUrl} from './blob-files.js';
import {log_debug} from './utils.js';

// The parse pipeline (content-structure -> remark/jsdom, gray-matter) costs
// >1 s of module loading; the walk-only startup must not pay it. It is
// imported once, on the first page parse.
let parseDepsPromise = null;
function loadParseDeps() {
    if (!parseDepsPromise) {
        parseDepsPromise = Promise.all([
            import('content-structure'),
            import('content-structure/src/structure_db.js'),
            import('content-structure/src/blob_files.js'),
            import('gray-matter')
        ]).then(([cs, structureDb, blobFiles, grayMatter]) => ({
            collectDocument: cs.collectDocument,
            getStructureSchema: structureDb.getStructureSchema,
            buildDocumentRow: structureDb.buildDocumentRow,
            writeBlobFiles: blobFiles.writeBlobFiles,
            matter: grayMatter.default
        }));
    }
    return parseDepsPromise;
}

const IGNORED_NAMES = new Set(['.git', 'node_modules']);
const LAZY_VERSION_ID = 'lazy';
const ASSET_KEY_SEPARATOR = '::';

const jsonDir = () => config.collect.json_dir;
const contentDir = () => config.collect.contentdir;
const treeStampPath = () => join(jsonDir(), 'tree.stamp');
const fileTreePath = () => join(jsonDir(), 'filetree.json');
const pagesDir = () => join(jsonDir(), 'pages');
const blobsDir = () => join(jsonDir(), 'blobs');

/* ------------------------------------------------------------------ tree */

let tree = null; // {documents, docByUid, docBySid, docByUrl, sourceEntries}
let treeStampSeen = null;

const indexes = {
    itemsByDocSid: new Map(),
    assetInfoByUid: new Map(),
    assetInfoByUidBlob: new Map(),
    assetsByUid: new Map(),
    imageByUid: new Map(),
    blobByUid: new Map(),
    contentDocBySid: new Map()
};
const loadedDocs = new Map(); // sid -> {hash, assetSources}
const inflight = new Map(); // sid -> Promise
const blobCache = new Map();

function assetBlobKey(assetUid, blobUid) {
    return `${assetUid}${ASSET_KEY_SEPARATOR}${blobUid}`;
}

function contentHash(buffer) {
    return createHash('md5').update(buffer).digest('hex');
}

function statMtime(file) {
    try {
        return Math.trunc(statSync(file).mtimeMs);
    } catch {
        return 0;
    }
}

/* Local slug rule (lite identity contract): lowercase, diacritics stripped,
   runs of anything non-alphanumeric collapse to single dashes. Deliberately
   self-contained — the walk must not load the parse pipeline's modules. */
function slugSegment(name) {
    const slug = String(name ?? '')
        .trim()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || 'page';
}

function stripExtension(name) {
    return String(name ?? '').replace(/\.[^.]+$/, '');
}

/* GitHub-style file identity: readme.md (any case) or a file named like its
   parent folder represents the folder itself. Mirrors content-structure's
   get_url_type() so lite and full agree on which file is a folder page. */
function urlTypeFor(relPath) {
    const lower = relPath.toLowerCase();
    if (lower.endsWith('readme.md')) {
        return 'dir';
    }
    const segments = relPath.split('/');
    const name = stripExtension(segments[segments.length - 1]);
    const parent = segments.length > 1 ? segments[segments.length - 2] : null;
    return name === parent ? 'dir' : 'file';
}

function levelFor(urlType, relPath) {
    const segments = relPath.split('/');
    const dirDepth = segments.length - 1;
    if (dirDepth === 0) {
        return 1;
    }
    return urlType === 'file' ? 1 + dirDepth + 1 : 1 + dirDepth;
}

/* Lite identity contract: url = slugified relative path without extension,
   label = filename (or folder name) without extension, verbatim. Frontmatter
   is never read (deliberate divergence from the full profile). */
function identityFor(relPath) {
    const segments = relPath.split('/');
    const fileName = segments[segments.length - 1];
    const dirSegments = segments.slice(0, -1);
    const urlType = urlTypeFor(relPath);
    let url;
    let title;
    if (urlType === 'dir') {
        url = dirSegments.map(slugSegment).join('/');
        title = dirSegments.length > 0 ? dirSegments[dirSegments.length - 1] : stripExtension(fileName);
    } else {
        url = [...dirSegments.map(slugSegment), slugSegment(stripExtension(fileName))].join('/');
        title = stripExtension(fileName);
    }
    const slug = url === '' ? stripExtension(fileName) : url.split('/').pop();
    return {url, title, slug, url_type: urlType};
}

function uidForUrl(url, slug) {
    const segments = String(url ?? '').split('/').filter(Boolean);
    if (segments.length > 0) {
        return segments.join('.');
    }
    return String(slug ?? 'home').replaceAll('/', '.');
}

function shortMD5(text) {
    return createHash('md5').update(text, 'utf8').digest('hex').substring(0, 8);
}

function walkWorkspace() {
    const startedAt = Date.now();
    const root = contentDir();
    const documents = [];
    const sourceEntries = [];
    const usedUrls = new Map();
    const orderTracker = new Map();
    // Diagnostics for the walk summary line: the root composition tells apart
    // "the walk dropped the folders" from "navigation filtered them out".
    let rootDirs = 0;
    let rootFiles = 0;
    let symlinkedDirsFollowed = 0;
    let skippedEntries = 0;
    // Directories reached through a symlink/junction, by real path — entering
    // one twice would mean a symlink cycle, so the second visit is skipped.
    const seenRealDirs = new Set();

    const visit = (absDir, relDir) => {
        let children;
        try {
            children = readdirSync(absDir, {withFileTypes: true});
        } catch (error) {
            console.warn(`[lite] tree walk skipped ${absDir} (${error.code ?? error.message})`);
            return;
        }
        children.sort((a, b) => {
            if (a.isDirectory() !== b.isDirectory()) {
                return a.isDirectory() ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });
        for (const child of children) {
            if (IGNORED_NAMES.has(child.name)) {
                continue;
            }
            const relPath = relDir ? `${relDir}/${child.name}` : child.name;
            const absPath = join(absDir, child.name);
            let isDirectory = child.isDirectory();
            let stat = null;
            if (!isDirectory) {
                try {
                    stat = statSync(absPath);
                } catch {
                    skippedEntries++;
                    continue;
                }
                // A symlinked/junction directory reports isDirectory() false on
                // the dirent; statSync follows the link, so its subtree is
                // walked like a plain folder instead of being silently lost.
                isDirectory = stat.isDirectory();
            }
            if (!relDir) {
                if (isDirectory) rootDirs++;
                else rootFiles++;
            }

            let doc = null;
            if (!isDirectory && child.name.toLowerCase().endsWith('.md')) {
                const identity = identityFor(relPath);
                let url = identity.url;
                const taken = usedUrls.get(url) ?? 0;
                usedUrls.set(url, taken + 1);
                if (taken > 0) {
                    url = `${url}-${taken + 1}`;
                }
                const uid = uidForUrl(url, identity.slug);
                const level = levelFor(identity.url_type, relPath);
                const orderKey = `${relDir || '.'}|${level}`;
                const order = (orderTracker.get(orderKey) ?? 0) + 1;
                orderTracker.set(orderKey, order);
                doc = {
                    sid: shortMD5(uid),
                    uid,
                    path: relPath,
                    url,
                    url_type: identity.url_type,
                    slug: identity.slug,
                    title: identity.title,
                    level,
                    order,
                    base_dir: relDir || '.'
                };
                documents.push(doc);
            }

            // Mirrors scripts/source-tree.js: a folder page's own file entry is
            // folded into its directory node (except at the root).
            if (!(doc && doc.url_type === 'dir' && relDir)) {
                sourceEntries.push({
                    path: relPath,
                    parent_path: relDir,
                    name: child.name,
                    entry_type: isDirectory ? 'dir' : 'file',
                    ext: isDirectory ? null : (child.name.includes('.') ? child.name.split('.').pop().toLowerCase() : null),
                    size: isDirectory ? null : stat.size,
                    mtime_ms: isDirectory ? null : Math.trunc(stat.mtimeMs),
                    document_url: doc ? doc.url : null,
                    document_title: doc ? doc.title : null,
                    document_url_type: doc ? doc.url_type : null,
                    sort_order: doc ? doc.order : null
                });
            }
            if (isDirectory) {
                if (!child.isDirectory()) {
                    // Reached through a symlink: guard against cycles before
                    // recursing (a link back to an ancestor would never end).
                    let realDir;
                    try {
                        realDir = realpathSync(absPath);
                    } catch {
                        skippedEntries++;
                        continue;
                    }
                    if (seenRealDirs.has(realDir)) {
                        continue;
                    }
                    seenRealDirs.add(realDir);
                    symlinkedDirsFollowed++;
                }
                visit(absPath, relPath);
            }
        }
    };
    visit(root, '');

    // Directory entries adopt their folder page's document mapping so the menu
    // can link folder nodes (same contract as the full collect's source tree).
    const dirDocByPath = new Map();
    for (const doc of documents) {
        if (doc.url_type === 'dir') {
            const parent = doc.path.includes('/') ? doc.path.slice(0, doc.path.lastIndexOf('/')) : '';
            if (parent) {
                dirDocByPath.set(parent, doc);
            }
        }
    }
    for (const entry of sourceEntries) {
        if (entry.entry_type === 'dir' && dirDocByPath.has(entry.path)) {
            const doc = dirDocByPath.get(entry.path);
            entry.document_url = doc.url;
            entry.document_title = doc.title;
            entry.document_url_type = doc.url_type;
            entry.sort_order = doc.order;
        }
    }

    const docByUid = new Map();
    const docBySid = new Map();
    const docByUrl = new Map();
    for (const doc of documents) {
        docByUid.set(doc.uid, doc);
        docBySid.set(doc.sid, doc);
        if (!docByUrl.has(doc.url)) {
            docByUrl.set(doc.url, doc);
        }
    }
    const walkMs = Date.now() - startedAt;
    const extras = [
        ...(symlinkedDirsFollowed ? [`${symlinkedDirsFollowed} symlinked dirs followed`] : []),
        ...(skippedEntries ? [`${skippedEntries} entries skipped`] : [])
    ];
    console.log(`[lite] file tree walk: ${documents.length} documents, ${sourceEntries.length} entries in ${walkMs} ms (root: ${rootDirs} dirs, ${rootFiles} files${extras.length ? `; ${extras.join(', ')}` : ''})`);

    try {
        mkdirSync(jsonDir(), {recursive: true});
        writeFileSync(fileTreePath(), JSON.stringify({
            version_id: LAZY_VERSION_ID,
            walked_at: new Date().toISOString(),
            walk_ms: walkMs,
            documents,
            source_entries: sourceEntries
        }));
    } catch (error) {
        console.warn(`[lite] could not persist filetree.json: ${error.message}`);
    }

    return {documents, sourceEntries, docByUid, docBySid, docByUrl};
}

/* Re-walk only when the extension bumped tree.stamp (file add/delete/rename).
   Content edits never invalidate the tree. */
function ensureTree() {
    const stamp = statMtime(treeStampPath());
    if (tree && stamp === treeStampSeen) {
        return tree;
    }
    tree = walkWorkspace();
    treeStampSeen = stamp;
    return tree;
}

/* ------------------------------------------------------- lazy page loads */

function assetSourcesFresh(sources) {
    for (const source of sources ?? []) {
        if (!source?.abs_path) {
            continue;
        }
        let stat;
        try {
            stat = statSync(source.abs_path);
        } catch {
            return false;
        }
        if (stat.size !== source.size || Math.trunc(stat.mtimeMs) !== source.mtime_ms) {
            return false;
        }
    }
    return true;
}

function mergeRecord(doc, record) {
    indexes.itemsByDocSid.set(doc.sid, record.items ?? []);
    indexes.contentDocBySid.set(doc.sid, record.document ?? null);

    const infoByUid = new Map();
    for (const row of record.asset_info ?? []) {
        const list = infoByUid.get(row.uid);
        if (list) list.push(row);
        else infoByUid.set(row.uid, [row]);
        indexes.assetInfoByUidBlob.set(assetBlobKey(row.uid, row.blob_uid), row);
    }
    for (const [uid, rows] of infoByUid) {
        indexes.assetInfoByUid.set(uid, rows);
    }

    const versionsByUid = new Map();
    for (const row of record.assets ?? []) {
        const list = versionsByUid.get(row.asset_uid);
        if (list) list.push(row);
        else versionsByUid.set(row.asset_uid, [row]);
    }
    for (const [uid, rows] of versionsByUid) {
        indexes.assetsByUid.set(uid, rows);
    }

    for (const row of record.images ?? []) {
        indexes.imageByUid.set(row.uid, row);
    }
    for (const row of record.blob_store ?? []) {
        if (row.blob_uid != null) {
            indexes.blobByUid.set(String(row.blob_uid), row);
        }
    }
    loadedDocs.set(doc.sid, {hash: record.hash, assetSources: record.asset_sources ?? []});
}

async function parseDocumentRecord(doc, rawText, hash) {
    const startedAt = Date.now();
    const {collectDocument, getStructureSchema, buildDocumentRow, writeBlobFiles, matter} = await loadParseDeps();
    let body = rawText;
    try {
        body = matter(rawText).content ?? rawText;
    } catch {
        // malformed frontmatter: render the file as-is
    }
    const entry = {
        sid: doc.sid,
        uid: doc.uid,
        path: doc.path,
        url: doc.url,
        url_type: doc.url_type,
        slug: doc.slug,
        title: doc.title,
        level: doc.level,
        order: doc.order,
        base_dir: doc.base_dir,
        version_id: LAZY_VERSION_ID
    };
    const result = await collectDocument(config.collect, {entry, markdownText: body});
    if (!result) {
        return null;
    }

    // Blob uids from the per-call counter collide across independent parses;
    // re-key everything by content hash (stable, content-addressed).
    const hashByUid = new Map();
    for (const blob of result.blobs ?? []) {
        if (blob?.blob_uid != null && blob.hash) {
            hashByUid.set(String(blob.blob_uid), blob.hash);
        }
    }
    for (const asset of result.assets ?? []) {
        if (asset?.blob_uid != null && hashByUid.has(String(asset.blob_uid))) {
            asset.blob_uid = hashByUid.get(String(asset.blob_uid));
        }
    }
    for (const image of result.images ?? []) {
        if (image?.blob_uid != null && hashByUid.has(String(image.blob_uid))) {
            image.blob_uid = hashByUid.get(String(image.blob_uid));
        }
    }
    const blobRowByUid = new Map();
    for (const blob of result.blobs ?? []) {
        blob.blob_uid = blob.hash;
        blobRowByUid.set(String(blob.blob_uid), blob);
    }

    const schema = await getStructureSchema();
    const documentsSchema = schema.tables.get('documents');
    const payload = buildDocumentRow(result.entry, result.content, documentsSchema, {
        versionId: LAZY_VERSION_ID,
        tree: result.tree,
        assets: result.assets
    });

    // A browser resolves ../README.md against the extension-less lite URL,
    // which would request a non-existent *.md route. Resolve Markdown links
    // against the source file instead, then replace them with the target
    // document's filename-derived lite URL. Anchors, query strings, external
    // URLs, and non-Markdown assets keep their original behavior.
    const documentsByPath = new Map(
        ensureTree().documents.map((candidate) => [candidate.path.toLowerCase(), candidate])
    );
    for (const item of payload.items ?? []) {
        if (item?.type !== 'link' || !item.ast) {
            continue;
        }
        try {
            const ast = JSON.parse(item.ast);
            const rawUrl = String(ast?.url ?? '');
            if (!rawUrl || rawUrl.startsWith('#') || rawUrl.startsWith('/')
                || rawUrl.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(rawUrl)) {
                continue;
            }
            const match = rawUrl.match(/^([^?#]*)(.*)$/);
            const relativePath = match?.[1] ?? rawUrl;
            const suffix = match?.[2] ?? '';
            if (!/\.md$/i.test(relativePath)) {
                continue;
            }
            let decodedPath = relativePath;
            try {
                decodedPath = decodeURIComponent(relativePath);
            } catch {
                // Leave malformed percent escapes untouched; no target match.
            }
            const sourcePath = posix.normalize(posix.join(posix.dirname(doc.path), decodedPath));
            const target = documentsByPath.get(sourcePath.toLowerCase());
            if (target) {
                ast.url = `${basePrefix(config.base)}/${target.url}${suffix}`;
                item.ast = JSON.stringify(ast);
            }
        } catch {
            // Preserve an unrecognized AST payload exactly as collected.
        }
    }

    // Content-addressed blob files for this page only (no rm -rf, additive).
    const refs = [];
    for (const asset of result.assets ?? []) {
        const blob = blobRowByUid.get(String(asset?.blob_uid));
        if (blob) {
            refs.push({blob, ext: asset.ext});
        }
    }
    for (const image of result.images ?? []) {
        const blob = blobRowByUid.get(String(image?.blob_uid));
        if (blob) {
            refs.push({blob, ext: image.extension});
        }
    }
    if (refs.length > 0) {
        mkdirSync(blobsDir(), {recursive: true});
        await writeBlobFiles(refs, blobsDir(), config.collect.outdir);
    }

    const assetInfo = (result.assets ?? [])
        .filter((asset) => asset?.uid)
        .map((asset) => ({
            uid: asset.uid,
            type: asset.type ?? null,
            blob_uid: asset.blob_uid ?? null,
            parent_doc_uid: asset.parent_doc_uid ?? null,
            path: asset.path ?? null,
            ext: asset.ext ?? null,
            params: asset.params ?? null,
            meta_data: asset.meta_data ?? null,
            first_seen: asset.first_seen ?? null,
            last_seen: asset.last_seen ?? null
        }));
    const blobMeta = (result.blobs ?? []).map((blob) => ({
        blob_uid: blob.blob_uid,
        hash: blob.hash,
        size: blob.size ?? null,
        path: blob.path ?? null,
        compression: blob.compression ?? null
    }));
    const assetSources = [];
    for (const asset of result.assets ?? []) {
        if (!asset?.abs_path || asset.exists === false) {
            continue;
        }
        try {
            const stat = statSync(asset.abs_path);
            assetSources.push({abs_path: asset.abs_path, size: stat.size, mtime_ms: Math.trunc(stat.mtimeMs)});
        } catch {
            // asset disappeared between parse and stat; next check reparses
        }
    }

    const parseMs = Date.now() - startedAt;
    const record = {
        hash,
        parsed_at: new Date().toISOString(),
        parse_ms: parseMs,
        document: payload.row,
        items: payload.items ?? [],
        assets: payload.assetVersions ?? [],
        asset_info: assetInfo,
        images: result.images ?? [],
        blob_store: blobMeta,
        asset_sources: assetSources
    };
    console.log(`[lite] parsed ${doc.path} in ${parseMs} ms (items=${record.items.length}, assets=${assetInfo.length})`);
    return record;
}

async function loadOrParseDocument(doc) {
    const absPath = join(contentDir(), doc.path);
    let raw;
    try {
        raw = readFileSync(absPath);
    } catch {
        return false;
    }
    const hash = contentHash(raw);
    const loaded = loadedDocs.get(doc.sid);
    if (loaded && loaded.hash === hash && assetSourcesFresh(loaded.assetSources)) {
        return true;
    }

    const recordPath = join(pagesDir(), `${doc.sid}.json`);
    if (existsSync(recordPath)) {
        try {
            const record = JSON.parse(readFileSync(recordPath, 'utf-8'));
            if (record?.hash === hash && assetSourcesFresh(record.asset_sources)) {
                mergeRecord(doc, record);
                log_debug(`  - getEntry[lazy]> cache hit ${doc.path}`);
                return true;
            }
        } catch {
            // unreadable record: fall through to a fresh parse
        }
    }

    const record = await parseDocumentRecord(doc, raw.toString('utf-8'), hash);
    if (!record) {
        return false;
    }
    try {
        mkdirSync(pagesDir(), {recursive: true});
        writeFileSync(recordPath, JSON.stringify(record));
    } catch (error) {
        console.warn(`[lite] could not persist page record for ${doc.path}: ${error.message}`);
    }
    mergeRecord(doc, record);
    return true;
}

function ensureDocumentLoaded(doc) {
    if (inflight.has(doc.sid)) {
        return inflight.get(doc.sid);
    }
    const pending = loadOrParseDocument(doc).finally(() => {
        inflight.delete(doc.sid);
    });
    inflight.set(doc.sid, pending);
    return pending;
}

/* --------------------------------------------------------- query surface */

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

function findWalkDocument(match) {
    const {docByUid, docBySid, docByUrl} = ensureTree();
    if (match?.uid) {
        return docByUid.get(match.uid) ?? null;
    }
    if (match?.sid) {
        return docBySid.get(match.sid) ?? null;
    }
    const urlValue = typeof match?.url === 'string' ? match.url : '';
    return docByUrl.get(urlValue) ?? null;
}

function getDocument(match, versionId = null) {
    const doc = findWalkDocument(match);
    if (!doc) {
        return null;
    }
    const contentRow = indexes.contentDocBySid.get(doc.sid);
    return normalizeDocumentRow(contentRow ? {...doc, ...contentRow} : doc);
}

function getItems(match, type, versionId = null) {
    const doc = match?.doc_sid ? {sid: match.doc_sid} : findWalkDocument(match);
    if (!doc?.sid) {
        return [];
    }
    let rows = indexes.itemsByDocSid.get(doc.sid) ?? [];
    if (type) {
        rows = rows.filter((item) => item.type === type);
    }
    return [...rows]
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        .map((item) => (item?.ast ? {...item, ast: safeParseAst(item.ast)} : item));
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

function getImageInfo(uid) {
    return indexes.imageByUid.get(uid);
}

function getAssetInfo(match) {
    if (!match?.asset_uid) {
        return null;
    }
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
    const blob = indexes.blobByUid.get(String(blobUid));
    const fileName = blob?.hash ? blobFileName(blob.hash, asset.ext) : String(blobUid);
    try {
        buffer = readFileSync(join(blobsDir(), fileName));
    } catch {
        buffer = null;
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
    if (!assetUid) {
        return null;
    }
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
    return findAssetRow(assetUid, versionId)?.blob_uid ?? null;
}

function getAssetUrl(assetUid, versionId = null) {
    if (!assetUid) {
        return null;
    }
    const assetRow = findAssetRow(assetUid, versionId);
    if (!assetRow?.blob_uid) {
        return null;
    }
    const assetInfo = indexes.assetInfoByUidBlob.get(assetBlobKey(assetUid, assetRow.blob_uid))
        ?? indexes.assetInfoByUid.get(assetUid)?.[0]
        ?? null;
    const blob = indexes.blobByUid.get(String(assetRow.blob_uid));
    return blobFileUrl(blob?.hash, assetInfo?.ext, config.base);
}

/* Mirrors structure-db-json.js: mark headings whose section contains a table,
   code block, or diagram for the TOC indicators. */
function annotateHeadingSections(items) {
    const headings = items.filter((i) => i.type === 'heading');
    if (headings.length === 0) {
        return headings;
    }
    const diagram = config.diagram ?? {};
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
            } else {
                current.hasCode = true;
            }
        }
    }
    return headings;
}

function getDocuments(versionId = null) {
    const {documents} = ensureTree();
    return documents
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

function getSourceEntries(versionId = null) {
    const {sourceEntries} = ensureTree();
    return [...sourceEntries].sort((a, b) => {
        const parent = String(a.parent_path ?? '').localeCompare(String(b.parent_path ?? ''));
        if (parent !== 0) {
            return parent;
        }
        if (a.entry_type !== b.entry_type) {
            return a.entry_type === 'dir' ? -1 : 1;
        }
        return String(a.name ?? '').localeCompare(String(b.name ?? ''));
    });
}

function getFirstDocument(versionId = null) {
    const {documents} = ensureTree();
    if (documents.length === 0) {
        return null;
    }
    const rank = (url) => (url === '' ? 0 : url === 'home' ? 1 : 2);
    const docs = [...documents].sort((a, b) => {
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

/* Async: parses/loads the requested page on demand. Await is safe across all
   backends (plain values from the sync ones pass through unchanged). */
async function getEntry(match) {
    ensureTree();
    const walkDoc = findWalkDocument(match);
    if (!walkDoc) {
        if (match?.url === '' || match?.url === undefined) {
            const firstDocument = getFirstDocument();
            if (firstDocument?.url && firstDocument.url !== match?.url) {
                return getEntry({...match, url: firstDocument.url});
            }
        }
        return {found: false, title: '', headings: [], items: [], data: {}};
    }
    const ok = await ensureDocumentLoaded(walkDoc);
    if (!ok) {
        return {found: false, title: '', headings: [], items: [], data: {}};
    }
    log_debug('  - getEntry[lazy]> document.sid=', walkDoc.sid);
    const document = getDocument({sid: walkDoc.sid});
    const items = getItems({doc_sid: walkDoc.sid});
    const headings = annotateHeadingSections(items);
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
