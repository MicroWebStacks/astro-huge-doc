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
const LOW_CARDINALITY_THRESHOLD = 20;

function quoteIdentifier(identifier) {
    return `"${identifier.replace(/"/g, '""')}"`;
}

function escapeLiteral(value) {
    if (value === null || value === undefined) {
        return 'NULL';
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }
    if (typeof value === 'boolean') {
        return value ? 'TRUE' : 'FALSE';
    }
    return `'${String(value).replace(/'/g, "''")}'`;
}

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

async function fetchColumns(tableIdentifier) {
    const [schema, table] = tableIdentifier.split('.');
    const columnsSql = `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = '${schema}'
          AND table_name = '${table}'
        ORDER BY ordinal_position
    `;
    const infoRows = await queryDataset(columnsSql);
    return (infoRows ?? [])
        .map((row) => row?.column_name)
        .filter((name) => typeof name === 'string' && name.length > 0);
}

function buildWhereClause(filters, allowedColumns) {
    if (!Array.isArray(filters) || !filters.length) {
        return '';
    }
    const clauses = [];
    for (const filter of filters) {
        const column = typeof filter?.column === 'string' ? filter.column.trim() : '';
        if (!column || !allowedColumns.includes(column)) {
            throw new Error(`Unknown filter column: ${column}`);
        }
        const values = Array.isArray(filter?.values)
            ? filter.values
            : filter?.values !== undefined
              ? [filter.values]
              : [];
        const normalized = values.map((value) => (value === undefined ? null : value));
        if (!normalized.length) {
            continue;
        }
        const nonNullValues = normalized.filter((value) => value !== null);
        const includesNull = normalized.length > nonNullValues.length;
        const parts = [];
        if (nonNullValues.length) {
            const literals = nonNullValues.map(escapeLiteral).join(', ');
            parts.push(`${quoteIdentifier(column)} IN (${literals})`);
        }
        if (includesNull) {
            parts.push(`${quoteIdentifier(column)} IS NULL`);
        }
        if (parts.length) {
            clauses.push(parts.length > 1 ? `(${parts.join(' OR ')})` : parts[0]);
        }
    }
    if (!clauses.length) {
        return '';
    }
    return `WHERE ${clauses.join(' AND ')}`;
}

async function fetchColumnStats(tableIdentifier, columnNames, whereClause) {
    const stats = {};
    for (const columnName of columnNames) {
        const quotedColumn = quoteIdentifier(columnName);
        const uniqueCountSql = `SELECT COUNT(DISTINCT ${quotedColumn}) AS unique_count FROM ${tableIdentifier} ${whereClause}`;
        const uniqueRows = await queryDataset(uniqueCountSql);
        const uniqueCountRaw = uniqueRows?.[0]?.unique_count ?? uniqueRows?.[0]?.count ?? 0;
        const uniqueCount = Number(uniqueCountRaw);
        const lowCardinality = Number.isFinite(uniqueCount) && uniqueCount <= LOW_CARDINALITY_THRESHOLD;
        let values = null;
        if (lowCardinality) {
            const valueCountsSql = `SELECT ${quotedColumn} AS value, COUNT(*) AS count FROM ${tableIdentifier} ${whereClause} GROUP BY ${quotedColumn} ORDER BY count DESC, value ASC`;
            const valueRows = await queryDataset(valueCountsSql);
            values = (valueRows ?? []).map((row) => ({
                value: row?.value ?? null,
                count: row?.count ?? 0
            }));
        }
        stats[columnName] = {
            unique_count: Number.isFinite(uniqueCount) ? uniqueCount : 0,
            low_cardinality: lowCardinality,
            values
        };
    }
    return stats;
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

    const filters = Array.isArray(payload?.filters) ? payload.filters : [];

    try {
        const columns = await fetchColumns(tableIdentifier);
        const whereClause = buildWhereClause(filters, columns);
        const sql = `SELECT * FROM ${tableIdentifier} ${whereClause}`;
        const rows = await queryDataset(sql);
        const resolvedColumns = columns.length ? columns : rows.length ? Object.keys(rows[0]) : [];
        const stats = await fetchColumnStats(tableIdentifier, resolvedColumns, whereClause);
        return jsonResponse({
            table: tableIdentifier,
            columns: resolvedColumns,
            row_count: rows.length,
            rows,
            stats
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = message.startsWith('Unknown filter column:') ? 400 : 500;
        return jsonResponse({error: message}, {status});
    }
}
