import { config } from '../config.js';
import { collect } from 'content-structure';

async function main() {
  const collectConfig = config.collect_content;

  console.log("content-structure: starting collect()");
  collectConfig.version_id = await collect(collectConfig);
  console.log(`content-structure: collect() finished (version: ${collectConfig.version_id})`);

}

main().catch((err) => {
  console.error("content-structure standalone runner: error", err);
  process.exit(1);
});
