import {defineMiddleware} from 'astro:middleware';
import {readFile, stat} from 'node:fs/promises';
import {basename, join} from 'node:path';
import {config} from '../config.js';
import {file_mime} from './libs/utils.js';
import {resolveBlobsSourceDir} from './libs/blob-files.js';
import {extensionPreviewEnabled, navigationPayload, sourceRoutePayload, runtimePayload, statsPayload, versionPayload, indexStatusPayload, indexControlPayload} from './libs/extension-preview.js';

const blobsDir = resolveBlobsSourceDir(config);

function jsonResponse(payload) {
    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
            'Cache-Control': 'no-store',
            'Content-Type': 'application/json'
        }
    });
}

function safeBlobName(pathname) {
    let name;
    try {
        name = decodeURIComponent(pathname.replace(/^\/blobs\/?/, ''));
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

export const onRequest = defineMiddleware(async (context, next) => {
    const method = context.request.method.toUpperCase();
    const url = new URL(context.request.url);
    const {pathname} = url;

    // Extension-preview endpoints live in the app (middleware), not in the
    // express wrapper, so every mode that renders pages also answers them —
    // `astro dev` included. Gate and UI emission share one module; see
    // src/libs/extension-preview.js and specification/run-modes/spec.md.
    if (extensionPreviewEnabled() && method === 'GET') {
        if (pathname === '/__lite/version') {
            return jsonResponse(await versionPayload());
        }
        if (pathname === '/__lite/navigation') {
            return jsonResponse(await navigationPayload(url.searchParams.get('pathname') ?? '/'));
        }
        if (pathname === '/__lite/source-route') {
            return jsonResponse(await sourceRoutePayload(url.searchParams.get('path')));
        }
        if (pathname === '/__lite/runtime') {
            return jsonResponse(runtimePayload({dev: import.meta.env.DEV}));
        }
        if (pathname === '/__lite/stats') {
            return jsonResponse(await statsPayload());
        }
        if (pathname === '/__lite/index-status') {
            return jsonResponse(await indexStatusPayload());
        }
    }
    if (extensionPreviewEnabled() && method === 'POST' && pathname === '/__lite/index-control') {
        const action = url.searchParams.get('action') ?? 'start';
        if (!['start', 'pause', 'resume', 'stop'].includes(action)) {
            return new Response(JSON.stringify({error: 'unknown index action'}), {
                status: 400,
                headers: {'Cache-Control': 'no-store', 'Content-Type': 'application/json'}
            });
        }
        return jsonResponse(await indexControlPayload(action));
    }

    if (!pathname.startsWith('/blobs/') || (method !== 'GET' && method !== 'HEAD')) {
        return next();
    }

    const blobName = safeBlobName(pathname);
    if (!blobName) {
        return next();
    }

    const filePath = join(blobsDir, blobName);
    let fileStat;
    try {
        fileStat = await stat(filePath);
    } catch {
        return next();
    }
    if (!fileStat.isFile()) {
        return next();
    }

    const etag = buildEtag(fileStat);
    const headers = {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Type': file_mime(blobName),
        ETag: etag
    };
    if (context.request.headers.get('if-none-match') === etag) {
        return new Response(null, {status: 304, headers});
    }
    if (method === 'HEAD') {
        return new Response(null, {status: 200, headers});
    }
    return new Response(await readFile(filePath), {status: 200, headers});
});
