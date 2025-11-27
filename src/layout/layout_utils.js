import {join} from 'path';
import {config} from '@/config.js';
import {section_from_pathname} from '@/libs/assets.js';
import {openDatabase} from 'content-structure/src/sqlite_utils/index.js';

function cloneHeading(heading) {
    return {
        label: heading.label ?? heading.body_text ?? '',
        slug: heading.slug,
        depth: heading.depth ?? heading.level ?? 1,
        link: heading.link ?? '',
        uid: heading.uid ?? null
    };
}

function find_parent(index, headings) {
    const element_depth = headings[index].depth ?? 1;
    if (index === 0) {
        return null;
    }
    for (let rev_i = index - 1; rev_i >= 0; rev_i--) {
        if ((headings[rev_i].depth ?? 1) < element_depth) {
            return headings[rev_i];
        }
    }
    return null;
}

/* not recursive o(n²)
*/
function headings_list_to_tree(headings, is_toc) {
    const copies = headings.map((heading) => ({
        ...cloneHeading(heading),
        order_index: heading.order_index ?? 0
    }));
    for (const element of copies) {
        element.items = [];
        element.parent = true;
        element.expanded = true;
        if (is_toc) {
            element.link = `#${element.slug ?? ''}`;
        }
    }

    const tree = [];

    for (let index = 0; index < copies.length; index++) {
        const element = copies[index];
        const parent = find_parent(index, copies);
        if (parent) {
            parent.items.push(element);
        } else {
            tree.push(element);
        }
    }

    for (const element of copies) {
        if (element.items.length === 0) {
            element.parent = false;
            delete element.items;
            delete element.expanded;
        } else {
            element.items.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
        }
    }
    return tree.sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
}

/** headings start at Sidemenu
 *
 */
function process_toc_list(headings) {
    if (!Array.isArray(headings) || headings.length === 0) {
        return {items: [], visible: false};
    }
    const tree = headings_list_to_tree(headings, true);
    return {items: tree, visible: true};
}

const dbPath = join(config.collect_content.outdir, 'structure.db');

function stripBase(pathname) {
    const base = config.base ?? '';
    if (!base || base === '/') {
        return pathname;
    }
    if (pathname.startsWith(base)) {
        const stripped = pathname.slice(base.length);
        return stripped || '/';
    }
    return pathname;
}

function normalizePath(pathname) {
    const value = pathname || '/';
    let normalized = value.startsWith('/') ? value : `/${value}`;
    if (normalized.length > 1 && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
    }
    return normalized;
}

function toDocUrl(pathname) {
    const stripped = stripBase(normalizePath(pathname));
    if (stripped === '/') {
        return '';
    }
    return stripped.startsWith('/') ? stripped.slice(1) : stripped;
}

function buildDocLink(url) {
    const base = config.base ?? '';
    const suffix = url ? `/${url}` : '/';
    const combined = `${base}${suffix}`;
    const cleaned = combined.replace(/\/{2,}/g, '/');
    if (cleaned === '/') {
        return '/';
    }
    return cleaned.endsWith('/') ? cleaned.slice(0, -1) : cleaned;
}

