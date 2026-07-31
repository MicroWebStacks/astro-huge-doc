export const GALLERY_IMAGE_PARAM = 'gallery-image';
export const PREVIEW_GALLERY_MESSAGE = 'microwebstacks.previewGalleryImage';

const PREVIEW_HASH = '#__preview';

export function galleryImageFromUrl(rawUrl) {
    const value = new URL(rawUrl).searchParams.get(GALLERY_IMAGE_PARAM);
    return value || null;
}

export function withGalleryImage(rawUrl, imageUid, {stripPreviewHash = false} = {}) {
    const url = new URL(rawUrl);
    url.searchParams.set(GALLERY_IMAGE_PARAM, imageUid);
    if (stripPreviewHash && (url.hash === PREVIEW_HASH || url.hash.startsWith(`${PREVIEW_HASH}&`))) {
        url.hash = '';
    }
    return url.toString();
}

export function withoutGalleryImage(rawUrl) {
    const url = new URL(rawUrl);
    url.searchParams.delete(GALLERY_IMAGE_PARAM);
    return url.toString();
}
