// Astro config pieces shared by every output target (server, static, ...).
// astro.config.mjs (server/SSR) and astro.config.static.mjs (static) each
// call baseAstroConfig() and layer their own output/adapter/integrations on
// top, so profile-driven behavior (lite image service, model-viewer gating,
// better-sqlite3 externalization) is defined once and cannot drift between
// targets.
import { passthroughImageService } from 'astro/config';
import { config } from './config.js';
import yaml from '@rollup/plugin-yaml';
import react from '@astrojs/react';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const isLite = config.profile === 'lite';

// Vite's default optimize-deps cache (`node_modules/.vite`) is shared by every
// Astro invocation in this checkout unless told otherwise. A one-shot `astro
// build` run alongside a live `astro dev` server (e.g. a maintainer verifying
// a change while a preview tab stays open) rewrites that shared cache mid-air;
// the dev server keeps serving stale chunk URLs against files the build just
// replaced, and a client dependency that is only pulled in on demand (PlantUML
// via plantuml-render.js's dynamic import) 504s the next time it's requested.
// This actually happened during 2026-07-15 verification work (see
// specification/run-modes/spec.md). Keying the cache dir off the Astro
// subcommand (dev/build/preview) makes that class of collision structurally
// impossible instead of relying on operators never doing this.
function viteCacheDir() {
  const command = process.argv[2];
  const suffix = command === 'dev' ? 'dev' : command === 'preview' ? 'preview' : 'build';
  return `node_modules/.vite-${suffix}`;
}

// Lite gates full-only client islands (model-viewer) so they never render.
// Alias their heavy side-effect imports to an empty module so the bundled
// code (model-viewer + its three.js, ~980 kB) stays out of the lite dist.
const emptyModule = fileURLToPath(new URL('./src/libs/empty-module.js', import.meta.url));
const liteAliases = isLite ? { '@google/model-viewer': emptyModule } : {};

// `public/` holds the *workspace's* root-absolute static assets (`/images/x.png`
// written literally in a document), not the engine's. Astro's default resolves
// publicDir against the Astro --root, which is always the engine (see
// src/libs/render-build.js: `astro build --root engineRoot`), so the default
// pointed every deployment at the engine checkout's own public/ folder.
//
// Two things went wrong with that. A consumer running `md-render build
// --workspace their-docs` got the engine's public/ baked into their site and
// their own public/ ignored entirely. And when this repo started fetching a
// content set into its public/ (manifest.yaml fetch entries, 2026-07-25), that
// content became part of every published engine artifact - 86.8 MB of it,
// twice, which is what npm rejected on the 0.0.20 publish attempt.
//
// config.js already anchors every workspace-owned path to workspaceRoot
// (content_path, storePath, jsonDir, collect.rootdir) and every engine-owned
// path to engineRoot (outDir). publicDir belongs to the first group; this puts
// it there. A workspace with no public/ directory is normal - Astro skips a
// missing publicDir and emits no static assets.
function workspacePublicDir() {
  return join(config.workspaceRoot, 'public');
}

export function baseAstroConfig() {
  return {
    integrations: [react()],
    outDir: config.outDir,
    publicDir: workspacePublicDir(),
    trailingSlash: 'ignore',
    ...(isLite ? { image: { service: passthroughImageService() } } : {}),
    vite: {
      cacheDir: viteCacheDir(),
      plugins: [yaml()],
      resolve: {
        alias: liteAliases
      },
      ssr: {
        // Native SQLite and the lazy Markdown parser stay runtime-resolved.
        // The extension package vendors all three under node_modules; keeping
        // content-structure external also preserves its first-request dynamic
        // import boundary instead of making Vite parse/bundle jsdom at build
        // time (which both breaks the deferred-load contract and trips over
        // cssstyle's generated source).
        external: ['better-sqlite3', 'content-structure', 'gray-matter']
      },
      optimizeDeps: {
        exclude: ['better-sqlite3', 'content-structure', 'gray-matter']
      }
    }
  };
}
