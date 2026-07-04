import './src/libs/load-env.js';
import {isAbsolute, join, resolve} from 'path'
import path from "node:path";
import fsp from "node:fs/promises";
import yaml from "js-yaml";
import {existsSync} from 'node:fs';
// NOTE: better-sqlite3 is imported lazily inside resolveLatestVersion (sqlite
// backend only) so the json/lite profile can import this config without the
// native dependency being present.

const DEFAULT_MANIFEST = {
    output: {
        ssr: 'dist',
        content: 'content',
        store: 'dataset',
        db_path: 'dataset/content.db'
    },
    server: {
        protocol: 'http',
        host: '0.0.0.0',
        port: 4321
    },
    kroki: {
        server: 'http://localhost:18000'
    },
    diagram: {
        default_renderer: 'kroki',
        renderers: {
            kroki: {
                server: 'http://localhost:18000'
            }
        },
        languages: {
            plantuml: 'kroki',
            blockdiag: 'kroki',
            mermaid: 'kroki'
        },
        aliases: {
            puml: 'plantuml',
            mmd: 'mermaid'
        }
    },
    collect: {
        folder_single_doc: false,
        file_link_ext: ['svg', 'webp', 'png', 'jpeg', 'jpg', 'xlsx', 'glb', 'puml', 'mermaid', 'mmd'],
        file_compress_ext: ['txt', 'md', 'json', 'csv', 'tsv', 'yaml', 'yml', 'mermaid', 'mmd'],
        external_storage_kb: 512,
        inline_compression_kb: 32
    },
    render: {
        highlighter: {
            theme: 'dark-plus',
            themes: {light: 'light-plus', dark: 'dark-plus'},
            langs: ['javascript', 'js', 'python', 'yaml', 'markdown', 'text']
        }
    },
    html_cache: {
        exclude_paths: ['/blobs/', '.well-known/']
    }
};

function mergeManifest(manifest = {}) {
    return {
        ...DEFAULT_MANIFEST,
        ...manifest,
        output: {...DEFAULT_MANIFEST.output, ...(manifest.output ?? {})},
        server: {...DEFAULT_MANIFEST.server, ...(manifest.server ?? {})},
        kroki: {...DEFAULT_MANIFEST.kroki, ...(manifest.kroki ?? {})},
        diagram: {
            ...DEFAULT_MANIFEST.diagram,
            ...(manifest.diagram ?? {}),
            renderers: {
                ...DEFAULT_MANIFEST.diagram.renderers,
                ...(manifest.diagram?.renderers ?? {}),
                kroki: {
                    ...DEFAULT_MANIFEST.diagram.renderers.kroki,
                    server: manifest.kroki?.server ?? DEFAULT_MANIFEST.diagram.renderers.kroki.server,
                    ...(manifest.diagram?.renderers?.kroki ?? {})
                }
            },
            languages: {
                ...DEFAULT_MANIFEST.diagram.languages,
                ...(manifest.diagram?.languages ?? {})
            },
            aliases: {
                ...DEFAULT_MANIFEST.diagram.aliases,
                ...(manifest.diagram?.aliases ?? {})
            }
        },
        collect: {...DEFAULT_MANIFEST.collect, ...(manifest.collect ?? {})},
        render: {
            ...DEFAULT_MANIFEST.render,
            ...(manifest.render ?? {}),
            highlighter: {
                ...DEFAULT_MANIFEST.render.highlighter,
                ...(manifest.render?.highlighter ?? {})
            }
        },
        html_cache: {...DEFAULT_MANIFEST.html_cache, ...(manifest.html_cache ?? {})}
    };
}

async function loadManifest(manifestPath) {
    if (!manifestPath || !existsSync(manifestPath)) {
        return mergeManifest();
    }
    const raw = await fsp.readFile(manifestPath, "utf8");
    return mergeManifest(yaml.load(raw));
}

function resolvePath(basePath, targetPath) {
    if (!targetPath) {
        return basePath;
    }
    return isAbsolute(targetPath) ? targetPath : join(basePath, targetPath);
}

function parsePort(value, fallback) {
    const port = Number.parseInt(value, 10);
    return Number.isFinite(port) ? port : fallback;
}

async function resolveLatestVersion(structurePath) {
    if (!existsSync(structurePath)) {
        return null;
    }
    let db;
    try {
        const {default: Database} = await import('better-sqlite3');
        db = new Database(structurePath, {readonly: true, fileMustExist: true});
        const row = db.prepare('SELECT version_id FROM versions ORDER BY version_id DESC LIMIT 1').get();
        return row?.version_id ?? null;
    } catch (error) {
        console.warn('Unable to resolve latest version:', error.message);
        return null;
    } finally {
        db?.close();
    }
}

