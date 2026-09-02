import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

/*
 * Robustness of the lite (VS Code extension) renderer against the files a user
 * hands it: the manifest, and the Markdown itself.
 *
 * The bug this starts from: a workspace with an *empty* `manifest.yaml` at its
 * root. An empty file is legal YAML, so config.js merged it happily - but the
 * built-in default `output.content: content` then pointed the renderer at a
 * `content/` folder that does not exist in a plain docs folder. The extension
 * stops passing MICROWEBSTACKS_DOCS_ROOT as soon as a manifest is present, so
 * nothing corrected it downstream: the walk found zero documents and the home
 * page threw `entry not found for home page` and served a 404.
 *
 * The rule these tests pin down, for the manifest and for every document:
 *
 *   - A file that is *empty of settings* - blank, comments only, all keys
 *     commented out - means "use the defaults". It is never an error.
 *   - A file that is *wrong* (a scalar where a mapping belongs, a list where
 *     an object belongs, a value of the wrong type) is ignored section by
 *     section and the renderer still comes up.
 *   - Only a genuine YAML *syntax* error in the manifest is fatal, because the
 *     manifest decides where and how the renderer runs. It must fail naming
 *     the file and the parser's own message - never as a raw TypeError from
 *     somewhere inside the merge.
 *   - Nothing in a Markdown document is ever fatal. Broken frontmatter, broken
 *     embedded YAML and unterminated fences degrade to rendered text.
 *
 * Every manifest case runs in its own child process: config.js resolves the
 * manifest once at import, so scenarios cannot share a module graph.
 */

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const benchRoot = join(engineRoot, '.cache', 'bench', 'lite-malformed-inputs');
const probePath = join(benchRoot, 'probe.mjs');
const PROBE_MARKER = '@@PROBE@@';

rmSync(benchRoot, {recursive: true, force: true});
mkdirSync(benchRoot, {recursive: true});

/* The lite backend logs its walk to stdout, so the probe's answer is tagged
   and read off the tail rather than assuming stdout holds JSON alone. */
writeFileSync(probePath, `
import {pathToFileURL} from 'node:url';
const engine = pathToFileURL(process.env.PROBE_ENGINE_ROOT + '/');
const {config} = await import(new URL('config.js', engine).href);
const {getEntry} = await import(new URL('src/libs/structure-db.js', engine).href);
const home = await getEntry({url: ''});
process.stdout.write('\\n${PROBE_MARKER}' + JSON.stringify({
    contentPath: config.content_path,
    homeFound: home.found,
    // The first heading identifies *which* README answered; the document
    // title is filename/frontmatter-derived and is pinned elsewhere.
    homeHeading: home.headings[0]?.body_text ?? null,
    homeItems: home.items.length,
    excludePaths: config.html_cache.exclude_paths,
    port: config.server.port,
    krokiServer: config.kroki_server,
    diagramLanguages: config.diagram.languages,
    highlighterTheme: config.highlighter.theme
}));
`);

/* One workspace per case, so a manifest written by one scenario can never be
   read by another. Mirrors what the extension hands the engine: the workspace
   root, a manifest beside the Markdown, and no MICROWEBSTACKS_DOCS_ROOT -
   which is precisely the path the reported crash came down. */
function makeWorkspace(name, {manifest, files = {'README.md': '# Home\n\nWelcome.\n'}} = {}) {
    const workspace = join(benchRoot, name);
    rmSync(workspace, {recursive: true, force: true});
    mkdirSync(workspace, {recursive: true});
    for (const [relPath, content] of Object.entries(files)) {
        const abs = join(workspace, relPath);
        mkdirSync(dirname(abs), {recursive: true});
        writeFileSync(abs, content);
    }
    if (manifest !== undefined) {
        writeFileSync(join(workspace, 'manifest.yaml'), manifest);
    }
    return workspace;
}

function liteEnv(workspace) {
    const env = {
        ...process.env,
        PROBE_ENGINE_ROOT: engineRoot,
        DOCS_PROFILE: 'lite',
        DOCS_BACKEND: 'json',
        MICROWEBSTACKS_EXTENSION_MODE: 'true',
        MICROWEBSTACKS_DOTENV_OVERRIDE: 'false',
        MICROWEBSTACKS_ENGINE_ROOT: engineRoot,
        MICROWEBSTACKS_WORKSPACE_ROOT: workspace,
        MICROWEBSTACKS_STORE_PATH: join(workspace, 'store')
    };
    // The extension passes no MICROWEBSTACKS_DOCS_ROOT when a manifest exists;
    // a developer's own shell must not smuggle either variable in.
    delete env.MICROWEBSTACKS_DOCS_ROOT;
    delete env.MICROWEBSTACKS_MANIFEST_PATH;
    return env;
}

