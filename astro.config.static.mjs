import { defineConfig } from 'astro/config';
import { existsSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { baseAstroConfig } from './astro.config.shared.mjs';
import { config } from './config.js';
import { resolveBlobsSourceDir } from './src/libs/blob-files.js';

// True Astro static output: no Node adapter, every route prerendered.
// [...url].astro supplies getStaticPaths() (via getDocuments()) so the
// catch-all route enumerates from the collected content instead of relying
// on request-time matching. Content-addressed blobs are not part of the
// Astro asset pipeline, so they are copied into the output directory
// explicitly by the integration below (mirrors the SSR /blobs/ middleware,
// see src/middleware.js and src/libs/blob-files.js#resolveBlobsSourceDir).
function staticBlobsIntegration() {
  const sourceDir = resolveBlobsSourceDir(config);
  return {
    name: 'md-render-static-blobs',
    hooks: {
      'astro:build:done': async ({ dir }) => {
        if (!existsSync(sourceDir)) {
          console.warn(`astro.config.static: no blobs directory at ${sourceDir}; skipping copy.`);
          return;
        }
        const targetDir = fileURLToPath(new URL('blobs/', dir));
        await cp(sourceDir, targetDir, { recursive: true });
      }
    }
  };
}

const base = baseAstroConfig();

export default defineConfig({
  ...base,
  integrations: [...base.integrations, staticBlobsIntegration()],
  output: 'static',
  base: config.base,
  ...(config.site ? { site: config.site } : {})
});
