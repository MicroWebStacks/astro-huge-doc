/*
 * Lazy light-theme PlantUML rendering.
 *
 * The build pipeline (scripts/diagrams.js) bakes the dark variant into the
 * blob store; this endpoint renders the light variant on first request via
 * Kroki and caches it as a plain file, so it works identically for the
 * sqlite and json backends and under both `astro dev` and the built server.
 */
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {config} from '@/config.js';
import {getAssetInfoBlob_version} from '@/libs/structure-db';
import {normalizeDiagramLanguage, renderKrokiDiagram} from '@/libs/diagram-render.js';

const blobsDir = config.dataBackend === 'json'
    ? join(config.collect.json_dir, 'blobs')
    : join(config.collect.outdir, 'blobs');
const cacheDir = join(blobsDir, 'lazy-light');

// De-dupe concurrent requests for the same diagram into one Kroki call.
const inFlight = new Map();

const svgHeaders = {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Type': 'image/svg+xml'
};

function cacheKey(uid, versionId) {
    return createHash('sha256').update(`${uid}::${versionId}`).digest('hex');
}

async function renderLightSvg(uid, versionId, cachePath) {
    const {asset, buffer} = getAssetInfoBlob_version(uid, versionId);
    if (!asset || !buffer) {
        return {status: 404, message: `unknown diagram ${uid} (version ${versionId})`};
    }
    if (normalizeDiagramLanguage(asset.ext) !== 'plantuml') {
        return {status: 400, message: `${uid} is not a plantuml diagram`};
    }
    const code = new TextDecoder().decode(buffer);
    const body = await renderKrokiDiagram('plantuml', code, 'light');
    await mkdir(cacheDir, {recursive: true});
    await writeFile(cachePath, body, 'utf-8');
    return {status: 200, body};
}

export async function GET({url}) {
    const uid = url.searchParams.get('uid');
    if (!uid) {
        return new Response('missing uid', {status: 400});
    }
    const versionId = url.searchParams.get('v') || config.collect.version_id;
    const key = cacheKey(uid, versionId);
    const cachePath = join(cacheDir, `${key}.svg`);

    try {
        return new Response(await readFile(cachePath), {status: 200, headers: svgHeaders});
    } catch {
        /* cache miss: render below */
    }

    let pending = inFlight.get(key);
    if (!pending) {
        pending = renderLightSvg(uid, versionId, cachePath).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
    }
    try {
        const result = await pending;
        if (result.status !== 200) {
            return new Response(result.message, {status: result.status});
        }
        return new Response(result.body, {status: 200, headers: svgHeaders});
    } catch (error) {
        return new Response(`light render failed: ${error.message}`, {status: 502});
    }
}
