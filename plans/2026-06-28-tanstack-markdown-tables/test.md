# Test Proof

## Static Checks

Command:

```powershell
rg -n "datatables\.net|jquery\.dataTables|data-tables\.js|dataTables_|DataTable\(" src package.json pnpm-lock.yaml
```

Expected:

- No DataTables.net imports, scripts, assets, or package metadata remain.
- Legacy local helper names may still include `DataTable`.

Actual:

- Only `src/components/markdown/table/table.js` helper names
  `astToDataTable` and `xlsxJson_to_DataTable` matched.

## Build

Command:

```powershell
$env:ASTRO_TELEMETRY_DISABLED='1'; corepack pnpm@10.22.0 build
```

Expected:

- Astro server build completes successfully.

Actual:

- Passed.
- Vite emitted existing large-chunk warnings for unrelated large bundles such
  as `ServerTable`, `ModelViewerCode`, and `plotly.min`.

## Localhost Render Check

Command:

```powershell
node server/server.js
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4321/docs/data-contract
```

The automated check started the built Express server, requested the real
localhost route, inspected the returned HTML, and stopped the server in the
same command. The first successful pass used port `4321`; after the final JSX
accessibility adjustment, the repeat pass used `MICROWEBSTACKS_PORT=4322`
because `4321` briefly returned `EADDRINUSE`.

Expected:

- HTTP 200 for `http://127.0.0.1:4321/docs/data-contract`.
- Markdown tables render with `markdown-table` markup.
- The first table includes headings `Field`, `Required`, and `Meaning`.
- Sort header buttons are present.
- DataTables search/pagination controls and assets are absent.

Actual:

```json
{
  "status": 200,
  "markdownTableClass": 5,
  "markdownTableScroll": 5,
  "tableHeaderField": true,
  "tableHeaderRequired": true,
  "tableHeaderMeaning": true,
  "sortButtons": 32,
  "ariaSort": 16,
  "dataTablesControls": false,
  "datatablesAsset": false
}
```

## Browser Notes

- In-app browser setup failed before navigation with a missing sandbox metadata
  field.
- Microsoft Edge headless was present but failed in this environment: one run
  crashed in the GPU process and another hung before producing DOM.
- Because of that environment limitation, no interactive header-click browser
  proof was captured.
