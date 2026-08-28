// Public "preview" command lifecycle: build the full static site from an
// arbitrary Markdown folder into an isolated temp directory, serve it over
// plain HTTP on localhost, open a browser, and tear everything down on
// Ctrl+C. Nothing is written into the user's folder.
//
// Contract: specification/reusable-render/spec.md. Shares every build
// mechanic with `md-render build` through prepareStaticSite(); what is
// preview-specific lives here: argument parsing, the workspace-root content
// default, the static server, browser launch, and signal handling.
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';

import { BuildError, checkNodeVersion, defaultBuildSteps, prepareStaticSite, probeContentRoot } from './render-build.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4321;

// Deliberately not src/libs/utils.js#file_mime: that one imports config.js
// (and so a manifest and a workspace) and covers only the blob/image types
// the SSR /blobs/ route needs. A static server has to get text/html,
// text/css and text/javascript right or the page will not run at all.
const MIME_TYPES = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  tsv: 'text/tab-separated-values; charset=utf-8',
  yaml: 'text/yaml; charset=utf-8',
  yml: 'text/yaml; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject',
  wasm: 'application/wasm',
  pdf: 'application/pdf',
  zip: 'application/zip',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).replace(/^\./, '').toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

function parsePort(value) {
  if (typeof value === 'number') {
    return value;
  }
  if (!/^\d+$/.test(value)) {
    throw new BuildError('invalid_configuration', `--port must be a whole number (got "${value}")`);
  }
  const port = Number(value);
  // 0 is the OS's "give me any free port", which is the friendliest answer
  // for someone whose 4321 is already taken; the bound port is read back
  // from the listening server and printed, so the URL is always right.
  if (port > 65535) {
    throw new BuildError('invalid_configuration', `--port must be between 0 and 65535 (got "${value}")`);
  }
  return port;
}

// Pure: turns argv into a raw args object. The workspace is positional and
// defaults to the current directory, which is the whole point of the command.
function parsePreviewArgs(argv) {
  const args = {
    workspace: '.',
    docsRoot: null,
    manifest: null,
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    open: true,
    keep: false
  };
  const flagToKey = {
    '--docs-root': 'docsRoot',
    '--manifest': 'manifest',
    '--host': 'host',
    '--port': 'port'
  };
  const unknown = [];
  let workspaceSeen = false;

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!flag.startsWith('--')) {
      if (workspaceSeen) {
        throw new BuildError('invalid_configuration', `unexpected extra argument: ${flag}`);
      }
      args.workspace = flag;
      workspaceSeen = true;
      continue;
    }
    if (flag === '--open' || flag === '--no-open') {
      args.open = flag === '--open';
      continue;
    }
    if (flag === '--keep') {
      args.keep = true;
      continue;
    }
    const key = flagToKey[flag];
    if (!key) {
      unknown.push(flag);
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new BuildError('invalid_configuration', `${flag} requires a value`);
    }
    args[key] = value;
    i += 1;
  }

  if (unknown.length > 0) {
    throw new BuildError('invalid_configuration', `Unknown argument(s): ${unknown.join(', ')}`);
  }
  args.port = parsePort(args.port);
  return args;
}

// The folder you are standing in is the content root. Overriding it is
// CLI-only, with one exception: a workspace that is already a configured
// astro-huge-doc project should render what its own manifest points at
// rather than its repository root. A manifest that points nowhere falls
// back like a bare folder, since --docs-root already covers saying otherwise.
//
// Returns the value for MICROWEBSTACKS_DOCS_ROOT, or undefined to let
// config.js resolve the manifest as it normally would.
function resolvePreviewDocsRoot({ workspaceAbs, docsRootArg, manifestAbs, log = () => {} }) {
  if (docsRootArg) {
    return docsRootArg;
  }
  const manifestPath = manifestAbs ?? path.join(workspaceAbs, 'manifest.yaml');
  if (!existsSync(manifestPath)) {
    return '.';
  }
  const configured = probeContentRoot({ workspaceAbs, manifestAbs, docsRoot: undefined });
  if (existsSync(configured)) {
    return undefined;
  }
  log(`md-render preview: no content directory at ${configured}; previewing the workspace root instead.`);
  return '.';
}

