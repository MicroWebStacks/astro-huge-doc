#!/usr/bin/env node
/*
 * Lite-engine startup benchmark (plans/2026-07/13-extension-performance).
 *
 * Generates a synthetic "huge" markdown website under .cache/bench/ (git-
 * ignored) and measures the lazy lite flow the VS Code extension runs
 * (structure-db-lazy.js):
 *
 *   1. file tree walk        - filename-derived documents + filetree.json
 *                              (what the extension pays before anything shows)
 *   2. cold getEntry()       - on-demand parse of ONE page + record write
 *   3. warm getEntry()       - same page from the in-memory merge
 *   4. fresh-process entry   - new process, record served from the hash-keyed
 *                              disk cache (what a preview restart pays)
 *
 * --eager additionally runs the legacy full pipeline (collect.js +
 * diagrams.js + content.json load) for comparison — this is what the static/
 * full flows still do by design, and what the extension did before Phase 4.
 *
 * Usage:
 *   node scripts/bench-lite.js                 # default 1000 pages, lazy
 *   node scripts/bench-lite.js --pages 200
 *   node scripts/bench-lite.js --pages 5000 --fresh --eager
 *
 * --fresh regenerates the synthetic site even if it already exists.
 * Mermaid-only diagrams are used so no measurement ever needs a Kroki server
 * or network access. Everything here is a local measurement tool: results are
 * printed to stdout and go nowhere else.
 */
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
    const args = {pages: 1000, fresh: false, eager: false};
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--pages') {
            args.pages = Math.max(1, parseInt(argv[++i], 10) || 1000);
        } else if (argv[i] === '--fresh') {
            args.fresh = true;
        } else if (argv[i] === '--eager') {
            args.eager = true;
        }
    }
    return args;
}

const {pages, fresh, eager} = parseArgs(process.argv);
const benchRoot = join(engineRoot, '.cache', 'bench', `site-${pages}`);
const contentDir = join(benchRoot, 'content');
const storeDir = join(benchRoot, 'store');
const jsonDir = join(storeDir, 'json');

/* ---------------------------------------------------------------- generate */

function pageBody(sectionIdx, topicIdx, pageIdx) {
    const id = `${sectionIdx}-${topicIdx}-${pageIdx}`;
    const para = (seed) =>
        `Paragraph ${seed} of page ${id}. This synthetic text exists to give the ` +
        `markdown parser a realistic amount of prose to tokenize, with some ` +
        `**bold**, *italic*, \`inline code\` and a [link](../README.md) thrown in ` +
        `so the mdast tree is not trivial. `.repeat(3);
    const lines = [
        '---',
        `title: Page ${id}`,
        '---',
        '',
        `# Page ${id}`,
        '',
        para('intro'),
        ''
    ];
    for (const section of ['Alpha', 'Beta', 'Gamma', 'Delta']) {
        lines.push(`## ${section} of ${id}`, '', para(section), '');
        lines.push(`### ${section} details`, '', para(`${section}-details`), '');
    }
    lines.push(
        '## Data table',
        '',
        '| Name | Value | Unit | Comment |',
        '| --- | --- | --- | --- |'
    );
    for (let r = 0; r < 6; r++) {
        lines.push(`| metric-${r} | ${r * 42} | ms | row ${r} of page ${id} |`);
    }
    lines.push(
        '',
        '## Code sample',
        '',
        '```js',
        `export function page_${sectionIdx}_${topicIdx}_${pageIdx}() {`,
        `    const values = Array.from({length: 32}, (_, i) => i * ${pageIdx + 1});`,
        '    return values.filter((v) => v % 3 === 0);',
        '}',
        '```',
        '',
        '## Flow diagram',
        '',
        '```mermaid',
        'graph TD;',
        `  A${id}[Start] --> B${id}{Check};`,
        `  B${id} -->|yes| C${id}[Render];`,
        `  B${id} -->|no| D${id}[Skip];`,
        '```',
        ''
    );
    return lines.join('\n');
}

