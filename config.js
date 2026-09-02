import './src/libs/load-env.js';
import {isAbsolute, join, resolve} from 'path'
import path from "node:path";
import fsp from "node:fs/promises";
import yaml from "js-yaml";
import {existsSync} from 'node:fs';
// NOTE: better-sqlite3 is imported lazily inside resolveLatestVersion (sqlite
// backend only) so the json/lite profile can import this config without the
// native dependency being present.
const SQLITE_MODULE_SPECIFIER = 'better-sqlite3';

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
            plantuml: 'client',
            blockdiag: 'kroki',
            mermaid: 'client'
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
        inline_compression_kb: 32,
        // Cap for the lite profile's in-memory relations store (OKF plan
        // DD-5); overridable via manifest collect.relations_cache_mb.
        relations_cache_mb: 10
    },
    render: {
        folder: null,
        highlighter: {
            theme: 'dark-plus',
            themes: {light: 'light-plus', dark: 'dark-plus'},
            langs: ['javascript', 'js', 'python', 'yaml', 'markdown', 'mermaid', 'text']
        }
    },
    html_cache: {
        // /__lite/ answers are live extension-preview state (change stamps,
        // navigation); caching them would freeze reload detection.
        exclude_paths: ['/blobs/', '.well-known/', '/__lite/']
    }
};

