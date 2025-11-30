import {config} from '@/config';
import { file_mime } from '@/libs/utils.js';
import {getAssetWithBlob} from '@/libs/structure-db.js';

export async function GET({params, request}) {
    if (config.copy_assets) {
        return new Response('Not supported and not needed with copy_assets = true', {status: 404});
    }
    const uid = params?.uid;
    if (!uid) {
        return new Response('Missing asset uid', {status: 400});
    }
    const {asset, buffer} = getAssetWithBlob(uid);
    if (asset && buffer) {
        const filename = asset.path ? asset.path.split(/[\\/]/).pop() : null;
        const contentType = file_mime(asset.ext ?? asset.path ?? uid);
        const etag = asset.blob_uid ;
        if (request?.headers?.get('if-none-match') === etag) {
            return new Response(null, {
                status: 304,
                headers: {
                    'Cache-Control': 'private, max-age=0, no-cache',
                    'ETag': etag,
                    'Vary': 'Authorization, Cookie'
                }
            });
        }
        const headers = {
            'Content-Type': contentType,
            'Content-Length': buffer.length?.toString(),
            'Cache-Control': 'private, max-age=0, no-cache',
            'ETag': etag,
            'Vary': 'Authorization, Cookie',
        };
        if (filename) {
            headers['Content-Disposition'] = `inline; filename="${filename}"`;
        }
        if (!headers['Content-Length']) {
            delete headers['Content-Length'];
        }
        return new Response(buffer, {status: 200, headers});
    }

    return new Response('Asset not found', {status: 404});
}
