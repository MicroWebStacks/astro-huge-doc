import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {MaterialReactTable, useMaterialReactTable} from 'material-react-table';

import {
    Alert,
    Box,
    Button,
    CssBaseline,
    Divider,
    FormControlLabel,
    FormGroup,
    Checkbox,
    Stack,
    TextField,
    ThemeProvider,
    Typography,
    createTheme
} from '@mui/material';

const API_ENDPOINT = '/api/tables';
const DEFAULT_TABLE = 'dataset.asset_info';
const TABLE_MAX_HEIGHT = 'calc(100vh - 320px)';
const LOW_CARDINALITY_THRESHOLD = 20;

function normalizeOption(value) {
    if (value === null || value === undefined) {
        return 'N/A';
    }
    return String(value);
}

function buildColumns(keys, rows, stats) {
    if (!keys.length) {
        return [];
    }
    const hasStats = stats && Object.keys(stats).length > 0;
    const optionMap = hasStats ? null : new Map(keys.map((key) => [key, new Set()]));
    if (!hasStats) {
        for (const row of rows) {
            for (const key of keys) {
                const value = row?.[key];
                optionMap.get(key)?.add(normalizeOption(value));
            }
        }
    }
    return keys.map((key) => {
        const stat = stats?.[key];
        const options = Array.isArray(stat?.values)
            ? stat.values.map((entry) => entry.value)
            : Array.from(optionMap?.get(key) ?? []);
        const useSelect =
            stat?.low_cardinality === true ||
            (options.length > 0 && options.length <= LOW_CARDINALITY_THRESHOLD && stat?.low_cardinality !== false);
        return {
            accessorKey: key,
            header: key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
            filterVariant: useSelect ? 'multi-select' : 'text',
            filterSelectOptions: useSelect ? options : undefined,
            enableColumnFilter: useSelect,
            meta: {lowCardinality: useSelect}
        };
    });
}

function Facet({column, stat, options, selected, onToggle, onClear}) {
    if (!options.length) {
        return null;
    }
    return (
        <Box
            key={column.id}
            sx={{
                minWidth: 220,
                border: '1px solid #e5e7eb',
                borderRadius: 1,
                p: 1.5,
                backgroundColor: '#fff'
            }}
        >
            <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle2">
                    {column.columnDef.header}{' '}
                    {typeof stat?.unique_count === 'number' ? `(unique ${stat.unique_count})` : ''}
                </Typography>
                <Button size="small" onClick={() => onClear(column)}>
                    Clear
                </Button>
            </Stack>
            <FormGroup sx={{maxHeight: 200, overflowY: 'auto', mt: 1}}>
                {options.map(({raw, label, count}) => (
                    <FormControlLabel
                        key={label}
                        control={
                            <Checkbox
                                size="small"
                                checked={selected.has(raw)}
                                onChange={() => onToggle(column, raw)}
                            />
                        }
                        label={`${label} (${count})`}
                    />
                ))}
            </FormGroup>
        </Box>
    );
}

function SearchPanes({table, columnStats, getStatOptions, clearFacet, toggleFacetValue}) {
    const facets = table
        .getAllColumns()
        .filter((column) => column.columnDef?.meta?.lowCardinality)
        .map((column) => {
            const options = getStatOptions(column);
            const stat = columnStats?.[column.id] ?? columnStats?.[column.columnDef?.accessorKey];
            const selected = new Set(Array.isArray(column.getFilterValue()) ? column.getFilterValue() : []);
            return {column, stat, options, selected};
        })
        .filter(({options}) => options.length);

    if (!facets.length) {
        return null;
    }

    return (
        <Box
            sx={{
                border: '1px solid #e5e7eb',
                borderRadius: 1,
                p: 2,
                backgroundColor: '#fafafa'
            }}
        >
            <Typography variant="subtitle1" sx={{mb: 1}}>
                Facet filters (low-cardinality columns)
            </Typography>
            <Divider sx={{mb: 1}} />
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                {facets.map(({column, stat, options, selected}) => (
                    <Facet
                        key={column.id}
                        column={column}
                        stat={stat}
                        options={options}
                        selected={selected}
                        onToggle={toggleFacetValue}
                        onClear={clearFacet}
                    />
                ))}
            </Stack>
        </Box>
    );
}

