import express from 'express';
import https from 'https'
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { readFileSync, } from 'fs';
import { handler as ssrHandler } from '../dist/server/entry.mjs';
import { createHtmlCacheMiddleware } from './cache/index.js';
import cors from 'cors';
import {config} from '../config.js';

import * as dotenv from 'dotenv'
dotenv.config()

const outdir = config.outDir;

const app = express();
const htmlCacheMiddleware = createHtmlCacheMiddleware({
    dbPath: config.collect.db_path,
    excludePaths: config.html_cache?.exclude_paths
});

if(process.env.ENABLE_CORS == "true"){
    app.use(cors());      
    console.log("\n -- !!! CORS enabled !!! -- APIs can be used from other sites --\n")
}

if(process.env.ENABLE_AUTH === "true"){
    const { authRouter } = await import('./auth/auth_router.js');
    app.use(authRouter)
    console.log(" with auth")
}else{
    console.log("\n -- !!! no auth !!! -- Authentication is disabled -- \n")
}

app.use(express.static(join(outdir, 'client')))
app.use(htmlCacheMiddleware)
app.use(ssrHandler);//catches all other routes

app.use((req, res, next) => {
    res.status(404).send("Sorry can't find that!")
  })

  
if(config.server.protocol == "https"){
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const key = readFileSync(join(__dirname, process.env.KEY_FILE),'utf8')
    const cert = readFileSync(join(__dirname, process.env.CERT_FILE),'utf8')
    const httpsServer = https.createServer({key,cert},app)
    httpsServer.listen(config.server.port,config.server.host,()=>{
        console.log(`listening on https://${config.server.host}:${config.server.port}`)
    });
}else{
    app.listen(config.server.port,config.server.host,()=>{
        console.log(`listening on http://${config.server.host}:${config.server.port}`)
    });
}
