import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import {config} from './config.js'
import yaml from '@rollup/plugin-yaml';

export default defineConfig({
  adapter: node({
    mode: 'middleware',
  }),
  output: "server",
  outDir: config.outDir,
  trailingSlash: 'ignore',
  vite: {
    plugins: [yaml()],
    ssr: {
      external: ['better-sqlite3']
    },
    optimizeDeps: {
      exclude: ['better-sqlite3']
    }
  }
});
