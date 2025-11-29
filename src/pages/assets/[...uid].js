import {createReadStream} from 'fs';
import {resolve, join} from 'path';
import {config} from '@/config';
import { file_mime } from '@/libs/utils.js';
import {getAssetWithBlob} from '@/libs/structure-db.js';

function normalizeUid(raw) {
    let value = '';
    if (Array.isArray(raw)) {
        value = raw.join('/');
    } else if (raw) {
        value = raw;
    }
    if (!value) {
        return '';
    }
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function streamFromPath(relativePath) {
    if (!relativePath) {
        return null;
    }
    try {
        const absPath = resolve(join(config.content_path, relativePath));
        const stream = createReadStream(absPath);
        const contentType = file_mime(relativePath);
        return {stream, contentType};
    } catch {
        return null;
    }
}

export async function GET({params}) {
    if (config.copy_assets) {
        return new Response('Not supported and not needed with copy_assets = true', {status: 404});
    }
    const uid = params?.uid;
    if (!uid) {
        return new Response('Missing asset uid', {status: 400});
    }
    console.log(`Asset request for uid: ${uid}`);
    const {asset, buffer} = getAssetWithBlob(uid);
    if (asset && buffer) {
        const filename = asset.path ? asset.path.split(/[\\/]/).pop() : null;
        const contentType = file_mime(asset.ext ?? asset.path ?? uid);
        const headers = {
            'Content-Type': contentType,
            'Content-Length': buffer.length?.toString()
        };
        if (filename) {
            headers['Content-Disposition'] = `inline; filename="${filename}"`;
        }
        if (!headers['Content-Length']) {
            delete headers['Content-Length'];
        }
        return new Response(buffer, {status: 200, headers});
    }

    const fileAssetFallback = asset?.path ? streamFromPath(asset.path) : null;
    if (fileAssetFallback) {
        return new Response(fileAssetFallback.stream, {
            status: 200,
            headers: {'Content-Type': fileAssetFallback.contentType}
        });
    }

    const directPathFallback = streamFromPath(uid);
    if (directPathFallback) {
        return new Response(directPathFallback.stream, {
            status: 200,
            headers: {'Content-Type': directPathFallback.contentType}
        });
    }

    return new Response('Asset not found', {status: 404});
}