function readProbeResult(stdout) {
    const marker = stdout.lastIndexOf(PROBE_MARKER);
    assert.notEqual(marker, -1, `probe produced no result:\n${stdout}`);
    return JSON.parse(stdout.slice(marker + PROBE_MARKER.length));
}

function runProbe(workspace) {
    try {
        const stdout = execFileSync(process.execPath, [probePath], {
            env: liteEnv(workspace),
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
        });
        return {ok: true, ...readProbeResult(stdout)};
    } catch (error) {
        return {ok: false, stderr: String(error.stderr ?? ''), stdout: String(error.stdout ?? '')};
    }
}

/* ------------------------------------------------------------------ *
 * The reported crash: an empty manifest in a plain docs folder.
 * ------------------------------------------------------------------ */

test('an empty manifest.yaml still renders the folder it sits in', () => {
    const workspace = makeWorkspace('empty-manifest', {manifest: ''});
    const probe = runProbe(workspace);
    assert.ok(probe.ok, `config load failed:\n${probe.stderr}`);
    // Before the fix this was <workspace>/content, which does not exist.
    assert.equal(probe.contentPath, workspace);
    assert.equal(probe.homeFound, true, 'the home entry must resolve - this is the reported 404');
    assert.ok(probe.homeItems > 0, 'and it must carry the document body, not an empty shell');
});

test('a manifest empty of settings reads as "use the defaults", never as an error', () => {
    const blank = {
        'comments-only': '# nothing configured yet\n# output:\n#   content: docs\n',
        'whitespace-only': '   \n\n \n',
        'explicit-null': 'null\n',
        'yaml-tilde': '~\n',
        'document-marker-only': '---\n'
    };
    for (const [name, manifest] of Object.entries(blank)) {
        const workspace = makeWorkspace(`blank-${name}`, {manifest});
        const probe = runProbe(workspace);
        assert.ok(probe.ok, `${name} was rejected:\n${probe.stderr}`);
        assert.equal(probe.contentPath, workspace, `${name} docs root`);
        assert.equal(probe.homeFound, true, `${name} home page`);
        // The defaults must survive intact, not be half-merged into nothing.
        assert.equal(probe.port, 4321, `${name} default port`);
        assert.equal(probe.diagramLanguages.mermaid, 'client', `${name} default renderers`);
        assert.deepEqual(probe.excludePaths, ['/blobs/', '.well-known/', '/__lite/'], `${name} default cache rules`);
    }
});

test('a manifest that configures something other than the docs root keeps the workspace root', () => {
    const workspace = makeWorkspace('server-only-manifest', {manifest: 'server:\n  port: 9876\n'});
    const probe = runProbe(workspace);
    assert.ok(probe.ok, `config load failed:\n${probe.stderr}`);
    assert.equal(probe.contentPath, workspace);
    assert.equal(probe.homeFound, true);
    assert.equal(probe.port, 9876, 'what the manifest does say is still honoured');
});

test('a declared docs root always wins, existing or not', () => {
    const declared = makeWorkspace('declared-docs-root', {
        manifest: 'render:\n  folder: docs\n',
        files: {'docs/README.md': '# Docs Home\n'}
    });
    const probe = runProbe(declared);
    assert.ok(probe.ok, `config load failed:\n${probe.stderr}`);
    assert.equal(probe.contentPath, join(declared, 'docs'));
    assert.equal(probe.homeHeading, 'Docs Home', 'the declared folder is the one being served');

    // An explicit declaration is a statement of intent: it is not second-guessed
    // just because the folder is missing, or the author would never see the typo.
    const missing = makeWorkspace('declared-missing-docs-root', {manifest: 'output:\n  content: typo-folder\n'});
    const missingProbe = runProbe(missing);
    assert.ok(missingProbe.ok, `config load failed:\n${missingProbe.stderr}`);
    assert.equal(missingProbe.contentPath, join(missing, 'typo-folder'));
});

