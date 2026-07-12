// Standalone runner: prints the env-resolved config as JSON on stdout.
//
// Spawned as its own process (fresh env, fresh module graph) so callers get
// the exact same path resolution collect.js/diagrams.js/astro build will use,
// without re-implementing config.js's manifest/env merging.
import { config } from '../../config.js';

process.stdout.write(JSON.stringify({
  contentPath: config.content_path
}));
