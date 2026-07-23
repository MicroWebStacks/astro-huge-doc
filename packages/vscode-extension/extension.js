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
const {
  movePreviewHistory,
  normalizePreviewRoute,
  previewHistoryState,
  recordPreviewRoute
} = require('./preview-history');
const {renderWebviewHtml} = require('./preview-webview');

const COMMANDS = {
  preview: 'microwebstacks.previewDocs',
  restart: 'microwebstacks.restartDocsPreviewServer',
  stop: 'microwebstacks.stopDocsPreviewServer',
  lock: 'microwebstacks.internal.lockDocsPreview',
  unlock: 'microwebstacks.internal.unlockDocsPreview'
};

const WATCHED_EXTENSIONS = new Set([
  '.md',
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
let extensionContext = null;
const sessions = new Map();
const BUILD_META_FILE = 'build-meta.json';
const BOX_WIDTH = 98;
const BUNDLED_ENGINE_DIR = 'bundled-engine';
const BUNDLED_MANIFEST_FILE = 'manifest.json';
const BUNDLED_TARBALL_FILE = 'engine.tgz';
const BUNDLED_MANIFEST_SCHEMA_VERSION = 1;

function runCapture(command, cliArgs, options = {}) {
  try {
    const result = cp.spawnSync(command, cliArgs, {
      encoding: 'utf8',
      windowsHide: true,
      ...options
    });
    return result.status === 0 ? result.stdout.trim() : null;
  } catch {
    return null;
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function buildWorkspaceMetadata({repoRoot, packageRoot, engineVersion = null}) {
  const pkg = readJson(path.join(packageRoot, 'package.json'));
  if (!pkg) {
    return null;
  }
  const gitCommit = runCapture('git', ['rev-parse', 'HEAD'], {cwd: repoRoot});
  const gitCommitShort = runCapture('git', ['rev-parse', '--short', 'HEAD'], {cwd: repoRoot});
  const gitBranch = runCapture('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {cwd: repoRoot});
  const gitStatus = runCapture('git', ['status', '--short'], {cwd: repoRoot});
  return {
    version: pkg.version ?? null,
    ...(engineVersion ? {engineVersion} : {}),
    gitCommit,
    gitCommitShort,
    gitBranch,
    gitDirty: Boolean(gitStatus)
  };
}

function loadPackageBuildMetadata(packageRoot, {repoRoot = packageRoot, engineVersion = null} = {}) {
  const pkg = readJson(path.join(packageRoot, 'package.json'));
  if (!pkg) {
    return null;
  }
  return (
    pkg.buildMetadata ??
    readJson(path.join(packageRoot, BUILD_META_FILE)) ??
    buildWorkspaceMetadata({repoRoot, packageRoot, engineVersion})
  );
}

function loadExtensionBuildMetadata() {
  return loadPackageBuildMetadata(__dirname, {repoRoot: path.resolve(__dirname, '..', '..')});
}

function loadEngineBuildMetadata(engineRoot) {
  const directRoot = loadPackageBuildMetadata(engineRoot, {engineVersion: ENGINE_VERSION});
  if (readJson(path.join(engineRoot, 'package.json'))?.name === ENGINE_PACKAGE) {
    return directRoot;
  }
  const workspacePackageRoot = path.join(engineRoot, 'packages', 'md-render');
  const workspacePkg = readJson(path.join(workspacePackageRoot, 'package.json'));
  if (workspacePkg?.name === ENGINE_PACKAGE) {
    return loadPackageBuildMetadata(workspacePackageRoot, {
      repoRoot: engineRoot,
      engineVersion: workspacePkg.version ?? ENGINE_VERSION
    });
  }
  return null;
}

function formatBuildMetadata(metadata) {
  if (!metadata) {
    return 'unavailable';
  }
  const parts = [];
  if (metadata.version) {
    parts.push(`version ${metadata.version}`);
  }
  if (metadata.engineVersion) {
    parts.push(`engine ${metadata.engineVersion}`);
  }
  if (metadata.gitCommitShort) {
    parts.push(`commit ${metadata.gitCommitShort}${metadata.gitDirty ? ' (dirty)' : ''}`);
  } else if (metadata.gitDirty) {
    parts.push('dirty worktree');
  }
  if (metadata.builtAt) {
    parts.push(`built ${metadata.builtAt}`);
  }
  return parts.join(', ') || 'unavailable';
}

function formatCommit(metadata) {
  if (metadata?.gitCommitShort) {
    return `${metadata.gitCommitShort}${metadata.gitDirty ? ' (dirty)' : ''}`;
  }
  if (metadata?.gitDirty) {
    return 'dirty worktree';
  }
  return 'unavailable';
}

function formatMetadataSummary(metadata) {
  if (!metadata) {
    return 'unavailable';
  }
  const parts = [];
  if (metadata.gitBranch) {
    parts.push(`branch ${metadata.gitBranch}`);
  }
  if (metadata.gitCommit) {
    parts.push(`full ${metadata.gitCommit}`);
  }
  if (metadata.builtAt) {
    parts.push(`built ${metadata.builtAt}`);
  } else if (metadata.gitCommit || metadata.gitBranch) {
    parts.push('workspace checkout');
  }
  if (metadata.gitDirty) {
    parts.push('dirty');
  }
  return parts.join(', ') || formatBuildMetadata(metadata);
}

function wrapText(text, width) {
  const value = String(text ?? '');
  if (!value) {
    return [''];
  }
  const lines = [];
  for (const rawLine of value.split(/\r?\n/)) {
    let remaining = rawLine;
    while (remaining.length > width) {
      let splitAt = remaining.lastIndexOf(' ', width);
      if (splitAt <= 0 || splitAt < Math.floor(width * 0.6)) {
        splitAt = width;
      }
      lines.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }
    lines.push(remaining);
  }
  return lines;
}

function logRaw(message) {
  output.appendLine(message);
}

function logBox(title, rows) {
  const border = `+${'-'.repeat(BOX_WIDTH + 2)}+`;
  const labelWidth = Math.max(...rows.map((row) => row.label.length), 0);
  logRaw(border);
  for (const line of wrapText(title, BOX_WIDTH)) {
    logRaw(`| ${line.padEnd(BOX_WIDTH)} |`);
  }
  logRaw(border);
  for (const row of rows) {
    const prefix = `${row.label.padEnd(labelWidth)} : `;
    const wrapped = wrapText(row.value, BOX_WIDTH - prefix.length);
    wrapped.forEach((line, index) => {
      const content = `${index === 0 ? prefix : ' '.repeat(prefix.length)}${line}`;
      logRaw(`| ${content.padEnd(BOX_WIDTH)} |`);
    });
  }
  logRaw(border);
}

function logPreviewSummary(runtime) {
  const extensionMetadata = loadExtensionBuildMetadata();
  const engineMetadata = loadEngineBuildMetadata(runtime.engineRoot);
  log(`[preview] ${runtime.engineSourceLabel}`);
  logBox('Preview Runtime', [
    {label: 'Extension version', value: extensionPackage.version},
    {label: 'Extension commit', value: formatCommit(extensionMetadata)},
    {label: 'Extension meta', value: formatMetadataSummary(extensionMetadata)},
    {label: 'Engine version', value: engineMetadata?.version ?? ENGINE_VERSION},
    {label: 'Engine commit', value: formatCommit(engineMetadata)},
    {label: 'Engine meta', value: formatMetadataSummary(engineMetadata)},
    {label: 'Engine source', value: runtime.engineSourceLabel},
    {label: 'Engine root', value: runtime.engineRoot},
    {label: 'Docs root', value: runtime.docsRoot},
    {label: 'Manifest path', value: runtime.manifestPath ?? '(none; using defaults)'}
  ]);
}

function activate(context) {
  extensionContext = context;
  output = vscode.window.createOutputChannel('MicroWebStacks Docs');
  context.subscriptions.push(output);
  context.subscriptions.push(vscode.commands.registerCommand(COMMANDS.preview, () => previewDocs(context)));
  context.subscriptions.push(vscode.commands.registerCommand(COMMANDS.restart, () => restartDocsPreviewServer(context)));
  context.subscriptions.push(vscode.commands.registerCommand(COMMANDS.stop, () => stopDocsPreviewServer(true)));
  context.subscriptions.push(vscode.commands.registerCommand(COMMANDS.lock, () => setActivePreviewLocked(true)));
  context.subscriptions.push(vscode.commands.registerCommand(COMMANDS.unlock, () => setActivePreviewLocked(false)));
  if (context.extensionMode !== vscode.ExtensionMode.Production) {
    context.subscriptions.push(vscode.commands.registerCommand('microwebstacks.internal.testSessionSnapshots', getSessionSnapshots));
    context.subscriptions.push(vscode.commands.registerCommand('microwebstacks.internal.testDisposePanel', disposeTestPanel));
    context.subscriptions.push(vscode.commands.registerCommand(
      'microwebstacks.internal.testPreviewMessage',
      dispatchTestPreviewMessage
    ));
  }
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => followActiveEditor(editor)));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => handleConfigurationChange(event)));
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders((event) => {
    for (const folder of event.removed) {
      const session = sessions.get(folder.uri.toString());
      if (session) {
        enqueueSession(session, () => disposeSession(session));
      }
    }
  }));
  return undefined;
}

