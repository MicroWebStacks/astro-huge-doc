import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseMarkdownFrontmatter } from '../packages/content-structure/src/frontmatter.js';
import {iterate_documents, set_config} from '../packages/content-structure/src/collect.js';

test('malformed YAML front matter preserves the body and salvages valid fields above the error', () => {
    const source = '---\ntitle: Kept\ncontext-domains: *\n---\n\n# Kept';

    const parsed = parseMarkdownFrontmatter(source, 'fixtures/broken.md');

    assert.deepEqual(parsed.data, {title: 'Kept'});
    assert.equal(parsed.content, '# Kept');
});

test('valid YAML front matter still supplies metadata and strips its wrapper', () => {
    const parsed = parseMarkdownFrontmatter('---\ntitle: Working\n---\n\n# Body', 'fixtures/working.md');

    assert.deepEqual(parsed.data, {title: 'Working'});
    assert.equal(parsed.content, '\n# Body');
});

test('collection keeps malformed documents and continues with valid documents', async () => {
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

        assert.equal(sources.length, 2);
        assert.deepEqual(sources.map(source => source.entry.path).sort(), ['broken.md', 'working.md']);
        assert.equal(sources.find(source => source.entry.path === 'broken.md').markdownText, '# Broken');
    }finally{
        process.chdir(originalCwd);
        rmSync(contentDir, {recursive:true, force:true});
    }
});
