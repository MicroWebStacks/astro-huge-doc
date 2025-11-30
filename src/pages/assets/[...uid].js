import {config} from '@/config';
import { file_mime } from '@/libs/utils.js';
import {getAssetWithBlob} from '@/libs/structure-db.js';

export async function GET({params}) {
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

    return new Response('Asset not found', {status: 404});
}
