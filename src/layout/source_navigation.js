/* Pure source-entry navigation builder shared by Astro SSR and the extension
 * server's post-paint navigation endpoint. Keeping this module free of the
 * structure-db dispatcher lets the endpoint consume the filetree.json that
 * the page request already wrote, instead of instantiating a second lazy DB
 * and repeating the workspace walk. */

function basePrefix(base) {
    const trimmed = String(base ?? '/').replace(/^\/+|\/+$/g, '');
    return trimmed ? `/${trimmed}` : '';
}

function normalizePath(pathname, base) {
    const raw = typeof pathname === 'string' ? pathname : '/';
    let normalized = raw.startsWith('/') ? raw : `/${raw}`;
    const prefix = basePrefix(base);
    if (prefix && normalized === prefix) {
        normalized = '/';
    } else if (prefix && normalized.startsWith(`${prefix}/`)) {
        normalized = normalized.slice(prefix.length);
    }
    normalized = normalized.replace(/\/{2,}/g, '/');
    if (normalized.length > 1 && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
    }
    return normalized || '/';
}

function docUrlFromPathname(pathname, base) {
    const normalized = normalizePath(pathname, base);
    return normalized === '/' ? '' : normalized.slice(1);
}

function buildDocLink(url, base) {
    const cleaned = url ? String(url).replace(/^\/+|\/+$/g, '') : '';
    return `${basePrefix(base)}/${cleaned}`;
}

function sortSourceNodes(a, b) {
    if (a.entryType !== b.entryType) {
        return a.entryType === 'dir' ? -1 : 1;
    }
    const orderA = a.order ?? 0;
    const orderB = b.order ?? 0;
    if (orderA !== orderB) {
        return orderA - orderB;
    }
    return (a.label ?? '').localeCompare(b.label ?? '');
}

function labelFromSourceEntry(entry) {
    const documentTitle = String(entry.document_title ?? '').trim();
    if (documentTitle && documentTitle !== '.') {
        return documentTitle;
    }
    if (entry.entry_type === 'file' && entry.name.toLowerCase().endsWith('.md')) {
        return entry.name.slice(0, -3);
    }
    return entry.name;
}

function renderedSourceEntries(sourceEntries) {
    const byPath = new Map(sourceEntries.map((entry) => [entry.path, entry]));
    const visiblePaths = new Set();
    for (const entry of sourceEntries) {
        if (entry.document_url === null || entry.document_url === undefined) {
            continue;
        }
        let current = entry.path;
        while (current && byPath.has(current)) {
            visiblePaths.add(current);
            current = byPath.get(current)?.parent_path;
        }
    }
    return sourceEntries.filter((entry) => visiblePaths.has(entry.path));
}

function activePathForUrl(sourceEntries, activeUrl) {
    return sourceEntries.find((entry) => (entry.document_url ?? null) === activeUrl)?.path ?? null;
}

/* Mirrors the structure-db backends' getFirstDocument() ranking, so callers
   can scope the root menu to the document the '/' route actually serves when
   the content has no root-level document (no root README.md). */
function firstDocumentUrl(documents) {
    const rank = (url) => (url === '' ? 0 : url === 'home' ? 1 : 2);
    let best = null;
    for (const doc of documents ?? []) {
        const candidate = {
            url: String(doc.url ?? ''),
            rank: rank(doc.url ?? ''),
            level: doc.level ?? 0,
            order: doc.order ?? doc.sort_order ?? 0
        };
        const wins = !best
            || candidate.rank < best.rank
            || (candidate.rank === best.rank && (candidate.level < best.level
                || (candidate.level === best.level && (candidate.order < best.order
                    || (candidate.order === best.order && candidate.url.localeCompare(best.url) < 0)))));
        if (wins) {
            best = candidate;
        }
    }
    return best?.url || null;
}

function buildSectionMenuFromSourceEntries(sourceEntries, pathname, base = '/', rootFallbackUrl = null) {
    if (!Array.isArray(sourceEntries) || sourceEntries.length === 0) {
        return [];
    }

    const allRenderedEntries = renderedSourceEntries(sourceEntries);
    let activeUrl = docUrlFromPathname(pathname, base);
    let activePath = activePathForUrl(allRenderedEntries, activeUrl);
    if (activeUrl === '' && !activePath && rootFallbackUrl) {
        // '/' serves the first document when no root README exists; scope the
        // menu to that document's section instead of an empty root listing.
        activeUrl = rootFallbackUrl;
        activePath = activePathForUrl(allRenderedEntries, activeUrl);
    }
    const activeTopLevel = activePath?.split('/').filter(Boolean)[0] ?? null;
    const inSection = Boolean(activeTopLevel && activePath?.includes('/'))
        || allRenderedEntries.some((entry) => (
            entry.path === activeTopLevel
            && entry.entry_type === 'dir'
            && entry.document_url === activeUrl
        ));
    const renderedEntries = inSection
        ? allRenderedEntries.filter((entry) => (
            entry.path === activeTopLevel
            || entry.path.startsWith(`${activeTopLevel}/`)
        ))
        : allRenderedEntries.filter((entry) => (
            !entry.parent_path
            && entry.entry_type === 'file'
            && entry.document_url !== null
            && entry.document_url !== undefined
        ));
    if (renderedEntries.length === 0) {
        return [];
    }

    const nodes = new Map();
    for (const entry of renderedEntries) {
        const link = entry.document_url !== null && entry.document_url !== undefined
            ? buildDocLink(entry.document_url, base)
            : null;
        nodes.set(entry.path, {
            path: entry.path,
            nodeKey: entry.path,
            label: labelFromSourceEntry(entry),
            entryType: entry.entry_type,
            order: entry.sort_order ?? 0,
            active: activePath === entry.path,
            expanded: true,
            items: [],
            ...(link ? {link} : {})
        });
    }

    for (const entry of renderedEntries) {
        const node = nodes.get(entry.path);
        const parentPath = entry.parent_path ?? '';
        if (parentPath && nodes.has(parentPath)) {
            nodes.get(parentPath).items.push(node);
        }
    }

    const activeAncestors = new Set();
    if (activePath) {
        let current = activePath;
        while (current) {
            activeAncestors.add(current);
            const parent = renderedEntries.find((entry) => entry.path === current)?.parent_path;
            if (!parent) {
                break;
            }
            current = parent;
        }
    }

    const finalize = (node) => {
        if (node.items.length > 0) {
            node.items.sort(sortSourceNodes);
            node.items.forEach(finalize);
            node.parent = true;
            node.expanded = activeAncestors.has(node.path);
        } else {
            delete node.items;
            node.parent = false;
            delete node.expanded;
        }
        delete node.entryType;
        delete node.path;
        delete node.order;
    };

    const roots = [];
    for (const entry of renderedEntries) {
        if (!entry.parent_path || !nodes.has(entry.parent_path)) {
            roots.push(nodes.get(entry.path));
        }
    }
    roots.sort(sortSourceNodes);
    roots.forEach(finalize);
    return roots;
}

export {buildSectionMenuFromSourceEntries, firstDocumentUrl};