async function deactivate() {
  const active = [...sessions.values()];
  await Promise.all(active.map((session) => enqueueSession(session, () => disposeSession(session))));
  killActiveChildren();
  extensionContext = null;
}

function enqueueSession(session, task) {
  session.operation = session.operation.then(task, task);
  return session.operation;
}

function log(message) {
  output.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
}

function showOutput() {
  output.show(true);
}

function activeSupportedWorkspaceFolder() {
  const activeUri = vscode.window.activeTextEditor?.document?.uri;
  if (activeUri && path.extname(activeUri.fsPath).toLowerCase() === '.md') {
    const folder = vscode.workspace.getWorkspaceFolder(activeUri);
    if (folder) {
      return folder;
    }
  }
  return null;
}

async function selectWorkspaceFolder() {
  const active = activeSupportedWorkspaceFolder();
  if (active) {
    return active;
  }
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 1) {
    return folders[0];
  }
  if (folders.length === 0) {
    return null;
  }
  const picked = await vscode.window.showQuickPick(
    folders.map((folder) => ({label: folder.name, description: folder.uri.fsPath, folder})),
    {placeHolder: 'Select the workspace folder to preview'}
  );
  return picked?.folder ?? null;
}

function getOrCreateSession(workspaceFolder) {
  const key = workspaceFolder.uri.toString();
  let session = sessions.get(key);
  if (!session) {
    session = {
      key,
      workspaceFolder,
      serverProcess: null,
      state: null,
      panel: null,
      watcher: null,
      refreshTimer: null,
      operation: Promise.resolve(),
      locked: false,
      currentRoute: '/',
      historyRoutes: [],
      historyIndex: -1,
      disposing: false,
      configRestartQueued: false,
      configSnapshot: configurationSnapshot(workspaceFolder)
    };
    sessions.set(key, session);
  }
  return session;
}

function getSessionSnapshots() {
  return [...sessions.values()].map((session) => ({
    key: session.key,
    workspace: session.workspaceFolder.uri.fsPath,
    serverRunning: Boolean(session.serverProcess),
    panelOpen: Boolean(session.panel),
    watcherOpen: Boolean(session.watcher),
    locked: session.locked,
    currentRoute: session.currentRoute,
    historyRoutes: [...session.historyRoutes],
    historyIndex: session.historyIndex,
    port: session.state?.port ?? null,
    docsRoot: session.state?.docsRoot ?? null,
    storageRoot: session.state?.storageRoot ?? null
  }));
}

function disposeTestPanel(workspacePath) {
  const session = [...sessions.values()].find((candidate) => candidate.workspaceFolder.uri.fsPath === workspacePath);
  session?.panel?.dispose();
}

function dispatchTestPreviewMessage(workspacePath, message) {
  const session = [...sessions.values()].find((candidate) => candidate.workspaceFolder.uri.fsPath === workspacePath);
  return session ? enqueueSession(session, () => handlePreviewMessage(session, message)) : undefined;
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

// OS-level variables a spawned Node process needs to work at all (DNS/TLS on
// Windows, temp dirs, PATH for anything the engine itself shells out to,
// terminal/proxy config a corporate machine may require for the registry
// download). Everything else in the host's process.env - other extensions'
// tokens, the user's shell customizations, unrelated app config - is
// deliberately not passed through to the collect/diagrams/server children.
const ENV_PASSTHROUGH_KEYS = process.platform === 'win32'
  ? ['SystemRoot', 'windir', 'ComSpec', 'PATH', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'ProgramData']
  : ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL'];
const ENV_PROXY_PASSTHROUGH_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy'];

function minimalChildEnv(extra = {}) {
  const base = {};
  for (const key of [...ENV_PASSTHROUGH_KEYS, ...ENV_PROXY_PASSTHROUGH_KEYS]) {
    if (process.env[key] !== undefined) {
      base[key] = process.env[key];
    }
  }
  return {...base, ...extra};
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
        env: minimalChildEnv(extraEnv),
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
// plans/2026-07/05/vscode-node-free-bootstrap/plan.md OP-001/OP-003):
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

function filterChildLogLine(line, mode, summary) {
  const text = String(line ?? '');
  if (mode !== 'diagrams') {
    return text;
  }
  if (/^Skipping client-rendered diagram /.test(text)) {
    summary.clientRendered += 1;
    return null;
  }
  if (/\[[^\]]+\]: generated blob /.test(text)) {
    summary.generated += 1;
    return null;
  }
  if (/\[[^\]]+\]: reused blob /.test(text)) {
    summary.reused += 1;
    return null;
  }
  if (/\[[^\]]+\]: linked existing blob /.test(text)) {
    summary.linked += 1;
    return null;
  }
  return text;
}

