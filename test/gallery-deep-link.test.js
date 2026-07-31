import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';

import {
    GALLERY_IMAGE_PARAM,
    PREVIEW_GALLERY_MESSAGE,
    galleryImageFromUrl,
    withGalleryImage,
    withoutGalleryImage
} from '../src/libs/gallery-deep-link.js';

const root = join(import.meta.dirname, '..');
const galleryMarkup = readFileSync(
    join(root, 'src/components/gallery/gallery.astro'),
    'utf8'
);
const galleryScript = readFileSync(
    join(root, 'src/components/gallery/gallery.js'),
    'utf8'
);
const previewScript = readFileSync(
    join(root, 'src/layout/link_preview.js'),
    'utf8'
);

test('gallery image URLs round-trip collected UIDs and preserve unrelated state', () => {
    const imageUid = 'guide/photos#gallery image-1.png';
    const next = withGalleryImage(
        'https://docs.example.test/guide?theme=dark#installation',
        imageUid
    );
    const parsed = new URL(next);

    assert.equal(parsed.searchParams.get(GALLERY_IMAGE_PARAM), imageUid);
    assert.equal(parsed.searchParams.get('theme'), 'dark');
    assert.equal(parsed.hash, '#installation');
    assert.equal(galleryImageFromUrl(next), imageUid);
});

test('closing a gallery removes only gallery-image', () => {
    const next = withoutGalleryImage(
        'https://docs.example.test/guide?theme=dark&gallery-image=asset%23one#installation'
    );
    const parsed = new URL(next);

    assert.equal(parsed.searchParams.has(GALLERY_IMAGE_PARAM), false);
    assert.equal(parsed.searchParams.get('theme'), 'dark');
    assert.equal(parsed.hash, '#installation');
    assert.equal(galleryImageFromUrl(next), null);
});

test('preview fallback removes only the internal preview hash', () => {
    const next = withGalleryImage(
        'https://docs.example.test/guide?theme=dark#__preview&installation',
        'asset#one',
        {stripPreviewHash: true}
    );
    const parsed = new URL(next);

    assert.equal(parsed.hash, '');
    assert.equal(parsed.searchParams.get('theme'), 'dark');
    assert.equal(parsed.searchParams.get(GALLERY_IMAGE_PARAM), 'asset#one');
});

test('gallery markup and controller use stable UID identity across multiple galleries', () => {
    assert.match(galleryMarkup, /data-gallery-image=\{image\.uid\}/);
    assert.doesNotMatch(galleryMarkup, /id="my-gallery"/);
    assert.match(galleryScript, /gallery:\s*'\.pswp-gallery'/);
    assert.match(galleryScript, /children:\s*'a\[data-gallery-image\]'/);
    assert.match(galleryScript, /lightbox\.on\('change'/);
    assert.match(galleryScript, /lightbox\.on\('close'/);
    assert.match(galleryScript, /lightbox\.loadAndOpen\(target\.index,\s*\{gallery:\s*target\.gallery\}\)/);
});

test('preview gallery clicks bypass nested PhotoSwipe and use the validated handoff', () => {
    assert.match(galleryScript, /if \(isPreviewMode\(\)\)\s*\{\s*initPreviewGalleryHandoff\(\);\s*return;/s);
    assert.match(galleryScript, /event\.stopImmediatePropagation\(\)/);
    assert.match(galleryScript, /type:\s*PREVIEW_GALLERY_MESSAGE/);
    assert.equal(PREVIEW_GALLERY_MESSAGE, 'microwebstacks.previewGalleryImage');

    assert.match(previewScript, /event\.origin !== window\.location\.origin/);
    assert.match(previewScript, /event\.source !== session\.iframe\.contentWindow/);
    assert.match(previewScript, /withGalleryImage\(session\.canonicalTarget,\s*imageUid\)/);
    assert.match(previewScript, /window\.location\.assign\(target\)/);
});
