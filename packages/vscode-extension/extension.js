const vscode = require('vscode');
const cp = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const http = require('http');
const https = require('https');
const net = require('net');
const path = require('path');
const zlib = require('zlib');
const extensionPackage = require('./package.json');

const COMMANDS = {
  preview: 'microwebstacks.previewDocs',
  browser: 'microwebstacks.openDocsInBrowser',
  restart: 'microwebstacks.restartDocsPreviewServer',
  stop: 'microwebstacks.stopDocsPreviewServer'
};

const WATCHED_EXTENSIONS = new Set([
  '.md',
  '.mdx',
  '.yaml',
  '.yml',
  '.json',
  '.svg',
  '.webp',
  '.png',
  '.jpeg',
  '.jpg',
  '.xlsx',
  '.glb',
  '.puml'
]);

let output;
let serverProcess = null;
let serverState = null;
let previewPanel = null;
let fileWatcher = null;
let refreshTimer = null;
let operation = Promise.resolve();

function activate(context) {
  output = vscode.window.createOutputChannel('MicroWebStacks Docs');
  log(`Extension version: ${extensionPackage.version}`);
  log(`Extension path: ${context.extensionPath}`);
  context.subscriptions.push(output);
  context.subscriptions.push(vscode.commands.registerCommand(COMMANDS.preview, () => enqueue(() => previewDocs(context))));
  context.subscriptions.push(vscode.commands.registerCommand(COMMANDS.browser, () => enqueue(() => openDocsInBrowser(context))));
  context.subscriptions.push(vscode.commands.registerCommand(COMMANDS.restart, () => enqueue(() => restartDocsPreviewServer(context))));
  context.subscriptions.push(vscode.commands.registerCommand(COMMANDS.stop, () => enqueue(() => stopDocsPreviewServer(true))));
}

function deactivate() {
  return stopDocsPreviewServer(false);
}

function enqueue(task) {
  operation = operation.then(task, task);
  return operation;
}

function log(message) {
  output.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
}

function showOutput() {
  output.show(true);
}

function getWorkspaceFolder() {
  const activeUri = vscode.window.activeTextEditor?.document?.uri;
  if (activeUri) {
    const folder = vscode.workspace.getWorkspaceFolder(activeUri);
    if (folder) {
      return folder;
    }
  }
  return vscode.workspace.workspaceFolders?.[0] ?? null;
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

// Probes whether `execPath` (run with `extraEnv` merged into its environment)
// behaves as a JS engine that understands `node -e <script>`. Used to detect
// both a real system Node and VS Code's own runtime under
// ELECTRON_RUN_AS_NODE=1, without assuming either exists or works.
function probeNodeRunner(execPath, extraEnv) {
  return new Promise((resolve) => {
    let settled = false;
    let child;
    const finish = (ok) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(ok);
    };
    try {
      child = cp.spawn(execPath, ['-e', 'process.stdout.write("mws-node-ok")'], {
        env: {...process.env, ...extraEnv},
        windowsHide: true
      });
    } catch {
      finish(false);
      return;
    }
    const timer = setTimeout(() => {
      child.kill();
      finish(false);
    }, 2000);
    let out = '';
    child.stdout?.on('data', (chunk) => {
      out += chunk.toString();
    });
    child.on('error', () => {
      clearTimeout(timer);
      finish(false);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      finish(code === 0 && out.includes('mws-node-ok'));
    });
  });
}

// Resolves how to spawn scripts as Node, without requiring a system Node
// install (BLK-002 hidden constraint; see
// plans/2026-07/05-vscode-node-free-bootstrap/plan.md OP-001/OP-003):
// 1. MICROWEBSTACKS_NODE_PATH, if the maintainer/user set it explicitly.
// 2. VS Code's own bundled runtime (process.execPath), run as plain Node via
//    ELECTRON_RUN_AS_NODE=1 - this is what makes no-system-Node possible.
// 3. A Node binary vendored alongside the installed engine, if present.
// 4. A system Node on PATH, as a last-resort fallback for the rare case
//    where a VS Code/Electron build has the runAsNode fuse disabled.
let nodeRunnerPromise = null;

