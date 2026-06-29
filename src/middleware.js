import {defineMiddleware} from 'astro:middleware';
import {readFile, stat} from 'node:fs/promises';
import {basename, join} from 'node:path';
import {config} from '../config.js';
import {file_mime} from './libs/utils.js';

const blobsDir = config.dataBackend === 'json'
    ? join(config.collect.json_dir, 'blobs')
    : join(config.collect.outdir, 'blobs');

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
    const {pathname} = new URL(context.request.url);
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
