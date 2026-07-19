# Validation

## Focused stale-cache regression

Command:

```text
node --test test/details-directive-cache.test.js
```

Result: pass. A deliberately stale, hash-matching version-2 record was rejected
and reparsed. The resulting directive AST was exactly
`{name: "details", attributes: {summary: "build log"}, childCount: 1}` and the
next flattened row was the code item.

## Real-page HTML containment

Started the Astro development server and requested
`http://127.0.0.1:4321/other/sound`. Assertions passed:

- HTTP status was 200;
- exactly one wrapper for `other.sound.code-2.bash` existed;
- that wrapper was between the opening and closing tags of the `<details>`
  whose `<summary>` contains `build log`;
- therefore no duplicate build-log wrapper existed outside the collapsible.

The same containment assertion passed against the freshly built SSR server
(`node server/server.js`).

## Full suite

Command:

```text
node --test "test/**/*.test.js"
```

Result: 32 passed, 0 failed.

## Production build

Command equivalent to `pnpm build`:

```text
node node_modules/astro/astro.js build
```

Result: pass. The SSR server and client bundles completed successfully. The
existing dynamic-route and large-chunk warnings remained non-fatal.

## Environment note

The in-app browser surface was unavailable in this session, so the proof used
exact HTTP/HTML structural assertions against both development and built
runtimes. The collapsible is a native `<details>` element; placing the only
code wrapper inside that element is the browser-independent condition required
for closed state to hide it.
