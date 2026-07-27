import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdirSync, rmSync, utimesSync, writeFileSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

/*
 * The lite (VS Code extension) profile used to label the file-tree menu with
 * filename slugs — "c3-devkit-m1", "esp32" — where the reference site shows
 * the authored titles, and it ignored the frontmatter `order` that the
 * reference sorts siblings by. The walk now reads the head of each markdown
 * file for both, and uses them as *display data only*.
 *
 * The invariant these tests protect: title and order change what the menu says
 * and in what sequence, and nothing else. url, uid, slug and level stay
 * filename-derived, so editing either can never move a page.
 */

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const benchRoot = join(engineRoot, '.cache', 'bench', 'site-menu-labels');
const contentDir = join(benchRoot, 'content');

const PAGES = {
    // [file, frontmatter, expected label]
    'plain.md': ['---\ntitle: Wall Display\n---\n', 'Wall Display'],
    // Real content writes `title : x`; YAML reads it as the same key.
    'spaced-key.md': ['---\ntitle : 3D Printing\n---\n', '3D Printing'],
    // A colon inside the value forces quoting; the quotes must not survive.
    'quoted.md': ['---\ntitle: "Deep: Dive"\n---\n', 'Deep: Dive'],
    'single-quoted.md': ["---\ntitle: 'It''s Here'\n---\n", "It's Here"],
    'commented.md': ['---\ntitle: Round Display # keep\n---\n', 'Round Display'],
    // Falls back to the filename: no frontmatter at all.
    'bare-file.md': ['', 'bare-file'],
    // Falls back to the filename: frontmatter without a title.
    'no-title.md': ['---\norder: 3\n---\n', 'no-title'],
    // Falls back to the filename: `title` nested under another key is not the
    // document title, so only a column-0 key may match.
    'nested-title.md': ['---\nmeta:\n  title: Nested\n---\n', 'nested-title'],
    // Falls back to the filename: a block scalar needs a real YAML parse.
    'block-scalar.md': ['---\ntitle: |\n  Multi\n  Line\n---\n', 'block-scalar'],
    // Falls back to the filename: an opening `---` with no closing delimiter is
    // a horizontal rule, not frontmatter — gray-matter reads it the same way.
    'rule-not-frontmatter.md': ['---\n\ntitle: Not Frontmatter\n', 'rule-not-frontmatter']
};

/* A second section for the sibling-order rule: `order` pins ascending, and
 * whatever the author left unpinned follows, A→Z by label. Titles here are
 * deliberately anti-correlated with both the filenames and the order values, so
 * a pass cannot come from alphabetical or walk-position luck. */
const RANKED = {
    'zulu.md': ['---\ntitle: Zulu\norder: 1\n---\n'],
    'alpha.md': ['---\ntitle: Alpha\norder: 2\n---\n'],
    // 10 must beat 2 numerically; a string sort would put it first.
    'bravo.md': ['---\ntitle: Bravo\norder: 10\n---\n'],
    'mike.md': ['---\ntitle: Mike\n---\n'],
    'delta.md': ['---\ntitle: Delta\n---\n'],
    // Non-numeric order is not an order: the entry is unpinned, not sorted on
    // garbage.
    'echo.md': ['---\ntitle: Echo\norder: soon\n---\n']
};
const RANKED_EXPECTED = ['Zulu', 'Alpha', 'Bravo', 'Delta', 'Echo', 'Mike'];

function generateSite() {
    rmSync(benchRoot, {recursive: true, force: true});
    mkdirSync(join(contentDir, 'boards'), {recursive: true});
    mkdirSync(join(contentDir, 'ranked'), {recursive: true});
    writeFileSync(join(contentDir, 'README.md'), '---\ntitle: Home Page\n---\n\nRoot.\n');
    // Folder page: its title labels the *directory* node in the tree.
    writeFileSync(join(contentDir, 'boards', 'README.md'), '---\ntitle: ESP32 Boards\n---\n\nSection.\n');
    for (const [name, [frontmatter]] of Object.entries(PAGES)) {
        writeFileSync(join(contentDir, 'boards', name), `${frontmatter}\n# Body\n`);
    }
    // Pinned section: sorts ahead of the unpinned "boards" in the app bar.
    writeFileSync(join(contentDir, 'ranked', 'README.md'), '---\ntitle: Ranked\norder: 1\n---\n\nSection.\n');
    for (const [name, [frontmatter]] of Object.entries(RANKED)) {
        writeFileSync(join(contentDir, 'ranked', name), `${frontmatter}\n# Body\n`);
    }
}

generateSite();