const workspaceRoot = resolve(process.env.MICROWEBSTACKS_WORKSPACE_ROOT ?? process.cwd());
const engineRoot = resolve(process.env.MICROWEBSTACKS_ENGINE_ROOT ?? process.cwd());
const manifestPath = process.env.MICROWEBSTACKS_MANIFEST_PATH
    ? resolve(process.env.MICROWEBSTACKS_MANIFEST_PATH)
    : join(workspaceRoot, "manifest.yaml");
const manifest = await loadManifest(manifestPath);

// Deployment profile + data backend (env-only; needed before version resolution).
//   DOCS_PROFILE: 'full' (local website/warehouse) | 'lite' (VS Code extension engine)
//   DOCS_BACKEND: 'sqlite' (canonical store) | 'json' (pre-exported, no native deps)
// The dispatcher in src/libs/structure-db.js reads DOCS_BACKEND directly; it is
// surfaced here too for introspection and so manifest/defaults stay discoverable.
const docsProfile = (process.env.DOCS_PROFILE ?? 'full').trim().toLowerCase();
const docsBackend = (process.env.DOCS_BACKEND ?? (docsProfile === 'lite' ? 'json' : 'sqlite')).trim().toLowerCase();

const krokiServer = process.env.MICROWEBSTACKS_KROKI_SERVER
    ?? manifest.diagram.renderers.kroki?.server
    ?? manifest.kroki.server;
// Relative env-provided paths anchor to the workspace root (the engine may run
// with a cwd far away from the docs, e.g. the VS Code extension's globalStorage);
// absolute values pass through unchanged. The SSR outDir belongs to the engine.
const docsRoot = process.env.MICROWEBSTACKS_DOCS_ROOT
    ? resolvePath(workspaceRoot, process.env.MICROWEBSTACKS_DOCS_ROOT)
    : resolvePath(workspaceRoot, manifest.output.content);
const outDir = process.env.MICROWEBSTACKS_OUTDIR
    ? resolvePath(engineRoot, process.env.MICROWEBSTACKS_OUTDIR)
    : resolvePath(engineRoot, manifest.output.ssr);
const storePath = process.env.MICROWEBSTACKS_STORE_PATH
    ? resolvePath(workspaceRoot, process.env.MICROWEBSTACKS_STORE_PATH)
    : resolvePath(workspaceRoot, manifest.output.store);
const abs_db_path = process.env.MICROWEBSTACKS_DB_PATH
    ? resolvePath(workspaceRoot, process.env.MICROWEBSTACKS_DB_PATH)
    : resolvePath(workspaceRoot, manifest.output.db_path);
// Pre-exported JSON dataset (json backend). Sits beside the sqlite store.
const jsonDir = process.env.MICROWEBSTACKS_JSON_DIR
    ? resolvePath(workspaceRoot, process.env.MICROWEBSTACKS_JSON_DIR)
    : join(storePath, 'json');
// Version resolution requires sqlite; the json backend carries its own version
// in the exported dataset, so skip the native lookup entirely in json mode.
const latestVersion = docsBackend === 'json' ? null : await resolveLatestVersion(abs_db_path);
const serverHost = process.env.MICROWEBSTACKS_HOST ?? manifest.server.host;
const serverPort = parsePort(process.env.MICROWEBSTACKS_PORT, manifest.server.port);
const serverProtocol = process.env.MICROWEBSTACKS_PROTOCOL ?? manifest.server.protocol;

const config = {
    profile: docsProfile,
    dataBackend: docsBackend,
    rootdir: engineRoot,
    workspaceRoot,
    manifestPath,
    outDir,
    content_path: docsRoot,
    kroki_server: krokiServer,
    diagram: {
        ...manifest.diagram,
        renderers: {
            ...manifest.diagram.renderers,
            kroki: {
                ...manifest.diagram.renderers.kroki,
                server: krokiServer
            }
        }
    },
    highlighter:manifest.render.highlighter,
    fetch: manifest.fetch,
    html_cache: manifest.html_cache,
    server: {
        ...manifest.server,
        protocol: serverProtocol,
        host: serverHost,
        port: serverPort
    },
    collect:{
        ...manifest.collect,
        version_id: latestVersion,
        rootdir: workspaceRoot,
        contentdir: docsRoot,
        outdir: storePath,//dist does not persist before build
        debug: manifest.collect.debug ?? false,
        db_path: abs_db_path,
        json_dir: jsonDir,
        // Output format for content-structure collect(): 'sqlite' (canonical) or
        // 'json' (lite, no native deps). Mirrors the data backend.
        format: docsBackend,
        // Baked into the JSON dataset so it is self-describing for diagram detection.
        diagram: manifest.diagram
    }
}

if (process.env.MICROWEBSTACKS_DEBUG_CONFIG === 'true') {
    console.log(config)
}

export {
    config
}