export default function ServerTable() {
    const [tableName, setTableName] = useState(DEFAULT_TABLE);
    const [activeTable, setActiveTable] = useState('');
    const activeTableRef = useRef('');
    const [rows, setRows] = useState([]);
    const [columnNames, setColumnNames] = useState([]);
    const [columnStats, setColumnStats] = useState({});
    const [columnFilters, setColumnFilters] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const columns = useMemo(() => {
        const keys = columnNames.length ? columnNames : rows[0] ? Object.keys(rows[0]) : [];
        return buildColumns(keys, rows, columnStats);
    }, [columnNames, rows, columnStats]);
    const theme = useMemo(() => createTheme({palette: {mode: 'light'}}), []);

    const getStatOptions = useCallback(
        (column) => {
            if (!column) {
                return [];
            }
            const stat = columnStats?.[column.id] ?? columnStats?.[column.columnDef?.accessorKey];
            if (!stat || !Array.isArray(stat.values)) {
                return [];
            }
            return stat.values.map(({value, count}) => ({
                raw: value,
                label: normalizeOption(value),
                count: Number(count ?? 0)
            }));
        },
        [columnStats]
    );

    const toggleFacetValue = useCallback((column, rawValue) => {
        if (!column) {
            return;
        }
        const current = column.getFilterValue();
        const currentValues = Array.isArray(current) ? [...current] : [];
        const hasValue = currentValues.some((value) => value === rawValue);
        const nextValues = hasValue
            ? currentValues.filter((value) => value !== rawValue)
            : [...currentValues, rawValue];
        column.setFilterValue(nextValues.length ? nextValues : undefined);
    }, []);

    const clearFacet = useCallback((column) => {
        column?.setFilterValue(undefined);
    }, []);

    const serializeFilters = useCallback((filters) => {
        if (!Array.isArray(filters) || !filters.length) {
            return [];
        }
        return filters
            .map((filter) => {
                const column = filter?.id || filter?.column;
                const rawValue = filter?.value;
                const values = Array.isArray(rawValue)
                    ? rawValue
                    : rawValue !== null && rawValue !== undefined && rawValue !== ''
                      ? [rawValue]
                      : [];
                if (!column || !values.length) {
                    return null;
                }
                return {column, values};
            })
            .filter(Boolean);
    }, []);

    const fetchTable = useCallback(async (tableToFetch, filters = []) => {
        const target = (tableToFetch ?? '').trim();
        if (!target) {
            setError('Enter a table name like dataset.asset_info');
            setRows([]);
            setActiveTable('');
            setColumnNames([]);
            setColumnStats({});
            return;
        }
        setLoading(true);
        setError('');
        try {
            const response = await fetch(API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({table: target, filters: serializeFilters(filters)})
            });
            const responseText = await response.text();
            let payload = null;
            try {
                payload = JSON.parse(responseText);
            } catch {
                // leave payload null if the response is not valid JSON
            }
            if (!response.ok) {
                throw new Error(payload?.error || responseText || 'Unable to fetch table data.');
            }
            const incomingRows = Array.isArray(payload?.rows) ? payload.rows : [];
            const incomingColumns = Array.isArray(payload?.columns) ? payload.columns : [];
            const derivedColumns = incomingColumns.length
                ? incomingColumns
                : incomingRows[0]
                  ? Object.keys(incomingRows[0])
                  : [];
            setColumnNames(derivedColumns);
            setColumnStats(payload?.stats ?? {});
            setRows(incomingRows);
            setActiveTable(payload?.table ?? target);
        } catch (fetchError) {
            setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
            setRows([]);
            setActiveTable('');
            setColumnNames([]);
            setColumnStats({});
        } finally {
            setLoading(false);
        }
    }, [serializeFilters]);

    useEffect(() => {
        fetchTable(DEFAULT_TABLE, []);
    }, [fetchTable]);

    useEffect(() => {
        activeTableRef.current = activeTable;
    }, [activeTable]);

    useEffect(() => {
        if (!activeTableRef.current) {
            return;
        }
        fetchTable(activeTableRef.current, columnFilters);
    }, [columnFilters, fetchTable]);

    const table = useMaterialReactTable({
        columns,
        data: rows,
        getRowId: (row, index) => {
            const id = row?.id ?? row?.uid ?? row?.uuid;
            return typeof id === 'string' || typeof id === 'number' ? String(id) : `${index}`;
        },
        initialState: {
            pagination: {pageSize: 10}
        },
        state: {
            columnFilters,
            isLoading: loading,
            showAlertBanner: Boolean(error),
            showProgressBars: loading
        },
        onColumnFiltersChange: setColumnFilters,
        enableStickyHeader: true,
        enableColumnResizing: true,
        enableDensityToggle: false,
        enableFullScreenToggle: false,
        enableColumnFilters: true,
        enableFilterMatchHighlighting: true,
        muiTablePaperProps: {
            sx: {
                maxHeight: TABLE_MAX_HEIGHT,
                display: 'flex',
                flexDirection: 'column'
            }
        },
        muiTableContainerProps: {
            sx: {
                maxHeight: TABLE_MAX_HEIGHT,
                overflow: 'auto'
            }
        },
        muiToolbarAlertBannerProps: error ? {color: 'error', children: error} : undefined
    });

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Stack spacing={2} sx={{p: 2}}>
                <Typography variant="h5" component="h1">
                    Server tables with DuckDB + Material React Table
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Fetch any attached table (for example {DEFAULT_TABLE}) through /api/tables and render it with
                    Material React Table.
                </Typography>
                <Box
                    component="form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        fetchTable(tableName);
                    }}
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        flexWrap: 'wrap'
                    }}
                >
                    <TextField
                        label="Table name"
                        size="small"
                        value={tableName}
                        onChange={(event) => setTableName(event.target.value)}
                        disabled={loading}
                    />
                    <Button type="submit" variant="contained" disabled={loading}>
                        {loading ? 'Loading...' : 'Load table'}
                    </Button>
                    <Typography variant="body2" color="text.secondary" sx={{minHeight: '1.5em'}}>
                        {loading
                            ? `Loading ${tableName || 'table'}...`
                            : activeTable
                              ? `Showing ${activeTable} (${rows.length} rows)`
                              : 'No table loaded yet'}
                    </Typography>
                </Box>
                {error ? (
                    <Alert severity="error" variant="filled">
                        {error}
                    </Alert>
                ) : null}
                <SearchPanes
                    table={table}
                    columnStats={columnStats}
                    getStatOptions={getStatOptions}
                    clearFacet={clearFacet}
                    toggleFacetValue={toggleFacetValue}
                />
                <MaterialReactTable table={table} />
            </Stack>
        </ThemeProvider>
    );
}
