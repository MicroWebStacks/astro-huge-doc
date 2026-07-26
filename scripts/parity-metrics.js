/*
 * Render-parity metrics (homesmartmesh-parity WP-19 / DD-007).
 *
 * Reads a built static artifact and reduces every emitted page to a small set
 * of structural counts. Comparing those counts against a recorded baseline is
 * what turns "the iframe stopped rendering" from something a person notices
 * months later into a failing check.
 *
 * Under R-7 this deliberately does NOT compare URLs with the reference site —
 * our urls are allowed to differ. It compares what a page *renders*: how many
 * headings, images, model viewers, tables, iframes and gallery images it has,
 * whether raw directive text leaked through, and whether its internal links
 * resolve inside the artifact.
 *
 * Usage:
 *   node scripts/parity-metrics.js [dist]            print a summary
 *   node scripts/parity-metrics.js [dist] --json     full per-page metrics
 *   node scripts/parity-metrics.js [dist] --write    record/refresh baseline
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = path.join(ROOT_DIR, 'test', 'fixtures', 'parity-baseline.json');

// Raw directive text that reached the page instead of a component. Phase 2
// fixed the iframe form; this is the guard that keeps it fixed.
const RAW_DIRECTIVE = /:(?:iframe|button|image|details)\[[^\]]*\]\{/;

function walk(dir, base = dir, out = []) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, base, out);
        else out.push(path.relative(base, full).split(path.sep).join('/'));
    }
    return out;
}

function count(html, pattern) {
    return (html.match(pattern) ?? []).length;
}

/* "/a/b/index.html" -> "/a/b"; "/index.html" -> "/". Route form, so a baseline
 * stays readable and diffable. */
function routeOf(file) {
    const withoutIndex = file.replace(/(^|\/)index\.html$/, '$1');
    const route = `/${withoutIndex}`.replace(/\/+$/, '');
    return route === '' ? '/' : route;
}

function pageMetrics(html) {
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() ?? '';
    // Body only: the head carries inline CSS/JS whose text would otherwise
    // inflate every count.
    const body = html.slice(html.indexOf('<body'));
    return {
        title,
        headings: count(body, /class="[^"]*\bheading\b/g),
        images: count(body, /<img\b/g),
        iframes: count(body, /<iframe\b/g),
        modelViewers: count(body, /<model-viewer\b/g),
        tables: count(body, /<table\b/g),
        galleries: count(body, /class="pswp-gallery/g),
        galleryImages: count(body, /data-pswp-width/g),
        codeBlocks: count(body, /class="[^"]*\bcode-shell\b/g),
        rawDirectives: RAW_DIRECTIVE.test(body) ? 1 : 0
    };
}

/* Internal hrefs that resolve to nothing in the artifact. Anchors, external
 * schemes and mailto are out of scope; so is the base prefix, which is stripped
 * by matching on the artifact-relative tail. */