function labelFromUrl(url) {
    if (!url) {
        return 'Home';
    }
    const segment = url.split('/').filter(Boolean).pop() ?? 'Home';
    const withSpaces = segment.replace(/[-_]/g, ' ');
    return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

function sortByOrderThenLabel(a, b) {
    const orderA = a.order ?? 0;
    const orderB = b.order ?? 0;
    if (orderA !== orderB) {
        return orderA - orderB;
    }
    const labelA = a.label ?? '';
    const labelB = b.label ?? '';
    return labelA.localeCompare(labelB);
}

function segmentCount(url) {
    if (!url) {
        return 0;
    }
    return url.split('/').filter(Boolean).length;
}

function loadDocuments() {
    const db = openDatabase(dbPath, {readonly: true});
    return db
        .prepare('SELECT url, title, level, "order" AS sort_order, url_type FROM documents ORDER BY level, sort_order, url')
        .all();
}

function belongsToSection(doc, section) {
    if (section === 'home') {
        return true;
    }
    return doc.url === section || doc.url.startsWith(`${section}/`);
}

function findParentUrl(url, section) {
    if (section === 'home') {
        if (!url) {
            return null;
        }
        const lastSlash = url.lastIndexOf('/');
        if (lastSlash === -1) {
            return '';
        }
        return url.slice(0, lastSlash);
    }
    if (!url || !url.startsWith(section)) {
        return null;
    }
    if (url === section) {
        return null;
    }
    const relative = url.slice(section.length + 1);
    const lastSlash = relative.lastIndexOf('/');
    if (lastSlash === -1) {
        return section;
    }
    const parentRelative = relative.slice(0, lastSlash);
    return `${section}/${parentRelative}`;
}

function buildAppBarMenuFromDocs(docs, pathname) {
    const currentSection = section_from_pathname(stripBase(pathname));
    const items = docs
        .filter((doc) => segmentCount(doc.url) <= 1)
        .map((doc) => {
            const link = buildDocLink(doc.url);
            return {
                label: doc.title ?? labelFromUrl(doc.url),
                link,
                active_class: section_from_pathname(stripBase(link)) === currentSection ? 'active' : '',
                order: doc.sort_order ?? 0
            };
        });
    items.sort(sortByOrderThenLabel);
    return items;
}

function buildSectionMenuFromDocs(docs, pathname) {
    const section = section_from_pathname(stripBase(pathname));
    const activeUrl = toDocUrl(pathname);
    const filtered = docs.filter((doc) => belongsToSection(doc, section));
    if (!filtered.length) {
        return [];
    }

    const docMap = new Map(filtered.map((doc) => [doc.url, doc]));
    const nodes = new Map();
    const parentLookup = new Map();

    function ensureNode(url) {
        let node = nodes.get(url);
        if (!node) {
            const doc = docMap.get(url);
            const label = doc?.title ?? labelFromUrl(url);
            node = {
                url,
                label,
                order: doc?.sort_order ?? 0,
                active: false,
                expanded: true,
                items: []
            };
            if (doc) {
                node.link = buildDocLink(url);
            }
            nodes.set(url, node);
        }
        return node;
    }

    function ensureAncestors(url) {
        const parentUrl = findParentUrl(url, section);
        if (parentUrl === null) {
            return;
        }
        parentLookup.set(url, parentUrl);
        ensureNode(parentUrl);
        ensureAncestors(parentUrl);
    }

    for (const doc of filtered) {
        ensureNode(doc.url);
        ensureAncestors(doc.url);
    }

    for (const [url, node] of nodes) {
        const parentUrl = findParentUrl(url, section);
        if (parentUrl !== null) {
            parentLookup.set(url, parentUrl);
            const parent = ensureNode(parentUrl);
            parent.items.push(node);
        }
    }

    const expandAncestors = (url) => {
        let current = url;
        while (current !== null && current !== undefined) {
            const node = nodes.get(current);
            if (node) {
                node.expanded = true;
            }
            current = parentLookup.get(current) ?? null;
        }
    };

    if (nodes.has(activeUrl)) {
        const activeNode = nodes.get(activeUrl);
        activeNode.active = true;
        expandAncestors(activeUrl);
    }

    const roots = [];
    for (const [url, node] of nodes) {
        const parentUrl = parentLookup.get(url);
        if (parentUrl === null || parentUrl === undefined) {
            roots.push(node);
        }
    }

    const finalize = (node) => {
        if (node.items && node.items.length) {
            node.items.sort(sortByOrderThenLabel);
            node.items.forEach(finalize);
            node.parent = true;
        } else {
            delete node.items;
            node.parent = false;
            delete node.expanded;
        }
    };

    roots.sort(sortByOrderThenLabel);
    roots.forEach(finalize);

    return roots;
}

function buildNavigationMenus(pathname) {
    const docs = loadDocuments();
    return {
        appBarMenu: buildAppBarMenuFromDocs(docs, pathname),
        sectionMenu: buildSectionMenuFromDocs(docs, pathname)
    };
}

function buildAppBarMenu(pathname) {
    return buildNavigationMenus(pathname).appBarMenu;
}

function buildSectionMenu(pathname) {
    return buildNavigationMenus(pathname).sectionMenu;
}

export {process_toc_list, buildNavigationMenus, buildAppBarMenu, buildSectionMenu};
