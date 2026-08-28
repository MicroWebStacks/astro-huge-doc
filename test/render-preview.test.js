import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { BuildError } from '../src/libs/render-build.js';
import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  browsableHost,
  closeServer,
  createPreviewServer,
  listen,
  mimeTypeFor,
  openBrowser,
  parsePreviewArgs,
  resolvePreviewDocsRoot,
  resolveRequestPath,
  resolveStaticFile,
  runPreviewCommand
} from '../src/libs/render-preview.js';

function makeArtifact() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'md-render-artifact-'));
  writeFileSync(path.join(root, 'index.html'), '<html>home</html>');
  writeFileSync(path.join(root, '404.html'), '<html>missing</html>');
  mkdirSync(path.join(root, 'guide'), { recursive: true });
  writeFileSync(path.join(root, 'guide', 'index.html'), '<html>guide</html>');
  mkdirSync(path.join(root, '_astro'), { recursive: true });
  writeFileSync(path.join(root, '_astro', 'app.js'), 'export const a = 1;');
  writeFileSync(path.join(root, '_astro', 'app.css'), 'body{}');
  mkdirSync(path.join(root, 'blobs'), { recursive: true });
  writeFileSync(path.join(root, 'blobs', 'abc123def456.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(path.join(root, 'diagram.svg'), '<svg></svg>');
  return root;
}

// fetch() normalizes ".." out of a URL before it ever reaches the wire, so
// proving the server itself rejects traversal needs a raw request.
function rawRequest(port, rawPath) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, DEFAULT_HOST, () => {
      socket.write(`GET ${rawPath} HTTP/1.1\r\nHost: ${DEFAULT_HOST}\r\nConnection: close\r\n\r\n`);
    });
    let data = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      data += chunk;
    });
    socket.on('end', () => resolve(data));
    socket.on('error', reject);
  });
}

// Starts the real server on an ephemeral port so tests never collide with a
// developer's own 4321.
async function withServer(rootDir, run) {
  const server = createPreviewServer(rootDir);
  await listen(server, { host: DEFAULT_HOST, port: 0 });
  const { port } = server.address();
  try {
    return await run(`http://${DEFAULT_HOST}:${port}`, port);
  } finally {
    await closeServer(server);
  }
}

test('parsePreviewArgs defaults the workspace to the current directory', () => {
  assert.deepEqual(parsePreviewArgs([]), {
    workspace: '.',
    docsRoot: null,
    manifest: null,
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    open: true,
    keep: false
  });
});

test('parsePreviewArgs accepts a positional workspace', () => {
  assert.equal(parsePreviewArgs(['.']).workspace, '.');
  assert.equal(parsePreviewArgs(['./docs']).workspace, './docs');
});

test('parsePreviewArgs reads every documented flag', () => {
  const args = parsePreviewArgs([
    './docs',
    '--docs-root', 'content',
    '--manifest', 'manifest.yaml',
    '--host', '0.0.0.0',
    '--port', '9000',
    '--no-open',
    '--keep'
  ]);
  assert.deepEqual(args, {
    workspace: './docs',
    docsRoot: 'content',
    manifest: 'manifest.yaml',
    host: '0.0.0.0',
    port: 9000,
    open: false,
    keep: true
  });
});

test('parsePreviewArgs treats --open as the default and --no-open as the override', () => {
  assert.equal(parsePreviewArgs(['--open']).open, true);
  assert.equal(parsePreviewArgs(['--no-open']).open, false);
  assert.equal(parsePreviewArgs(['--no-open', '--open']).open, true);
});

test('parsePreviewArgs rejects unknown flags, missing values and extra positionals', () => {
  assert.throws(() => parsePreviewArgs(['--bogus', 'x']), (error) => error instanceof BuildError && error.category === 'invalid_configuration');
  assert.throws(() => parsePreviewArgs(['--port', '--keep']), BuildError);
  assert.throws(() => parsePreviewArgs(['.', 'extra']), BuildError);
});

