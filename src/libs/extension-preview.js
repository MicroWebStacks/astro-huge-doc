/*
 * Extension-preview runtime surface: the single gate plus the payload
 * builders behind the /__lite/* endpoints.
 *
 * Contract (specification/run-modes/spec.md): a feature that both emits
 * client-side UI and answers an endpoint must read ONE gate from ONE module.
 * Layout.astro decides whether to render the lazy navigation skeleton and the
 * live-reload poller with extensionPreviewEnabled(); src/middleware.js answers
 * /__lite/version and /__lite/navigation under the exact same gate. Neither
 * side may re-derive the condition or add conditions the other cannot see —
 * that split (client gated on the env var, endpoint additionally requiring
 * the express wrapper) is what shipped the 2026-07-14 "Pages could not be
 * loaded." regression under `astro dev`.
 */
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {stat} from 'node:fs/promises';
import {join} from 'node:path';
import {config} from '../../config.js';
import {buildSectionMenuFromSourceEntries, firstDocumentUrl} from '../layout/source_navigation.js';

function extensionPreviewEnabled() {
    return process.env.MICROWEBSTACKS_EXTENSION_MODE === 'true';
}

async function stampMtime(name) {
    try {
        return Math.trunc((await stat(join(config.collect.json_dir, name))).mtimeMs);
    } catch {
        return 0;
    }
}

/* Live-reload signal: the extension bumps stamp files in the json dir on
   workspace changes; pages poll this payload (Layout.astro) and reload
   themselves in place, preserving the current URL. The server never restarts
   on edits. Under `astro dev` nobody bumps the stamps, so the poller idles. */
async function versionPayload() {
    return {
        reload: await stampMtime('reload.stamp'),
        tree: await stampMtime('tree.stamp')
    };
}

/* Runtime identity for the in-viewer info surface (src/layout/runtime_info.js).
   Everything here is already on the local machine and stays there — the
   payload is served only on the local preview origin, behind the same gate as
   the rest of the surface (no-telemetry policy, engine-profiles spec). */
function engineMetadata() {
    // build-meta.json is written by the release staging flow; a git checkout
    // running from source has only package.json.
    try {
        const meta = JSON.parse(readFileSync(join(config.rootdir, 'build-meta.json'), 'utf8'));
        return {
            version: meta.version ?? null,
            commit: meta.gitCommitShort ?? null,
            branch: meta.gitBranch ?? null,
            builtAt: meta.builtAt ?? null,
            dirty: meta.gitDirty ?? null,
            source: 'release'
        };
    } catch {
        try {
            const pkg = JSON.parse(readFileSync(join(config.rootdir, 'package.json'), 'utf8'));
            return {version: pkg.version ?? null, source: 'workspace'};
        } catch {
            return {version: null, source: 'unknown'};
        }
    }
}

function runtimePayload({dev = false} = {}) {
    return {
        engine: engineMetadata(),
        // Launcher identity (e.g. "vscode-extension@0.0.17"), passed through
        // the env by whatever process started this server; null for plain CLI
        // runs. Lets the viewer show the extension<->engine pair.
        launcher: process.env.MICROWEBSTACKS_LAUNCHER ?? null,
        mode: dev ? 'dev-server' : 'built',
        profile: config.profile,
        backend: config.dataBackend,
        output: config.output,
        base: config.base,
        workspaceRoot: config.workspaceRoot,
        docsRoot: config.content_path,
        jsonDir: config.collect.json_dir,
        // The port the server was *configured* to bind. The viewer compares it
        // with its own location.port to make silent dev-server port drift
        // (4321 taken -> serving on 4323) visible instead of mysterious.
        configuredServer: {
            host: config.server.host,
            port: config.server.port,
            protocol: config.server.protocol
        },
        node: process.version,
        pid: process.pid,
        uptimeSeconds: Math.round(process.uptime()),
        // Renderer routing: which diagram languages stay entirely client-side
        // (no data leaves the machine) vs are routed to a Kroki server. Static
        // config only — no rendering happens to produce this.
        diagram: {
            languages: config.diagram.languages,
            krokiServer: config.diagram.renderers?.kroki?.server ?? null
        }
    };
}

/* Shallow file count + byte sum of one directory (the lazy cache dirs are
   flat); tolerates a dir that does not exist yet. */
function dirStats(dir) {
    try {
        let files = 0;
        let bytes = 0;
        for (const entry of readdirSync(dir, {withFileTypes: true})) {
            if (!entry.isFile()) continue;
            try {
                bytes += statSync(join(dir, entry.name)).size;
                files += 1;
            } catch {
                // deleted between readdir and stat
            }
        }
        return {files, bytes};
    } catch {
        return {files: 0, bytes: 0};
    }
}

