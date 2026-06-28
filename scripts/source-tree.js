import fsp from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';

const IGNORED_NAMES = new Set(['.git', 'node_modules']);

function normalizeRelPath(value) {
  return String(value ?? '').split(path.sep).join('/');
}

function parentPathFor(relPath) {
  const parent = path.posix.dirname(relPath);
  return parent === '.' ? '' : parent;
}

function markdownDocumentTarget(docPath, urlType) {
  const normalized = normalizeRelPath(docPath);
  if (urlType !== 'dir') {
    return normalized;
  }
  const parent = parentPathFor(normalized);
  return parent || normalized;
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_id TEXT,
      path TEXT,
      parent_path TEXT,
      name TEXT,
      entry_type TEXT,
      ext TEXT,
      size INTEGER,
      mtime_ms INTEGER,
      document_url TEXT,
      document_title TEXT,
      document_url_type TEXT,
      sort_order INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_source_entries_version_path
      ON source_entries(version_id, path);
    CREATE INDEX IF NOT EXISTS idx_source_entries_version_parent
      ON source_entries(version_id, parent_path);
  `);
}

function loadDocumentMap(db, versionId) {
  const rows = db
    .prepare('SELECT path, url, title, url_type, "order" AS sort_order FROM documents WHERE version_id = ?')
    .all(versionId);
  const map = new Map();
  for (const row of rows) {
    if (!row.path) {
      continue;
    }
    const target = markdownDocumentTarget(row.path, row.url_type);
    map.set(target, {
      document_url: row.url ?? '',
      document_title: row.title ?? null,
      document_url_type: row.url_type ?? null,
      sort_order: row.sort_order ?? null
    });
  }
  return map;
}

async function scanContentTree(contentRoot, documentMap) {
  const entries = [];

  async function visit(absDir, relDir) {
    const children = await fsp.readdir(absDir, {withFileTypes: true});
    children.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) {
        return a.isDirectory() ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    for (const child of children) {
      if (IGNORED_NAMES.has(child.name)) {
        continue;
      }
      const relPath = relDir ? `${relDir}/${child.name}` : child.name;
      const absPath = path.join(absDir, child.name);
      const stat = await fsp.stat(absPath);
      const isDirectory = child.isDirectory();
      const doc = documentMap.get(relPath) ?? {};

      if (!(child.isFile() && doc.document_url_type === 'dir' && parentPathFor(relPath))) {
        entries.push({
          path: relPath,
          parent_path: relDir,
          name: child.name,
          entry_type: isDirectory ? 'dir' : 'file',
          ext: isDirectory ? null : path.extname(child.name).replace(/^\./, '').toLowerCase() || null,
          size: isDirectory ? null : stat.size,
          mtime_ms: Math.trunc(stat.mtimeMs),
          document_url: doc.document_url ?? null,
          document_title: doc.document_title ?? null,
          document_url_type: doc.document_url_type ?? null,
          sort_order: doc.sort_order ?? null
        });
      }

      if (isDirectory) {
        await visit(absPath, relPath);
      }
    }
  }

  await visit(contentRoot, '');
  return entries;
}

function insertEntries(db, versionId, entries) {
  const insert = db.prepare(`
    INSERT INTO source_entries (
      version_id, path, parent_path, name, entry_type, ext, size, mtime_ms,
      document_url, document_title, document_url_type, sort_order
    ) VALUES (
      @version_id, @path, @parent_path, @name, @entry_type, @ext, @size, @mtime_ms,
      @document_url, @document_title, @document_url_type, @sort_order
    )
  `);
  const insertMany = db.transaction((rows) => {
    db.prepare('DELETE FROM source_entries WHERE version_id = ?').run(versionId);
    for (const row of rows) {
      insert.run({version_id: versionId, ...row});
    }
  });
  insertMany(entries);
}

async function indexSourceTree({dbPath, contentRoot, versionId}) {
  if (!versionId) {
    throw new Error('source-tree: versionId is required');
  }
  const db = new Database(dbPath, {readonly: false});
  try {
    createSchema(db);
    const documentMap = loadDocumentMap(db, versionId);
    const entries = await scanContentTree(contentRoot, documentMap);
    insertEntries(db, versionId, entries);
    console.log(`source-tree: indexed ${entries.length} entries`);
    return entries.length;
  } finally {
    db.close();
  }
}

export {indexSourceTree};
