import { config } from '../config.js';
import { collect } from 'content-structure';

async function clearHtmlCache(dbPath) {
  // better-sqlite3 is imported lazily so the json/lite collect never loads it.
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(dbPath, {readonly: false});
  try {
    db.prepare("DELETE FROM html_cache WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'html_cache')").run();
    console.log("html-cache: cleared");
  } catch (error) {
    if (!String(error?.message ?? '').includes('no such table')) {
      console.warn("html-cache: clear skipped", error.message);
    }
  } finally {
    db.close();
  }
}

async function main() {
  const collectConfig = config.collect;

  console.log(`content-structure: starting collect() [format: ${collectConfig.format ?? 'sqlite'}]`);
  collectConfig.version_id = await collect(collectConfig);
  console.log(`content-structure: collect() finished (version: ${collectConfig.version_id})`);

  if ((collectConfig.format ?? 'sqlite') === 'json') {
    // The JSON dataset is self-contained; the SQLite-only source-tree index and
    // html-cache clear do not apply (and would require better-sqlite3).
    console.log("content-structure: json output - skipping sqlite source-tree indexing and html-cache clear");
    return;
  }

  const { indexSourceTree } = await import('./source-tree.js');
  await indexSourceTree({
    dbPath: collectConfig.db_path,
    contentRoot: collectConfig.contentdir,
    versionId: collectConfig.version_id
  });
  await clearHtmlCache(collectConfig.db_path);
}

main().catch((err) => {
  console.error("content-structure standalone runner: error", err);
  process.exit(1);
});
