import {join} from 'node:path';

function normalizeBlobExt(ext) {
    const value = String(ext ?? '').trim().toLowerCase();
    if (!value) {
        return '';
    }
    return value.startsWith('.') ? value.slice(1) : value;
}

const BLOB_FILE_HASH_LENGTH = 12;

function shortenBlobHash(hash) {
    const value = String(hash ?? '');
    return value.length > BLOB_FILE_HASH_LENGTH ? value.slice(0, BLOB_FILE_HASH_LENGTH) : value;
}

function blobFileName(hash, ext) {
    const normalized = normalizeBlobExt(ext);
    const visibleHash = shortenBlobHash(hash);
    return normalized ? `${visibleHash}.${normalized}` : visibleHash;
}

// `base` is the deployment path prefix (e.g. "/docs/" for a GitHub Pages
// project site). Root deployments pass '/' or omit it, which is a no-op.
function basePrefix(base) {
    const trimmed = String(base ?? '/').replace(/^\/+|\/+$/g, '');
    return trimmed ? `/${trimmed}` : '';
}

function blobFileUrl(hash, ext, base = '/') {
    if (!hash) {
        return null;
    }
    return `${basePrefix(base)}/blobs/${blobFileName(hash, ext)}`;
}

// Source directory for on-disk blobs, shared by the SSR blob middleware and
// the static build's blob-copy step so both agree on where blobs live.
function resolveBlobsSourceDir(config) {
    return config.dataBackend === 'json'
        ? join(config.collect.json_dir, 'blobs')
        : join(config.collect.outdir, 'blobs');
}

export {
    BLOB_FILE_HASH_LENGTH,
    normalizeBlobExt,
    shortenBlobHash,
    blobFileName,
    blobFileUrl,
    basePrefix,
    resolveBlobsSourceDir
};
