/*
 * Neighborhood graph payload (OKF plan TP-13/DD-11): center + ring 1 + ring 2
 * for one concept. Astro only calls getStaticPaths() when output is "static"
 * (astro.config.static.mjs); under output "server" this stays on-demand, so
 * the same file answers full/static builds, `astro dev`, and the lite
 * extension server alike (mirrors src/pages/[...url].astro and the explore
 * routes' dual-mode convention). Lite is server-only (never statically
 * built), so getStaticPaths short-circuits for it — the GET handler still
 * answers it live from the in-memory relations store.
 */
import {computeNeighbors} from '@/libs/graph.js';
import {getDocumentsFull, getDocuments} from '@/libs/structure-db.js';
import {config} from '@/config';

// No `export const prerender` here on purpose: a prerender:true route is
// matched against getStaticPaths() even under `astro dev` and the built
// server engine, so the lite profile (whose getStaticPaths is empty) would
// lose the route entirely and the GET handler would never answer. Under
// output:"static" endpoints are prerendered by default, so the static build
// still emits per-sid /graph/<sid>.json files from getStaticPaths().
export async function getStaticPaths() {
    if (config.profile === 'lite') {
        return [];
    }
    const documents = typeof getDocumentsFull === 'function' ? getDocumentsFull() : getDocuments();
    return documents
        .filter((doc) => doc.sid)
        .map((doc) => ({params: {sid: doc.sid}}));
}

export async function GET({params}) {
    const graph = computeNeighbors(params.sid);
    if (!graph) {
        return new Response(JSON.stringify({error: 'not found'}), {
            status: 404,
            headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}
        });
    }
    return new Response(JSON.stringify(graph), {
        status: 200,
        headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}
    });
}