async function resolveNodeRunner(runtime) {
  if (nodeRunnerPromise) {
    return nodeRunnerPromise;
  }
  nodeRunnerPromise = (async () => {
    const override = process.env.MICROWEBSTACKS_NODE_PATH;
    if (override) {
      if (!exists(override)) {
        throw new Error(`MICROWEBSTACKS_NODE_PATH is set to "${override}" but that file does not exist.`);
      }
      log(`Using MICROWEBSTACKS_NODE_PATH override: ${override}`);
      return {execPath: override, extraEnv: {}};
    }

    if (await probeNodeRunner(process.execPath, {ELECTRON_RUN_AS_NODE: '1'})) {
      log(`Using VS Code's own runtime as the Node engine (${process.execPath}, ELECTRON_RUN_AS_NODE=1); no system Node required.`);
      return {execPath: process.execPath, extraEnv: {ELECTRON_RUN_AS_NODE: '1'}};
    }
    log("VS Code's runtime does not support ELECTRON_RUN_AS_NODE (the runAsNode fuse may be disabled on this build); falling back.");

    const vendoredNode = path.join(runtime.engineRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'node.exe' : 'node');
    if (exists(vendoredNode)) {
      log(`Using Node binary vendored with the engine: ${vendoredNode}`);
      return {execPath: vendoredNode, extraEnv: {}};
    }

    const systemNode = process.platform === 'win32' ? 'node.exe' : 'node';
    if (await probeNodeRunner(systemNode, {})) {
      log(`Using system Node on PATH: ${systemNode}`);
      return {execPath: systemNode, extraEnv: {}};
    }

    throw new Error(
      "Could not find a way to run scripts as Node: VS Code's bundled runtime does not support ELECTRON_RUN_AS_NODE, and no system Node.js was found on PATH. Install Node.js 18+, or set the MICROWEBSTACKS_NODE_PATH environment variable to a Node executable."
    );
  })();
  return nodeRunnerPromise.catch((error) => {
    nodeRunnerPromise = null;
    throw error;
  });
}

const ENGINE_PACKAGE = '@microwebstacks/md-render';
const ENGINE_VERSION = extensionPackage.engineVersion || extensionPackage.version;

// With shell:true, cmd.exe splits unquoted spaces (e.g. C:\Users\John Doe\...).
// Windows paths cannot contain double quotes, so wrapping is sufficient.
function quoteForShell(value) {
  return /\s/.test(value) ? `"${value}"` : value;
}

function spawnLogged(executable, args, options) {
  const useShell = process.platform === 'win32';
  const command = useShell ? quoteForShell(executable) : executable;
  const finalArgs = useShell ? args.map(quoteForShell) : args;
  const child = cp.spawn(command, finalArgs, {...options, shell: useShell, windowsHide: true});
  child.stdout.on('data', (chunk) => output.append(chunk.toString()));
  child.stderr.on('data', (chunk) => output.append(chunk.toString()));
  return child;
}

function isEngineRoot(candidate) {
  return (
    exists(path.join(candidate, 'server', 'server.js')) &&
    exists(path.join(candidate, 'scripts', 'collect.js')) &&
    exists(path.join(candidate, 'config.js'))
  );
}

// Each engine version gets its own prefix. In-place npm upgrades of a shared
// 'engine' dir fail with EBUSY on Windows when an orphaned preview server
// still holds the old folder; a fresh per-version folder never collides.
function getEnginePrefix(context) {
  return path.join(context.globalStorageUri.fsPath, `engine-${ENGINE_VERSION}`);
}

function getInstalledEngineRoot(context) {
  return path.join(getEnginePrefix(context), 'node_modules', '@microwebstacks', 'md-render');
}

// Best-effort removal of previous engine installs (including the legacy
// unversioned 'engine' dir). A locked folder is left behind and retried on a
// later run; it never blocks the active engine.
async function cleanupOldEngines(context) {
  const storageRoot = context.globalStorageUri.fsPath;
  const keep = `engine-${ENGINE_VERSION}`;
  let entries = [];
  try {
    entries = await fsp.readdir(storageRoot);
  } catch {
    return;
  }
  for (const entry of entries) {
    if ((entry === 'engine' || entry.startsWith('engine-')) && entry !== keep) {
      try {
        await fsp.rm(path.join(storageRoot, entry), {recursive: true, force: true});
        log(`Removed old engine install ${entry}.`);
      } catch (error) {
        log(`Could not remove old engine install ${entry} (${error.message}); will retry on a later run.`);
      }
    }
  }
}

