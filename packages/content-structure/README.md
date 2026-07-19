# content-structure (in-repo)

Markdown collection and parsing layer of the astro-huge-doc engine: walks a
content tree, parses markdown to mdast, and stores the result in the SQLite or
JSON backend consumed by the render layer.

This package was adopted from the standalone
[content-structure](https://github.com/MicroWebStacks/content-structure)
repository on 2026-07-13 (source commit `2de04f9`, npm version 2.2.4) —
decision OP-003 in `plans/2026-07/13/extension-performance/plan.md`. This
engine is its only consumer; maintaining it here removes the cross-package
release cycle. It is `private` and is **never published to npm** — the
external repository is frozen at 2.2.4.

Consumed as a pnpm workspace package under its original import name, so
imports are unchanged:

```js
import { collect } from 'content-structure';
import { openDatabase } from 'content-structure/src/sqlite_utils/index.js';
```

At engine release time, `scripts/stage-engine.js` copies this directory into
the staged package's vendored `_modules/` tree (npm cannot resolve
`workspace:*`) and merges its runtime dependencies into the staged dependency
list.