/* Workspace + cache statistics for the info surface. Deliberately bounded by
   the lazy contract (engine-profiles spec): everything comes from file
   metadata the tree walk already gathered plus a shallow listing of the two
   flat cache dirs — no content reads, no recursive disk scans. */
async function statsPayload() {
    let entries;
    let documents = null;
    let walk = null;
    try {
        const snapshot = JSON.parse(readFileSync(join(config.collect.json_dir, 'filetree.json'), 'utf8'));
        entries = snapshot.source_entries ?? [];
        documents = Array.isArray(snapshot.documents) ? snapshot.documents.length : null;
        walk = {at: snapshot.walked_at ?? null, ms: snapshot.walk_ms ?? null};
    } catch {
        const {getSourceEntries} = await import('./structure-db.js');
        entries = getSourceEntries();
    }

    let dirs = 0;
    let files = 0;
    let bytes = 0;
    let newestMtimeMs = 0;
    const byExt = new Map();
    for (const entry of entries) {
        if (entry.entry_type === 'dir') {
            dirs += 1;
            continue;
        }
        files += 1;
        bytes += entry.size ?? 0;
        if (entry.mtime_ms && entry.mtime_ms > newestMtimeMs) {
            newestMtimeMs = entry.mtime_ms;
        }
        const ext = entry.ext ?? '(none)';
        byExt.set(ext, (byExt.get(ext) ?? 0) + 1);
    }
    const topExtensions = [...byExt.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([ext, count]) => ({ext, count}));

    const memory = process.memoryUsage();

    // Lazy-backend-only bookkeeping (undefined getters on full/sqlite): both
    // just read numbers the pipeline already computed for its own purposes,
    // nothing here re-parses or re-walks anything (see structure-db-lazy.js).
    const {getLastPageLoad, getWalkHistory} = await import('./structure-db.js');
    const lastPage = typeof getLastPageLoad === 'function' ? getLastPageLoad() : null;
    const history = typeof getWalkHistory === 'function' ? getWalkHistory() : [];
    const walkHistory = history.length > 0
        ? {
            count: history.length,
            lastMs: history[history.length - 1].ms,
            avgMs: Math.round(history.reduce((sum, item) => sum + item.ms, 0) / history.length)
        }
        : null;

    return {
        workspace: {
            dirs,
            files,
            // documents is exact (every markdown file becomes a document in
            // the walk); the tree entries undercount markdown because folder
            // pages fold into their directory node.
            markdownDocuments: documents ?? byExt.get('md') ?? 0,
            bytes,
            newestMtimeMs: newestMtimeMs || null,
            topExtensions
        },
        walk,
        walkHistory,
        lastPage,
        cache: {
            pages: dirStats(join(config.collect.json_dir, 'pages')),
            blobs: dirStats(join(config.collect.json_dir, 'blobs'))
        },
        memory: {rss: memory.rss, heapUsed: memory.heapUsed}
    };
}

/* Post-paint navigation for the lazy side menu (src/layout/lazy_navigation.js). */
async function navigationPayload(pathname) {
    const startedAt = performance.now();
    let entries;
    let documents;
    try {
        const snapshot = JSON.parse(readFileSync(join(config.collect.json_dir, 'filetree.json'), 'utf8'));
        entries = snapshot.source_entries ?? [];
        documents = snapshot.documents ?? [];
    } catch {
        // The article request normally writes filetree.json before the browser
        // asks for navigation. Fall back to the live backend when persistence
        // failed, the payload was requested directly, or the active backend
        // never writes the snapshot (any non-lazy backend under `astro dev`).
        const {getSourceEntries, getDocuments} = await import('./structure-db.js');
        entries = getSourceEntries();
        documents = getDocuments();
    }
    const items = buildSectionMenuFromSourceEntries(entries, pathname, config.base, firstDocumentUrl(documents));
    const ms = Math.round(performance.now() - startedAt);
    console.log(`[lite] navigation for ${pathname} ready in ${ms} ms (${items.length} roots)`);
    return {items, ms};
}

async function indexStatusPayload() {
    const {relationIndexStatus} = await import('./structure-db.js');
    return typeof relationIndexStatus === 'function'
        ? relationIndexStatus()
        : {running: false, paused: false, stopped: false, complete: true, current: 0, total: 0};
}

async function indexControlPayload(action) {
    const {controlRelationIndex} = await import('./structure-db.js');
    if (typeof controlRelationIndex !== 'function') return indexStatusPayload();
    return controlRelationIndex(action);
}

export {extensionPreviewEnabled, versionPayload, navigationPayload, runtimePayload, statsPayload, indexStatusPayload, indexControlPayload};
