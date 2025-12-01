import {config} from '@/config';
import {file_mime} from '@/libs/utils.js';
import {getAssetInfoBlob_version, getAssetInfoBlob_blob} from '@/libs/structure-db.js';

const PRIVATE_CACHE = 'private, max-age=0, no-cache';
const IMMUTABLE_CACHE = 'private, max-age=31536000, immutable';
const VARY_HEADER = 'Authorization, Cookie';
const VERSION_ID = config.collect_content.version_id ?? null;

export async function GET({params, request}) {
    const rawUid = params?.uid;
    if (!rawUid) {
        return new Response('Missing asset uid', {status: 400});
    }

    const has_blob_id = (rawUid.indexOf(':') !== -1);
    if (has_blob_id) {
        const [blobUid, assetUid] = rawUid.split(':');
        if (!blobUid || !assetUid) {
            return new Response('Invalid asset identifier', {status: 400});
        }
        const {asset, buffer} = getAssetInfoBlob_blob(assetUid, blobUid);
        return buildAssetResponse({
            asset,
            buffer,
            request,
            cacheControl: IMMUTABLE_CACHE
        });
    }
    else{
        return buildAssetResponse({
            ...getAssetInfoBlob_version(rawUid, VERSION_ID),
            request,
            cacheControl: PRIVATE_CACHE
        });
    }
}

function buildAssetResponse({asset, buffer, request, cacheControl}) {
    if (!asset || !buffer) {
        return new Response('Asset not found', {status: 404});
    }

    const filename = asset.path ? asset.path.split(/[\\/]/).pop() : null;
    const contentType = file_mime(asset.ext ?? asset.path ?? asset.uid);
    const etag = asset.blob_uid

    // --------------- 304 Not Modified check ---------------
    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch && ifNoneMatch === etag) {
        return new Response(null, {
            status: 304,
            headers: {
                'Cache-Control': cacheControl,
                'ETag': etag,
                Vary: VARY_HEADER
            }
        });
    }
    // -------------- 200 ---------------

    const headers = {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        Vary: VARY_HEADER,
        ETag: etag,
    };
    if (buffer.length) {
        headers['Content-Length'] = buffer.length.toString();
    }
    if (filename) {
        headers['Content-Disposition'] = `inline; filename="${filename}"`;
    }

    return new Response(buffer, {status: 200, headers});
}

function maybeNotModified(request, etag, cacheControl) {
    if (!etag || !request?.headers) {
        return null;
    }
    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch && ifNoneMatch === etag) {
        return new Response(null, {
            status: 304,
            headers: {
                'Cache-Control': cacheControl,
                'ETag': etag,
                Vary: VARY_HEADER
            }
        });
    }
    return null;
}
