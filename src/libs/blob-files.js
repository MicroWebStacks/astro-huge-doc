function normalizeBlobExt(ext) {
    const value = String(ext ?? '').trim().toLowerCase();
    if (!value) {
        return '';
    }
    return value.startsWith('.') ? value.slice(1) : value;
}

function blobFileName(hash, ext) {
    const normalized = normalizeBlobExt(ext);
    return normalized ? `${hash}.${normalized}` : String(hash);
}

function blobFileUrl(hash, ext) {
    if (!hash) {
        return null;
    }
    return `/blobs/${blobFileName(hash, ext)}`;
}

export {
    normalizeBlobExt,
    blobFileName,
    blobFileUrl
};
