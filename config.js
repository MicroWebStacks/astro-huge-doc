import * as dotenv from 'dotenv'
import {join} from 'path'
import path from "node:path";
import fsp from "node:fs/promises";
import yaml from "js-yaml";

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
    highlighter:{
        theme:"dark-plus",
        langs:['javascript','js','python','yaml']
    },
    copy_assets:false,
    copy_assets_dir: "_astro",
    assets_hash_dir:true,    //N.A. if(copy_assets == false)
    fetch: manifest.fetch
}

config.collect_content = {
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
