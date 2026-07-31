/*
 * One lazy graph-universe payload. Static builds emit this once at
 * /graph/all.json; server and lite profiles compute it on demand. The client
 * extracts the connected component containing the current page, avoiding a
 * full-graph copy per document and avoiding a cascade of per-node requests.
 */
import {computeGraphUniverse} from '@/libs/graph.js';

export async function GET() {
    return new Response(JSON.stringify(computeGraphUniverse()), {
        status: 200,
        headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}
    });
}