async function generateSite() {
    if (existsSync(contentDir) && !fresh) {
        const marker = join(benchRoot, 'generated.json');
        if (existsSync(marker)) {
            const meta = JSON.parse(await fsp.readFile(marker, 'utf8'));
            if (meta.pages === pages) {
                console.log(`bench: reusing generated site at ${contentDir} (${pages} pages)`);
                return meta;
            }
        }
    }
    console.log(`bench: generating ${pages} pages under ${contentDir} ...`);
    await fsp.rm(benchRoot, {recursive: true, force: true});
    await fsp.mkdir(contentDir, {recursive: true});
    await fsp.writeFile(
        join(contentDir, 'README.md'),
        `---\ntitle: Bench Home\n---\n\n# Benchmark site (${pages} pages)\n\nSynthetic content for lite-engine startup measurements.\n`
    );

    // ~10 top-level sections, each with topics of 10 pages: mirrors a large
    // docs tree (depth 3) rather than one flat folder.
    const sections = Math.max(1, Math.min(10, Math.ceil(pages / 100)));
    const perSection = Math.ceil(pages / sections);
    let written = 0;
    const t0 = performance.now();
    for (let s = 0; s < sections && written < pages; s++) {
        const sectionDir = join(contentDir, `section-${String(s).padStart(2, '0')}`);
        await fsp.mkdir(sectionDir, {recursive: true});
        await fsp.writeFile(join(sectionDir, 'README.md'), `---\ntitle: Section ${s}\n---\n\n# Section ${s}\n\nSection overview.\n`);
        const topics = Math.ceil(perSection / 10);
        for (let t = 0; t < topics && written < pages; t++) {
            const topicDir = join(sectionDir, `topic-${String(t).padStart(3, '0')}`);
            await fsp.mkdir(topicDir, {recursive: true});
            await fsp.writeFile(join(topicDir, 'README.md'), `---\ntitle: Topic ${s}.${t}\n---\n\n# Topic ${s}.${t}\n\nTopic overview.\n`);
            for (let p = 0; p < 10 && written < pages; p++) {
                await fsp.writeFile(join(topicDir, `page-${String(p).padStart(2, '0')}.md`), pageBody(s, t, p));
                written++;
            }
        }
    }
    const generateMs = performance.now() - t0;
    const meta = {pages, written, generateMs};
    await fsp.writeFile(join(benchRoot, 'generated.json'), JSON.stringify(meta));
    console.log(`bench: generated ${written} pages in ${generateMs.toFixed(0)} ms`);
    return meta;
}

/* ----------------------------------------------------------------- measure */

// Same environment shape the VS Code extension gives its collect/diagrams/
// server children (extension.js createRuntimeEnv), pointed at the bench site.
function benchEnv() {
    return {
        ...process.env,
        DOCS_PROFILE: 'lite',
        DOCS_BACKEND: 'json',
        MICROWEBSTACKS_DOTENV_OVERRIDE: 'false',
        MICROWEBSTACKS_EXTENSION_MODE: 'true',
        MICROWEBSTACKS_ENGINE_ROOT: engineRoot,
        MICROWEBSTACKS_WORKSPACE_ROOT: benchRoot,
        MICROWEBSTACKS_MANIFEST_PATH: join(benchRoot, 'manifest.yaml'),
        MICROWEBSTACKS_DOCS_ROOT: contentDir,
        MICROWEBSTACKS_STORE_PATH: storeDir,
        MICROWEBSTACKS_JSON_DIR: jsonDir
    };
}

