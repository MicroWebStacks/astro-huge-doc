import {DATASET_SCHEMA, queryDataset} from '@/libs/dataset-sql.js';

function jsonResponse(body, init = {}) {
    const headers = new Headers(init.headers);
    headers.set('content-type', 'application/json');
    return new Response(JSON.stringify(body), {
        ...init,
        headers
    });
}

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function normalizeTableIdentifier(rawValue) {
    if (typeof rawValue !== 'string') {
        return null;
    }
    const trimmed = rawValue.trim();
    if (!trimmed) {
        return null;
    }
    const parts = trimmed.split('.');
    if (parts.length === 1) {
        const table = parts[0];
        return IDENTIFIER_PATTERN.test(table) ? `${DATASET_SCHEMA}.${table}` : null;
    }
    if (parts.length === 2) {
        const [schema, table] = parts;
        return IDENTIFIER_PATTERN.test(schema) && IDENTIFIER_PATTERN.test(table) ? `${schema}.${table}` : null;
    }
    return null;
}

export async function POST({request}) {
    let payload = null;
    try {
        payload = await request.json();
    } catch {
        return jsonResponse({error: 'Invalid JSON body.'}, {status: 400});
    }
    const tableIdentifier = normalizeTableIdentifier(payload?.table);
    if (!tableIdentifier) {
        return jsonResponse(
            {error: `table must be a valid identifier like ${DATASET_SCHEMA}.asset_info`},
            {status: 400}
        );
    }

    try {
        const sql = `SELECT * FROM ${tableIdentifier}`;
        const rows = await queryDataset(sql);
        const columns = rows.length ? Object.keys(rows[0]) : [];
        return jsonResponse({
            table: tableIdentifier,
            columns,
            row_count: rows.length,
            rows
        });
    } catch (error) {
        return jsonResponse({error: error instanceof Error ? error.message : String(error)}, {status: 500});
    }
}
