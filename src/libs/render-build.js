// Public "build" command lifecycle: parse arguments, resolve isolated
// paths, orchestrate the existing collect / diagrams / astro-build entry
// points as subprocesses (each gets a fresh env-driven config.js import),
// and copy the finished static artifact into the caller's --out-dir.
//
// Contract: specification/reusable-render/spec.md. Fixed for this command:
// output=static, DOCS_BACKEND=json, DOCS_PROFILE=full.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIN_NODE_MAJOR = 22;

class BuildError extends Error {
  constructor(category, message) {
    super(message);
    this.name = 'BuildError';
    this.category = category;
  }
}

function checkNodeVersion(nodeVersion = process.version) {
  const major = Number(nodeVersion.replace(/^v/, '').split('.')[0]);
  if (!Number.isFinite(major) || major < MIN_NODE_MAJOR) {
    throw new BuildError(
      'invalid_configuration',
      `md-render requires Node ${MIN_NODE_MAJOR}+ (running ${nodeVersion}).`
    );
  }
}

// Pure: turns argv into a raw args object. No filesystem access, no
// defaults beyond what the flags themselves carry, so it is fast to test.
function parseBuildArgs(argv) {
  const args = { workspace: null, outDir: null, manifest: null, site: null, base: null };
  const flagToKey = {
    '--workspace': 'workspace',
    '--out-dir': 'outDir',
    '--manifest': 'manifest',
    '--site': 'site',
    '--base': 'base'
  };
  const unknown = [];
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
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
  if (!args.workspace) {
    throw new BuildError('invalid_configuration', '--workspace is required');
  }
  if (!args.outDir) {
    throw new BuildError('invalid_configuration', '--out-dir is required');
  }
  return args;
}

// Blocks an --out-dir that would delete something other than a prior build:
// the workspace root, the content directory, the engine checkout, or a
// filesystem root. Copy-in only ever touches outDirAbs itself, so the risk
// is exclusively "outDirAbs equals or contains one of these".
function assertSafeOutDir(outDirAbs, protectedPaths) {
  const root = path.parse(outDirAbs).root;
  if (outDirAbs === root) {
    throw new BuildError('unsafe_output_path', `--out-dir must not be a filesystem root: ${outDirAbs}`);
  }
  for (const protectedPath of protectedPaths) {
    if (!protectedPath) {
      continue;
    }
    if (outDirAbs === protectedPath) {
      throw new BuildError('unsafe_output_path', `--out-dir must not be ${protectedPath}`);
    }
    const rel = path.relative(outDirAbs, protectedPath);
    const outDirIsAncestor = rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
    if (outDirIsAncestor) {
      throw new BuildError(
        'unsafe_output_path',
        `--out-dir must not contain ${protectedPath} (would delete it on rebuild): ${outDirAbs}`
      );
    }
  }
}

// Fixed contract env (DOCS_BACKEND/DOCS_PROFILE/DOCS_OUTPUT) plus the
// isolated paths this invocation resolved, layered over the ambient
// process env so PATH/HOME/etc. survive. MICROWEBSTACKS_DOTENV_OVERRIDE=false
// makes these explicit values win over a workspace's own .env (see
// src/libs/load-env.js) instead of being silently clobbered by it.
function buildEnv({ workspaceAbs, engineRoot, manifestAbs, storeAbs, dbPathAbs, outDirAbs, site, base }) {
  return {
    ...process.env,
    DOCS_BACKEND: 'json',
    DOCS_PROFILE: 'full',
    DOCS_OUTPUT: 'static',
    MICROWEBSTACKS_DOTENV_OVERRIDE: 'false',
    MICROWEBSTACKS_WORKSPACE_ROOT: workspaceAbs,
    MICROWEBSTACKS_ENGINE_ROOT: engineRoot,
    MICROWEBSTACKS_OUTDIR: outDirAbs,
    MICROWEBSTACKS_STORE_PATH: storeAbs,
    MICROWEBSTACKS_DB_PATH: dbPathAbs,
    ...(manifestAbs ? { MICROWEBSTACKS_MANIFEST_PATH: manifestAbs } : {}),
    ...(site ? { MICROWEBSTACKS_SITE: site } : {}),
    ...(base ? { MICROWEBSTACKS_BASE: base } : {})
  };
}

function runCapture(execPath, scriptArgs, { cwd, env }, category, label) {
  const result = spawnSync(execPath, scriptArgs, { cwd, env, encoding: 'utf8' });
  if (result.error) {
    throw new BuildError(category, `${label} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new BuildError(category, `${label} exited with code ${result.status}: ${(result.stderr || '').trim()}`);
  }
  return result.stdout;
}

function runStreamed(execPath, scriptArgs, { cwd, env }, category, label) {
  const result = spawnSync(execPath, scriptArgs, { cwd, env, stdio: 'inherit' });
  if (result.error) {
    throw new BuildError(category, `${label} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new BuildError(category, `${label} failed (exit code ${result.status ?? 'unknown'})`);
  }
}

function probeConfig(engineRoot, env) {
  const probePath = path.join(engineRoot, 'src', 'libs', 'config-probe.js');
  const stdout = runCapture(process.execPath, [probePath], { cwd: engineRoot, env }, 'invalid_configuration', 'config resolution');
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new BuildError('invalid_configuration', `config resolution produced unreadable output: ${error.message}`);
  }
}

