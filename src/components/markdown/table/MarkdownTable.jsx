import {useEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    useReactTable
} from '@tanstack/react-table';
import './MarkdownTable.css';

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

function RichContent({tokens = []}) {
    return tokens.map((token, index) => {
        const key = `${token.type}-${index}`;
        if (token.type === 'text') return token.value;
        if (token.type === 'inlineCode') return <code key={key}>{token.value}</code>;
        if (token.type === 'break') return <br key={key} />;
        if (token.type === 'strong') return <strong key={key}><RichContent tokens={token.children} /></strong>;
        if (token.type === 'emphasis') return <em key={key}><RichContent tokens={token.children} /></em>;
        if (token.type === 'delete') return <del key={key}><RichContent tokens={token.children} /></del>;
        if (token.type === 'link') {
            const content = <RichContent tokens={token.children} />;
            if (token.unresolved) {
                return <a key={key} className="link unresolved" title={token.title ?? undefined} aria-disabled="true">{content}</a>;
            }
            return (
                <a
                    key={key}
                    href={token.href || '#'}
                    className={token.className || 'link'}
                    target={token.target || '_self'}
                    rel={token.rel || undefined}
                    title={token.title || undefined}
                >
                    {content}
                </a>
            );
        }
        return null;
    });
}

function tokensContainLink(tokens = []) {
    return tokens.some((token) => token.type === 'link' || tokensContainLink(token.children));
}

function tableFromModel(model) {
    const headers = Array.isArray(model?.headers) ? model.headers : [];
    const rows = Array.isArray(model?.rows) ? model.rows : [];
    const columns = headers.map((headerCell, index) => ({
        accessorKey: `c${index}`,
        id: uniqueColumnId(index, headerCell.text),
        header: () => <RichContent tokens={headerCell.content} />,
        cell: (info) => <RichContent tokens={info.row.original.__rich[index]?.content} />,
        // Avoid invalid nested interactive content (<a> inside the sort
        // <button>) when an author puts a link in a header cell.
        enableSorting: !tokensContainLink(headerCell.content),
        meta: {align: headerCell.align ?? null}
    }));
    const data = rows.map((cells) => {
        const record = {__rich: cells};
        cells.forEach((cell, index) => {
            record[`c${index}`] = cell.text;
        });
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

export default function MarkdownTable({model = null, assetUrl = null}) {
    const [assetRows, setAssetRows] = useState(null);
    const [error, setError] = useState('');
    const [sorting, setSorting] = useState([]);
    const [expanded, setExpanded] = useState(false);
    const [overflowing, setOverflowing] = useState(false);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (model || !assetUrl) {
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
    }, [assetUrl, model]);

    const {columns, data} = useMemo(() => {
        if (model) {
            return tableFromModel(model);
        }
        return tableFromJsonRows(assetRows);
    }, [assetRows, model]);

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