test('the conventional content/ folder is still used when it exists', () => {
    const workspace = makeWorkspace('conventional-content', {
        manifest: '',
        files: {'content/README.md': '# Content Home\n', 'README.md': '# Repo Readme\n'}
    });
    const probe = runProbe(workspace);
    assert.ok(probe.ok, `config load failed:\n${probe.stderr}`);
    assert.equal(probe.contentPath, join(workspace, 'content'));
    assert.equal(probe.homeHeading, 'Content Home', 'content/ wins over the repo README beside it');
});

/* ------------------------------------------------------------------ *
 * Manifests that parse but are structurally wrong.
 * ------------------------------------------------------------------ */

test('a manifest that is not a mapping is ignored, not fatal', () => {
    const wrongShape = {
        'top-level-scalar': 'just some text\n',
        'top-level-number': '42\n',
        'top-level-list': '- content\n- dataset\n'
    };
    for (const [name, manifest] of Object.entries(wrongShape)) {
        const workspace = makeWorkspace(`shape-${name}`, {manifest});
        const probe = runProbe(workspace);
        assert.ok(probe.ok, `${name} was fatal:\n${probe.stderr}`);
        assert.equal(probe.contentPath, workspace, `${name} docs root`);
        assert.equal(probe.homeFound, true, `${name} home page`);
        assert.equal(probe.port, 4321, `${name} defaults`);
    }
});

test('a section of the wrong type falls back to that section defaults, leaving the rest alone', () => {
    const workspace = makeWorkspace('wrong-section-types', {
        manifest: [
            'output: nope',             // scalar where a mapping belongs
            'diagram:',                 // dangling key: reads as null
            'collect:',
            '  - not-a-mapping',        // list where a mapping belongs
            'render:',
            '  highlighter: dark-plus', // scalar where a mapping belongs
            'server:',
            '  port: 8123'              // the one good section must survive
        ].join('\n') + '\n'
    });
    const probe = runProbe(workspace);
    assert.ok(probe.ok, `config load failed:\n${probe.stderr}`);
    assert.equal(probe.contentPath, workspace);
    assert.equal(probe.homeFound, true);
    assert.equal(probe.port, 8123, 'a broken section must not discard a good one');
    assert.equal(probe.diagramLanguages.mermaid, 'client', 'diagram defaults intact');
    assert.equal(probe.highlighterTheme, 'dark-plus', 'highlighter defaults intact');
    assert.ok(probe.krokiServer, 'kroki server still resolves through the broken diagram section');
});

test('a single-string list value is read as a one-item list, not as characters', () => {
    const workspace = makeWorkspace('scalar-list-value', {
        manifest: 'html_cache:\n  exclude_paths: /blobs/\n'
    });
    const probe = runProbe(workspace);
    assert.ok(probe.ok, `config load failed:\n${probe.stderr}`);
    assert.deepEqual(probe.excludePaths, ['/blobs/']);
});

/* ------------------------------------------------------------------ *
 * Manifests that are genuinely broken YAML: fatal, but legibly so.
 * ------------------------------------------------------------------ */

test('a syntactically broken manifest fails naming the file and the parse error', () => {
    const broken = {
        'bad-indentation': 'output:\n  content: content\n bad: value\n',
        'unclosed-flow-sequence': 'collect:\n  file_link_ext: [svg, png\n',
        'unclosed-quote': 'render:\n  folder: "content\n',
        'tab-indentation': 'server:\n\tport: 4321\n',
        'duplicate-key': 'server:\n  port: 1\n  port: 2\n',
        'unknown-tag': 'output: !!js/function "function(){}"\n'
    };
    for (const [name, manifest] of Object.entries(broken)) {
        const workspace = makeWorkspace(`broken-${name}`, {manifest});
        const probe = runProbe(workspace);
        assert.equal(probe.ok, false, `${name} should not have loaded`);
        assert.match(probe.stderr, /invalid YAML in manifest/, `${name} says what went wrong`);
        assert.ok(probe.stderr.includes('manifest.yaml'), `${name} names the file`);
        // The failure must come from the YAML parser, not from the merge
        // tripping over whatever the parser handed back.
        assert.doesNotMatch(
            probe.stderr,
            /Cannot read properties|is not a function|undefined is not/,
            `${name} is a parse error, not a crash`
        );
    }
});

/* ------------------------------------------------------------------ *
 * Markdown: nothing an author writes in a document may take a page down.
 * ------------------------------------------------------------------ */

