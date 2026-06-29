import { defineConfig, passthroughImageService } from 'astro/config';
import node from '@astrojs/node';
import {config} from './config.js'
import yaml from '@rollup/plugin-yaml';
import react from "@astrojs/react";
import {fileURLToPath} from 'node:url';

// Lite profile has no sharp: use Astro's passthrough image service so
// astro:assets never invokes the native optimizer. Full keeps the default
// (sharp) service for optimization.
const isLite = config.profile === 'lite';

// Lite gates full-only client islands (model-viewer) so they never render.
// Alias their heavy side-effect imports to an empty module so the bundled
// code (model-viewer + its three.js, ~980 kB) stays out of the lite dist.
const emptyModule = fileURLToPath(new URL('./src/libs/empty-module.js', import.meta.url));
const liteAliases = isLite ? {'@google/model-viewer': emptyModule} : {};

export default defineConfig({
  integrations: [react()],
  adapter: node({
    mode: 'middleware',
  }),
  output: "server",
  outDir: config.outDir,
  trailingSlash: 'ignore',
  ...(isLite ? {image: {service: passthroughImageService()}} : {}),
  vite: {
    plugins: [yaml()],
    resolve: {
      alias: liteAliases
    },
    ssr: {
      external: ['better-sqlite3']
    },
    optimizeDeps: {
      exclude: ['better-sqlite3']
    }
  }
});