function installedEngineVersion(engineRoot) {
  try {
    return JSON.parse(fs.readFileSync(path.join(engineRoot, 'package.json'), 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

// A previously installed engine is only reusable when it matches the version
// this extension release expects; otherwise npm install updates it in place.
function isUsableInstalledEngine(engineRoot) {
  if (!isEngineRoot(engineRoot)) {
    return false;
  }
  const version = installedEngineVersion(engineRoot);
  if (version !== ENGINE_VERSION) {
    log(`Installed engine version ${version ?? 'unknown'} does not match expected ${ENGINE_VERSION}; reinstalling.`);
    return false;
  }
  return true;
}

// Scoped package tarball convention: the scope stays in the path but is
// dropped from the filename, e.g. @foo/bar@1.0.0 ->
// https://registry.npmjs.org/@foo/bar/-/bar-1.0.0.tgz
function engineTarballUrl(name, version) {
  const shortName = name.includes('/') ? name.split('/')[1] : name;
  return `https://registry.npmjs.org/${name}/-/${shortName}-${version}.tgz`;
}

function fetchBuffer(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {headers: {'user-agent': `microwebstacks-docs-preview/${extensionPackage.version}`}}, (response) => {
      if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location && redirectsLeft > 0) {
        response.resume();
        resolve(fetchBuffer(new URL(response.headers.location, url).toString(), redirectsLeft - 1));
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`request to ${url} failed with status ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });
    request.on('error', reject);
  });
}

function readTarString(block, start, length) {
  const slice = block.subarray(start, start + length);
  const nul = slice.indexOf(0);
  return (nul === -1 ? slice : slice.subarray(0, nul)).toString('utf8');
}

function tarBlockPadding(size) {
  const remainder = size % 512;
  return remainder === 0 ? size : size + (512 - remainder);
}

// PAX extended header records look like "<record-length> <key>=<value>\n",
// back-to-back for as many keys as were overridden for the next entry.
function parsePaxRecords(text) {
  const result = {};
  let i = 0;
  while (i < text.length) {
    const spaceIndex = text.indexOf(' ', i);
    if (spaceIndex === -1) {
      break;
    }
    const recordLength = parseInt(text.slice(i, spaceIndex), 10);
    if (!Number.isFinite(recordLength) || recordLength <= 0) {
      break;
    }
    const record = text.slice(i, i + recordLength);
    const equalsIndex = record.indexOf('=');
    const key = record.slice(spaceIndex - i + 1, equalsIndex);
    const value = record.slice(equalsIndex + 1).replace(/\n$/, '');
    result[key] = value;
    i += recordLength;
  }
  return result;
}

// Minimal reader for the USTAR/PAX tar format npm registry tarballs use.
// Supports what a real `npm install` output actually contains - regular
// files, directories, and PAX/GNU long-name headers for the deeply nested
// paths vendored node_modules trees have. Deliberately does not handle
// symlinks or hard links: the vendored tree is produced by `npm install`
// (scripts/stage-engine.js), which does not create either.
function parseTarEntries(tarBuffer) {
  const entries = [];
  let offset = 0;
  let pendingLongName = null;
  let pendingPax = null;

  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      break;
    }

    const size = parseInt(readTarString(header, 124, 12).trim() || '0', 8);
    const typeflag = String.fromCharCode(header[156] || 0);
    const dataStart = offset + 512;

    if (typeflag === 'x' || typeflag === 'g') {
      const pax = parsePaxRecords(tarBuffer.subarray(dataStart, dataStart + size).toString('utf8'));
      if (typeflag === 'x') {
        pendingPax = pax;
      }
      offset = dataStart + tarBlockPadding(size);
      continue;
    }

    if (typeflag === 'L') {
      pendingLongName = tarBuffer.subarray(dataStart, dataStart + size).toString('utf8').replace(/\0+$/, '');
      offset = dataStart + tarBlockPadding(size);
      continue;
    }

    const name = readTarString(header, 0, 100);
    const entryName = pendingPax?.path ?? pendingLongName ?? name;
    const entrySize = pendingPax?.size ? parseInt(pendingPax.size, 10) : size;
    pendingLongName = null;
    pendingPax = null;

    if (typeflag === '5') {
      entries.push({name: entryName, type: 'directory'});
    } else if (typeflag === '0' || typeflag === '\0') {
      entries.push({name: entryName, type: 'file', data: tarBuffer.subarray(dataStart, dataStart + entrySize)});
    }
    // Other typeflags (symlinks, hard links, device files) are ignored.

    offset = dataStart + tarBlockPadding(entrySize);
  }
  return entries;
}

async function extractTarGz(buffer, destDir) {
  const tarBuffer = zlib.gunzipSync(buffer);
  const resolvedDestDir = path.resolve(destDir);
  for (const entry of parseTarEntries(tarBuffer)) {
    // npm tarballs wrap every entry under a top-level "package/" directory.
    const relPath = entry.name.replace(/^package\//, '');
    if (!relPath || relPath === '.') {
      continue;
    }
    const target = path.resolve(resolvedDestDir, relPath);
    const relativeToRoot = path.relative(resolvedDestDir, target);
    if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
      throw new Error(`Refusing to extract entry outside the install directory: ${entry.name}`);
    }
    if (entry.type === 'directory') {
      await fsp.mkdir(target, {recursive: true});
    } else {
      await fsp.mkdir(path.dirname(target), {recursive: true});
      await fsp.writeFile(target, entry.data);
    }
  }
}

// Installs the engine with a plain HTTPS download of its published npm
// tarball, extracted in-process - no npm (or system Node) involved (plans/
// 2026-07/05-vscode-node-free-bootstrap OP-002). The tarball's production
// dependencies are pre-vendored under a disguised directory name by
// scripts/stage-engine.js (npm's packer always strips a real "node_modules"
// out of a published tarball); this renames it back after extracting.
async function installEngine(context) {
  const enginePrefix = getEnginePrefix(context);
  await fsp.mkdir(enginePrefix, {recursive: true});
  const url = engineTarballUrl(ENGINE_PACKAGE, ENGINE_VERSION);
  log(`Installing ${ENGINE_PACKAGE}@${ENGINE_VERSION} from ${url} (this runs once and needs network access).`);

  let buffer;
  try {
    buffer = await fetchBuffer(url);
  } catch (error) {
    throw new Error(`Could not download ${ENGINE_PACKAGE}@${ENGINE_VERSION} (${error.message}).`);
  }

  const installRoot = getInstalledEngineRoot(context);
  await fsp.rm(installRoot, {recursive: true, force: true});
  await fsp.mkdir(installRoot, {recursive: true});
  try {
    await extractTarGz(buffer, installRoot);
  } catch (error) {
    throw new Error(`Could not extract ${ENGINE_PACKAGE}@${ENGINE_VERSION} (${error.message}).`);
  }

  const installedPkg = JSON.parse(await fsp.readFile(path.join(installRoot, 'package.json'), 'utf8'));
  const vendoredDir = installedPkg.vendoredModulesDir;
  if (!vendoredDir || !exists(path.join(installRoot, vendoredDir))) {
    throw new Error(`${ENGINE_PACKAGE}@${ENGINE_VERSION} was not published with vendored dependencies; this extension version can only install a vendored engine build. Republish it with scripts/stage-engine.js (vendoring is on by default).`);
  }
  await fsp.rename(path.join(installRoot, vendoredDir), path.join(installRoot, 'node_modules'));
  log(`Installed ${ENGINE_PACKAGE}@${ENGINE_VERSION} into ${enginePrefix}.`);
}

// Resolves the engine root. The local workspace checkout is always a valid
// fallback (see engineSource: local|auto); the registry install is additive.
async function resolveEngine(context) {
  const config = vscode.workspace.getConfiguration('microwebstacks.preview');
  const source = config.get('engineSource') || 'auto';

  const configured = config.get('enginePath');
  if (configured) {
    const root = path.resolve(configured);
    if (isEngineRoot(root)) {
      return root;
    }
    throw new Error(`microwebstacks.preview.enginePath is set to "${root}" but no engine was found there (missing server/server.js, scripts/collect.js, or config.js).`);
  }

  if (source !== 'registry') {
    for (const candidate of [path.resolve(__dirname, '..', '..'), path.resolve(__dirname)]) {
      if (isEngineRoot(candidate)) {
        log(`Using local workspace engine at ${candidate}.`);
        return candidate;
      }
    }
    if (source === 'local') {
      throw new Error('engineSource is "local" but no local engine checkout was found. Set microwebstacks.preview.enginePath to an astro-huge-doc checkout, or switch engineSource to "auto".');
    }
  }

  const installed = getInstalledEngineRoot(context);
  if (isUsableInstalledEngine(installed)) {
    log(`Using installed engine at ${installed}.`);
    return installed;
  }

  await installEngine(context);
  if (isUsableInstalledEngine(installed)) {
    log(`Using installed engine at ${installed}.`);
    await cleanupOldEngines(context);
    return installed;
  }
  throw new Error(`Engine ${ENGINE_PACKAGE}@${ENGINE_VERSION} was installed but could not be located at ${installed}.`);
}

function resolveDocsRoot(workspaceRoot, manifestPath) {
  const configured = vscode.workspace.getConfiguration('microwebstacks.preview').get('docsRoot');
  if (configured) {
    return {
      path: path.isAbsolute(configured) ? configured : path.join(workspaceRoot, configured),
      passToEngine: true
    };
  }
  if (exists(manifestPath)) {
    return {
      path: workspaceRoot,
      passToEngine: false
    };
  }
  return {
    path: workspaceRoot,
    passToEngine: true
  };
}

function workspaceKey(workspaceFolder) {
  return crypto.createHash('sha256').update(workspaceFolder.uri.toString()).digest('hex').slice(0, 16);
}

async function buildRuntime(context) {
  const workspaceFolder = getWorkspaceFolder();
  if (!workspaceFolder) {
    throw new Error('Open a workspace folder before starting the docs preview.');
  }

  const engineRoot = await resolveEngine(context);
  const workspaceRoot = workspaceFolder.uri.fsPath;
  const manifestPath = path.join(workspaceRoot, 'manifest.yaml');
  const docsRoot = resolveDocsRoot(workspaceRoot, manifestPath);
  if (!context.storageUri) {
    throw new Error('VS Code did not provide workspace-scoped extension storage for this window.');
  }
  const storageRoot = path.join(context.storageUri.fsPath, 'microwebstacks', workspaceKey(workspaceFolder));
  const storePath = path.join(storageRoot, 'store');
  const dbPath = path.join(storageRoot, 'content.db');
  const outDir = path.join(engineRoot, 'dist');
  const entryPath = path.join(outDir, 'server', 'entry.mjs');

  if (!exists(entryPath)) {
    throw new Error(`Missing Astro SSR build at ${entryPath}. Run pnpm build in the astro-huge-doc repository first.`);
  }
  if (!exists(docsRoot.path)) {
    throw new Error(`Documentation root does not exist: ${docsRoot.path}`);
  }

  await fsp.mkdir(storageRoot, {recursive: true});
  await fsp.mkdir(storePath, {recursive: true});

  const runtime = {
    workspaceFolder,
    engineRoot,
    workspaceRoot,
    docsRoot: docsRoot.path,
    passDocsRootToEngine: docsRoot.passToEngine,
    storageRoot,
    storePath,
    dbPath,
    outDir,
    manifestPath: exists(manifestPath) ? manifestPath : null
  };
  log(`Workspace root: ${runtime.workspaceRoot}`);
  log(`Docs root: ${runtime.docsRoot}`);
  log(`Engine root: ${runtime.engineRoot}`);
  log(`Storage root: ${runtime.storageRoot}`);
  log(`DB path: ${runtime.dbPath}`);
  log(`SSR outDir: ${runtime.outDir}`);
  log(`Manifest path: ${runtime.manifestPath ?? '(none; using defaults)'}`);
  return runtime;
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

function createRuntimeEnv(runtime, port) {
  const krokiServer = (vscode.workspace.getConfiguration('microwebstacks.preview').get('krokiServer') || '').trim();
  return {
    ...process.env,
    ...(krokiServer ? {MICROWEBSTACKS_KROKI_SERVER: krokiServer} : {}),
    // The previewed workspace's .env must not clobber this explicit runtime
    // config (profile, port, paths); it only fills in keys not set here.
    MICROWEBSTACKS_DOTENV_OVERRIDE: 'false',
    DOCS_PROFILE: 'lite',
    DOCS_BACKEND: 'json',
    MICROWEBSTACKS_ENGINE_ROOT: runtime.engineRoot,
    MICROWEBSTACKS_WORKSPACE_ROOT: runtime.workspaceRoot,
    MICROWEBSTACKS_DB_PATH: runtime.dbPath,
    MICROWEBSTACKS_STORE_PATH: runtime.storePath,
    MICROWEBSTACKS_OUTDIR: runtime.outDir,
    MICROWEBSTACKS_HOST: '127.0.0.1',
    MICROWEBSTACKS_PORT: String(port),
    MICROWEBSTACKS_PROTOCOL: 'http',
    ...(runtime.passDocsRootToEngine ? {MICROWEBSTACKS_DOCS_ROOT: runtime.docsRoot} : {}),
    ...(runtime.manifestPath ? {MICROWEBSTACKS_MANIFEST_PATH: runtime.manifestPath} : {})
  };
}

async function runNodeScript(runtime, scriptPath, env) {
  const runner = await resolveNodeRunner(runtime);
  return new Promise((resolve, reject) => {
    log(`Running ${scriptPath}`);
    log(`Node runtime: ${runner.execPath}`);
    const child = spawnLogged(runner.execPath, [scriptPath], {
      cwd: runtime.engineRoot,
      env: {...env, ...runner.extraEnv}
    });
    child.on('error', (error) => {
      reject(new Error(`Could not run ${scriptPath} (${error.message}).`));
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${scriptPath} exited with code ${code}`));
    });
  });
}

