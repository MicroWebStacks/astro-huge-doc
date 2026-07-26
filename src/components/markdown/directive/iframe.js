function normalizeIframeSrc(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    try {
        const url = new URL(raw);
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        if (host === 'youtu.be') {
            const videoId = url.pathname.split('/').filter(Boolean)[0];
            return videoId ? `https://www.youtube.com/embed/${videoId}` : raw;
        }
        if (host === 'youtube.com' && url.pathname === '/watch') {
            const videoId = url.searchParams.get('v');
            return videoId ? `https://www.youtube.com/embed/${videoId}` : raw;
        }
    } catch {
        // Relative and malformed authored values remain visible to the browser.
    }
    return raw;
}

export {normalizeIframeSrc};
