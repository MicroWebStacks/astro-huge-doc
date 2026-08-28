#!/usr/bin/env node
// End-to-end proof that `md-render preview` serves the *normal* full website:
// a bare Markdown folder is built and served through the real command, then a
// real browser opens a gallery in PhotoSwipe, walks it, and closes it.
//
// The CLI adds no gallery logic of its own (specification/reusable-render/spec.md);
// this exists so a regression in the shared full render path is caught here
// rather than by a user running npx. Kept out of `pnpm test` because it runs a
// full Astro build and a browser - same reasoning as `pnpm test:extension`.
//
// Usage: node scripts/check-preview-gallery.js [--headed] [--keep]
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import { runPreviewCommand } from '../src/libs/render-preview.js';

const argv = process.argv.slice(2);
const headed = argv.includes('--headed');
const keepFixture = argv.includes('--keep');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

// A real PNG, generated rather than committed, so the fixture stays text.
function makePng(r, g, b, size = 16) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = y * (size * 3 + 1) + 1 + x * 3;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
    }
  }
  const crc = (buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) {
      c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const typed = Buffer.concat([Buffer.from(type), data]);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc(typed));
    return Buffer.concat([length, typed, checksum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function makeFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'md-render-gallery-fixture-'));
  mkdirSync(path.join(root, 'shots'), { recursive: true });
  writeFileSync(path.join(root, 'shots', 'one.png'), makePng(220, 40, 40));
  writeFileSync(path.join(root, 'shots', 'two.png'), makePng(40, 80, 220));
  writeFileSync(path.join(root, 'shots', 'three.png'), makePng(40, 180, 90));
  writeFileSync(path.join(root, 'README.md'), [
    '# Gallery Notes',
    '',
    'Three images that become a gallery:',
    '',
    '```yaml gallery',
    '- ./shots/one.png',
    '- ./shots/two.png',
    '- ./shots/three.png',
    '```',
    ''
  ].join('\n'));
  return root;
}

const checks = [];
function check(label, ok, detail = '') {
  checks.push({ label, ok, detail });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` - ${detail}` : ''}`);
}

async function inspect(url) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));

  try {
    await page.goto(url, { waitUntil: 'networkidle' });

    const links = page.locator('.pswp-gallery a[data-gallery-image]');
    const count = await links.count();
    check('the gallery renders its images', count === 3, `${count} item(s)`);

    const styleHrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((link) => link.getAttribute('href')));
    check('PhotoSwipe CSS is loaded', styleHrefs.some((href) => /photoswipe/i.test(href ?? '')));

    await links.first().click();
    const lightbox = page.locator('.pswp');
    await lightbox.waitFor({ state: 'visible', timeout: 10000 });
    check('clicking an image opens PhotoSwipe', await lightbox.isVisible());

    // PhotoSwipe keeps neighbouring slides mounted and fills their <img> src
    // asynchronously, so the counter - not the first .pswp__img - is what
    // actually says which slide is showing.
    const counter = async () => (await page.locator('.pswp__counter').textContent())?.trim();
    const first = await counter();
    check('the lightbox opens on the clicked slide', first === '1 / 3', first);

    await page.locator('.pswp__button--arrow--next').click();
    await page.waitForTimeout(400);
    const second = await counter();
    check('the next arrow advances the gallery', second === '2 / 3', second);

    await page.locator('.pswp__button--arrow--prev').click();
    await page.waitForTimeout(400);
    const back = await counter();
    check('the previous arrow goes back', back === '1 / 3', back);

    await page.locator('.pswp__button--close').click();
    await page.waitForTimeout(600);
    check('closing dismisses PhotoSwipe', (await page.locator('.pswp').count()) === 0
      || !(await page.locator('.pswp').first().isVisible()));

    // Deep-linking survives: the shared gallery code rewrites the URL on open.
    const navigation = await page.locator('nav, .filetree, aside').count();
    check('the site chrome hydrated (navigation present)', navigation > 0);

    const relevant = consoleErrors.filter((text) => !/favicon/i.test(text));
    check('no console or module errors', relevant.length === 0, relevant.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }
}

async function main() {
  const fixture = makeFixture();
  console.log(`fixture: ${fixture}`);

  let ready;
  const readyUrl = new Promise((resolve) => {
    ready = resolve;
  });
  let shutdown;
  const stopped = new Promise((resolve) => {
    shutdown = resolve;
  });

  const preview = runPreviewCommand([fixture, '--port', '0', '--no-open'], {
    log: (message) => {
      console.log(message);
      const match = /ready at (\S+)/.exec(message);
      if (match) {
        ready(match[1]);
      }
    },
    waitForShutdown: () => stopped
  });

  let failure;
  try {
    const url = await Promise.race([
      readyUrl,
      preview.then(() => {
        throw new Error('preview exited before the server was ready');
      })
    ]);
    await inspect(url);
  } catch (error) {
    failure = error;
  } finally {
    shutdown();
    await preview.catch((error) => {
      failure = failure ?? error;
    });
    if (!keepFixture) {
      rmSync(fixture, { recursive: true, force: true });
    }
  }

  if (failure) {
    console.error(`\ncheck-preview-gallery: ${failure.message}`);
    process.exit(1);
  }
  const failed = checks.filter((entry) => !entry.ok);
  console.log(`\ncheck-preview-gallery: ${checks.length - failed.length}/${checks.length} checks passed.`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