async function collect(runtime, env) {
  await runNodeScript(runtime, path.join('scripts', 'collect.js'), env);
  await runNodeScript(runtime, path.join('scripts', 'diagrams.js'), env);
}

async function startServer(runtime, port, env) {
  const runner = await resolveNodeRunner(runtime);
  log(`Starting preview server on http://127.0.0.1:${port}/`);
  log(`Node runtime: ${runner.execPath}`);
  const child = spawnLogged(runner.execPath, [path.join('server', 'server.js')], {
    cwd: runtime.engineRoot,
    env: {...env, ...runner.extraEnv}
  });
  child.on('exit', (code, signal) => {
    if (serverProcess === child) {
      log(`Preview server exited (code: ${code}, signal: ${signal}).`);
      serverProcess = null;
      serverState = null;
    }
  });
  serverProcess = child;
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (!serverProcess) {
      throw new Error('Preview server exited before it became reachable. Check the MicroWebStacks Docs output channel.');
    }
    try {
      await requestUrl(url);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Preview server did not become reachable at ${url}: ${lastError?.message ?? 'timeout'}`);
}

function requestUrl(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      response.resume();
      response.on('end', resolve);
    });
    request.setTimeout(2000, () => {
      request.destroy(new Error('request timed out'));
    });
    request.on('error', reject);
  });
}

async function ensureServer(context) {
  if (serverProcess && serverState) {
    return serverState;
  }
  return vscode.window.withProgress(
    {location: vscode.ProgressLocation.Notification, title: 'MicroWebStacks Docs'},
    async (progress) => {
      progress.report({message: 'resolving engine (first run downloads it, which can take a few minutes)…'});
      const runtime = await buildRuntime(context);
      const port = await getFreePort();
      const env = createRuntimeEnv(runtime, port);
      progress.report({message: 'indexing documentation…'});
      await collect(runtime, env);
      progress.report({message: 'starting preview server…'});
      await startServer(runtime, port, env);
      const browserUrl = `http://127.0.0.1:${port}/`;
      await waitForServer(browserUrl);
      serverState = {
        ...runtime,
        port,
        browserUrl,
        webviewUrl: `http://localhost:${port}/`,
        env
      };
      ensureWatcher(context, serverState);
      return serverState;
    }
  );
}

