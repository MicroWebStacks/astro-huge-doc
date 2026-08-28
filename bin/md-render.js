#!/usr/bin/env node
// Public CLI entry point for @microwebstacks/md-render.
//
// Usage:
//   md-render preview [workspace] [--docs-root <path>] [--manifest <path>] \
//     [--host <host>] [--port <port>] [--no-open] [--keep]
//   md-render build --workspace <path> --out-dir <path> \
//     [--manifest <path>] [--site <absolute-url>] [--base <path>]
//
// See specification/reusable-render/spec.md for the full command contract.
import { runBuildCommand } from '../src/libs/render-build.js';
import { runPreviewCommand } from '../src/libs/render-preview.js';

const USAGE = {
  build:
    'md-render build --workspace <path> --out-dir <path> [--manifest <path>] [--site <url>] [--base <path>]',
  preview: [
    'md-render preview [workspace]',
    '',
    '  --docs-root <path>   content root inside the workspace (default: the workspace itself)',
    '  --manifest <path>    manifest to use',
    '  --host <host>        default 127.0.0.1',
    '  --port <port>        default 4321 (0 picks any free port)',
    '  --no-open            do not open a browser',
    '  --keep               keep the temporary artifact and print its location'
  ].join('\n')
};

const COMMANDS = {
  build: { run: runBuildCommand, usage: USAGE.build },
  preview: { run: runPreviewCommand, usage: USAGE.preview }
};

function printUsage(stream = console.error) {
  stream(`Usage:\n  ${USAGE.build}\n\n${USAGE.preview}`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === '--help' || command === '-h' || command === 'help') {
    printUsage(console.log);
    return;
  }
  const entry = COMMANDS[command];
  if (!entry) {
    console.error(`md-render: unknown command "${command ?? ''}"`);
    printUsage();
    process.exitCode = 1;
    return;
  }
  try {
    await entry.run(rest, { log: (message) => console.log(message) });
  } catch (error) {
    const category = error?.category ?? 'unknown_error';
    console.error(`md-render ${command}: ${category}: ${error.message}`);
    if (error?.buildRoot) {
      console.error(`md-render ${command}: kept temporary artifact at ${error.buildRoot}`);
    }
    if (category === 'invalid_configuration') {
      console.error(`Usage: ${entry.usage}`);
    }
    process.exitCode = 1;
  }
}

main();
