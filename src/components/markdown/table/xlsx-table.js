import {dirname, isAbsolute, relative, resolve} from 'node:path';
import {read, utils} from 'xlsx';

function resolveXlsxPath(contentRoot, documentPath, authoredUrl) {
    const rawPath = String(authoredUrl ?? '').split(/[?#]/, 1)[0];
    if (!rawPath || /^[a-z][a-z0-9+.-]*:/i.test(rawPath) || rawPath.startsWith('//')) {
        return null;
    }
    let decoded;
    try {
        decoded = decodeURIComponent(rawPath);
    } catch {
        decoded = rawPath;
    }
    const root = resolve(contentRoot);
    const from = resolve(root, dirname(String(documentPath ?? '')));
    const candidate = resolve(from, decoded.replace(/^[/\\]+/, ''));
    const rel = relative(root, candidate);
    if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) {
        return null;
    }
    return candidate;
}

function valueCell(value) {
    const text = value === null || value === undefined ? '' : String(value);
    return {text, content: [{type: 'text', value: text}]};
}

function rowsToTableModel(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return {headers: [], rows: []};
    }
    const width = Math.max(...rows.map((row) => Array.isArray(row) ? row.length : 0));
    const first = Array.isArray(rows[0]) ? rows[0] : [];
    const headers = Array.from({length: width}, (_, index) =>
        valueCell(first[index] || `Column ${index + 1}`)
    );
    const body = rows.slice(1).map((row) =>
        Array.from({length: width}, (_, index) => valueCell(Array.isArray(row) ? row[index] : ''))
    );
    return {headers, rows: body};
}

function workbookBufferToTableModel(buffer) {
    const workbook = read(buffer, {type: 'buffer'});
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return {headers: [], rows: []};
    const rows = utils.sheet_to_json(workbook.Sheets[sheetName], {
        header: 1,
        raw: false,
        defval: ''
    });
    return rowsToTableModel(rows);
}

export {resolveXlsxPath, rowsToTableModel, workbookBufferToTableModel};