// Same runtime shape the extension gives the engine, as in
// lite-deep-site-navigation.test.js. Must be set before config.js /
// structure-db.js are imported.
process.env.DOCS_PROFILE = 'lite';
process.env.DOCS_BACKEND = 'json';
process.env.MICROWEBSTACKS_DOTENV_OVERRIDE = 'false';
process.env.MICROWEBSTACKS_ENGINE_ROOT = engineRoot;
process.env.MICROWEBSTACKS_WORKSPACE_ROOT = benchRoot;
process.env.MICROWEBSTACKS_MANIFEST_PATH = join(benchRoot, 'manifest.yaml');
process.env.MICROWEBSTACKS_DOCS_ROOT = contentDir;
process.env.MICROWEBSTACKS_STORE_PATH = join(benchRoot, 'store');

const {config} = await import('../config.js');
const {getDocuments, getSourceEntries} = await import('../src/libs/structure-db.js');
const {buildNavigationMenus, buildSectionMenu} = await import('../src/layout/layout_utils.js');

function flatten(nodes, out = []) {
    for (const node of nodes ?? []) {
        out.push(node);
        flatten(node.items, out);
    }
    return out;
}

function boardsMenuByLink() {
    const menu = flatten(buildSectionMenu('/boards'));
    return new Map(menu.filter((node) => node.link).map((node) => [node.link, node]));
}

test('menu labels come from the frontmatter title, in every single-line YAML form', () => {
    const byLink = boardsMenuByLink();
    for (const [name, [, expected]] of Object.entries(PAGES)) {
        const link = `/boards/${name.replace(/\.md$/, '')}`;
        const node = byLink.get(link);
        assert.ok(node, `${link} present in the boards menu`);
        assert.equal(node.label, expected, `label for ${name}`);
    }
});

test('a folder page title labels its directory node', () => {
    const boards = buildSectionMenu('/boards')[0];
    assert.equal(boards.label, 'ESP32 Boards');
    assert.equal(boards.link, '/boards', 'the directory still routes by folder name');
});

test('titles never reach the url — routes stay filename-derived', () => {
    const urls = new Set(getDocuments().map((doc) => doc.url));
    for (const name of Object.keys(PAGES)) {
        assert.ok(urls.has(`boards/${name.replace(/\.md$/, '')}`), `url for ${name}`);
    }
    assert.ok(urls.has('boards'), 'folder page keeps the folder url');
    assert.ok(urls.has(''), 'root folder page keeps the root url');
    // "Deep: Dive", "3D Printing" and "Home Page" must leave no trace here.
    for (const url of urls) {
        assert.ok(!/[A-Z\s:]/.test(url), `url ${JSON.stringify(url)} is filename-derived`);
    }
});

test('the app bar labels the section with its folder page title', () => {
    const {appBarMenu} = buildNavigationMenus('/boards');
    const boards = appBarMenu.find((item) => item.link === '/boards');
    assert.ok(boards, 'boards section present in the app bar');
    assert.equal(boards.label, 'ESP32 Boards');
});

test('siblings sort by frontmatter order, then unpinned entries A-Z', () => {
    const labels = flatten(buildSectionMenu('/ranked'))
        .filter((node) => node.link && node.link !== '/ranked')
        .map((node) => node.label);
    assert.deepEqual(labels, RANKED_EXPECTED);
});

test('the app bar puts pinned sections ahead of unpinned ones', () => {
    const {appBarMenu} = buildNavigationMenus('/');
    // Home always leads; "Ranked" carries order 1, "ESP32 Boards" carries none.
    assert.deepEqual(appBarMenu.map((item) => item.label), ['Home Page', 'Ranked', 'ESP32 Boards']);
});

test('order never reaches the url either', () => {
    const byUrl = new Map(getDocuments().map((doc) => [doc.url, doc]));
    for (const name of Object.keys(RANKED)) {
        assert.ok(byUrl.has(`ranked/${name.replace(/\.md$/, '')}`), `url for ${name}`);
    }
    // `order: 10` on bravo.md must not have renamed, renumbered or moved it.
    assert.equal(byUrl.get('ranked/bravo').title, 'Bravo');
    assert.equal(byUrl.get('ranked/bravo').sort_order, 10);
    assert.equal(byUrl.get('ranked/mike').sort_order, null, 'unpinned stays null, not 0');
});

test('an edited title is picked up on the next walk (cache keys on size + mtime)', () => {
    const target = join(contentDir, 'boards', 'plain.md');
    writeFileSync(target, '---\ntitle: Wall Display v2\n---\n\n# Body\n');
    // Give the file an unambiguously newer mtime: two writes inside the same
    // millisecond would otherwise be indistinguishable to the title cache.
    const future = new Date(Date.now() + 5000);
    utimesSync(target, future, future);
    // Only a tree.stamp bump re-walks; content edits alone never do.
    mkdirSync(config.collect.json_dir, {recursive: true});
    writeFileSync(join(config.collect.json_dir, 'tree.stamp'), String(Date.now()));
    utimesSync(join(config.collect.json_dir, 'tree.stamp'), future, future);

    const entry = getSourceEntries().find((row) => row.path === 'boards/plain.md');
    assert.equal(entry.document_title, 'Wall Display v2');
    assert.equal(entry.document_url, 'boards/plain', 'the url did not move with the title');
});
