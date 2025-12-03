import {join} from 'path'
import path from "node:path";
import fsp from "node:fs/promises";
import yaml from "js-yaml";
import {openDatabase} from 'content-structure/src/sqlite_utils/index.js';

async function loadManifest() {
  const manifestPath = path.join(process.cwd(), "manifest.yaml");
  const raw = await fsp.readFile(manifestPath, "utf8");
  return yaml.load(raw);
}

function resolveLatestVersion(structurePath) {
    try {
        const db = openDatabase(structurePath, {readonly: true});
        const row = db.prepare('SELECT version_id FROM versions ORDER BY version_id DESC LIMIT 1').get();
        return row?.version_id ?? null;
    } catch (error) {
        console.warn('Unable to resolve latest version:', error.message);
        return null;
    }
}

const rootdir = process.cwd()
const manifest = await loadManifest();
const abs_db_path = join(rootdir, manifest.output.db_path);
const latestVersion = resolveLatestVersion(abs_db_path);

const config = {
    rootdir: rootdir,
    outDir: join(rootdir, manifest.output.ssr),
    content_path: join(rootdir, manifest.output.content),
    kroki_server: manifest.kroki.server,
    highlighter:manifest.render.highlighter,
    fetch: manifest.fetch,
    html_cache: manifest.html_cache,
    collect:{
        version_id: latestVersion,
        rootdir:rootdir,
        contentdir:join(rootdir, manifest.output.content),
        outdir:join(rootdir, manifest.output.store),//dist does not persist before build
        debug:false,
        db_path: abs_db_path,
        ...manifest.collect
    }
}

console.log(config)

export {
    config
}