// Every merge below assumes a section is a plain mapping. A hand-edited
// manifest can put anything there (`output:` left dangling reads as null, a
// stray value reads as a string, a mis-indented block reads as a list), and
// spreading those produces nonsense keys or throws. Sections that are not a
// mapping are dropped in favour of the defaults, so a typo in one section can
// never take the renderer down or corrupt another.
function section(value) {
    return (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
}

// exclude_paths is walked with array methods downstream (server/cache); a
// single path written without a list marker must not iterate as characters.
function stringList(value, fallback) {
    if (Array.isArray(value)) {
        return value.filter((entry) => typeof entry === 'string');
    }
    return typeof value === 'string' ? [value] : fallback;
}

function mergeManifest(rawManifest = {}) {
    const manifest = section(rawManifest);
    const diagram = section(manifest.diagram);
    const renderers = section(diagram.renderers);
    const render = section(manifest.render);
    const htmlCache = section(manifest.html_cache);
    return {
        ...DEFAULT_MANIFEST,
        ...manifest,
        output: {...DEFAULT_MANIFEST.output, ...section(manifest.output)},
        server: {...DEFAULT_MANIFEST.server, ...section(manifest.server)},
        kroki: {...DEFAULT_MANIFEST.kroki, ...section(manifest.kroki)},
        diagram: {
            ...DEFAULT_MANIFEST.diagram,
            ...diagram,
            renderers: {
                ...DEFAULT_MANIFEST.diagram.renderers,
                ...renderers,
                kroki: {
                    ...DEFAULT_MANIFEST.diagram.renderers.kroki,
                    server: section(manifest.kroki).server ?? DEFAULT_MANIFEST.diagram.renderers.kroki.server,
                    ...section(renderers.kroki)
                }
            },
            languages: {
                ...DEFAULT_MANIFEST.diagram.languages,
                ...section(diagram.languages)
            },
            aliases: {
                ...DEFAULT_MANIFEST.diagram.aliases,
                ...section(diagram.aliases)
            }
        },
        collect: {...DEFAULT_MANIFEST.collect, ...section(manifest.collect)},
        render: {
            ...DEFAULT_MANIFEST.render,
            ...render,
            highlighter: {
                ...DEFAULT_MANIFEST.render.highlighter,
                ...section(render.highlighter)
            }
        },
        html_cache: {
            ...DEFAULT_MANIFEST.html_cache,
            ...htmlCache,
            exclude_paths: stringList(htmlCache.exclude_paths, DEFAULT_MANIFEST.html_cache.exclude_paths)
        }
    };
}

// Returns the manifest document as authored (a mapping), never merged. An
// absent, empty or unusable manifest reads as `{}` so callers can still tell
// "the author configured nothing" from "the author configured this", which is
// what the docs-root fallback below turns on.
//
// An *empty* manifest is not an error: a freshly created file, a file of
// comments, or one whose keys are all commented out are all legal YAML that
// parse to null/undefined and mean "use the defaults". Only a genuine syntax
// error is fatal — unlike document YAML, the manifest controls where and how
// the renderer runs, so a broken one cannot safely be guessed at.
async function readManifestDocument(manifestPath) {
    if (!manifestPath || !existsSync(manifestPath)) {
        return {};
    }
    let raw;
    try {
        raw = await fsp.readFile(manifestPath, "utf8");
    } catch (error) {
        console.warn(`Ignoring unreadable manifest '${manifestPath}': ${error.message}`);
        return {};
    }
    let parsed;
    try {
        parsed = yaml.load(raw);
    } catch (error) {
        // Name the exact file and failure plainly so the extension output
        // never looks blank.
        throw new Error(`Cannot start preview: invalid YAML in manifest '${manifestPath}': ${error.message}`, {cause: error});
    }
    if (parsed === null || parsed === undefined) {
        return {};
    }
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        // Syntactically valid YAML that is not a settings mapping (a bare
        // scalar, a list). The defaults still render the folder, so say what
        // was ignored rather than refusing to start.
        console.warn(`Ignoring manifest '${manifestPath}': expected a YAML mapping of settings, found ${Array.isArray(parsed) ? 'a list' : typeof parsed}.`);
        return {};
    }
    return parsed;
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
        // Keep the native module runtime-only. A literal dynamic import is
        // still resolved by Vite while bundling a json/static build, even
        // though this sqlite-only branch never executes in that deployment.
        const {default: Database} = await import(/* @vite-ignore */ SQLITE_MODULE_SPECIFIER);
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
const manifestDocument = await readManifestDocument(manifestPath);
const manifest = mergeManifest(manifestDocument);

// Deployment profile + data backend (env-only; needed before version resolution).
//   DOCS_PROFILE: 'full' (local website/warehouse) | 'lite' (VS Code extension engine)
//   DOCS_BACKEND: 'sqlite' (canonical store) | 'json' (pre-exported, no native deps)
// The dispatcher in src/libs/structure-db.js reads DOCS_BACKEND directly; it is
// surfaced here too for introspection and so manifest/defaults stay discoverable.
const docsProfile = (process.env.DOCS_PROFILE ?? 'full').trim().toLowerCase();
const docsBackend = (process.env.DOCS_BACKEND ?? (docsProfile === 'lite' ? 'json' : 'sqlite')).trim().toLowerCase();
// DOCS_OUTPUT: 'server' (default, Node-adapter SSR) | 'static' (true Astro
// static build, no adapter). Selected by astro.config.static.mjs via env so
// page frontmatter (getStaticPaths gating) and config.js agree without each
// static/server Astro config duplicating the decision.
const docsOutput = (process.env.DOCS_OUTPUT ?? 'server').trim().toLowerCase();
// Static-only deployment path prefix/canonical origin (e.g. a GitHub Pages
// project site at "/repo-name/"). SSR ignores these; it always serves at root.
const site = process.env.MICROWEBSTACKS_SITE || undefined;
const base = process.env.MICROWEBSTACKS_BASE || '/';

const krokiServer = process.env.MICROWEBSTACKS_KROKI_SERVER
    ?? manifest.diagram.renderers.kroki?.server
    ?? manifest.kroki.server;
// Relative env-provided paths anchor to the workspace root (the engine may run
// with a cwd far away from the docs, e.g. the VS Code extension's globalStorage);
// absolute values pass through unchanged. The SSR outDir belongs to the engine.
//
// Only what the manifest *authored* counts as a declaration: DEFAULT_MANIFEST
// always carries `output.content: content`, so reading the merged manifest here
// would make every workspace look like it had asked for a `content/` folder.
const declaredDocsRoot = section(manifestDocument.render).folder
    ?? section(manifestDocument.output).render
    ?? section(manifestDocument.output).content;
// A manifest that says nothing about where the docs live — an empty file, or
// one that only configures the server — describes a plain folder of Markdown.
// Defaulting it to `content/` used to point the renderer at a directory that
// does not exist, and every page 404'd with "entry not found for home page";
// the workspace root is the honest answer, and it is the same fallback
// `md-render preview` already applies to a bare folder.
function resolveDefaultDocsRoot() {
    const conventional = resolvePath(workspaceRoot, DEFAULT_MANIFEST.output.content);
    return existsSync(conventional) ? conventional : workspaceRoot;
}
const docsRoot = process.env.MICROWEBSTACKS_DOCS_ROOT
    ? resolvePath(workspaceRoot, process.env.MICROWEBSTACKS_DOCS_ROOT)
    : (typeof declaredDocsRoot === 'string' && declaredDocsRoot.trim()
        ? resolvePath(workspaceRoot, declaredDocsRoot)
        : resolveDefaultDocsRoot());
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
    output: docsOutput,
    site,
    base,
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
