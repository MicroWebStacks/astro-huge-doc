/*
 * Static artifact gate (homesmartmesh-parity WP-15 / DD-006).
 *
 * A published page must not request a route the static build never emitted.
 * The /__lite/* endpoints are registered by src/middleware.js, which does not
 * exist in a static artifact, so anything reachable from a page that fetches
 * them is a defect — it 404s on every page load and surfaces a "Link index
 * unavailable" bar to the reader.
 *
 * Reachability, not a flat grep, is the invariant that matters: Astro bundles a
 * hoisted <script> for every component in the module graph, including ones
 * behind a render-time condition that was false. Those chunks are written to
 * _astro/ but linked from no page. They are dead weight rather than a live
 * request, so this script separates the two:
 *
 *   - a forbidden string reachable from any page  -> failure
 *   - a forbidden string in a file no page can    -> dead preview chunk,
 *     reach                                          removed with --prune
 *
 * Unreachable is NOT the same as unused, so --prune deliberately removes only
 * that second, provable set. A static scan cannot see mermaid's runtime
 * dynamic imports (`_astro/c4Diagram-*.js` and ~90 siblings), and deleting
 * those on "nothing references them" reasoning would break every diagram in
 * the artifact. The remaining unreferenced files are reported as information,
 * never removed — the WP-14 caveat's fail-closed rule.
 *
 * Selecting which public/** files ship is a different job (WP-14) and is
 * deliberately not done here.
 *
 * Usage: node scripts/check-static-artifact.js [dist] [--prune] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Routes only the SSR middleware answers. A static page reaching any of these
// is the WP-15 defect.
const FORBIDDEN = ['/__lite/'];

// Extensions worth opening when following references. Binary assets cannot
// contain a URL that matters here.
const TEXT_EXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.map']);

function walk(dir, base = dir, out = []) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, base, out);
        else out.push(path.relative(base, full).split(path.sep).join('/'));
    }
    return out;
}

/* Every quoted or bare reference that could name another emitted file. Matching
 * on basename keeps this independent of `base`: with base=/docs/ the same asset
 * is referenced as /docs/_astro/x.js, and a prefix-sensitive matcher would call
 * it unreachable and prune a live file. */
function referencedNames(text) {
    const names = new Set();
    const pattern = /[\w./-]*[\w-]+\.(?:js|mjs|css|json|map|svg|png|webp|jpe?g|gif|ico|woff2?|glb|xlsx|zip|hex|db|ya?ml)/gi;
    for (const match of text.matchAll(pattern)) {
        names.add(match[0].split('/').at(-1));
    }
    return names;
}

function readText(distDir, file) {
    try {
        return fs.readFileSync(path.join(distDir, file), 'utf8');
    } catch {
        return '';
    }
}

function analyze(distDir) {
    const files = walk(distDir);
    const byName = new Map();
    for (const file of files) {
        const name = file.split('/').at(-1);
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push(file);
    }

    const pages = files.filter(file => file.endsWith('.html'));
    const reachable = new Set(pages);
    const queue = [...pages];
    while (queue.length) {
        const current = queue.pop();
        if (!TEXT_EXT.has(path.extname(current))) continue;
        for (const name of referencedNames(readText(distDir, current))) {
            for (const target of byName.get(name) ?? []) {
                if (reachable.has(target)) continue;
                reachable.add(target);
                queue.push(target);
            }
        }
    }

    const violations = [];
    const deadPreviewChunks = [];
    for (const file of files) {
        if (!TEXT_EXT.has(path.extname(file))) continue;
        const text = readText(distDir, file);
        const needle = FORBIDDEN.find(candidate => text.includes(candidate));
        if (!needle) continue;
        if (reachable.has(file)) violations.push({file, needle});
        else deadPreviewChunks.push(file);
    }

    // Reported only. Only _astro is claimed here; public/** and blobs are WP-14.
    const orphans = files.filter(file => file.startsWith('_astro/') && !reachable.has(file));

    const bytesOf = group => group.reduce((sum, file) => {
        try { return sum + fs.statSync(path.join(distDir, file)).size; } catch { return sum; }
    }, 0);

    const composition = {};
    for (const file of files) {
        const top = file.includes('/') ? file.split('/')[0] : '(root)';
        const key = top.startsWith('_astro') || ['blobs', 'images', 'data', 'design'].includes(top) ? top : '(pages)';
        composition[key] = composition[key] ?? {files: 0, bytes: 0};
        composition[key].files += 1;
        try { composition[key].bytes += fs.statSync(path.join(distDir, file)).size; } catch { /* raced */ }
    }

    return {
        files: files.length,
        pages: pages.length,
        reachable: reachable.size,
        violations,
        deadPreviewChunks,
        deadPreviewBytes: bytesOf(deadPreviewChunks),
        orphans,
        orphanBytes: bytesOf(orphans),
        composition
    };
}

function formatMb(bytes) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function main() {
    const args = process.argv.slice(2);
    const prune = args.includes('--prune');
    const asJson = args.includes('--json');
    const positional = args.filter(arg => !arg.startsWith('--'));
    const distDir = path.resolve(ROOT_DIR, positional[0] ?? 'dist');

    if (!fs.existsSync(distDir)) {
        console.error(`check-static-artifact: no artifact at ${distDir}`);
        process.exitCode = 1;
        return;
    }

    const report = analyze(distDir);

    if (prune) {
        for (const dead of report.deadPreviewChunks) {
            fs.rmSync(path.join(distDir, dead), {force: true});
        }
    }

    if (asJson) {
        console.log(JSON.stringify({...report, pruned: prune}, null, 2));
    } else {
        console.log(`check-static-artifact: ${report.pages} pages, ${report.files} files, ${report.reachable} reachable`);
        for (const [group, stats] of Object.entries(report.composition).sort((a, b) => b[1].bytes - a[1].bytes)) {
            console.log(`  ${group.padEnd(10)} ${String(stats.files).padStart(5)} files  ${formatMb(stats.bytes).padStart(10)}`);
        }
        if (report.deadPreviewChunks.length) {
            const verb = prune ? 'pruned' : 'present (pass --prune to remove)';
            console.log(`  dead preview chunks ${verb}: ${report.deadPreviewChunks.length} files / ${formatMb(report.deadPreviewBytes)}`);
            for (const dead of report.deadPreviewChunks) console.log(`    ${dead}`);
        }
        if (report.orphans.length) {
            // Informational: mermaid resolves its diagram chunks by runtime
            // dynamic import, which no static scan can follow. Never pruned.
            console.log(`  _astro not statically referenced: ${report.orphans.length} files / ${formatMb(report.orphanBytes)} (kept — dynamic imports are invisible here)`);
        }
    }

    if (report.violations.length) {
        console.error(`check-static-artifact: ${report.violations.length} page-reachable reference(s) to an SSR-only route:`);
        for (const violation of report.violations) {
            console.error(`  ${violation.file} contains ${violation.needle}`);
        }
        process.exitCode = 1;
        return;
    }
    console.log('check-static-artifact: no page-reachable SSR-only route references.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}

export {analyze, FORBIDDEN};
