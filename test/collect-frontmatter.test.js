import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseMarkdownFrontmatter } from '../packages/content-structure/src/frontmatter.js';
import {iterate_documents, set_config} from '../packages/content-structure/src/collect.js';

test('malformed YAML front matter returns a document skip signal', () => {
    const source = '---\nname: broken\ncontext-domains: *\n---\n\n# Kept';

    const parsed = parseMarkdownFrontmatter(source, 'fixtures/broken.md');

    assert.equal(parsed, null);
});

test('valid YAML front matter still supplies metadata and strips its wrapper', () => {
    const parsed = parseMarkdownFrontmatter('---\ntitle: Working\n---\n\n# Body', 'fixtures/working.md');

    assert.deepEqual(parsed.data, {title: 'Working'});
    assert.equal(parsed.content, '\n# Body');
});

test('collection skips a malformed document and continues with valid documents', async () => {
    const contentDir = mkdtempSync(path.join(os.tmpdir(), 'content-structure-frontmatter-'));
    const originalCwd = process.cwd();
    try{
        writeFileSync(path.join(contentDir, 'broken.md'), '---\ncontext-domains: *\n---\n\n# Broken');
        writeFileSync(path.join(contentDir, 'working.md'), '---\ntitle: Working\n---\n\n# Body');
        set_config({rootdir:contentDir, contentdir:contentDir, folder_single_doc:false});
        process.chdir(contentDir);

        const sources = [];
        for await (const source of iterate_documents()){
            sources.push(source);
        }

        assert.equal(sources.length, 1);
        assert.equal(sources[0].entry.path, 'working.md');
        assert.equal(sources[0].markdownText, '\n# Body');
    }finally{
        process.chdir(originalCwd);
        rmSync(contentDir, {recursive:true, force:true});
    }
});
