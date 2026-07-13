import express from 'express';
import https from 'https'
import { fileURLToPath } from 'url';
import { join, dirname, basename } from 'path';
import { readFileSync, } from 'fs';
import { readFile, stat } from 'fs/promises';
import { handler as ssrHandler } from '../dist/server/entry.mjs';
import cors from 'cors';
import {config} from '../config.js';
import {file_mime} from '../src/libs/utils.js';

import * as dotenv from 'dotenv'
dotenv.config()

const outdir = config.outDir;
const blobsDir = config.dataBackend === 'json'
    ? join(config.collect.json_dir, 'blobs')
    : join(config.collect.outdir, 'blobs');

function safeBlobName(requestPath) {
    let name;
    try {
        name = decodeURIComponent(String(requestPath ?? '').replace(/^\/?/, ''));
    } catch {
        return null;
    }
    if (!name || name.includes('/') || name.includes('\\') || name !== basename(name)) {
        return null;
    }
    return name;
}

function buildEtag(fileStat) {
    return `"${fileStat.size.toString(16)}-${Math.trunc(fileStat.mtimeMs).toString(16)}"`;
}

function requestMatchesEtag(header, etag) {
    return String(header ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .includes(etag);
}

const app = express();
// The HTML cache is SQLite-backed (better-sqlite3); the lite/json profile has
// no native deps, so skip it there. The import is dynamic so merely starting
// the lite engine never loads better-sqlite3. Full keeps it for cached pages.
const useHtmlCache = config.dataBackend !== 'json';
let htmlCacheMiddleware = null;
if (useHtmlCache) {
    const { createHtmlCacheMiddleware } = await import('./cache/index.js');
    htmlCacheMiddleware = createHtmlCacheMiddleware({
        dbPath: config.collect.db_path,
        excludePaths: config.html_cache?.exclude_paths
    });
}

if(process.env.ENABLE_CORS == "true"){
    app.use(cors());      
    console.log("\n -- !!! CORS enabled !!! -- APIs can be used from other sites --\n")
}

if(process.env.ENABLE_AUTH === "true"){
    const { authRouter } = await import('./auth/auth_router.js');
    app.use(authRouter)
    console.log(" with auth")
}else if (process.env.MICROWEBSTACKS_EXTENSION_MODE !== "true"){
    console.log("\n -- !!! no auth !!! -- Authentication is disabled -- \n")
}

// Live-reload signal for the extension preview (lite/lazy flow): the extension
// bumps stamp files in the json dir on workspace changes; pages poll this
// endpoint (Layout.astro, extension mode only) and reload themselves in place,
// preserving the current URL. The server never restarts on edits.
if (config.dataBackend === 'json' && process.env.MICROWEBSTACKS_EXTENSION_MODE === 'true') {
    const {buildSectionMenuFromSourceEntries} = await import('../src/layout/source_navigation.js');
    const stampDir = config.collect.json_dir;
    const stampMtime = async (name) => {
        try {
            return Math.trunc((await stat(join(stampDir, name))).mtimeMs);
        } catch {
            return 0;
        }
    };
    app.get('/__lite/version', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json({
            reload: await stampMtime('reload.stamp'),
            tree: await stampMtime('tree.stamp')
        });
    });
    app.get('/__lite/navigation', async (req, res) => {
        const startedAt = performance.now();
        const pathname = typeof req.query.pathname === 'string' ? req.query.pathname : '/';
        let entries;
        try {
            const snapshot = JSON.parse(readFileSync(join(stampDir, 'filetree.json'), 'utf8'));
            entries = snapshot.source_entries ?? [];
        } catch {
            // The article request normally writes filetree.json before the
            // browser asks for navigation. Fall back to the live backend only
            // when persistence failed or the endpoint was called directly.
            const {getSourceEntries} = await import('../src/libs/structure-db.js');
            entries = getSourceEntries();
        }
        const items = buildSectionMenuFromSourceEntries(entries, pathname, config.base);
        const elapsedMs = performance.now() - startedAt;
        console.log(`[lite] navigation for ${pathname} ready in ${elapsedMs.toFixed(0)} ms (${items.length} roots)`);
        res.set('Cache-Control', 'no-store');
        res.json({items, ms: Math.round(elapsedMs)});
    });
}

app.use('/blobs', async (req, res, next) => {
    const method = req.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
        next();
        return;
    }

    const blobName = safeBlobName(req.path);
    if (!blobName) {
        next();
        return;
    }

    const filePath = join(blobsDir, blobName);
    let fileStat;
    try {
        fileStat = await stat(filePath);
    } catch {
        next();
        return;
    }
    if (!fileStat.isFile()) {
        next();
        return;
    }

    const etag = buildEtag(fileStat);
    res.set({
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Type': file_mime(blobName),
        ETag: etag
    });
    if (requestMatchesEtag(req.headers['if-none-match'], etag)) {
        res.status(304).end();
        return;
    }
    if (method === 'HEAD') {
        res.status(200).end();
        return;
    }
    res.status(200).send(await readFile(filePath));
});
app.use(express.static(join(outdir, 'client')))
if (htmlCacheMiddleware) {
    app.use(htmlCacheMiddleware)
}
app.use(ssrHandler);//catches all other routes

app.use((req, res, next) => {
    res.status(404).send("Sorry can't find that!")
  })

  
if(config.server.protocol == "https"){
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const key = readFileSync(join(__dirname, process.env.KEY_FILE),'utf8')
    const cert = readFileSync(join(__dirname, process.env.CERT_FILE),'utf8')
    const httpsServer = https.createServer({key,cert},app)
    httpsServer.listen(config.server.port,config.server.host,()=>{
        console.log(`listening on https://${config.server.host}:${config.server.port}`)
    });
}else{
    app.listen(config.server.port,config.server.host,()=>{
        console.log(`listening on http://${config.server.host}:${config.server.port}`)
    });
}
