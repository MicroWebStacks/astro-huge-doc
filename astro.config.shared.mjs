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

const isLite = config.profile === 'lite';

// Lite gates full-only client islands (model-viewer) so they never render.
// Alias their heavy side-effect imports to an empty module so the bundled
// code (model-viewer + its three.js, ~980 kB) stays out of the lite dist.
const emptyModule = fileURLToPath(new URL('./src/libs/empty-module.js', import.meta.url));
const liteAliases = isLite ? { '@google/model-viewer': emptyModule } : {};

export function baseAstroConfig() {
  return {
    integrations: [react()],
    outDir: config.outDir,
    trailingSlash: 'ignore',
    ...(isLite ? { image: { service: passthroughImageService() } } : {}),
    vite: {
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