// Pure: maps a request path to an absolute path inside rootDir, or null when
// it escapes (traversal, an absolute or drive-qualified path, a NUL byte, or
// undecodable percent-escapes).
function resolveRequestPath(rootDir, requestUrl) {
  const [rawPath] = String(requestUrl ?? '/').split(/[?#]/);
  let pathname;
  try {
    pathname = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) {
    return null;
  }
  const target = path.resolve(rootDir, pathname.replace(/^\/+/, ''));
  const rel = path.relative(rootDir, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }
  return target;
}

// Astro's default `directory` build format emits dist/guide/index.html for
// /guide/, so a directory request resolves to its index; the bare-file and
// implicit-.html candidates cover links written without the trailing slash.
function resolveStaticFile(rootDir, requestUrl) {
  const target = resolveRequestPath(rootDir, requestUrl);
  if (target === null) {
    return { status: 403 };
  }
  const [rawPath] = String(requestUrl ?? '/').split(/[?#]/);
  const endsWithSlash = rawPath.endsWith('/');
  const candidates = endsWithSlash
    ? [path.join(target, 'index.html')]
    : [target, path.join(target, 'index.html'), `${target}.html`];

  for (const candidate of candidates) {
    let stats;
    try {
      stats = statSync(candidate);
    } catch {
      continue;
    }
    if (stats.isFile()) {
      return { status: 200, filePath: candidate, size: stats.size };
    }
  }
  return { status: 404 };
}

function sendFile(res, { filePath, size, status = 200, method }) {
  res.writeHead(status, {
    'Content-Type': mimeTypeFor(filePath),
    'Content-Length': size,
    // A preview is rebuilt often enough that a cached asset from a previous
    // run is always the wrong answer.
    'Cache-Control': 'no-store'
  });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  const stream = createReadStream(filePath);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

function sendStatus(res, status, method, rootDir) {
  if (status === 404) {
    const notFoundPage = path.join(rootDir, '404.html');
    if (existsSync(notFoundPage)) {
      sendFile(res, { filePath: notFoundPage, size: statSync(notFoundPage).size, status: 404, method });
      return;
    }
  }
  const body = status === 403 ? 'Forbidden\n' : 'Not Found\n';
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(method === 'HEAD' ? undefined : body);
}

// Serves exactly one directory - the generated artifact - and nothing else.
function createPreviewServer(rootDir) {
  return createServer((req, res) => {
    const method = (req.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Length': 0 });
      res.end();
      return;
    }
    const resolved = resolveStaticFile(rootDir, req.url);
    if (resolved.status !== 200) {
      sendStatus(res, resolved.status, method, rootDir);
      return;
    }
    sendFile(res, { ...resolved, method });
  });
}

function listen(server, { host, port }) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener('listening', onListening);
      if (error.code === 'EADDRINUSE') {
        reject(new BuildError('port_in_use', `port ${port} is already in use on ${host}; pass --port <number> to choose another.`));
        return;
      }
      if (error.code === 'EACCES') {
        reject(new BuildError('invalid_configuration', `not allowed to bind ${host}:${port}.`));
        return;
      }
      reject(error);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve(server);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

// A wildcard bind is not an address a browser can visit; show a loopback one.
function browsableHost(host) {
  if (host === '0.0.0.0' || host === '') {
    return '127.0.0.1';
  }
  if (host === '::' || host === '::0') {
    return '[::1]';
  }
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function openBrowser(url, { log = () => {}, platform = process.platform, spawnFn = spawn } = {}) {
  const [command, commandArgs] = platform === 'win32'
    ? ['cmd', ['/c', 'start', '', url]]
    : platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];
  try {
    const child = spawnFn(command, commandArgs, { stdio: 'ignore', detached: platform !== 'win32' });
    // Never fatal: a headless box, a container, or a missing xdg-open must
    // not take the server down. The URL is already printed.
    child.on?.('error', () => log(`md-render preview: could not open a browser (${command}); open ${url} manually.`));
    child.unref?.();
    return true;
  } catch {
    log(`md-render preview: could not open a browser (${command}); open ${url} manually.`);
    return false;
  }
}

function waitForSignals(signals = ['SIGINT', 'SIGTERM']) {
  return new Promise((resolve) => {
    const handlers = new Map();
    const finish = (signal) => {
      for (const [name, handler] of handlers) {
        process.off(name, handler);
      }
      resolve(signal);
    };
    for (const signal of signals) {
      const handler = () => finish(signal);
      handlers.set(signal, handler);
      process.on(signal, handler);
    }
  });
}

async function runPreviewCommand(argv, {
  log = () => {},
  steps = defaultBuildSteps,
  nodeVersion = process.version,
  openBrowser: openFn = openBrowser,
  waitForShutdown = waitForSignals
} = {}) {
  checkNodeVersion(nodeVersion);
  const args = parsePreviewArgs(argv);

  const workspaceAbs = path.resolve(args.workspace);
  if (!existsSync(workspaceAbs)) {
    throw new BuildError('missing_content', `workspace not found: ${workspaceAbs}`);
  }
  const manifestAbs = args.manifest ? path.resolve(args.manifest) : undefined;
  if (manifestAbs && !existsSync(manifestAbs)) {
    throw new BuildError('invalid_configuration', `manifest not found: ${manifestAbs}`);
  }
  const docsRoot = resolvePreviewDocsRoot({ workspaceAbs, docsRootArg: args.docsRoot, manifestAbs, log });

  log('md-render preview: building full site...');
  const prepared = await prepareStaticSite({
    workspace: workspaceAbs,
    docsRoot,
    manifest: manifestAbs,
    log,
    logPrefix: 'md-render preview',
    steps,
    tempPrefix: 'md-render-preview-',
    cleanupOnFailure: !args.keep
  });

  let released = false;
  const release = async () => {
    if (released) {
      return;
    }
    released = true;
    if (args.keep) {
      log(`md-render preview: kept temporary artifact at ${prepared.buildRoot}`);
      return;
    }
    await prepared.cleanup();
  };

  const server = createPreviewServer(prepared.outDir);
  try {
    await listen(server, { host: args.host, port: args.port });
  } catch (error) {
    await release();
    throw error;
  }

  const boundPort = server.address()?.port ?? args.port;
  const url = `http://${browsableHost(args.host)}:${boundPort}/`;
  log(`md-render preview: ready at ${url}`);
  log('Press Ctrl+C to stop.');
  if (args.open) {
    openFn(url, { log });
  }

  try {
    await waitForShutdown();
  } finally {
    await closeServer(server);
    await release();
  }
  return { url, outDir: prepared.outDir, buildRoot: prepared.buildRoot };
}

export {
  DEFAULT_HOST,
  DEFAULT_PORT,
  parsePreviewArgs,
  resolvePreviewDocsRoot,
  resolveRequestPath,
  resolveStaticFile,
  mimeTypeFor,
  createPreviewServer,
  listen,
  closeServer,
  browsableHost,
  openBrowser,
  waitForSignals,
  runPreviewCommand
};