function runScript(script, env) {
    return new Promise((resolveRun, rejectRun) => {
        const t0 = performance.now();
        const child = spawn(process.execPath, [join(engineRoot, 'scripts', script)], {
            cwd: engineRoot,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
        });
        let tail = '';
        const keepTail = (chunk) => {
            tail = (tail + chunk.toString()).slice(-2000);
        };
        child.stdout.on('data', keepTail);
        child.stderr.on('data', keepTail);
        child.on('error', rejectRun);
        child.on('exit', (code) => {
            const ms = performance.now() - t0;
            if (code === 0) {
                resolveRun({ms, tail});
            } else {
                rejectRun(new Error(`${script} exited with code ${code}\n${tail}`));
            }
        });
    });
}

async function walkCount(dir) {
    const entries = await fsp.readdir(dir, {recursive: true, withFileTypes: true});
    let files = 0;
    for (const entry of entries) {
        if (entry.isFile()) {
            files++;
        }
    }
    return files;
}

async function measureLazy(env) {
    // Applies the bench env to this process, then imports the lazy backend the
    // same way the SSR server does. config.js/load-env.js read env at import
    // time, so env must be set before the dynamic import.
    for (const [key, value] of Object.entries(env)) {
        process.env[key] = value;
    }
    // Start truly cold: no page records, no filetree, no stamps.
    await fsp.rm(jsonDir, {recursive: true, force: true});

    const memBefore = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    const db = await import('../src/libs/structure-db-lazy.js');
    const docs = db.getDocuments(); // triggers the file-level walk + filetree.json
    const walkMs = performance.now() - t0;

    const t1 = performance.now();
    const sourceEntries = db.getSourceEntries();
    const sourceMs = performance.now() - t1;

    const someUrl = docs.find((doc) => doc.url_type === 'file' && doc.url?.includes('/'))?.url
        ?? docs.find((doc) => doc.url && doc.url.includes('/'))?.url
        ?? docs[0]?.url
        ?? '';
    const t2 = performance.now();
    const cold = await db.getEntry({url: someUrl});
    const coldMs = performance.now() - t2;

    const t3 = performance.now();
    await db.getEntry({url: someUrl});
    const warmMs = performance.now() - t3;
    const memAfter = process.memoryUsage().heapUsed;

    return {
        walkMs,
        sourceMs,
        coldMs,
        warmMs,
        url: someUrl,
        documents: docs.length,
        sourceEntries: sourceEntries.length,
        entryFound: cold.found,
        entryItems: cold.items?.length ?? 0,
        heapMB: (memAfter - memBefore) / (1024 * 1024)
    };
}

// What a preview restart pays for an already-visited page: new process, walk,
// then the page record served from the hash-keyed disk cache (no parse).
function measureFreshProcess(env, url) {
    const script = [
        "const t0 = performance.now();",
        "const db = await import('./src/libs/structure-db.js');",
        `const entry = await db.getEntry({url: ${JSON.stringify(url)}});`,
        "console.log(JSON.stringify({ms: performance.now() - t0, found: entry.found, items: entry.items?.length ?? 0}));"
    ].join('\n');
    return new Promise((resolveRun, rejectRun) => {
        const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
            cwd: engineRoot,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
        });
        let out = '';
        let err = '';
        child.stdout.on('data', (chunk) => { out += chunk.toString(); });
        child.stderr.on('data', (chunk) => { err += chunk.toString(); });
        child.on('error', rejectRun);
        child.on('exit', (code) => {
            if (code !== 0) {
                rejectRun(new Error(`fresh-process measurement exited with code ${code}\n${err}`));
                return;
            }
            const lines = out.trim().split('\n');
            resolveRun(JSON.parse(lines[lines.length - 1]));
        });
    });
}

function getFreePort() {
    return new Promise((resolvePort, rejectPort) => {
        const server = net.createServer();
        server.unref();
        server.on('error', rejectPort);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : null;
            server.close(() => port ? resolvePort(port) : rejectPort(new Error('Could not allocate a benchmark port.')));
        });
    });
}

async function waitForEndpoint(url, child, tailOutput, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) {
            throw new Error(`SSR benchmark server exited before it became ready.\n${tailOutput()}`);
        }
        try {
            const response = await fetch(url, {cache: 'no-store'});
            if (response.ok) {
                await response.arrayBuffer();
                return;
            }
        } catch {
            // Server is still starting.
        }
        await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
    throw new Error(`SSR benchmark server did not become ready within ${timeoutMs} ms.\n${tailOutput()}`);
}

