/**
 * Canonical document identity.
 *
 * Identity is path-only: frontmatter and display titles never participate.
 * Keep this module dependency-free so the lite file walk can import it without
 * loading the markdown parse pipeline.
 */

function slugSegment(value) {
    const slug = String(value ?? '')
        .trim()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        // Preserve the RFC 3986 unreserved ASCII set. These characters are
        // already URL-safe and are meaningful in ordinary GitHub filenames
        // and OKF bundle-relative concept paths.
        .replace(/[^A-Za-z0-9._~-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug && slug !== '.' && slug !== '..' ? slug : 'page';
}

function normalizeSlashes(value) {
    return String(value ?? '').replaceAll('\\', '/');
}

function stripExtension(value) {
    return String(value ?? '').replace(/\.[^.]+$/, '');
}

function identityForPath(relativePath, isLanding = false) {
    const normalized = normalizeSlashes(relativePath).replace(/^\/+/, '');
    const segments = normalized.split('/').filter(Boolean);
    const fileName = segments.at(-1) ?? '';
    const directorySegments = segments.slice(0, -1);
    const urlSegments = directorySegments.map(slugSegment);
    if (!isLanding) {
        urlSegments.push(slugSegment(stripExtension(fileName)));
    }
    const url = urlSegments.join('/');
    const slug = urlSegments.at(-1) ?? slugSegment(stripExtension(fileName));
    const uid = urlSegments.length > 0 ? urlSegments.join('.') : slug;
    return {
        slug,
        url,
        uid,
        url_type: isLanding ? 'dir' : 'file'
    };
}

function canonicalDocumentPath(value) {
    const normalized = normalizeSlashes(value).replace(/^\/+/, '');
    const segments = normalized.split('/').filter(Boolean);
    if (segments.length === 0) {
        return '';
    }
    const last = stripExtension(segments.pop());
    return [...segments.map(slugSegment), slugSegment(last)].join('/');
}

function canonicalUid(value) {
    return String(value ?? '')
        .split('.')
        .filter(Boolean)
        .map(slugSegment)
        .join('.');
}

export {
    canonicalDocumentPath,
    canonicalUid,
    identityForPath,
    normalizeSlashes,
    slugSegment,
    stripExtension
};
