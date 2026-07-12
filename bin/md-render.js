#!/usr/bin/env node
// Public CLI entry point for @microwebstacks/md-render.
//
// Usage:
//   md-render build --workspace <path> --out-dir <path> \
//     [--manifest <path>] [--site <absolute-url>] [--base <path>]
//
// See specification/reusable-render/spec.md for the full command contract.
import { runBuildCommand } from '../src/libs/render-build.js';

const USAGE =
  'md-render build --workspace <path> --out-dir <path> [--manifest <path>] [--site <url>] [--base <path>]';

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== 'build') {
    console.error(`md-render: unknown command "${command ?? ''}"\nUsage: ${USAGE}`);
    process.exitCode = 1;
    return;
  }
  try {
    await runBuildCommand(rest, { log: (message) => console.log(message) });
  } catch (error) {
    const category = error?.category ?? 'unknown_error';
    console.error(`md-render build: ${category}: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