function assertContentPresent(contentPath) {
  if (!existsSync(contentPath)) {
    throw new BuildError('missing_content', `content directory not found: ${contentPath}`);
  }
  if (readdirSync(contentPath).length === 0) {
    throw new BuildError('missing_content', `content directory is empty: ${contentPath}`);
  }
}

// The three stages a real build runs, as injectable steps so tests can
// substitute fast fakes without spawning collect/diagrams/astro for real.
// Each receives the resolved {engineRoot, env} and throws BuildError on
// failure; defaultBuildSteps are what `md-render build` actually runs.
const defaultBuildSteps = [
  {
    name: 'collect',
    run: ({ engineRoot, env }) => {
      const scriptPath = path.join(engineRoot, 'scripts', 'collect.js');
      runStreamed(process.execPath, [scriptPath], { cwd: engineRoot, env }, 'collection_failed', 'collect');
    }
  },
  {
    name: 'diagrams',
    run: ({ engineRoot, env }) => {
      const scriptPath = path.join(engineRoot, 'scripts', 'diagrams.js');
      runStreamed(process.execPath, [scriptPath], { cwd: engineRoot, env }, 'diagram_failed', 'diagrams');
    }
  },
  {
    name: 'astro-build',
    run: ({ engineRoot, env }) => {
      const astroBin = path.join(engineRoot, 'node_modules', 'astro', 'astro.js');
      // Astro resolves --config as `path.join(root, configFile)`, so this must
      // stay a bare filename (relative to --root), not an absolute path.
      runStreamed(
        process.execPath,
        [astroBin, 'build', '--root', engineRoot, '--config', 'astro.config.static.mjs'],
        { cwd: engineRoot, env },
        'build_failed',
        'astro build'
      );
    }
  }
];

function resolveEngineRoot() {
  // src/libs/render-build.js -> repo (or staged package) root is two levels up.
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

async function runBuildCommand(argv, { log = () => {}, steps = defaultBuildSteps, nodeVersion = process.version } = {}) {
  checkNodeVersion(nodeVersion);
  const args = parseBuildArgs(argv);

  const workspaceAbs = path.resolve(args.workspace);
  if (!existsSync(workspaceAbs)) {
    throw new BuildError('missing_content', `workspace not found: ${workspaceAbs}`);
  }
  const outDirAbs = path.resolve(args.outDir);
  const manifestAbs = args.manifest ? path.resolve(args.manifest) : undefined;
  if (manifestAbs && !existsSync(manifestAbs)) {
    throw new BuildError('invalid_configuration', `manifest not found: ${manifestAbs}`);
  }

  const engineRoot = resolveEngineRoot();
  const buildRoot = mkdtempSync(path.join(os.tmpdir(), 'md-render-build-'));
  const storeAbs = path.join(buildRoot, 'store');
  const dbPathAbs = path.join(storeAbs, 'content.db');
  const stagedOutDirAbs = path.join(buildRoot, 'dist');

  try {
    const env = buildEnv({
      workspaceAbs,
      engineRoot,
      manifestAbs,
      storeAbs,
      dbPathAbs,
      outDirAbs: stagedOutDirAbs,
      site: args.site,
      base: args.base
    });

    const resolved = probeConfig(engineRoot, env);
    assertContentPresent(resolved.contentPath);
    assertSafeOutDir(outDirAbs, [workspaceAbs, resolved.contentPath, engineRoot]);

    for (const step of steps) {
      log(`md-render build: running ${step.name}...`);
      step.run({ engineRoot, env, buildRoot });
    }

    if (!existsSync(stagedOutDirAbs)) {
      throw new BuildError('build_failed', `astro build did not produce an output directory at ${stagedOutDirAbs}`);
    }

    await fsp.rm(outDirAbs, { recursive: true, force: true });
    await fsp.mkdir(path.dirname(outDirAbs), { recursive: true });
    await fsp.cp(stagedOutDirAbs, outDirAbs, { recursive: true });

    log(`md-render build: artifact written to ${outDirAbs}`);
    return { outDir: outDirAbs };
  } finally {
    await fsp.rm(buildRoot, { recursive: true, force: true });
  }
}

export {
  BuildError,
  parseBuildArgs,
  assertSafeOutDir,
  buildEnv,
  checkNodeVersion,
  probeConfig,
  assertContentPresent,
  defaultBuildSteps,
  resolveEngineRoot,
  runBuildCommand
};