function ensureWatcher(context, state) {
  if (fileWatcher) {
    fileWatcher.dispose();
    fileWatcher = null;
  }
  const pattern = new vscode.RelativePattern(state.docsRoot, '**/*');
  fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
  const onChange = (uri) => {
    const ext = path.extname(uri.fsPath).toLowerCase();
    if (!WATCHED_EXTENSIONS.has(ext)) {
      return;
    }
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      enqueue(() => refreshPreviewAfterChange(context)).catch((error) => {
        vscode.window.showErrorMessage(error.message);
      });
    }, 600);
  };
  fileWatcher.onDidCreate(onChange);
  fileWatcher.onDidChange(onChange);
  fileWatcher.onDidDelete(onChange);
  context.subscriptions.push(fileWatcher);
}

async function refreshPreviewAfterChange(context) {
  if (!serverState) {
    return;
  }
  log('File change detected; rebuilding preview index and restarting server.');
  await stopDocsPreviewServer(false);
  const state = await ensureServer(context);
  updatePreviewPanel(state);
}

async function previewDocs(context) {
  try {
    const state = await ensureServer(context);
    openPreviewPanel(context, state);
  } catch (error) {
    log(error.stack || error.message);
    showOutput();
    vscode.window.showErrorMessage(error.message);
  }
}

