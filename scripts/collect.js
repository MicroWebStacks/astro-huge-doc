import { config } from '../config.js';
import { collect } from 'content-structure';
import Database from 'better-sqlite3';

function clearHtmlCache() {
  const db = new Database(config.collect.db_path, {readonly: false});
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

  console.log("content-structure: starting collect()");
  collectConfig.version_id = await collect(collectConfig);
  console.log(`content-structure: collect() finished (version: ${collectConfig.version_id})`);
  clearHtmlCache();

}

main().catch((err) => {
  console.error("content-structure standalone runner: error", err);
  process.exit(1);
});
