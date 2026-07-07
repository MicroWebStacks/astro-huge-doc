import {spawnSync} from 'node:child_process';
import path from 'node:path';
import fsp from 'node:fs/promises';

function runCapture(command, cliArgs, options = {}) {
  const result = spawnSync(command, cliArgs, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function buildArtifactMetadata({repoRoot, kind, version, engineVersion = null}) {
  const cwd = path.resolve(repoRoot);
  const gitCommit = runCapture('git', ['rev-parse', 'HEAD'], {cwd});
  const gitCommitShort = runCapture('git', ['rev-parse', '--short', 'HEAD'], {cwd});
  const gitBranch = runCapture('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {cwd});
  const gitStatus = runCapture('git', ['status', '--short'], {cwd});

  return {
    kind,
    version,
    ...(engineVersion ? {engineVersion} : {}),
    builtAt: new Date().toISOString(),
    gitCommit,
    gitCommitShort,
    gitBranch,
    gitDirty: Boolean(gitStatus)
  };
}

export async function writeBuildMetadata(filePath, metadata) {
  await fsp.mkdir(path.dirname(filePath), {recursive: true});
  await fsp.writeFile(filePath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
}

export function formatBuildMetadata(metadata) {
  if (!metadata) {
    return 'build metadata unavailable';
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
  return parts.join(', ');
}
