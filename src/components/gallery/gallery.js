import {
  galleryImageFromUrl,
  PREVIEW_GALLERY_MESSAGE,
  withGalleryImage,
  withoutGalleryImage
} from '../../libs/gallery-deep-link.js';

function isPreviewMode() {
  return document.documentElement.dataset.previewMode === 'true';
}

function galleryImageTarget(target) {
  const anchor = target?.closest?.('a[data-gallery-image]');
  if (!anchor || !anchor.closest('.pswp-gallery')) {
    return null;
  }
  return anchor;
}

function initPreviewGalleryHandoff() {
  // Register on document capture before the page-preview owner's generic link
  // interceptor is attached at iframe load. This gallery-specific action must
  // win so the raw asset href never navigates and PhotoSwipe never nests.
  document.addEventListener('click', (event) => {
    const anchor = galleryImageTarget(event.target);
    const imageUid = anchor?.dataset.galleryImage;
    if (!imageUid) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (window.parent === window) {
      window.location.assign(withGalleryImage(window.location.href, imageUid, {
        stripPreviewHash: true
      }));
      return;
    }

    window.parent.postMessage({
      type: PREVIEW_GALLERY_MESSAGE,
      imageUid
    }, window.location.origin);
  }, true);
}

function findGalleryImage(imageUid) {
  for (const gallery of document.querySelectorAll('.pswp-gallery')) {
    const items = Array.from(gallery.querySelectorAll('a[data-gallery-image]'));
    const index = items.findIndex((item) => item.dataset.galleryImage === imageUid);
    if (index !== -1) {
      return {gallery, index};
    }
  }
  return null;
}

function replacePageUrl(nextUrl) {
  if (nextUrl !== window.location.href) {
    window.history.replaceState(window.history.state, '', nextUrl);
  }
}

async function initPhotoSwipe() {
  const galleries = document.querySelectorAll('.pswp-gallery');
  if (!galleries.length) {
    return;
  }

  const {default: PhotoSwipeLightbox} = await import('photoswipe/lightbox');
  await import('photoswipe/style.css');

  const lightbox = new PhotoSwipeLightbox({
    gallery: '.pswp-gallery',
    children: 'a[data-gallery-image]',
    pswpModule: () => import('photoswipe')
  });

  lightbox.on('change', () => {
    const imageUid = lightbox.pswp?.currSlide?.data?.element?.dataset?.galleryImage;
    if (imageUid) {
      replacePageUrl(withGalleryImage(window.location.href, imageUid));
    }
  });

  lightbox.on('close', () => {
    replacePageUrl(withoutGalleryImage(window.location.href));
  });

  lightbox.init();

  const requestedImage = galleryImageFromUrl(window.location.href);
  if (!requestedImage) {
    return;
  }
  const target = findGalleryImage(requestedImage);
  if (target) {
    lightbox.loadAndOpen(target.index, {gallery: target.gallery});
  }
}

function initGalleries() {
  if (isPreviewMode()) {
    initPreviewGalleryHandoff();
    return;
  }
  initPhotoSwipe();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGalleries);
} else {
  initGalleries();
}