function danglingLinks(html, {files, routes, base}) {
    const dangling = [];
    for (const match of html.matchAll(/href="([^"]+)"/g)) {
        const raw = match[1];
        if (!raw.startsWith('/')) continue;
        if (/^(?:https?:|mailto:|data:|#)/.test(raw)) continue;
        let target = raw.split('#')[0].split('?')[0];
        if (base && base !== '/' && target.startsWith(base)) target = `/${target.slice(base.length)}`;
        if (target === '') continue;
        let decoded = target;
        try { decoded = decodeURIComponent(target); } catch { /* keep raw */ }
        const asFile = decoded.replace(/^\//, '');
        const asRoute = decoded.replace(/\/$/, '') || '/';
        if (files.has(asFile) || files.has(`${asFile}/index.html`) || routes.has(asRoute)) continue;
        dangling.push(raw);
    }
    return dangling;
}

function collectMetrics(distDir, {base = '/'} = {}) {
    const files = new Set(walk(distDir));
    const pages = [...files].filter(file => file.endsWith('.html')).sort();
    const routes = new Set(pages.map(routeOf));

    const result = {};
    let totalDangling = 0;
    for (const file of pages) {
        const html = fs.readFileSync(path.join(distDir, file), 'utf8');
        const metrics = pageMetrics(html);
        const dangling = danglingLinks(html, {files, routes, base});
        totalDangling += dangling.length;
        result[routeOf(file)] = {...metrics, danglingLinks: dangling.length};
    }

    const sum = key => Object.values(result).reduce((total, page) => total + (page[key] ?? 0), 0);
    return {
        pages: result,
        totals: {
            pages: pages.length,
            headings: sum('headings'),
            images: sum('images'),
            iframes: sum('iframes'),
            modelViewers: sum('modelViewers'),
            tables: sum('tables'),
            galleries: sum('galleries'),
            galleryImages: sum('galleryImages'),
            rawDirectives: sum('rawDirectives'),
            danglingLinks: totalDangling
        }
    };
}

/* Regressions only: a page that gained content is not a failure, a page that
 * lost a component is. Missing pages and any raw directive always fail. */
function compareToBaseline(current, baseline) {
    const regressions = [];
    const counted = ['headings', 'images', 'iframes', 'modelViewers', 'tables', 'galleries', 'galleryImages'];

    for (const [route, expected] of Object.entries(baseline.pages ?? {})) {
        const actual = current.pages?.[route];
        if (!actual) {
            regressions.push({route, metric: 'page', expected: 'present', actual: 'missing'});
            continue;
        }
        for (const metric of counted) {
            if ((actual[metric] ?? 0) < (expected[metric] ?? 0)) {
                regressions.push({route, metric, expected: expected[metric], actual: actual[metric] ?? 0});
            }
        }
        if ((actual.danglingLinks ?? 0) > (expected.danglingLinks ?? 0)) {
            regressions.push({route, metric: 'danglingLinks', expected: expected.danglingLinks, actual: actual.danglingLinks});
        }
        if (expected.title && actual.title !== expected.title) {
            regressions.push({route, metric: 'title', expected: expected.title, actual: actual.title});
        }
    }
    for (const [route, actual] of Object.entries(current.pages ?? {})) {
        if (actual.rawDirectives > 0) {
            regressions.push({route, metric: 'rawDirectives', expected: 0, actual: actual.rawDirectives});
        }
    }
    return regressions;
}

function loadBaseline() {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

function main() {
    const args = process.argv.slice(2);
    const write = args.includes('--write');
    const asJson = args.includes('--json');
    const positional = args.filter(arg => !arg.startsWith('--'));
    const distDir = path.resolve(ROOT_DIR, positional[0] ?? 'dist');

    if (!fs.existsSync(distDir)) {
        console.error(`parity-metrics: no artifact at ${distDir}`);
        process.exitCode = 1;
        return;
    }

    const current = collectMetrics(distDir, {base: process.env.MICROWEBSTACKS_BASE || '/'});

    if (write) {
        fs.mkdirSync(path.dirname(BASELINE_PATH), {recursive: true});
        fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`);
        console.log(`parity-metrics: baseline written for ${current.totals.pages} pages`);
        return;
    }

    if (asJson) {
        console.log(JSON.stringify(current, null, 2));
        return;
    }

    console.log(`parity-metrics: ${current.totals.pages} pages`);
    for (const [key, value] of Object.entries(current.totals)) {
        if (key !== 'pages') console.log(`  ${key.padEnd(14)} ${value}`);
    }

    if (fs.existsSync(BASELINE_PATH)) {
        const regressions = compareToBaseline(current, loadBaseline());
        if (regressions.length) {
            console.error(`parity-metrics: ${regressions.length} regression(s) against the recorded baseline:`);
            for (const item of regressions.slice(0, 40)) {
                console.error(`  ${item.route} ${item.metric}: expected ${item.expected}, got ${item.actual}`);
            }
            process.exitCode = 1;
            return;
        }
        console.log('parity-metrics: no regressions against the recorded baseline.');
    } else {
        console.log('parity-metrics: no baseline recorded yet (run with --write).');
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}

export {collectMetrics, compareToBaseline, pageMetrics, routeOf, danglingLinks, BASELINE_PATH};
