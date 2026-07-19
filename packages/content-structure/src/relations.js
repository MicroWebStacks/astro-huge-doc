// Link-resolution pass (OKF plan TP-5/TP-6).
//
// Runs after all documents of a collection are known and turns every recorded
// markdown link into a `relations` row carrying its reading context (link
// text, containing heading) plus a resolution status:
//
//   resolved   - target is a collected document (target_sid set)
//   asset      - target exists in the content tree but is not a document
//   public     - root-absolute target absent from the content root but present
//                under public/ (DD-3: content root first, public/ fallback)
//   external   - scheme or protocol-relative URL
//   unresolved - nothing matched; the page still renders (handoff §5.5)
//
// Matching is case-sensitive with URL-decoding and '/'-normalization only
// (OP-1); anchor-only links are intra-document navigation, not relations.
import { posix } from 'path';
import { exists, exists_public } from './utils.js';

const EXTERNAL_URL_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/

function normalizeSlashes(value){
    return String(value ?? '').replaceAll('\\','/')
}

async function resolveLinkRelation({sourcePath, rawUrl, docByPath}){
    const trimmed = String(rawUrl ?? '').trim()
    if(!trimmed){
        return null
    }
    if(EXTERNAL_URL_PATTERN.test(trimmed) || trimmed.startsWith('//')){
        return {status:'external', external:true, target_sid:null, fragment:null}
    }
    const hashIndex = trimmed.indexOf('#')
    const fragment = hashIndex >= 0 ? (trimmed.slice(hashIndex + 1) || null) : null
    let pathPart = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed
    pathPart = pathPart.split('?')[0]
    if(!pathPart){
        return null
    }
    let decoded = pathPart
    try{
        decoded = decodeURIComponent(pathPart)
    }catch(_error){
        // malformed percent escapes stay verbatim; they can still match a file
    }
    decoded = normalizeSlashes(decoded)
    const rootAbsolute = decoded.startsWith('/')
    const sourceDir = posix.dirname(normalizeSlashes(sourcePath))
    const contentPath = rootAbsolute
        ? posix.normalize(decoded.replace(/^\/+/,''))
        : posix.normalize(posix.join(sourceDir === '.' ? '' : sourceDir, decoded))
    if(!contentPath || contentPath === '.' || contentPath.startsWith('..')){
        return {status:'unresolved', external:false, target_sid:null, fragment}
    }
    // Exact path first, then two best-effort fallbacks: an extension-less
    // target may mean `<target>.md`, and a directory target resolves to that
    // directory's landing document (docByPath carries dir keys for those).
    const target = docByPath.get(contentPath)
        ?? (posix.extname(contentPath) === '' ? docByPath.get(`${contentPath}.md`) : undefined)
    if(target){
        return {status:'resolved', external:false, target_sid:target.sid, fragment}
    }
    if(await exists(contentPath)){
        return {status:'asset', external:false, target_sid:null, fragment}
    }
    if(rootAbsolute && await exists_public(decoded)){
        return {status:'public', external:false, target_sid:null, fragment}
    }
    return {status:'unresolved', external:false, target_sid:null, fragment}
}

// documents: [{sid, path, url_type, links:[{url, text, heading, title}]}]
async function buildRelationRows({documents = [], versionId = null}){
    const docByPath = new Map()
    for(const doc of documents){
        const path = normalizeSlashes(doc?.path)
        if(path && !docByPath.has(path)){
            docByPath.set(path, doc)
        }
    }
    // Landing documents also answer for their directory, so a link written as
    // `./folder` (or `./folder/`) resolves to the folder's landing page.
    for(const doc of documents){
        if(doc?.url_type !== 'dir'){
            continue
        }
        const dir = posix.dirname(normalizeSlashes(doc?.path ?? ''))
        if(dir && dir !== '.' && !docByPath.has(dir)){
            docByPath.set(dir, doc)
        }
    }
    const rows = []
    for(const doc of documents){
        for(const link of doc?.links ?? []){
            const resolution = await resolveLinkRelation({
                sourcePath: doc.path,
                rawUrl: link?.url,
                docByPath
            })
            if(!resolution){
                continue
            }
            rows.push({
                version_id: versionId,
                source_sid: doc.sid,
                target_sid: resolution.target_sid,
                target_raw: link?.url ?? '',
                fragment: resolution.fragment,
                link_text: link?.text ?? null,
                source_heading: link?.heading ?? null,
                status: resolution.status,
                external: resolution.external
            })
        }
    }
    return rows
}

export {
    buildRelationRows,
    resolveLinkRelation
}
