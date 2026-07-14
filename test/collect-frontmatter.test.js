import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdownFrontmatter } from '../packages/content-structure/src/frontmatter.js';

test('malformed YAML front matter is retained as Markdown instead of aborting collection', () => {
    const source = '---\nname: broken\ncontext-domains: *\n---\n\n# Kept';

    const parsed = parseMarkdownFrontmatter(source, 'fixtures/broken.md');

    assert.deepEqual(parsed.data, {});
    assert.equal(parsed.content, source);
});

test('valid YAML front matter still supplies metadata and strips its wrapper', () => {
    const parsed = parseMarkdownFrontmatter('---\ntitle: Working\n---\n\n# Body', 'fixtures/working.md');

    assert.deepEqual(parsed.data, {title: 'Working'});
    assert.equal(parsed.content, '\n# Body');
});
