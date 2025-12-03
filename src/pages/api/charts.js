import {queryDataset} from '@/libs/dataset-sql.js';

function jsonResponse(body, init = {}) {
    const headers = new Headers(init.headers);
    headers.set('content-type', 'application/json');
    return new Response(JSON.stringify(body), {
        ...init,
        headers
    });
}

export async function POST({request}) {
    let payload = null;
    try {
        payload = await request.json();
    } catch {
        return jsonResponse({error: 'Invalid JSON body.'}, {status: 400});
    }
    const chartId = typeof payload?.chart_id === 'string' ? payload.chart_id.trim() : '';
    const sql = typeof payload?.sql === 'string' ? payload.sql : '';
    if (!chartId) {
        return jsonResponse({error: 'chart_id is required.'}, {status: 400});
    }
    if (!sql.trim()) {
        return jsonResponse({error: 'sql is required.'}, {status: 400});
    }
    try {
        const rows = await queryDataset(sql);
        return jsonResponse({chart_id: chartId, rows});
    } catch (error) {
        return jsonResponse({error: error instanceof Error ? error.message : String(error)}, {status: 500});
    }
}
