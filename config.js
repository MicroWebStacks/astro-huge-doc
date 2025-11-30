import * as dotenv from 'dotenv'
import {join} from 'path'
import path from "node:path";
import fsp from "node:fs/promises";
import yaml from "js-yaml";
import sqlite3 from 'sqlite3';

async function loadManifest() {
  const manifestPath = path.join(process.cwd(), "manifest.yaml");
  const raw = await fsp.readFile(manifestPath, "utf8");
  return yaml.load(raw);
}

dotenv.config()
const rootdir = process.cwd()

const outdir = (process.env.OUT_DIR==null)?"dist":process.env.OUT_DIR
const base = (process.env.PUBLIC_BASE==null)?"":process.env.PUBLIC_BASE
const structuredir = (process.env.STRUCTURE==null)?join(rootdir,".structure"):process.env.STRUCTURE
const contentdir = (process.env.CONTENT==null)?join(rootdir,"content"):process.env.CONTENT
const kroki_server = (process.env.KROKI_SERVER==null)?"https://kroki.io":process.env.KROKI_SERVER

const manifest = await loadManifest();

const config = {
    rootdir: rootdir,
    outDir: outdir,
    base: base,
    content_path: contentdir,
    code_path: `${rootdir}/${outdir}/codes`,
    kroki_server: kroki_server,
    client_menu:true,
    highlighter:manifest.render.highlighter,
    copy_assets:false,
    assets_hash_dir:true,    //N.A. if(copy_assets == false)
    fetch: manifest.fetch
}

function resolveLatestVersion(structurePath) {
    return new Promise((resolve) => {
        const db = new sqlite3.Database(structurePath, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                console.warn('Unable to open structure DB for version lookup:', err.message);
                resolve(null);
                return;
            }
            db.get('SELECT version_id FROM versions ORDER BY version_id DESC LIMIT 1', (error, row) => {
                if (error) {
                    console.warn('Unable to fetch latest version:', error.message);
                    resolve(null);
                } else {
                    resolve(row?.version_id ?? null);
                }
                db.close();
            });
        });
    });
}

const latestVersion = await resolveLatestVersion(join(structuredir, 'structure.db'));

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
