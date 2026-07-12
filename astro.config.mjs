import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import { baseAstroConfig } from './astro.config.shared.mjs';

// Server/SSR target (Node adapter). This is the default engine target used
// by the VS Code extension and `pnpm build`/`pnpm server`. The static target
// lives in astro.config.static.mjs and must not be selected by default here.
export default defineConfig({
  ...baseAstroConfig(),
  adapter: node({
    mode: 'middleware',
  }),
  output: 'server'
});
