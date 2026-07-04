/*
 * Environment preload.
 *
 * Loads the workspace root `.env` and lets it OVERRIDE any pre-existing shell /
 * global environment variables. This makes the root `.env` the single, explicit
 * source of truth for configuration on a machine, ahead of ambient env.
 *
 * Precedence (highest wins):
 *   root `.env`  >  shell / global env  >  manifest.yaml  >  built-in defaults
 *
 * Import this module for its side effect BEFORE anything reads `process.env`
 * (notably at the very top of `config.js`, the universal config chokepoint).
 *
 * The `.env` location follows the workspace root used by `config.js`
 * (MICROWEBSTACKS_WORKSPACE_ROOT, falling back to the current working dir), so a
 * VS Code extension launching the engine against a separate docs workspace gets
 * that workspace's `.env`.
 */
import {resolve, join} from 'node:path';
import * as dotenv from 'dotenv';

const workspaceRoot = resolve(process.env.MICROWEBSTACKS_WORKSPACE_ROOT ?? process.cwd());

// The VS Code extension launches the engine with explicit runtime config
// (profile, backend, port, paths) that a previewed workspace's `.env` must not
// clobber. It sets MICROWEBSTACKS_DOTENV_OVERRIDE=false so the `.env` only
// fills in keys the launcher did not set. CLI use keeps override semantics.
const override = process.env.MICROWEBSTACKS_DOTENV_OVERRIDE !== 'false';

dotenv.config({path: join(workspaceRoot, '.env'), override});
