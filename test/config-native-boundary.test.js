import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const configSource = await readFile(new URL('../config.js', import.meta.url), 'utf8');

test('json/static config keeps better-sqlite3 runtime-only for Vite', () => {
  assert.doesNotMatch(
    configSource,
    /import\(\s*['"]better-sqlite3['"]\s*\)/,
    'a literal import makes Vite resolve the absent native package during json/static builds'
  );
  assert.match(configSource, /const SQLITE_MODULE_SPECIFIER = ['"]better-sqlite3['"]/);
  assert.match(
    configSource,
    /import\(\/\*\s*@vite-ignore\s*\*\/\s*SQLITE_MODULE_SPECIFIER\)/,
    'the sqlite-only runtime import must remain opaque to Vite'
  );
});
