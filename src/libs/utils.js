import {constants, access, mkdir, readFile, writeFile} from 'fs/promises'
import { relative, resolve, join, sep, dirname, extname } from 'path';
import {config} from '../../config.js'
import {createHash} from 'crypto'
import yaml from 'js-yaml'
import {glob} from 'glob'

async function load_json(rel_path){
  const path = join(config.rootdir,rel_path)
  const text = await readFile(path,'utf-8')
  return JSON.parse(text)
}

async function load_json_abs(abs_path){
  const text = await readFile(abs_path,'utf-8')
  return JSON.parse(text)
}

function shortMD5(text) {
  const hash = createHash('md5').update(text, 'utf8').digest('hex');
  return hash.substring(0, 8);
}

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

async function save_file(filePath,content){
  const directory = dirname(filePath)
  if(!await exists(directory)){
    await mkdir(directory, { recursive: true });
  }
  return writeFile(filePath,content)
}

async function save_json(data,file_path){
  const file_abs = join(config.rootdir,file_path)
  await writeFile(file_abs,JSON.stringify(data,undefined, 2))
}

async function load_yaml_abs(abs_path){
  const fileContent = await readFile(abs_path,'utf-8')
  const data = yaml.load(fileContent);
  return data;
}

async function load_yaml(rel_path){
  const path = join(config.rootdir,rel_path)
  const fileContent = await readFile(path,'utf-8')
  const data = yaml.load(fileContent);
  return data;
}


async function get_dir_files(dirpath,rel_dir){
  const content_dir = join(config.content_path,dirpath,rel_dir)
  const originalDirectory = process.cwd();
  process.chdir(content_dir)
  const results = await glob(content_dir+"/**/*.*")
  const files = results.map((file)=>(relative(content_dir,resolve(content_dir,file)).split(sep).join('/')))
  process.chdir(originalDirectory)
  return files.map(file=>join(rel_dir,file)).sort()
}

function normalize_ext(value){
    if(!value){
        return ''
    }
    const extFromPath = extname(value);
    if(extFromPath){
        return extFromPath.startsWith('.') ? extFromPath.slice(1) : extFromPath;
    }
    const trimmed = String(value).trim();
    if(trimmed.startsWith('.')){
        return trimmed.slice(1);
    }
    return trimmed;
}

function file_mime(path){
    const ext = normalize_ext(path).toLowerCase()
    if(ext == "svg"){
        return 'image/svg+xml'
    }
    else if(ext == "png"){
        return 'image/png'
    }
    else if(ext == "jpg"){
        return 'image/jpeg'
    }
    else if(ext == "jpeg"){
        return 'image/jpeg'
    }
    else if(ext == "webp"){
        return 'image/webp'
    }
    else if(ext == "gif"){
        return 'image/gif'
    }
    else if(ext == "bmp"){
        return 'image/bmp'
    }
    else if((ext == "txt") || (ext == "md") || (ext == "json") || (ext == "yaml") || (ext == "yml") || (ext == "csv") || (ext == "tsv")){
        return 'text/plain'
    }
    return 'application/octet-stream'
}

function log_debug(...args){
  if(import.meta.env.DEV){
    console.log(...args)
  }
}

export{
  shortMD5,
  exists,
  load_json,
  load_json_abs,
  load_yaml,
  load_yaml_abs,
  save_json,
  save_file,
  get_dir_files,
  file_mime,
  log_debug
}
