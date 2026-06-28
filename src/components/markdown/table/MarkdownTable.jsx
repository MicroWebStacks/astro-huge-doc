import {useEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
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
    const [expanded, setExpanded] = useState(false);
    const [overflowing, setOverflowing] = useState(false);
    const scrollRef = useRef(null);

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

    useEffect(() => {
        if (!expanded) {
            return undefined;
        }
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                setExpanded(false);
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [expanded]);

    // Only offer the full view when the inline table is wider than its
    // container (horizontal scroll); fully visible tables need no expand.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || typeof ResizeObserver === 'undefined') {
            return undefined;
        }
        const update = () => setOverflowing(el.scrollWidth - el.clientWidth > 1);
        update();
        const observer = new ResizeObserver(update);
        observer.observe(el);
        if (el.firstElementChild) {
            observer.observe(el.firstElementChild);
        }
        return () => observer.disconnect();
    }, [columns, data]);

    if (error) {
        return <p className="markdown-table-message">{error}</p>;
    }

    if (!columns.length) {
        return <p className="markdown-table-message">No table data available.</p>;
    }

    const renderTable = (full) => (
        <table className={`markdown-table${full ? ' markdown-table--full' : ''}`}>
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
    );

    return (
        <div className="markdown-table-shell">
            {overflowing ? (
            <div className="markdown-table-toolbar" role="toolbar" aria-label="Table controls">
                <button
                    type="button"
                    className="markdown-table-btn"
                    title="Open full view"
                    aria-label="Open full view"
                    onClick={() => setExpanded(true)}
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <polyline points="9 3 3 3 3 9" />
                        <polyline points="15 3 21 3 21 9" />
                        <polyline points="3 15 3 21 9 21" />
                        <polyline points="21 15 21 21 15 21" />
                    </svg>
                </button>
            </div>
            ) : null}
            <div className="markdown-table-scroll" ref={scrollRef}>{renderTable(false)}</div>

            {expanded && typeof document !== 'undefined'
                ? createPortal(
                      <div
                          className="markdown-table-modal-background visible"
                          onClick={() => setExpanded(false)}
                      >
                          <div
                              className="markdown-table-modal"
                              role="dialog"
                              aria-modal="true"
                              aria-label="Table full view"
                              onClick={(event) => event.stopPropagation()}
                          >
                              <div
                                  className="markdown-table-modal-header"
                                  role="button"
                                  tabIndex={0}
                                  title="Close full view"
                                  aria-label="Close full view"
                                  onClick={() => setExpanded(false)}
                              >
                                  <span className="markdown-table-modal-close">&times;</span>
                              </div>
                              <div className="markdown-table-modal-content">{renderTable(true)}</div>
                          </div>
                      </div>,
                      document.body
                  )
                : null}
        </div>
    );
}
