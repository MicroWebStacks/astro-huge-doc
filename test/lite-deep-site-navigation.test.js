import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

/*
 * Regression test for the "huge site shows only the README" lock-out: a
 * workspace whose root folders hold only deep markdown (no README.md or
 * folder-named file directly inside each root folder) produced an app bar
 * with just "Home" and a closed menu with just the root README — no clickable
 * path to any of the content. The failing site shape is generated under
 * .cache/bench/ (git-ignored) and navigation is asserted through the same
 * lazy lite backend + layout builders the VS Code extension preview uses.
 */

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const benchRoot = join(engineRoot, '.cache', 'bench', 'site-deep-nav');
const contentDir = join(benchRoot, 'content');

// Half the sections have a folder page deep down, half have no README at all:
// both shapes were unreachable before the fix.
const SECTIONS_WITH_DEEP_README = ['guides', 'ops', 'research'];
const SECTIONS_WITHOUT_README = ['api', 'internals', 'tools'];
const ALL_SECTIONS = [...SECTIONS_WITH_DEEP_README, ...SECTIONS_WITHOUT_README];

function page(title) {
    return `# ${title}\n\nSome deep content for ${title}.\n`;
}

function generateSite() {
    rmSync(benchRoot, {recursive: true, force: true});
    mkdirSync(contentDir, {recursive: true});
    writeFileSync(join(contentDir, 'README.md'), '# Deep site\n\nThe only file at the root.\n');
    for (const section of SECTIONS_WITH_DEEP_README) {
        const dir = join(contentDir, section, 'manual', 'overview');
        mkdirSync(dir, {recursive: true});
        writeFileSync(join(dir, 'README.md'), page(`${section} overview`));
        writeFileSync(join(dir, 'page-0.md'), page(`${section} page 0`));
        writeFileSync(join(dir, 'page-1.md'), page(`${section} page 1`));
    }
    for (const section of SECTIONS_WITHOUT_README) {
        const dir = join(contentDir, section, 'area-0', 'detail');
        mkdirSync(dir, {recursive: true});
        for (let p = 0; p < 3; p++) {
            writeFileSync(join(dir, `page-${p}.md`), page(`${section} page ${p}`));
        }
    }
}

generateSite();

// Same runtime shape the extension gives the engine (extension.js
// createRuntimeEnv): lite profile, json backend, workspace-scoped store.
// Must be set before config.js / structure-db.js are imported.
process.env.DOCS_PROFILE = 'lite';
process.env.DOCS_BACKEND = 'json';
process.env.MICROWEBSTACKS_DOTENV_OVERRIDE = 'false';
process.env.MICROWEBSTACKS_ENGINE_ROOT = engineRoot;
process.env.MICROWEBSTACKS_WORKSPACE_ROOT = benchRoot;
process.env.MICROWEBSTACKS_MANIFEST_PATH = join(benchRoot, 'manifest.yaml');
process.env.MICROWEBSTACKS_DOCS_ROOT = contentDir;
process.env.MICROWEBSTACKS_STORE_PATH = join(benchRoot, 'store');

const {getDocuments} = await import('../src/libs/structure-db.js');
const {buildNavigationMenus, buildSectionMenu} = await import('../src/layout/layout_utils.js');

const docs = getDocuments();
const docUrls = new Set(docs.map((doc) => doc.url));

test('walker finds every deep document', () => {
    const expected = 1 // root README
        + SECTIONS_WITH_DEEP_README.length * 3 // deep folder page + 2 pages
        + SECTIONS_WITHOUT_README.length * 3; // 3 loose deep pages
    assert.equal(docs.length, expected);
});

test('app bar exposes every root folder even without a top-level folder page', () => {
    const {appBarMenu} = buildNavigationMenus('/');
    // Before the fix this menu collapsed to a single "Home" entry.
    assert.equal(appBarMenu[0].link, '/');
    const sectionsInBar = appBarMenu
        .map((item) => item.link.replace(/^\/+/, '').split('/')[0])
        .filter(Boolean);
    assert.deepEqual([...sectionsInBar].sort(), [...ALL_SECTIONS].sort());
});

test('every app bar entry links to an existing document', () => {
    const {appBarMenu} = buildNavigationMenus('/');
    for (const item of appBarMenu) {
        const url = item.link.replace(/^\/+/, '');
        assert.ok(docUrls.has(url), `app bar link ${item.link} must resolve to a document`);
    }
});

test('a section with a deep folder page links to that folder page and keeps the folder label', () => {
    const {appBarMenu} = buildNavigationMenus('/');
    const guides = appBarMenu.find((item) => item.link.startsWith('/guides'));
    assert.ok(guides, 'guides section present in the app bar');
    assert.equal(guides.link, '/guides/manual/overview');
    assert.equal(guides.label, 'Guides');
});

test('following a section link scopes the file-tree menu to that section subtree', () => {
    const {appBarMenu} = buildNavigationMenus('/');
    for (const item of appBarMenu.slice(1)) {
        const section = item.link.replace(/^\/+/, '').split('/')[0];
        const menu = buildSectionMenu(item.link);
        assert.equal(menu.length, 1, `menu for ${item.link} has one scoped root`);
        assert.equal(menu[0].nodeKey, section);
        const flat = JSON.stringify(menu);
        assert.ok(flat.includes('page-0'), `menu for ${section} reaches its deep pages`);
        for (const other of ALL_SECTIONS.filter((name) => name !== section)) {
            assert.ok(!flat.includes(`"${other}`), `menu for ${section} excludes ${other}`);
        }
    }
});

test('home closed menu still lists only loose rendered root files (accepted ruling)', () => {
    const {sectionMenu} = buildNavigationMenus('/');
    assert.deepEqual(sectionMenu.map((entry) => entry.nodeKey), ['README.md']);
});
