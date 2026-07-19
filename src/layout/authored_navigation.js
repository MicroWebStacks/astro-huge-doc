import {posix} from 'node:path';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {buildDocLink, docUrlFromPathname, findAuthoredIndexEntry, firstDocumentUrl} from './source_navigation.js';

function nodeText(node) {
    if (!node) return '';
    if (typeof node.value === 'string') return node.value;
    return (node.children ?? []).map(nodeText).join('');
}

function firstDescendant(node, predicate, skipNestedLists = false) {
    for (const child of node?.children ?? []) {
        if (predicate(child)) return child;
        if (skipNestedLists && child.type === 'list') continue;
        const nested = firstDescendant(child, predicate, skipNestedLists);
        if (nested) return nested;
    }
    return null;
}

function resolveAuthoredLink(rawHref, indexEntry, sourceEntries, base) {
    const href = String(rawHref ?? '').trim();
    if (!href) return {href: null, documentUrl: null};
    if (href.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(href)) {
        return {href, documentUrl: null};
    }
    const match = href.match(/^([^?#]*)(.*)$/);
    const rawPath = match?.[1] ?? href;
    const suffix = match?.[2] ?? '';
    let decoded = rawPath;
    try { decoded = decodeURIComponent(rawPath); } catch { /* retain authored form */ }

    if (!decoded || decoded.startsWith('#')) {
        const documentUrl = indexEntry.document_url ?? '';
        return {href: `${buildDocLink(documentUrl, base)}${href.startsWith('#') ? href : suffix}`, documentUrl};
    }

    const indexDir = posix.dirname(indexEntry.path) === '.' ? '' : posix.dirname(indexEntry.path);
    const targetPath = decoded.startsWith('/')
        ? posix.normalize(decoded.replace(/^\/+/, ''))
        : posix.normalize(posix.join(indexDir, decoded));
    const entry = sourceEntries.find((candidate) => candidate.path === targetPath && candidate.document_url != null);
    if (entry) {
        return {href: `${buildDocLink(entry.document_url, base)}${suffix}`, documentUrl: entry.document_url};
    }
    // Route-shaped authored links can still target a collected document.
    const route = decoded.replace(/^\/+|\/+$/g, '');
    const routeEntry = sourceEntries.find((candidate) => candidate.document_url === route);
    if (routeEntry) {
        return {href: `${buildDocLink(routeEntry.document_url, base)}${suffix}`, documentUrl: routeEntry.document_url};
    }
    return {href, documentUrl: null};
}

function buildSectionMenuFromIndexNav(markdownAst, indexEntry, pathname, sourceEntries, base = '/') {
    if (!markdownAst || !indexEntry) return [];
    const activeUrl = docUrlFromPathname(pathname, base);
    const linkedUrls = new Set();
    let sequence = 0;

    const buildListItem = (listItem) => {
        const linkNode = firstDescendant(listItem, (node) => node.type === 'link', true);
        const paragraph = (listItem.children ?? []).find((node) => node.type === 'paragraph');
        const label = (linkNode ? nodeText(linkNode) : nodeText(paragraph)).trim() || 'Untitled section';
        const resolved = linkNode
            ? resolveAuthoredLink(linkNode.url, indexEntry, sourceEntries, base)
            : {href: null, documentUrl: null};
        if (resolved.documentUrl != null) linkedUrls.add(resolved.documentUrl);
        const items = [];
        for (const child of listItem.children ?? []) {
            if (child.type !== 'list') continue;
            for (const nestedItem of child.children ?? []) items.push(buildListItem(nestedItem));
        }
        const node = {
            nodeKey: `contents:${indexEntry.path}:${sequence++}`,
            label,
            active: resolved.documentUrl === activeUrl,
            synthesized: !linkNode,
            ...(resolved.href ? {link: resolved.href} : {}),
            ...(items.length ? {items, parent: true, expanded: items.some((child) => child.active)} : {parent: false})
        };
        if (items.some((child) => child.active || child.expanded)) node.expanded = true;
        return node;
    };

    const roots = [];
    const visitTopLevelLists = (node) => {
        for (const child of node?.children ?? []) {
            if (child.type === 'list') {
                for (const item of child.children ?? []) roots.push(buildListItem(item));
            } else if (child.type !== 'listItem') {
                visitTopLevelLists(child);
            }
        }
    };
    visitTopLevelLists(markdownAst);

    // Keep every page reachable even when the authored index omits it. These
    // additions are visually marked as synthesized rather than silently
    // pretending they were present in index.md.
    const indexDir = posix.dirname(indexEntry.path) === '.' ? '' : posix.dirname(indexEntry.path);
    const supplements = sourceEntries
        .filter((entry) => entry.document_url != null && entry.path !== indexEntry.path)
        .filter((entry) => !indexDir || entry.path.startsWith(`${indexDir}/`))
        .filter((entry) => !linkedUrls.has(entry.document_url))
        .sort((a, b) => String(a.document_title ?? a.name).localeCompare(String(b.document_title ?? b.name)))
        .map((entry) => ({
            nodeKey: `contents:synthesized:${entry.path}`,
            label: String(entry.document_title || entry.name?.replace(/\.md$/i, '') || entry.document_url),
            link: buildDocLink(entry.document_url, base),
            active: entry.document_url === activeUrl,
            parent: false,
            synthesized: true
        }));
    roots.push(...supplements);
    return roots;
}

async function buildAuthoredSectionMenu(sourceEntries, documents, pathname, base, contentRoot) {
    const indexEntry = findAuthoredIndexEntry(sourceEntries, pathname, base, firstDocumentUrl(documents), documents);
    if (!indexEntry) return [];
    try {
        const [{remark}, markdown] = await Promise.all([
            import('remark'),
            readFile(join(contentRoot, ...indexEntry.path.split('/')), 'utf8')
        ]);
        return buildSectionMenuFromIndexNav(remark().parse(markdown), indexEntry, pathname, sourceEntries, base);
    } catch (error) {
        console.warn(`authored index navigation unavailable for '${indexEntry.path}': ${error.message}`);
        return [];
    }
}

export {buildSectionMenuFromIndexNav, buildAuthoredSectionMenu};
