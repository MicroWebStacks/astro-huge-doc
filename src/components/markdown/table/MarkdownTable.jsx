import {useEffect, useMemo, useState} from 'react';
import {
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable
} from '@tanstack/react-table';
import './MarkdownTable.css';

function nodeText(node) {
    if (!node) {
        return '';
    }
    if (typeof node.value === 'string') {
        return node.value;
    }
    if (Array.isArray(node.children)) {
        return node.children.map(nodeText).join('');
    }
    return '';
}

function normalizeValue(value) {
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return JSON.stringify(value);
}

function uniqueColumnId(index, label) {
    const normalized = String(label || `Column ${index + 1}`)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return normalized ? `${normalized}_${index}` : `column_${index}`;
}

function tableFromMdast(node) {
    const rows = Array.isArray(node?.children) ? node.children : [];
    if (!rows.length) {
        return {columns: [], data: []};
    }

    const headerCells = rows[0]?.children ?? [];
    const headers = headerCells.map((cell, index) => nodeText(cell) || `Column ${index + 1}`);
    const columnCount = Math.max(headers.length, ...rows.slice(1).map((row) => row.children?.length ?? 0));
    const columns = Array.from({length: columnCount}, (_, index) => {
        const header = headers[index] || `Column ${index + 1}`;
        return {
            accessorKey: `c${index}`,
            id: uniqueColumnId(index, header),
            header,
            cell: (info) => normalizeValue(info.getValue()),
            meta: {
                align: node.align?.[index] ?? null
            }
        };
    });
    const data = rows.slice(1).map((row) => {
        const record = {};
        for (let index = 0; index < columnCount; index += 1) {
            record[`c${index}`] = nodeText(row.children?.[index]);
        }
        return record;
    });

    return {columns, data};
}

function tableFromJsonRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return {columns: [], data: []};
    }

    if (Array.isArray(rows[0])) {
        const headers = rows[0].map((value, index) => normalizeValue(value) || `Column ${index + 1}`);
        const columnCount = Math.max(headers.length, ...rows.slice(1).map((row) => row.length));
        const columns = Array.from({length: columnCount}, (_, index) => {
            const header = headers[index] || `Column ${index + 1}`;
            return {
                accessorKey: `c${index}`,
                id: uniqueColumnId(index, header),
                header,
                cell: (info) => normalizeValue(info.getValue())
            };
        });
        const data = rows.slice(1).map((row) => {
            const record = {};
            for (let index = 0; index < columnCount; index += 1) {
                record[`c${index}`] = normalizeValue(row[index]);
            }
            return record;
        });
        return {columns, data};
    }

    const keys = Object.keys(rows[0] ?? {});
    const columns = keys.map((key, index) => ({
        accessorKey: key,
        id: uniqueColumnId(index, key),
        header: key,
        cell: (info) => normalizeValue(info.getValue())
    }));
    return {columns, data: rows};
}

export default function MarkdownTable({node = null, assetUrl = null}) {
    const [assetRows, setAssetRows] = useState(null);
    const [error, setError] = useState('');
    const [sorting, setSorting] = useState([]);

    useEffect(() => {
        if (node?.type === 'table' || !assetUrl) {
            return;
        }
        let cancelled = false;
        async function loadRows() {
            try {
                const response = await fetch(assetUrl);
                if (!response.ok) {
                    throw new Error(`Failed to load table data (${response.status})`);
                }
                const payload = await response.json();
                if (!cancelled) {
                    setAssetRows(payload);
                }
            } catch (fetchError) {
                if (!cancelled) {
                    setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
                }
            }
        }
        loadRows();
        return () => {
            cancelled = true;
        };
    }, [assetUrl, node]);

    const {columns, data} = useMemo(() => {
        if (node?.type === 'table') {
            return tableFromMdast(node);
        }
        return tableFromJsonRows(assetRows);
    }, [assetRows, node]);

    const table = useReactTable({
        columns,
        data,
        state: {sorting},
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel()
    });

    if (error) {
        return <p className="markdown-table-message">{error}</p>;
    }

    if (!columns.length) {
        return <p className="markdown-table-message">No table data available.</p>;
    }

    return (
        <div className="markdown-table-scroll">
            <table className="markdown-table">
                <thead>
                    {table.getHeaderGroups().map((headerGroup) => (
                        <tr key={headerGroup.id}>
                            {headerGroup.headers.map((header) => {
                                const sortState = header.column.getIsSorted();
                                const align = header.column.columnDef.meta?.align;
                                return (
                                    <th
                                        key={header.id}
                                        style={{textAlign: align ?? undefined}}
                                        aria-sort={
                                            sortState === 'asc'
                                                ? 'ascending'
                                                : sortState === 'desc'
                                                  ? 'descending'
                                                  : 'none'
                                        }
                                    >
                                        {header.column.getCanSort() ? (
                                            <button
                                                className="markdown-table-sort"
                                                type="button"
                                                onClick={header.column.getToggleSortingHandler()}
                                            >
                                                <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                                                <span className={`markdown-table-sort-state${sortState ? ' sorted' : ''}`} aria-hidden="true">
                                                    {sortState === 'asc' ? '▲' : sortState === 'desc' ? '▼' : '▾'}
                                                </span>
                                            </button>
                                        ) : (
                                            flexRender(header.column.columnDef.header, header.getContext())
                                        )}
                                    </th>
                                );
                            })}
                        </tr>
                    ))}
                </thead>
                <tbody>
                    {table.getRowModel().rows.map((row) => (
                        <tr key={row.id}>
                            {row.getVisibleCells().map((cell) => {
                                const align = cell.column.columnDef.meta?.align;
                                return (
                                    <td key={cell.id} style={{textAlign: align ?? undefined}}>
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
