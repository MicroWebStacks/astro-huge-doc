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

/* Prefix an authored root-absolute link with the deployment base (R-9).
 *
 * A root-absolute path in content means "from the site root" (R-8), so under a
 * project-site base like /astro-huge-doc/ it must carry that prefix or it
 * resolves against the domain root and 404s. This is invisible at base "/",
 * which is why WP-24 had to build the sub-path artifact to find the 95 links
 * that were missing it.
 *
 * Untouched: external and protocol-relative URLs, fragments, relative paths,
 * and anything already carrying the prefix.
 */
function withBasePrefix(url, base = '/') {
    const value = String(url ?? '');
    if (!value.startsWith('/') || value.startsWith('//')) {
        return value;
    }
    const prefix = basePrefix(base);
    if (!prefix || value === prefix || value.startsWith(`${prefix}/`)) {
        return value;
    }
    return `${prefix}${value}`;
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
    withBasePrefix,
    resolveBlobsSourceDir
};
