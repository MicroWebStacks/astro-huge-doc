#!/usr/bin/env node
// Runs only from the *published* @microwebstacks/md-render package, as its
// postinstall step (wired in by scripts/stage-engine.js; the source repo's own
// package.json has no postinstall).
//
// `content-structure` is a private workspace package that is never published
// to the registry, so npm cannot install it for a consumer. The tarball
// carries it inside `_modules/`, because npm's packer refuses to ship any
// directory literally named node_modules. The VS Code extension renames that
// whole tree back to node_modules after extracting, and never runs npm - but
// an `npm install` / `npx` consumer gets its registry dependencies installed
// normally and `_modules/` left as-is, where neither Node nor Rollup can see
// it. `md-render build` then dies resolving `content-structure/src/identity.js`.
//
// Copying just this one package into the engine's own node_modules is enough:
// stage-engine already declares content-structure's runtime dependencies as
// md-render's own, so they are installed at the consumer's top level and
// resolve upward from here. The rest of `_modules/` stays untouched - the npm
// consumer does not need it, and duplicating a second full dependency tree
// alongside npm's own is what produces mismatched-binary failures (esbuild
// host/binary version).
import { cp, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE = 'content-structure';

async function isDirectory(target) {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

async function main() {
  const destination = path.join(packageRoot, 'node_modules', PACKAGE);
  if (await isDirectory(destination)) {
    return;
  }
  const source = path.join(packageRoot, '_modules', PACKAGE);
  if (!(await isDirectory(source))) {
    // A source checkout, or a staging run made with --no-vendor. Nothing to
    // do; the workspace resolves the package on its own.
    return;
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, {
    recursive: true,
    // Its own dependencies come from the consumer's top-level install.
    filter: (entry) => path.basename(entry) !== 'node_modules'
  });
  console.log(`md-render: linked ${PACKAGE} into ${path.relative(packageRoot, destination)}`);
}

main().catch((error) => {
  // A failed postinstall must not fail the whole install; the build will
  // report the missing package clearly enough if this did not work.
  console.warn(`md-render: could not stage ${PACKAGE} (${error.message}); \`md-render build\` may fail to resolve it.`);
});
