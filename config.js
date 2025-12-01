import * as dotenv from 'dotenv'
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

dotenv.config()
const rootdir = process.cwd()

const outdir = (process.env.OUT_DIR==null)?"dist":process.env.OUT_DIR
const structuredir = (process.env.STRUCTURE==null)?join(rootdir,".structure"):process.env.STRUCTURE
const contentdir = (process.env.CONTENT==null)?join(rootdir,"content"):process.env.CONTENT
const kroki_server = (process.env.KROKI_SERVER==null)?"https://kroki.io":process.env.KROKI_SERVER

const manifest = await loadManifest();

const config = {
    rootdir: rootdir,
    outDir: outdir,
    content_path: contentdir,
    code_path: `${rootdir}/${outdir}/codes`,
    kroki_server: kroki_server,
    highlighter:manifest.render.highlighter,
    fetch: manifest.fetch
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

const latestVersion = resolveLatestVersion(join(structuredir, 'structure.db'));

config.collect_content = {
    version_id: latestVersion ?? "",
    rootdir:config.rootdir,
    contentdir:contentdir,
    outdir:structuredir,//dist does not persist before build
    out_menu:"public/menu.json",//used by src\layout\client_nav_menu.js
    debug:false,
    ...manifest.collect
}

console.log(config)

export {
    config
}
