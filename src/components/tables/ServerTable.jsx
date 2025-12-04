import {useCallback, useEffect, useMemo, useState} from 'react';
import {MaterialReactTable, useMaterialReactTable} from 'material-react-table';

import {
    Alert,
    Box,
    Button,
    CssBaseline,
    Stack,
    TextField,
    ThemeProvider,
    Typography,
    createTheme
} from '@mui/material';

const API_ENDPOINT = '/api/tables';
const DEFAULT_TABLE = 'dataset.asset_info';
const TABLE_MAX_HEIGHT = 'calc(100vh - 320px)';

function buildColumns(keys) {
    if (!keys.length) {
        return [];
    }
    return keys.map((key) => ({
        accessorKey: key,
        header: key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
    }));
}

export default function ServerTable() {
    const [tableName, setTableName] = useState(DEFAULT_TABLE);
    const [activeTable, setActiveTable] = useState('');
    const [rows, setRows] = useState([]);
    const [columnNames, setColumnNames] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const columns = useMemo(
        () => buildColumns(columnNames.length ? columnNames : rows[0] ? Object.keys(rows[0]) : []),
        [columnNames, rows]
    );
    const theme = useMemo(() => createTheme({palette: {mode: 'light'}}), []);

    const fetchTable = useCallback(async (tableToFetch) => {
        const target = (tableToFetch ?? '').trim();
        if (!target) {
            setError('Enter a table name like dataset.asset_info');
            setRows([]);
            setActiveTable('');
            setColumnNames([]);
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
                body: JSON.stringify({table: target})
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
            setRows(incomingRows);
            setActiveTable(payload?.table ?? target);
        } catch (fetchError) {
            setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
            setRows([]);
            setActiveTable('');
            setColumnNames([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTable(DEFAULT_TABLE);
    }, [fetchTable]);

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
            isLoading: loading,
            showAlertBanner: Boolean(error),
            showProgressBars: loading
        },
        enableStickyHeader: true,
        enableColumnResizing: true,
        enableDensityToggle: false,
        enableFullScreenToggle: false,
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
                <MaterialReactTable table={table} />
            </Stack>
        </ThemeProvider>
    );
}