test('parsePreviewArgs rejects a non-numeric or out-of-range port and keeps 0 as "any free port"', () => {
  assert.throws(() => parsePreviewArgs(['--port', 'abc']), (error) => error instanceof BuildError && error.category === 'invalid_configuration');
  assert.throws(() => parsePreviewArgs(['--port', '-1']), BuildError);
  assert.throws(() => parsePreviewArgs(['--port', '70000']), BuildError);
  assert.equal(parsePreviewArgs(['--port', '9000']).port, 9000);
  assert.equal(parsePreviewArgs(['--port', '0']).port, 0);
});

test('resolvePreviewDocsRoot uses the workspace root for a bare folder', () => {
  const workspace = mkdtempSync(path.join(os.tmpdir(), 'md-render-bare-'));
  writeFileSync(path.join(workspace, 'README.md'), '# Notes\n');
  try {
    assert.equal(resolvePreviewDocsRoot({ workspaceAbs: workspace }), '.');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('resolvePreviewDocsRoot lets --docs-root win over everything', () => {
  const workspace = mkdtempSync(path.join(os.tmpdir(), 'md-render-cli-root-'));
  try {
    writeFileSync(path.join(workspace, 'manifest.yaml'), 'render:\n  folder: content\n');
    assert.equal(resolvePreviewDocsRoot({ workspaceAbs: workspace, docsRootArg: 'notes' }), 'notes');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('resolvePreviewDocsRoot defers to a manifest whose content root exists', () => {
  const workspace = mkdtempSync(path.join(os.tmpdir(), 'md-render-manifest-'));
  try {
    writeFileSync(path.join(workspace, 'manifest.yaml'), 'render:\n  folder: content\n');
    mkdirSync(path.join(workspace, 'content'), { recursive: true });
    writeFileSync(path.join(workspace, 'content', 'index.md'), '# Doc\n');
    assert.equal(resolvePreviewDocsRoot({ workspaceAbs: workspace }), undefined);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('resolvePreviewDocsRoot falls back when a manifest points at a missing directory', () => {
  const workspace = mkdtempSync(path.join(os.tmpdir(), 'md-render-manifest-gone-'));
  const logged = [];
  try {
    writeFileSync(path.join(workspace, 'manifest.yaml'), 'render:\n  folder: nowhere\n');
    writeFileSync(path.join(workspace, 'README.md'), '# Notes\n');
    assert.equal(resolvePreviewDocsRoot({ workspaceAbs: workspace, log: (m) => logged.push(m) }), '.');
    assert.match(logged.join('\n'), /previewing the workspace root/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('resolveRequestPath rejects traversal, absolute and NUL-byte paths', () => {
  const root = path.resolve('/srv/site');
  assert.equal(resolveRequestPath(root, '/../secret'), null);
  assert.equal(resolveRequestPath(root, '/%2e%2e/%2e%2e/secret'), null);
  assert.equal(resolveRequestPath(root, '/a/%00b'), null);
  assert.equal(resolveRequestPath(root, '/%zz'), null);
  assert.equal(resolveRequestPath(root, '/index.html'), path.join(root, 'index.html'));
  assert.equal(resolveRequestPath(root, '/guide/?x=1#y'), path.join(root, 'guide'));
});

test('resolveStaticFile resolves index, nested routes, implicit .html and 404', () => {
  const root = makeArtifact();
  try {
    assert.equal(resolveStaticFile(root, '/').filePath, path.join(root, 'index.html'));
    assert.equal(resolveStaticFile(root, '/guide/').filePath, path.join(root, 'guide', 'index.html'));
    assert.equal(resolveStaticFile(root, '/guide').filePath, path.join(root, 'guide', 'index.html'));
    assert.equal(resolveStaticFile(root, '/404').filePath, path.join(root, '404.html'));
    assert.equal(resolveStaticFile(root, '/nope/').status, 404);
    assert.equal(resolveStaticFile(root, '/../escape').status, 403);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('mimeTypeFor covers the types the full client bundle needs', () => {
  assert.equal(mimeTypeFor('/a/index.html'), 'text/html; charset=utf-8');
  assert.equal(mimeTypeFor('/_astro/app.js'), 'text/javascript; charset=utf-8');
  assert.equal(mimeTypeFor('/_astro/app.css'), 'text/css; charset=utf-8');
  assert.equal(mimeTypeFor('/blobs/abc.png'), 'image/png');
  assert.equal(mimeTypeFor('/d.svg'), 'image/svg+xml');
  assert.equal(mimeTypeFor('/f.woff2'), 'font/woff2');
  assert.equal(mimeTypeFor('/unknown.bin'), 'application/octet-stream');
});

test('the preview server serves pages, assets and blobs, and refuses to escape its root', async () => {
  const root = makeArtifact();
  try {
    await withServer(root, async (origin, port) => {
      const home = await fetch(`${origin}/`);
      assert.equal(home.status, 200);
      assert.equal(home.headers.get('content-type'), 'text/html; charset=utf-8');
      assert.match(await home.text(), /home/);

      const nested = await fetch(`${origin}/guide/`);
      assert.equal(nested.status, 200);
      assert.match(await nested.text(), /guide/);

      const script = await fetch(`${origin}/_astro/app.js`);
      assert.equal(script.status, 200);
      assert.equal(script.headers.get('content-type'), 'text/javascript; charset=utf-8');

      const style = await fetch(`${origin}/_astro/app.css`);
      assert.equal(style.headers.get('content-type'), 'text/css; charset=utf-8');

      const svg = await fetch(`${origin}/diagram.svg`);
      assert.equal(svg.headers.get('content-type'), 'image/svg+xml');

      const blob = await fetch(`${origin}/blobs/abc123def456.png`);
      assert.equal(blob.status, 200);
      assert.equal(blob.headers.get('content-type'), 'image/png');

      const missing = await fetch(`${origin}/does-not-exist/`);
      assert.equal(missing.status, 404);
      assert.match(await missing.text(), /missing/);

      const traversal = await rawRequest(port, '/../../etc/passwd');
      assert.match(traversal, /^HTTP\/1\.1 403/);
      const encodedTraversal = await rawRequest(port, '/%2e%2e/%2e%2e/etc/passwd');
      assert.match(encodedTraversal, /^HTTP\/1\.1 403/);

      const post = await fetch(`${origin}/`, { method: 'POST' });
      assert.equal(post.status, 405);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('listen reports an occupied port as port_in_use', async () => {
  const root = makeArtifact();
  const first = createPreviewServer(root);
  await listen(first, { host: DEFAULT_HOST, port: 0 });
  const { port } = first.address();
  const second = createPreviewServer(root);
  try {
    await assert.rejects(
      listen(second, { host: DEFAULT_HOST, port }),
      (error) => error instanceof BuildError && error.category === 'port_in_use'
    );
  } finally {
    await closeServer(first);
    rmSync(root, { recursive: true, force: true });
  }
});

test('browsableHost turns a wildcard bind into something a browser can open', () => {
  assert.equal(browsableHost('0.0.0.0'), '127.0.0.1');
  assert.equal(browsableHost('::'), '[::1]');
  assert.equal(browsableHost('127.0.0.1'), '127.0.0.1');
  assert.equal(browsableHost('localhost'), 'localhost');
});

test('openBrowser picks the platform launcher and survives a missing one', () => {
  const calls = [];
  const spawnFn = (command, args) => {
    calls.push([command, args]);
    return { on() {}, unref() {} };
  };
  openBrowser('http://127.0.0.1:4321/', { platform: 'win32', spawnFn });
  openBrowser('http://127.0.0.1:4321/', { platform: 'darwin', spawnFn });
  openBrowser('http://127.0.0.1:4321/', { platform: 'linux', spawnFn });
  assert.deepEqual(calls.map(([command]) => command), ['cmd', 'open', 'xdg-open']);

  const logged = [];
  const throwing = () => {
    throw new Error('no launcher');
  };
  assert.equal(openBrowser('http://x/', { platform: 'linux', spawnFn: throwing, log: (m) => logged.push(m) }), false);
  assert.match(logged.join('\n'), /could not open a browser/);
});

test('runPreviewCommand builds, serves and cleans up its temp root on shutdown', async () => {
  const workspace = mkdtempSync(path.join(os.tmpdir(), 'md-render-ws-'));
  writeFileSync(path.join(workspace, 'README.md'), '# Notes\n');
  const tmpBefore = new Set(readdirSync(os.tmpdir()).filter((name) => name.startsWith('md-render-preview-')));

  const fakeSteps = [
    {
      name: 'fake-astro-build',
      run: ({ env }) => {
        mkdirSync(env.MICROWEBSTACKS_OUTDIR, { recursive: true });
        writeFileSync(path.join(env.MICROWEBSTACKS_OUTDIR, 'index.html'), '<html>preview</html>');
      }
    }
  ];

  let shutdown;
  const waitForShutdown = () => new Promise((resolve) => {
    shutdown = resolve;
  });
  const opened = [];
  const logged = [];

  const pending = runPreviewCommand(['--port', '0', '--host', DEFAULT_HOST], {
    steps: fakeSteps,
    log: (message) => logged.push(message),
    openBrowser: (url) => opened.push(url),
    waitForShutdown
  });

  // The workspace itself is the content root, so no manifest is needed.
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.match(logged.join('\n'), /building full site/);
  assert.equal(opened.length, 1, 'the browser should be opened by default');

  shutdown();
  const result = await pending;

  assert.equal(existsSync(result.buildRoot), false, 'the temp build root must be removed on shutdown');
  const tmpAfter = readdirSync(os.tmpdir()).filter((name) => name.startsWith('md-render-preview-'));
  for (const name of tmpAfter) {
    assert.ok(tmpBefore.has(name), `leftover preview temp dir: ${name}`);
  }
  assert.equal(existsSync(path.join(workspace, 'dist')), false, 'nothing may be written into the workspace');
  assert.deepEqual(readdirSync(workspace), ['README.md']);

  rmSync(workspace, { recursive: true, force: true });
});

test('runPreviewCommand honours --no-open and --keep', async () => {
  const workspace = mkdtempSync(path.join(os.tmpdir(), 'md-render-keep-'));
  writeFileSync(path.join(workspace, 'README.md'), '# Notes\n');

  const fakeSteps = [
    {
      name: 'fake-astro-build',
      run: ({ env }) => {
        mkdirSync(env.MICROWEBSTACKS_OUTDIR, { recursive: true });
        writeFileSync(path.join(env.MICROWEBSTACKS_OUTDIR, 'index.html'), '<html>kept</html>');
      }
    }
  ];

  let shutdown;
  const opened = [];
  const pending = runPreviewCommand([workspace, '--port', '0', '--no-open', '--keep'], {
    steps: fakeSteps,
    openBrowser: (url) => opened.push(url),
    waitForShutdown: () => new Promise((resolve) => {
      shutdown = resolve;
    })
  });

  await new Promise((resolve) => setTimeout(resolve, 250));
  shutdown();
  const result = await pending;

  assert.equal(opened.length, 0, '--no-open must not launch a browser');
  assert.equal(existsSync(result.buildRoot), true, '--keep must retain the temp artifact');
  rmSync(result.buildRoot, { recursive: true, force: true });
  rmSync(workspace, { recursive: true, force: true });
});

test('runPreviewCommand rejects a workspace that does not exist', async () => {
  await assert.rejects(
    runPreviewCommand([path.join(os.tmpdir(), 'md-render-absent-workspace')], { steps: [] }),
    (error) => error instanceof BuildError && error.category === 'missing_content'
  );
});