async function measureSsrFirstPage(env, url) {
    const entryPath = join(engineRoot, 'dist', 'server', 'entry.mjs');
    if (!existsSync(entryPath)) {
        throw new Error('SSR benchmark needs dist/server/entry.mjs. Run pnpm build first.');
    }

    // measureLazy() populated the selected page record. Remove page records so
    // this HTTP request pays the real cold per-page parse while retaining the
    // cheap filetree cache written by the same run.
    await fsp.rm(join(jsonDir, 'pages'), {recursive: true, force: true});
    const port = await getFreePort();
    const serverEnv = {
        ...env,
        DOCS_OUTPUT: 'server',
        MICROWEBSTACKS_HOST: '127.0.0.1',
        MICROWEBSTACKS_PORT: String(port),
        MICROWEBSTACKS_PROTOCOL: 'http',
        MICROWEBSTACKS_OUTDIR: join(engineRoot, 'dist')
    };
    const child = spawn(process.execPath, [join(engineRoot, 'server', 'server.js')], {
        cwd: engineRoot,
        env: serverEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    let tail = '';
    const keepTail = (chunk) => {
        tail = (tail + chunk.toString()).slice(-4000);
    };
    child.stdout.on('data', keepTail);
    child.stderr.on('data', keepTail);

    try {
        await waitForEndpoint(`http://127.0.0.1:${port}/__lite/version`, child, () => tail);
        const firstPageUrl = `http://127.0.0.1:${port}/${String(url).replace(/^\/+/, '')}`;
        const startedAt = performance.now();
        const response = await fetch(firstPageUrl, {cache: 'no-store'});
        const body = await response.arrayBuffer();
        const html = new TextDecoder().decode(body);
        const ms = performance.now() - startedAt;
        if (!response.ok) {
            throw new Error(`SSR first-page request returned ${response.status}.\n${tail}`);
        }
        const relativeLinkResolved = !html.includes('../README.md');
        if (!relativeLinkResolved) {
            throw new Error(`SSR page kept an unresolved ../README.md link under extension-less lite URLs.\n${tail}`);
        }
        const navigationStartedAt = performance.now();
        const navigationResponse = await fetch(
            `http://127.0.0.1:${port}/__lite/navigation?pathname=${encodeURIComponent(`/${url}`)}`,
            {cache: 'no-store'}
        );
        const navigation = await navigationResponse.json();
        const navigationMs = performance.now() - navigationStartedAt;
        if (!navigationResponse.ok || !Array.isArray(navigation.items)) {
            throw new Error(`Lazy navigation request failed.\n${tail}`);
        }
        return {
            ms,
            status: response.status,
            bytes: body.byteLength,
            relativeLinkResolved,
            navigationMs,
            navigationRoots: navigation.items.length
        };
    } finally {
        child.kill();
    }
}

async function measureEager(env) {
    console.log('bench: [eager] running collect.js ...');
    const collect = await runScript('collect.js', env);
    console.log('bench: [eager] running diagrams.js ...');
    const diagrams = await runScript('diagrams.js', env);
    const datasetBytes = (await fsp.stat(join(jsonDir, 'content.json'))).size;
    return {collectMs: collect.ms, diagramsMs: diagrams.ms, datasetBytes};
}

function fmt(ms) {
    return `${ms.toFixed(0)} ms`;
}

async function main() {
    await generateSite();
    const env = benchEnv();

    // Bare file walk: the theoretical floor.
    const tWalk = performance.now();
    const fileCount = await walkCount(contentDir);
    const bareWalkMs = performance.now() - tWalk;

    console.log('bench: measuring lazy flow (walk + on-demand page parse) ...');
    const lazy = await measureLazy(env);
    console.log('bench: measuring fresh-process cached entry ...');
    const freshHit = await measureFreshProcess(env, lazy.url);
    console.log('bench: measuring cold SSR first-page request ...');
    const ssr = await measureSsrFirstPage(env, lazy.url);

    const startupMs = lazy.walkMs + lazy.coldMs;
    console.log('');
    console.log(`=== lite engine startup benchmark (lazy) — ${pages} pages (${fileCount} files) ===`);
    console.log(`site               : ${benchRoot}`);
    console.log(`bare file walk     : ${fmt(bareWalkMs)}   (readdir floor)`);
    console.log(`tree walk+filetree : ${fmt(lazy.walkMs)}   (${lazy.documents} docs, ${lazy.sourceEntries} source entries, filetree.json written)`);
    console.log(`getSourceEntries   : ${fmt(lazy.sourceMs)}   (menu tree, after walk)`);
    console.log(`cold getEntry      : ${fmt(lazy.coldMs)}   (on-demand parse of '${lazy.url}', found=${lazy.entryFound}, items=${lazy.entryItems}, record written)`);
    console.log(`warm getEntry      : ${fmt(lazy.warmMs)}   (in-memory)`);
    console.log(`fresh-process entry: ${fmt(freshHit.ms)}   (new process, record from hash-keyed disk cache)`);
    console.log(`SSR first page      : ${fmt(ssr.ms)}   (HTTP ${ssr.status}, cold page parse, ${ssr.bytes} bytes)`);
    console.log(`relative .md link   : ${ssr.relativeLinkResolved ? 'resolved to lite URL' : 'FAILED'}`);
    console.log(`section navigation  : ${fmt(ssr.navigationMs)}   (${ssr.navigationRoots} scoped root${ssr.navigationRoots === 1 ? '' : 's'})`);
    console.log(`heap growth        : ${lazy.heapMB.toFixed(1)} MB (walk + one parsed page)`);
    console.log(`TOTAL to first page: ${fmt(startupMs)}  (walk + one page parse; edits re-parse one page only)`);

    let eagerResult = null;
    if (eager) {
        eagerResult = await measureEager(env);
        const eagerTotal = eagerResult.collectMs + eagerResult.diagramsMs;
        console.log('');
        console.log('--- eager comparison (full pipeline; static/full flows only) ---');
        console.log(`collect.js         : ${fmt(eagerResult.collectMs)}`);
        console.log(`diagrams.js        : ${fmt(eagerResult.diagramsMs)}`);
        console.log(`content.json size  : ${(eagerResult.datasetBytes / (1024 * 1024)).toFixed(1)} MB`);
        console.log(`eager total        : ${fmt(eagerTotal)}  (${(eagerTotal / Math.max(1, startupMs)).toFixed(0)}x the lazy startup)`);
    }
    console.log('');
    console.log(JSON.stringify({
        mode: 'lazy',
        pages,
        fileCount,
        bareWalkMs: Math.round(bareWalkMs),
        walkMs: Math.round(lazy.walkMs),
        sourceMs: Math.round(lazy.sourceMs),
        coldEntryMs: Math.round(lazy.coldMs),
        warmEntryMs: Math.round(lazy.warmMs),
        freshProcessMs: Math.round(freshHit.ms),
        ssrFirstPageMs: Math.round(ssr.ms),
        ssrFirstPageBytes: ssr.bytes,
        relativeLinkResolved: ssr.relativeLinkResolved,
        navigationMs: Math.round(ssr.navigationMs),
        navigationRoots: ssr.navigationRoots,
        heapMB: Math.round(lazy.heapMB * 10) / 10,
        totalMs: Math.round(startupMs),
        ...(eagerResult ? {
            eagerCollectMs: Math.round(eagerResult.collectMs),
            eagerDiagramsMs: Math.round(eagerResult.diagramsMs),
            eagerDatasetBytes: eagerResult.datasetBytes
        } : {})
    }));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
