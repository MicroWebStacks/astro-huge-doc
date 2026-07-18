import fsp from 'node:fs/promises';
import {join} from 'node:path';
import { config } from '../config.js';

async function loadCollector() {
  try {
    return (await import('content-structure')).collect;
  } catch (error) {
    const missingPrivatePackage = error?.code === 'ERR_MODULE_NOT_FOUND'
      && String(error?.message ?? '').includes("package 'content-structure'");
    if (!missingPrivatePackage) {
      throw error;
    }

    // Published engines carry this private workspace package in _modules;
    // source workspaces resolve the normal package import above instead.
    return (await import('../_modules/content-structure/index.js')).collect;
  }
}

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

async function updateJsonSourceTree(jsonDir, contentRoot) {
  const jsonFile = join(jsonDir, 'content.json');
  const dataset = JSON.parse(await fsp.readFile(jsonFile, 'utf8'));
  const {buildSourceEntries} = await import('./source-tree.js');
  const sourceEntries = await buildSourceEntries({
    contentRoot,
    documents: dataset.documents ?? []
  });
  dataset.source_entries = sourceEntries;
  await fsp.writeFile(jsonFile, `${JSON.stringify(dataset)}\n`, 'utf8');
  console.log(`source-tree: indexed ${sourceEntries.length} entries in json dataset`);
}

async function main() {
  const collectConfig = config.collect;
  const collect = await loadCollector();

  console.log(`content-structure: starting collect() [format: ${collectConfig.format ?? 'sqlite'}]`);
  collectConfig.version_id = await collect(collectConfig);
  console.log(`content-structure: collect() finished (version: ${collectConfig.version_id})`);

  if ((collectConfig.format ?? 'sqlite') === 'json') {
    await updateJsonSourceTree(collectConfig.json_dir, collectConfig.contentdir);
    console.log("content-structure: json output - source-tree refreshed; sqlite html-cache clear skipped");
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