function attachLoggedStream(stream, mode, summary) {
  let buffer = '';
  const flush = (force = false) => {
    const normalized = buffer.replace(/\r\n/g, '\n');
    const parts = normalized.split('\n');
    buffer = force ? '' : parts.pop();
    for (const line of force ? parts.filter((_, index) => true) : parts) {
      const filtered = filterChildLogLine(line, mode, summary);
      if (filtered !== null) {
        logRaw(filtered);
      }
    }
    if (force && normalized && !normalized.endsWith('\n')) {
      const filtered = filterChildLogLine(parts.at(-1) ?? normalized, mode, summary);
      if (filtered !== null && parts.length === 0) {
        logRaw(filtered);
      }
    }
  };
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    flush(false);
  });
  stream.on('end', () => {
    if (buffer) {
      const filtered = filterChildLogLine(buffer.replace(/\r?\n$/, ''), mode, summary);
      if (filtered !== null) {
        logRaw(filtered);
      }
      buffer = '';
    }
  });
}

// Tracks every child process spawned via spawnLogged so deactivate()/stop can
// kill stragglers (e.g. an in-flight collect/diagrams script) instead of only
// the long-lived preview server. Node's spawn already quotes args correctly
// for CreateProcess on Windows for real executables, so this never needs
// shell:true - shell would also make args vulnerable to shell-metacharacter
// injection (&, |, ^, %) that manual double-quote wrapping does not guard
// against.
const activeChildren = new Set();

function spawnLogged(executable, args, options = {}) {
  const {logMode = 'passthrough', ...spawnOptions} = options;
  const child = cp.spawn(executable, args, {...spawnOptions, windowsHide: true});
  activeChildren.add(child);
  child.on('exit', () => activeChildren.delete(child));
  const summary = {generated: 0, reused: 0, linked: 0, clientRendered: 0};
  attachLoggedStream(child.stdout, logMode, summary);
  attachLoggedStream(child.stderr, logMode, summary);
  child.mwsLogMode = logMode;
  child.mwsSummary = summary;
  return child;
}

function killActiveChildren() {
  for (const child of activeChildren) {
    activeChildren.delete(child);
    child.kill();
  }
}

function isEngineRoot(candidate) {
  return (
    exists(path.join(candidate, 'server', 'server.js')) &&
    exists(path.join(candidate, 'scripts', 'collect.js')) &&
    exists(path.join(candidate, 'config.js'))
  );
}

function getBundledEnginePackageRoot() {
  return path.join(__dirname, BUNDLED_ENGINE_DIR);
}

