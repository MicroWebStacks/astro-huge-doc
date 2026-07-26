/*
 * Phase 5 (WP-24 / R-9) cover for sub-path deployments.
 *
 * Both base values must work: "/" for a user site and "/<repo>/" for a project
 * site. Only the second exercises the prefixing, so a link that hardcodes a
 * leading "/" looks perfect until the day someone deploys under a path — which
 * is exactly what happened here. Building the sub-path artifact found 95
 * internal links (every `:button[]{link=/...}` and every authored
 * root-absolute markdown link) emitted without the prefix, so they resolved
 * against the domain root and 404'd.
 *
 * These tests pin the rule that fixed them. The end-to-end check — build with
 * MICROWEBSTACKS_BASE and assert no unprefixed root-absolute href/src remains —
 * is recorded in the packet's test.md; it needs a 40 s build and so is not run
 * from here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {basePrefix, withBasePrefix, blobFileUrl} from '../src/libs/blob-files.js';

test('basePrefix normalizes both deployment shapes', () => {
    assert.equal(basePrefix('/'), '');
    assert.equal(basePrefix(''), '');
    assert.equal(basePrefix('/astro-huge-doc/'), '/astro-huge-doc');
    assert.equal(basePrefix('astro-huge-doc'), '/astro-huge-doc');
});

test('withBasePrefix is a no-op at the root base', () => {
    for (const url of ['/data/firmware.zip', '/protocols/thread/', '/images/a.webp']) {
        assert.equal(withBasePrefix(url, '/'), url);
    }
});

test('withBasePrefix prefixes root-absolute internal links under a sub-path base', () => {
    assert.equal(withBasePrefix('/data/firmware.zip', '/astro-huge-doc/'), '/astro-huge-doc/data/firmware.zip');
    assert.equal(withBasePrefix('/protocols/thread/', '/astro-huge-doc/'), '/astro-huge-doc/protocols/thread/');
    assert.equal(withBasePrefix('/', '/astro-huge-doc/'), '/astro-huge-doc/');
});

test('withBasePrefix leaves everything that is not a root-absolute path alone', () => {
    const base = '/astro-huge-doc/';
    assert.equal(withBasePrefix('https://example.invalid/a.glb', base), 'https://example.invalid/a.glb');
    assert.equal(withBasePrefix('//cdn.example.invalid/a.js', base), '//cdn.example.invalid/a.js');
    assert.equal(withBasePrefix('#section', base), '#section');
    assert.equal(withBasePrefix('./sibling.md', base), './sibling.md');
    assert.equal(withBasePrefix('relative/page', base), 'relative/page');
    assert.equal(withBasePrefix('', base), '');
});

test('withBasePrefix is idempotent, so a rebuild cannot double-prefix', () => {
    const base = '/astro-huge-doc/';
    const once = withBasePrefix('/data/firmware.zip', base);
    assert.equal(withBasePrefix(once, base), once);
    assert.equal(withBasePrefix('/astro-huge-doc', base), '/astro-huge-doc');
});

test('blob urls carry the same prefix', () => {
    assert.equal(blobFileUrl('abc123', 'webp', '/'), '/blobs/abc123.webp');
    assert.equal(blobFileUrl('abc123', 'webp', '/astro-huge-doc/'), '/astro-huge-doc/blobs/abc123.webp');
});