async function openDocsInBrowser(context) {
  try {
    const state = await ensureServer(context);
    await vscode.env.openExternal(vscode.Uri.parse(state.browserUrl));
  } catch (error) {
    log(error.stack || error.message);
    showOutput();
    vscode.window.showErrorMessage(error.message);
  }
}

async function restartDocsPreviewServer(context) {
  try {
    await stopDocsPreviewServer(false);
    const state = await ensureServer(context);
    updatePreviewPanel(state);
    vscode.window.showInformationMessage('MicroWebStacks docs preview server restarted.');
  } catch (error) {
    log(error.stack || error.message);
    showOutput();
    vscode.window.showErrorMessage(error.message);
  }
}

async function stopDocsPreviewServer(showMessage) {
  clearTimeout(refreshTimer);
  refreshTimer = null;
  if (fileWatcher) {
    fileWatcher.dispose();
    fileWatcher = null;
  }
  if (serverProcess) {
    const child = serverProcess;
    serverProcess = null;
    serverState = null;
    child.kill();
    log('Stopped preview server.');
  }
  if (showMessage) {
    vscode.window.showInformationMessage('MicroWebStacks docs preview server stopped.');
  }
}

function openPreviewPanel(context, state) {
  if (previewPanel) {
    previewPanel.reveal(vscode.ViewColumn.Beside);
    updatePreviewPanel(state);
    return;
  }
  previewPanel = vscode.window.createWebviewPanel(
    'microwebstacksDocsPreview',
    'MicroWebStacks Docs',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      portMapping: [{webviewPort: state.port, extensionHostPort: state.port}]
    }
  );
  previewPanel.onDidDispose(() => {
    previewPanel = null;
  }, null, context.subscriptions);
  updatePreviewPanel(state);
}

function updatePreviewPanel(state) {
  if (!previewPanel) {
    return;
  }
  previewPanel.webview.html = renderWebviewHtml(state.webviewUrl, state.port, previewPanel.webview.cspSource);
}

function renderWebviewHtml(url, port, cspSource) {
  const escapedUrl = escapeHtml(url);
  const escapedCspSource = escapeHtml(cspSource);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://localhost:${port} http://127.0.0.1:${port}; style-src 'unsafe-inline' ${escapedCspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MicroWebStacks Docs</title>
  <style>
    html, body, iframe {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      border: 0;
      overflow: hidden;
      background: var(--vscode-editor-background);
    }
  </style>
</head>
<body>
  <iframe src="${escapedUrl}" title="Markdown Site Preview"></iframe>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  activate,
  deactivate
};