// Presence-only check (AD-003/Phase 2): the bundled payload is now an
// unopened manifest.json + engine.tgz pair, not an exploded engine
// directory, so this can no longer call isEngineRoot() against it. Content
// validity (schema, digest, nested package metadata) is checked by
// hydrateBundledEngine(), which fails loudly rather than falling back here.
function hasBundledEnginePackage() {
  const bundledRoot = getBundledEnginePackageRoot();
  return exists(path.join(bundledRoot, BUNDLED_MANIFEST_FILE)) && exists(path.join(bundledRoot, BUNDLED_TARBALL_FILE));
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

function getBundledEnginePrefix(context) {
  return path.join(context.globalStorageUri.fsPath, `bundled-engine-${ENGINE_VERSION}`);
}

function getBundledInstalledEngineRoot(context) {
  return path.join(getBundledEnginePrefix(context), 'node_modules', '@microwebstacks', 'md-render');
}

// Best-effort removal of previous engine installs (including the legacy
// unversioned 'engine' dir). A locked folder is left behind and retried on a
// later run; it never blocks the active engine.
async function cleanupOldEngines(context) {
  const storageRoot = context.globalStorageUri.fsPath;
  let entries = [];
  try {
    entries = await fsp.readdir(storageRoot);
  } catch {
    return;
  }
  for (const entry of entries) {
    const match = /^(?:engine|bundled-engine)-(\d+)\.(\d+)\.(\d+)$/.exec(entry);
    const entryVersion = match ? match.slice(1).map(Number) : null;
    const currentVersion = ENGINE_VERSION.split('.').map(Number);
    const isOlder = entryVersion && entryVersion.some((part, index) => {
      if (part === currentVersion[index]) return false;
      return entryVersion.slice(0, index).every((value, prior) => value === currentVersion[prior]) && part < currentVersion[index];
    });
    const isStaleActivationArtifact = entry.startsWith('.mws-engine-activation-');
    let removeStaleActivationArtifact = false;
    if (isStaleActivationArtifact) {
      try {
        const stat = await fsp.stat(path.join(storageRoot, entry));
        removeStaleActivationArtifact = Date.now() - stat.mtimeMs > 60 * 60 * 1000;
      } catch {
        removeStaleActivationArtifact = true;
      }
    }
    // Never delete a newer engine. An older extension host may remain alive
    // after VS Code installs an update, and all windows share globalStorage.
    if (entry === 'engine' || isOlder || removeStaleActivationArtifact) {
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
  const pkg = readJson(path.join(engineRoot, 'package.json'));
  const version = pkg?.version ?? null;
  if (version !== ENGINE_VERSION) {
    log(`Installed engine version ${version ?? 'unknown'} does not match expected ${ENGINE_VERSION}; reinstalling.`);
    return false;
  }
  if (Object.keys(pkg?.dependencies ?? {}).length > 0 && !exists(path.join(engineRoot, 'node_modules'))) {
    log(`Installed engine at ${engineRoot} is missing node_modules; reinstalling.`);
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

async function extractTarGz(buffer, destDir, {mapVendoredModules = false} = {}) {
  const tarBuffer = zlib.gunzipSync(buffer);
  const resolvedDestDir = path.resolve(destDir);
  const entries = parseTarEntries(tarBuffer);
  let vendoredModulesDir = null;
  if (mapVendoredModules) {
    const packageEntry = entries.find((entry) => entry.name === 'package/package.json' && entry.type === 'file');
    vendoredModulesDir = packageEntry ? JSON.parse(packageEntry.data.toString('utf8')).vendoredModulesDir ?? null : null;
  }
  for (const entry of entries) {
    // npm tarballs wrap every entry under a top-level "package/" directory.
    let relPath = entry.name.replace(/^package\//, '');
    if (!relPath || relPath === '.') {
      continue;
    }
    // npm strips real node_modules directories when packing. The release
    // artifact therefore carries dependencies under vendoredModulesDir. Map
    // that tree while extracting so corporate filesystem filters never see a
    // large, freshly-written directory rename from `_modules` to
    // `node_modules`.
    if (vendoredModulesDir && (relPath === vendoredModulesDir || relPath.startsWith(`${vendoredModulesDir}/`))) {
      relPath = `node_modules${relPath.slice(vendoredModulesDir.length)}`;
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
  return {vendoredModulesDir};
}

async function runActivationDiagnostics({error, stage, tempRoot, installRoot, vendoredModulesDir}) {
  const checks = [];
  const add = (name, passed, detail) => checks.push({name, passed, detail});
  const parent = path.dirname(installRoot);
  const probeBase = path.join(parent, `.mws-diagnostic-${crypto.randomBytes(4).toString('hex')}`);
  const probeRenamed = `${probeBase}-renamed`;

  add('temporary extraction directory exists', exists(tempRoot), exists(tempRoot) ? 'available' : 'missing');
  add('mapped node_modules exists', exists(path.join(tempRoot, 'node_modules')), exists(path.join(tempRoot, 'node_modules')) ? 'available' : 'missing');
  add('vendored alias is absent', !vendoredModulesDir || !exists(path.join(tempRoot, vendoredModulesDir)), !vendoredModulesDir || !exists(path.join(tempRoot, vendoredModulesDir)) ? 'absent' : 'still present');

  try {
    await fsp.mkdir(probeBase);
    add('global storage write', true, 'small directory created');
    await fsp.rename(probeBase, probeRenamed);
    add('global storage directory rename', true, 'small directory renamed');
  } catch (probeError) {
    if (!exists(probeBase)) {
      add('global storage write', false, probeError.code || 'failed');
    } else {
      add('global storage write', true, 'small directory created');
      add('global storage directory rename', false, probeError.code || 'failed');
    }
  } finally {
    await fsp.rm(probeBase, {recursive: true, force: true}).catch(() => {});
    await fsp.rm(probeRenamed, {recursive: true, force: true}).catch(() => {});
  }

  log('Engine activation diagnostics (local only; no data was uploaded):');
  log(`  Stage: ${stage}`);
  log(`  Error code: ${error?.code || 'unavailable'}`);
  for (const check of checks) {
    log(`  ${check.passed ? 'PASS' : 'FAIL'} - ${check.name} (${check.detail})`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A directory just written by extraction (or about to be removed to make way
// for a fresh install) can be briefly held open on Windows by Defender/an
// indexer, or by an orphaned preview server process from a previous window -
// same class of transient lock as the vendoring-time EPERM fixed in
// scripts/stage-engine.js. Retrying a few times with a short backoff clears
// it without needing an AV exclusion or killing the offending process.
async function retryFsOp(op, {attempts = 6, delayMs = 500} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await op();
    } catch (error) {
      const retryable = error.code === 'EPERM' || error.code === 'EBUSY';
      if (!retryable || attempt === attempts) {
        throw error;
      }
      log(`${error.code} while activating the engine (attempt ${attempt}/${attempts}), retrying in ${delayMs}ms...`);
      await sleep(delayMs);
    }
  }
}

async function activateWithStorageLock(context, kind, installedRoot, activate) {
  const storageRoot = context.globalStorageUri.fsPath;
  const lockRoot = path.join(storageRoot, `.mws-engine-activation-lock-${kind}-${ENGINE_VERSION}`);
  const deadline = Date.now() + 2 * 60 * 1000;
  await fsp.mkdir(storageRoot, {recursive: true});

  while (true) {
    if (isUsableInstalledEngine(installedRoot)) return;
    try {
      await fsp.mkdir(lockRoot);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const stat = await fsp.stat(lockRoot);
        if (Date.now() - stat.mtimeMs > 5 * 60 * 1000) {
          await fsp.rm(lockRoot, {recursive: true, force: true});
          continue;
        }
      } catch (statError) {
        if (statError.code === 'ENOENT') continue;
        throw statError;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for another VS Code window to activate ${ENGINE_PACKAGE}@${ENGINE_VERSION}.`);
      }
      await sleep(250);
    }
  }

  try {
    if (!isUsableInstalledEngine(installedRoot)) await activate();
  } finally {
    await fsp.rm(lockRoot, {recursive: true, force: true}).catch(() => {});
  }
}

// Shared post-download work for both the bundled and registry tiers
// (AD-003): extract into a fresh temporary sibling directory, validate the
// extracted package before trusting it, then promote it into the versioned
// install location. A partially extracted or mismatched directory is never
// treated as a valid cached engine, and interrupted/failed extraction leaves
// no usable partial install behind.
async function extractAndActivateEngine({tarballBuffer, expectedPackage, expectedVersion, installRoot, sourceLabel}) {
  const enginePrefix = path.resolve(installRoot, '..', '..', '..');
  const storageRoot = path.dirname(enginePrefix);
  // Keep extraction outside the versioned engine prefix. A still-running old
  // extension window may remove a newer prefix during an update, but it cannot
  // erase this neutral activation directory; promotion then repairs the target.
  const tempRoot = path.join(storageRoot, `.mws-engine-activation-${path.basename(enginePrefix)}-${crypto.randomBytes(4).toString('hex')}`);
  let activationStage = 'prepare temporary directory';
  let vendoredDir = null;
  await fsp.mkdir(path.dirname(tempRoot), {recursive: true});
  await fsp.rm(tempRoot, {recursive: true, force: true});
  await fsp.mkdir(tempRoot, {recursive: true});
  try {
    try {
      activationStage = 'extract package';
      const extracted = await extractTarGz(tarballBuffer, tempRoot, {mapVendoredModules: true});
      vendoredDir = extracted.vendoredModulesDir;
    } catch (error) {
      const wrapped = new Error(`Could not extract ${sourceLabel} (${error.message}).`, {cause: error});
      wrapped.code = error.code;
      throw wrapped;
    }

    const pkg = readJson(path.join(tempRoot, 'package.json'));
    if (!pkg || pkg.name !== expectedPackage || pkg.version !== expectedVersion) {
      throw new Error(
        `${sourceLabel} extracted to an unexpected package ` +
        `(got ${pkg?.name ?? 'unknown'}@${pkg?.version ?? 'unknown'}, expected ${expectedPackage}@${expectedVersion}).`
      );
    }

    vendoredDir = pkg.vendoredModulesDir;
    if (!vendoredDir || !exists(path.join(tempRoot, 'node_modules'))) {
      throw new Error(
        `${sourceLabel} was not published with vendored dependencies; this extension version can only install a ` +
        'vendored engine build. Republish it with scripts/stage-engine.js (vendoring is on by default).'
      );
    }
    activationStage = 'validate extracted engine';
    if (!isUsableInstalledEngine(tempRoot)) {
      throw new Error(`${sourceLabel} extracted but failed the usable-engine checks at ${tempRoot}.`);
    }

    activationStage = 'replace previous engine';
    await retryFsOp(() => fsp.rm(installRoot, {recursive: true, force: true}));
    activationStage = 'activate extracted engine';
    await fsp.mkdir(path.dirname(installRoot), {recursive: true});
    await retryFsOp(() => fsp.rename(tempRoot, installRoot));
  } catch (error) {
    await runActivationDiagnostics({error, stage: activationStage, tempRoot, installRoot, vendoredModulesDir: vendoredDir}).catch((diagnosticError) => {
      log(`Engine activation diagnostics could not complete (${diagnosticError.code || diagnosticError.message}).`);
    });
    await fsp.rm(tempRoot, {recursive: true, force: true}).catch(() => {});
    throw error;
  }
}

// Installs the engine with a plain HTTPS download of its published npm
// tarball, extracted in-process - no npm (or system Node) involved (plans/
// 2026-07/05-vscode-node-free-bootstrap OP-002). The tarball's production
// dependencies are pre-vendored under a disguised directory name by
// scripts/stage-engine.js (npm's packer always strips a real "node_modules"
// out of a published tarball); extraction maps that path directly back to
// node_modules without a post-extraction directory rename.
async function installEngine(context) {
  const enginePrefix = getEnginePrefix(context);
  const url = engineTarballUrl(ENGINE_PACKAGE, ENGINE_VERSION);
  log(`Installing ${ENGINE_PACKAGE}@${ENGINE_VERSION} from ${url} (this runs once and needs network access).`);

  let buffer;
  try {
    buffer = await fetchBuffer(url);
  } catch (error) {
    throw new Error(`Could not download ${ENGINE_PACKAGE}@${ENGINE_VERSION} (${error.message}).`);
  }

  try {
    await extractAndActivateEngine({
      tarballBuffer: buffer,
      expectedPackage: ENGINE_PACKAGE,
      expectedVersion: ENGINE_VERSION,
      installRoot: getInstalledEngineRoot(context),
      sourceLabel: `${ENGINE_PACKAGE}@${ENGINE_VERSION} (registry)`
    });
  } catch (error) {
    throw new Error(`Could not install ${ENGINE_PACKAGE}@${ENGINE_VERSION} (${error.message}).`);
  }
  log(`Installed ${ENGINE_PACKAGE}@${ENGINE_VERSION} into ${enginePrefix}.`);
}

// Reads and authenticates the bundled outer manifest.json + engine.tgz pair
// (AD-001) before handing the exact tarball bytes to the same
// extraction-and-activation path installEngine() uses. A manifest or tarball
// that fails to parse, name the expected package/version, or match its own
// declared digest is treated as corrupt bundled data and fails loudly here -
// it is never silently reinterpreted as "no bundled engine" (that would
// route through to the registry tier instead, masking a packaging bug).
async function hydrateBundledEngine(context) {
  const bundledRoot = getBundledEnginePackageRoot();
  if (!hasBundledEnginePackage()) {
    throw new Error(`Bundled engine payload is missing at ${bundledRoot}. Repackage the extension.`);
  }

  const manifestPath = path.join(bundledRoot, BUNDLED_MANIFEST_FILE);
  const manifest = readJson(manifestPath);
  if (
    !manifest ||
    manifest.schemaVersion !== BUNDLED_MANIFEST_SCHEMA_VERSION ||
    manifest.package !== ENGINE_PACKAGE ||
    manifest.version !== ENGINE_VERSION ||
    !manifest.tarball ||
    typeof manifest.byteLength !== 'number' ||
    !manifest.sha256
  ) {
    throw new Error(`Bundled engine manifest at ${manifestPath} is invalid or does not describe ${ENGINE_PACKAGE}@${ENGINE_VERSION}. Repackage the extension.`);
  }

  const tarballPath = path.join(bundledRoot, manifest.tarball);
  let tarballBuffer;
  try {
    tarballBuffer = await fsp.readFile(tarballPath);
  } catch (error) {
    throw new Error(`Could not read bundled engine tarball at ${tarballPath} (${error.message}). Repackage the extension.`);
  }
  if (tarballBuffer.length !== manifest.byteLength) {
    throw new Error(`Bundled engine tarball at ${tarballPath} is ${tarballBuffer.length} bytes but the manifest expects ${manifest.byteLength}. Repackage the extension.`);
  }
  const actualDigest = crypto.createHash('sha256').update(tarballBuffer).digest('hex');
  if (actualDigest !== manifest.sha256) {
    throw new Error(`Bundled engine tarball at ${tarballPath} failed digest verification (expected ${manifest.sha256}, got ${actualDigest}). Repackage the extension.`);
  }

  await extractAndActivateEngine({
    tarballBuffer,
    expectedPackage: manifest.package,
    expectedVersion: manifest.version,
    installRoot: getBundledInstalledEngineRoot(context),
    sourceLabel: `bundled engine ${manifest.package}@${manifest.version}`
  });

  log(`Hydrated bundled ${ENGINE_PACKAGE}@${ENGINE_VERSION} into ${getBundledEnginePrefix(context)}.`);
}

// Resolves the engine root. The local workspace checkout remains the guaranteed
// dev fallback, and installed VSIX builds can hydrate a bundled engine before
// trying any registry install path.
async function resolveEngine(context, workspaceFolder) {
  const config = vscode.workspace.getConfiguration('microwebstacks.preview', workspaceFolder.uri);
  const source = config.get('engineSource') || 'auto';

  const configured = config.get('enginePath');
  if (configured) {
    const root = path.resolve(configured);
    if (isEngineRoot(root)) {
      return {root, label: `configured engine path (${root})`};
    }
    throw new Error(`microwebstacks.preview.enginePath is set to "${root}" but no engine was found there (missing server/server.js, scripts/collect.js, or config.js).`);
  }

  if (source !== 'registry') {
    for (const candidate of [path.resolve(__dirname, '..', '..'), path.resolve(__dirname)]) {
      if (isEngineRoot(candidate)) {
        return {root: candidate, label: `local workspace engine (${candidate})`};
      }
    }
    if (source === 'local') {
      throw new Error('engineSource is "local" but no local engine checkout was found. Set microwebstacks.preview.enginePath to an astro-huge-doc checkout, or switch engineSource to "auto".');
    }
  }

  if (source === 'auto' && hasBundledEnginePackage()) {
    const bundledInstalled = getBundledInstalledEngineRoot(context);
    if (!isUsableInstalledEngine(bundledInstalled)) {
      await activateWithStorageLock(context, 'bundled', bundledInstalled, () => hydrateBundledEngine(context));
    }
    if (isUsableInstalledEngine(bundledInstalled)) {
      await cleanupOldEngines(context);
      return {root: bundledInstalled, label: `bundled VSIX engine (${bundledInstalled})`};
    }
    throw new Error(`Bundled engine ${ENGINE_PACKAGE}@${ENGINE_VERSION} could not be activated at ${bundledInstalled}.`);
  }

  const installed = getInstalledEngineRoot(context);
  if (isUsableInstalledEngine(installed)) {
    return {root: installed, label: `installed engine package (${installed})`};
  }

  await activateWithStorageLock(context, 'registry', installed, () => installEngine(context));
  if (isUsableInstalledEngine(installed)) {
    await cleanupOldEngines(context);
    return {root: installed, label: `installed engine package (${installed})`};
  }
  throw new Error(`Engine ${ENGINE_PACKAGE}@${ENGINE_VERSION} was installed but could not be located at ${installed}.`);
}

function resolveDocsRoot(workspaceRoot, manifestPath, workspaceFolder) {
  const configured = vscode.workspace.getConfiguration('microwebstacks.preview', workspaceFolder.uri).get('docsRoot');
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

function configurationSnapshot(workspaceFolder) {
  const config = vscode.workspace.getConfiguration('microwebstacks.preview', workspaceFolder.uri);
  return JSON.stringify({
    engineSource: config.get('engineSource') || 'auto',
    enginePath: config.get('enginePath') || '',
    docsRoot: config.get('docsRoot') || '',
    krokiServer: config.get('krokiServer') || ''
  });
}

async function buildRuntime(context, workspaceFolder) {
  const engine = await resolveEngine(context, workspaceFolder);
  const engineRoot = engine.root;
  const workspaceRoot = workspaceFolder.uri.fsPath;
  const manifestPath = path.join(workspaceRoot, 'manifest.yaml');
  const docsRoot = resolveDocsRoot(workspaceRoot, manifestPath, workspaceFolder);
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
    engineSourceLabel: engine.label,
    workspaceRoot,
    docsRoot: docsRoot.path,
    passDocsRootToEngine: docsRoot.passToEngine,
    storageRoot,
    storePath,
    dbPath,
    outDir,
    manifestPath: exists(manifestPath) ? manifestPath : null
  };
  logPreviewSummary(runtime);
  log(`Storage root: ${runtime.storageRoot}`);
  log(`DB path: ${runtime.dbPath}`);
  log(`SSR outDir: ${runtime.outDir}`);
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
  const krokiServer = (vscode.workspace.getConfiguration('microwebstacks.preview', runtime.workspaceFolder.uri).get('krokiServer') || '').trim();
  return minimalChildEnv({
    ...(krokiServer ? {MICROWEBSTACKS_KROKI_SERVER: krokiServer} : {}),
    // The previewed workspace's .env must not clobber this explicit runtime
    // config (profile, port, paths); it only fills in keys not set here.
    MICROWEBSTACKS_DOTENV_OVERRIDE: 'false',
    DOCS_PROFILE: 'lite',
    DOCS_BACKEND: 'json',
    MICROWEBSTACKS_ENGINE_ROOT: runtime.engineRoot,
    MICROWEBSTACKS_EXTENSION_MODE: 'true',
    // Launcher identity shown by the viewer's runtime info surface
    // (/__lite/runtime), so the extension<->engine pair is visible in-page.
    MICROWEBSTACKS_LAUNCHER: `vscode-extension@${extensionPackage.version ?? 'unknown'}`,
    MICROWEBSTACKS_WORKSPACE_ROOT: runtime.workspaceRoot,
    MICROWEBSTACKS_DB_PATH: runtime.dbPath,
    MICROWEBSTACKS_STORE_PATH: runtime.storePath,
    MICROWEBSTACKS_OUTDIR: runtime.outDir,
    MICROWEBSTACKS_HOST: '127.0.0.1',
    MICROWEBSTACKS_PORT: String(port),
    MICROWEBSTACKS_PROTOCOL: 'http',
    ...(runtime.passDocsRootToEngine ? {MICROWEBSTACKS_DOCS_ROOT: runtime.docsRoot} : {}),
    ...(runtime.manifestPath ? {MICROWEBSTACKS_MANIFEST_PATH: runtime.manifestPath} : {})
  });
}

// Lazy lite flow: there is no upfront collect/diagrams pass anymore. The
// server's lazy backend walks the file tree on first request and parses each
// page on demand (hash-keyed cache). The extension only signals workspace
// changes by bumping stamp files that the backend and the pages watch.
function stampDir(state) {
  return path.join(state.storePath, 'json');
}

async function touchStamps(state, {tree}) {
  const dir = stampDir(state);
  await fsp.mkdir(dir, {recursive: true});
  const now = new Date().toISOString();
  const names = tree ? ['tree.stamp', 'reload.stamp'] : ['reload.stamp'];
  for (const name of names) {
    await fsp.writeFile(path.join(dir, name), now);
  }
}

async function startServer(session, runtime, port, env) {
  const runner = await resolveNodeRunner(runtime);
  log(`Starting preview server on http://127.0.0.1:${port}/`);
  log(`Node runtime: ${runner.execPath}`);
  const child = spawnLogged(runner.execPath, [path.join('server', 'server.js')], {
    cwd: runtime.engineRoot,
    env: {...env, ...runner.extraEnv}
  });
  child.on('exit', (code, signal) => {
    if (session.serverProcess === child) {
      log(`Preview server exited (code: ${code}, signal: ${signal}).`);
      session.serverProcess = null;
      session.state = null;
      enqueueSession(session, () => disposeSession(session));
    }
  });
  session.serverProcess = child;
}

async function waitForServer(session, url, {timeoutMs = 120000, progress} = {}) {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let lastError = null;
  let lastReportedAt = 0;
  while (Date.now() < deadline) {
    if (!session.serverProcess) {
      throw new Error('Preview server exited before it became reachable. Check the MicroWebStacks Docs output channel.');
    }
    try {
      await requestUrl(url);
      return;
    } catch (error) {
      lastError = error;
      const elapsed = Date.now() - startedAt;
      // A cold first run (engine hydration, antivirus scanning node_modules)
      // can take a while to boot; keep the user informed instead of silent.
      if (progress && elapsed - lastReportedAt >= 5000) {
        lastReportedAt = elapsed;
        progress.report({message: `waiting for preview server… (${Math.round(elapsed / 1000)}s)`});
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Preview server did not become reachable at ${url}: ${lastError?.message ?? 'timeout'}`);
}

// Non-fatal warm-up of the first page. Rendering `/` on a large cold
// workspace triggers the full tree walk plus the first parse and can take
// far longer than any reasonable startup gate, so this never blocks startup
// beyond a short grace period and never fails it: past the grace the render
// keeps going in the background and the opened preview shows the browser's
// own loading state until the server answers.
const FIRST_PAGE_GRACE_MS = 5000;
const FIRST_PAGE_TIMEOUT_MS = 10 * 60 * 1000;

function warmFirstPage(url) {
  const startedAt = Date.now();
  const warm = requestUrl(url, FIRST_PAGE_TIMEOUT_MS)
    .then(() => {
      log(`First page rendered in ${Date.now() - startedAt} ms.`);
      return 'rendered';
    })
    .catch((error) => {
      log(`First page warm-up did not complete (${error.message}); the preview renders it on demand instead.`);
      return 'failed';
    });
  const grace = new Promise((resolve) => setTimeout(resolve, FIRST_PAGE_GRACE_MS, 'grace'));
  return Promise.race([warm, grace]).then((outcome) => {
    if (outcome === 'grace') {
      log('First page is still rendering (large site or cold caches); opening the preview now, it will display once ready.');
      vscode.window.showInformationMessage(
        'MicroWebStacks Docs: indexing this site for the first time — the preview opens now and will display as soon as the first page is ready.'
      );
    }
  });
}

function requestUrl(url, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      response.resume();
      response.on('end', resolve);
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('request timed out'));
    });
    request.on('error', reject);
  });
}

function requestJson(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if ((response.statusCode ?? 500) >= 400) {
          reject(new Error(`HTTP ${response.statusCode} from ${url}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Invalid JSON from ${url}: ${error.message}`));
        }
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('request timed out')));
    request.on('error', reject);
  });
}

async function ensureServer(context, session) {
  if (session.serverProcess && session.state) {
    return session.state;
  }
  return vscode.window.withProgress(
    {location: vscode.ProgressLocation.Notification, title: 'MicroWebStacks Docs'},
    async (progress) => {
      progress.report({message: 'resolving engine (first run may hydrate the bundled engine or download the pinned fallback)…'});
      const runtime = await buildRuntime(context, session.workspaceFolder);
      const port = await getFreePort();
      const env = createRuntimeEnv(runtime, port);
      progress.report({message: 'starting preview server…'});
      const startedAt = Date.now();
      // No upfront indexing: the lazy backend walks the tree and parses pages
      // on demand. Startup cost is server boot + one page, not the whole site.
      await startServer(session, runtime, port, env);
      const browserUrl = `http://127.0.0.1:${port}/`;
      // Readiness means "the server answers HTTP", probed on a cheap
      // middleware endpoint. Never gate startup on rendering `/`: on a large
      // cold workspace that first render exceeds any reasonable probe budget
      // (this failed as a hard timeout on big first runs).
      await waitForServer(session, `${browserUrl}__lite/runtime`, {progress});
      const runtimePayload = await requestJson(`${browserUrl}__lite/runtime`);
      if (typeof runtimePayload.docsRoot === 'string' && runtimePayload.docsRoot) {
        runtime.docsRoot = path.resolve(runtimePayload.docsRoot);
      }
      log(`Preview server reachable in ${Date.now() - startedAt} ms (pages parse on demand).`);
      progress.report({message: 'rendering first page…'});
      await warmFirstPage(browserUrl);
      session.state = {
        ...runtime,
        port,
        browserUrl,
        webviewUrl: `http://localhost:${port}/`,
        env
      };
      session.configSnapshot = configurationSnapshot(session.workspaceFolder);
      ensureWatcher(session, session.state);
      return session.state;
    }
  );
}

function ensureWatcher(session, state) {
  if (session.watcher) {
    session.watcher.dispose();
    session.watcher = null;
  }
  const pattern = new vscode.RelativePattern(state.docsRoot, '**/*');
  session.watcher = vscode.workspace.createFileSystemWatcher(pattern);
  // The server stays alive across all workspace changes (lazy flow). Content
  // edits only bump reload.stamp: open pages reload themselves and the lazy
  // backend re-parses just the requested page when its content hash moved.
  // Add/delete/rename additionally bump tree.stamp so the backend re-walks
  // the file tree (the only whole-tree work, and it is file-level only).
  let pendingTreeChange = false;
  const onChange = (uri, isTreeEvent) => {
    const ext = path.extname(uri.fsPath).toLowerCase();
    if (!WATCHED_EXTENSIONS.has(ext)) {
      return;
    }
    pendingTreeChange = pendingTreeChange || isTreeEvent;
    clearTimeout(session.refreshTimer);
    session.refreshTimer = setTimeout(() => {
      const treeChanged = pendingTreeChange;
      pendingTreeChange = false;
      const startedAt = Date.now();
      touchStamps(state, {tree: treeChanged})
        .then(() => {
          log(`Workspace change signaled in ${Date.now() - startedAt} ms (tree refresh: ${treeChanged ? 'yes' : 'no'}; server kept alive).`);
        })
        .catch((error) => {
          log(`Failed to signal workspace change: ${error.message}`);
        });
    }, 300);
  };
  session.watcher.onDidCreate((uri) => onChange(uri, true));
  session.watcher.onDidChange((uri) => onChange(uri, false));
  session.watcher.onDidDelete((uri) => onChange(uri, true));
}

async function previewDocs(context) {
  const workspaceFolder = await selectWorkspaceFolder();
  if (!workspaceFolder) {
    if (!(vscode.workspace.workspaceFolders?.length)) {
      vscode.window.showErrorMessage('Open a workspace folder before starting the docs preview.');
    }
    return;
  }
  const session = getOrCreateSession(workspaceFolder);
  return enqueueSession(session, async () => {
    try {
      const state = await ensureServer(context, session);
      const route = await routeForUri(session, vscode.window.activeTextEditor?.document?.uri, {fallback: '/'});
      openPreviewPanel(context, session, state, route);
    } catch (error) {
      handlePreviewError(error);
      await disposeSession(session);
    }
  });
}

function handlePreviewError(error) {
  log(error.stack || error.message);
  showOutput();
  vscode.window.showErrorMessage(error.message);
}

function relativeMarkdownPath(state, uri) {
  if (!uri || uri.scheme !== 'file' || path.extname(uri.fsPath).toLowerCase() !== '.md') {
    return null;
  }
  const relative = path.relative(state.docsRoot, uri.fsPath);
  if (!relative || path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    return null;
  }
  return relative.split(path.sep).join('/');
}

async function routeForUri(session, uri, {fallback = null} = {}) {
  if (!session.state) {
    return fallback;
  }
  const relative = relativeMarkdownPath(session.state, uri);
  if (!relative) {
    return fallback;
  }
  try {
    const payload = await requestJson(
      `${session.state.browserUrl}__lite/source-route?path=${encodeURIComponent(relative)}`
    );
    return payload.found && typeof payload.route === 'string' ? payload.route : fallback;
  } catch (error) {
    log(`Could not resolve preview route for ${relative}: ${error.message}`);
    return fallback;
  }
}

async function restartDocsPreviewServer(context) {
  const workspaceFolder = await selectWorkspaceFolder();
  if (!workspaceFolder) {
    return;
  }
  const session = sessions.get(workspaceFolder.uri.toString());
  if (!session?.panel) {
    vscode.window.showInformationMessage('Open a Markdown Site Preview before restarting its server.');
    return;
  }
  return enqueueSession(session, () => restartSession(context, session, {notify: true}));
}

async function stopDocsPreviewServer(showMessage) {
  const workspaceFolder = await selectWorkspaceFolder();
  if (!workspaceFolder) {
    return;
  }
  const session = sessions.get(workspaceFolder.uri.toString());
  const hadServer = Boolean(session?.serverProcess);
  if (session) {
    await enqueueSession(session, () => disposeSession(session));
  }
  if (hadServer) {
    log('Stopped preview server.');
  }
  if (showMessage) {
    vscode.window.showInformationMessage('MicroWebStacks docs preview server stopped.');
  }
}

async function stopSessionRuntime(session) {
  clearTimeout(session.refreshTimer);
  session.refreshTimer = null;
  session.watcher?.dispose();
  session.watcher = null;
  const child = session.serverProcess;
  session.serverProcess = null;
  session.state = null;
  if (child) {
    activeChildren.delete(child);
    child.kill();
  }
}

async function disposeSession(session) {
  if (session.disposing) {
    return;
  }
  session.disposing = true;
  const panel = session.panel;
  session.panel = null;
  if (panel) {
    panel.dispose();
  }
  await stopSessionRuntime(session);
  sessions.delete(session.key);
  session.disposing = false;
  updateLockContext();
}

async function restartSession(context, session, {notify = false} = {}) {
  try {
    await stopSessionRuntime(session);
    const state = await ensureServer(context, session);
    updatePreviewPanel(session, state, session.currentRoute);
    if (notify) {
      vscode.window.showInformationMessage('MicroWebStacks docs preview server restarted.');
    }
    return true;
  } catch (error) {
    handlePreviewError(error);
    await disposeSession(session);
    return false;
  }
}

function openPreviewPanel(context, session, state, route) {
  if (session.panel) {
    session.panel.reveal(vscode.ViewColumn.Beside);
    updatePreviewPanel(session, state, route);
    updateLockContext();
    return;
  }
  session.locked = false;
  session.panel = vscode.window.createWebviewPanel(
    'microwebstacksDocsPreview',
    `Markdown Site Preview: ${session.workspaceFolder.name}`,
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      portMapping: [{webviewPort: state.port, extensionHostPort: state.port}]
    }
  );
  session.panel.onDidDispose(() => {
    session.panel = null;
    if (!session.disposing) {
      enqueueSession(session, () => disposeSession(session));
    }
  }, null, context.subscriptions);
  session.panel.onDidChangeViewState(() => {
    updateLockContext();
  }, null, context.subscriptions);
  session.panel.webview.onDidReceiveMessage((message) => {
    enqueueSession(session, () => handlePreviewMessage(session, message));
  }, null, context.subscriptions);
  updatePreviewPanel(session, state, route);
  updateLockContext();
}

function updatePreviewPanel(session, state, route = session.currentRoute, {recordHistory = true} = {}) {
  if (!session.panel || !state) {
    return;
  }
  const normalizedRoute = normalizePreviewRoute(route) ?? '/';
  if (recordHistory) {
    recordPreviewRoute(session, normalizedRoute);
  } else {
    session.currentRoute = normalizedRoute;
  }
  updatePreviewPanelTitle(session);
  session.panel.webview.options = {
    ...session.panel.webview.options,
    enableScripts: true,
    portMapping: [{webviewPort: state.port, extensionHostPort: state.port}]
  };
  const targetUrl = new URL(normalizedRoute.replace(/^\//, ''), state.webviewUrl).toString();
  session.panel.webview.html = renderWebviewHtml(
    targetUrl,
    state.port,
    session.panel.webview.cspSource,
    previewHistoryState(session)
  );
}

function postPreviewHistoryState(session) {
  session.panel?.webview.postMessage({
    type: 'microwebstacks.previewHistoryState',
    ...previewHistoryState(session)
  });
}

function handlePreviewMessage(session, message) {
  if (!session.panel || !session.state || !message || typeof message !== 'object') {
    return;
  }
  if (message.type === 'microwebstacks.previewRoute') {
    recordPreviewRoute(session, message.route);
    postPreviewHistoryState(session);
    return;
  }
  if (message.type !== 'microwebstacks.previewHistory'
    || (message.action !== 'back' && message.action !== 'forward')) {
    return;
  }
  const route = movePreviewHistory(session, message.action === 'back' ? -1 : 1);
  if (route) {
    updatePreviewPanel(session, session.state, route, {recordHistory: false});
  } else {
    postPreviewHistoryState(session);
  }
}

function updatePreviewPanelTitle(session) {
  if (session.panel) {
    session.panel.title = `Markdown Site Preview: ${session.workspaceFolder.name}`;
  }
}

async function followActiveEditor(editor) {
  if (!editor || path.extname(editor.document.uri.fsPath).toLowerCase() !== '.md') {
    return;
  }
  const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
  const session = folder ? sessions.get(folder.uri.toString()) : null;
  if (!session?.panel || session.locked) {
    return;
  }
  await enqueueSession(session, async () => {
    const route = await routeForUri(session, editor.document.uri);
    if (route && route !== session.currentRoute) {
      updatePreviewPanel(session, session.state, route);
    }
  });
}

function activePreviewSession() {
  return [...sessions.values()].find((session) => session.panel?.active)
    ?? [...sessions.values()].find((session) => session.panel?.visible)
    ?? (() => {
      const folder = activeSupportedWorkspaceFolder();
      return folder ? sessions.get(folder.uri.toString()) : null;
    })()
    ?? null;
}

async function setActivePreviewLocked(locked) {
  const session = activePreviewSession();
  if (!session?.panel) {
    return;
  }
  session.locked = locked;
  updatePreviewPanelTitle(session);
  updateLockContext();
  if (!locked) {
    await followActiveEditor(vscode.window.activeTextEditor);
  }
}

function updateLockContext() {
  const session = activePreviewSession();
  vscode.commands.executeCommand('setContext', 'microwebstacks.previewLocked', Boolean(session?.locked));
}

function handleConfigurationChange(event) {
  if (!event.affectsConfiguration('microwebstacks.preview')) {
    return;
  }
  for (const session of sessions.values()) {
    if (!event.affectsConfiguration('microwebstacks.preview', session.workspaceFolder.uri)) {
      continue;
    }
    const next = configurationSnapshot(session.workspaceFolder);
    if (next === session.configSnapshot) {
      continue;
    }
    session.configSnapshot = next;
    if (session.configRestartQueued) {
      continue;
    }
    session.configRestartQueued = true;
    enqueueSession(session, async () => {
      try {
        const restarted = await restartSession(extensionContext, session);
        if (restarted) {
          vscode.window.showInformationMessage(`Markdown Site Preview restarted for ${session.workspaceFolder.name} after a configuration change.`);
        }
      } finally {
        session.configRestartQueued = false;
      }
    });
  }
}

module.exports = {
  activate,
  deactivate
};

// Test-only seam (plans/2026-07/09/vsix-packaging-performance): exposes the
// engine extraction/activation internals so a harness can exercise AD-003's
// failure scenarios (bad manifest, digest mismatch, corrupt tar, missing
// runtime files, wrong version, missing vendored deps, failure cleanup)
// directly, without a separate transport. It is an internal diagnostic API;
// no command or webview surface exposes it to rendered content.
module.exports.__testInternals = {
    hasBundledEnginePackage,
    hydrateBundledEngine,
    installEngine,
    extractAndActivateEngine,
    activateWithStorageLock,
    cleanupOldEngines,
    extractTarGz,
    runActivationDiagnostics,
    isUsableInstalledEngine,
    isEngineRoot,
    getBundledEnginePackageRoot,
    getEnginePrefix,
    getBundledEnginePrefix,
    getInstalledEngineRoot,
    getBundledInstalledEngineRoot,
    getSessionSnapshots,
    disposePanel: disposeTestPanel
  };