const HOSTILE_DOCS = {
    // Frontmatter that does not parse at all.
    'broken-frontmatter.md': '---\ntitle: [unclosed\nsummary: "also broken\n---\n\n# Broken Frontmatter\n\nBody survives.\n',
    // Frontmatter indented with a tab, which YAML forbids.
    'tab-frontmatter.md': '---\nmeta:\n\ttitle: Tabbed\n---\n\n# Tab Frontmatter\n\nBody survives.\n',
    // Frontmatter that parses, but to a list rather than a mapping.
    'list-frontmatter.md': '---\n- one\n- two\n---\n\n# List Frontmatter\n\nBody survives.\n',
    // Frontmatter that parses to a bare scalar.
    'scalar-frontmatter.md': '---\njust a string\n---\n\n# Scalar Frontmatter\n\nBody survives.\n',
    // A duplicated key: js-yaml rejects the whole block.
    'duplicate-key-frontmatter.md': '---\ntitle: One\ntitle: Two\n---\n\n# Duplicate Key\n\nBody survives.\n',
    // An opening delimiter that never closes: a horizontal rule, not metadata.
    'unterminated-frontmatter.md': '---\ntitle: Never Closed\n\n# Unterminated\n\nBody survives.\n',
    // Embedded YAML blocks the renderer parses itself.
    'broken-cards.md': '# Broken Cards\n\n```yaml cards\n- uid: [unclosed\n  title: nope\n```\n\nBody survives.\n',
    'cards-not-a-list.md': '# Cards Not A List\n\n```yaml cards\nuid: single-mapping\n```\n\nBody survives.\n',
    'broken-model.md': '# Broken Model\n\n```yaml model\nsrc: "unclosed\n```\n\nBody survives.\n',
    'broken-gallery.md': '# Broken Gallery\n\n```yaml gallery\n- image: [unclosed\n```\n\nBody survives.\n',
    // Structural damage to the Markdown itself.
    'unterminated-fence.md': '# Unterminated Fence\n\n```js\nconst never = "closed";\n',
    'unterminated-table.md': '# Unterminated Table\n\n| a | b\n|---\n| 1 |\n',
    'lone-delimiters.md': '# Lone Delimiters\n\n:::\n\n::: unknown-directive\n\n> [!\n',
    // A file with nothing in it at all.
    'empty.md': ''
};

test('no malformed document can take a page down', () => {
    const workspace = makeWorkspace('hostile-docs', {
        manifest: '',
        files: {'README.md': '# Home\n\nWelcome.\n', ...HOSTILE_DOCS}
    });
    // One process renders every page, the way a preview session would.
    const walkerPath = join(benchRoot, 'walk-docs.mjs');
    writeFileSync(walkerPath, `
import {pathToFileURL} from 'node:url';
const engine = pathToFileURL(process.env.PROBE_ENGINE_ROOT + '/');
await import(new URL('config.js', engine).href);
const {getDocuments, getEntry} = await import(new URL('src/libs/structure-db.js', engine).href);
const results = [];
for (const doc of getDocuments()) {
    try {
        const entry = await getEntry({url: doc.url});
        results.push({url: doc.url, found: entry.found, items: entry.items.length, error: null});
    } catch (error) {
        results.push({url: doc.url, found: false, items: 0, error: String(error && error.message)});
    }
}
process.stdout.write('\\n${PROBE_MARKER}' + JSON.stringify(results));
`);
    const stdout = execFileSync(process.execPath, [walkerPath], {
        env: liteEnv(workspace),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const results = readProbeResult(stdout);

    const byUrl = new Map(results.map((row) => [row.url, row]));
    // The walk must see every hostile file: a document that cannot be listed
    // is as invisible to the reader as one that throws.
    for (const name of Object.keys(HOSTILE_DOCS)) {
        const url = name.replace(/\.md$/, '');
        const row = byUrl.get(url);
        assert.ok(row, `${name} is listed in the file tree`);
        assert.equal(row.error, null, `${name} rendered without throwing`);
        assert.equal(row.found, true, `${name} resolved to an entry`);
    }
    // The body of a document with broken metadata still reaches the page.
    for (const name of ['broken-frontmatter.md', 'tab-frontmatter.md', 'duplicate-key-frontmatter.md', 'broken-cards.md']) {
        assert.ok(byUrl.get(name.replace(/\.md$/, '')).items > 0, `${name} kept its body`);
    }
});
