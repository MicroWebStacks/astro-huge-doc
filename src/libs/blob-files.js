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

function blobFileUrl(hash, ext) {
    if (!hash) {
        return null;
    }
    return `/blobs/${blobFileName(hash, ext)}`;
}

export {
    BLOB_FILE_HASH_LENGTH,
    normalizeBlobExt,
    shortenBlobHash,
    blobFileName,
    blobFileUrl
};
