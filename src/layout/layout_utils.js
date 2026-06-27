import {join} from 'path';
import {config} from '@/config.js';
import {openDatabase} from 'content-structure/src/sqlite_utils/index.js';

function cloneHeading(heading) {
    const label = (heading.label ?? heading.body_text ?? '').trim();
    return {
        label,
        slug: heading.slug ?? '',
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
function toc_list_to_tree(headings) {
    const copies = headings.map((heading) => ({
        ...cloneHeading(heading),
        order_index: heading.order_index ?? 0
    }));
    for (const element of copies) {
        element.items = [];
        element.parent = true;
        element.expanded = true;
        element.link = `#${element.slug ?? ''}`;
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
    const tree = toc_list_to_tree(headings);
    return {items: tree, visible: true};
}

function normalizePath(pathname) {
    const raw = typeof pathname === 'string' ? pathname : '/';
    const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
    const cleaned = withLeading.replace(/\/{2,}/g, '/');
    if (cleaned.length > 1 && cleaned.endsWith('/')) {
        return cleaned.slice(0, -1);
    }
    return cleaned || '/';
}

function docUrlFromPathname(pathname) {
    const normalized = normalizePath(pathname);
    return normalized === '/' ? '' : normalized.slice(1);
}

function buildDocLink(url) {
    if (!url) {
        return '/';
    }
    const cleaned = String(url).replace(/^\/+|\/+$/g, '');
    return `/${cleaned}`;
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
    const db = openDatabase(config.collect.db_path, {readonly: true});
    return db
        .prepare('SELECT url, title, level, "order" AS sort_order, url_type FROM documents ORDER BY level, sort_order, url')
        .all();
}

/* The set of top-level names that are real folders (sections of their own).
 * Anything not in this set — the root index and loose root files — belongs to "home".
 */
function topLevelSections(docs) {
    const sections = new Set();
    for (const doc of docs) {
        if (doc.url_type === 'dir' && doc.url) {
            sections.add(doc.url.split('/')[0]);
        }
    }
    return sections;
}

function sectionKeyForDoc(doc, sections) {
    if (!doc.url || doc.url === 'home') {
        return 'home';
    }
    const first = doc.url.split('/')[0];
    return sections.has(first) ? first : 'home';
}

function resolveSection(pathname, sections) {
    const segment = section_from_pathname(pathname);
    if (segment === 'home' || segment === 'external') {
        return segment;
    }
    return sections.has(segment) ? segment : 'home';
}

function homeLabel(doc) {
    return doc?.title && doc.title !== '.' ? doc.title : 'Home';
}

function buildAppBarMenuFromDocs(docs, pathname) {
    const sections = topLevelSections(docs);
    const currentSection = resolveSection(pathname, sections);
    const topLevel = docs.filter((doc) => segmentCount(doc.url) <= 1);
    const sectionMap = new Map();

    for (const doc of topLevel) {
        const section = sectionKeyForDoc(doc, sections);
        if (!sectionMap.has(section)) {
            sectionMap.set(section, doc);
            continue;
        }
        const existing = sectionMap.get(section);
        if (existing.url !== '' && doc.url === '') {
            sectionMap.set(section, doc);
        }
    }

    const items = [];
    for (const [section, doc] of sectionMap) {
        const isHome = section === 'home';
        const link = isHome ? '/' : buildDocLink(doc.url);
        items.push({
            label: isHome ? homeLabel(doc) : (doc.title ?? labelFromUrl(doc.url)),
            link,
            active_class: resolveSection(link, sections) === currentSection ? 'active' : '',
            order: doc.sort_order ?? 0,
            isHome
        });
    }
    items.sort((a, b) => {
        if (a.isHome !== b.isHome) {
            return a.isHome ? -1 : 1;
        }
        return sortByOrderThenLabel(a, b);
    });
    return items.map(({isHome, ...item}) => item);
}

function buildSectionMenuFromDocs(docs, pathname) {
    const sections = topLevelSections(docs);
    const section = resolveSection(pathname, sections);
    const activeUrl = docUrlFromPathname(pathname);
    const isHome = section === 'home';
    const filtered = docs.filter((doc) => {
        if (isHome) {
            return sectionKeyForDoc(doc, sections) === 'home';
        }
        return doc.url.startsWith(`${section}/`);
    });
    if (!filtered.length) {
        return [];
    }

    const docMap = new Map(filtered.map((doc) => [doc.url, doc]));
    const nodes = new Map();
    const parentLookup = new Map();
    const sectionRoots = isHome ? new Set(['', 'home']) : new Set([section]);

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

    function findSectionParent(url) {
        if (isHome) {
            if (!url || url === '' || url === 'home') {
                return null;
            }
            if (url.startsWith('home/')) {
                const withoutSection = url.slice('home/'.length);
                const lastSlash = withoutSection.lastIndexOf('/');
                if (lastSlash === -1) {
                    return 'home';
                }
                return `home/${withoutSection.slice(0, lastSlash)}`;
            }
            return null;
        }

        if (!url.startsWith(`${section}/`)) {
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

    function ensureAncestors(url) {
        const parentUrl = findSectionParent(url);
        if (!parentUrl) {
            return;
        }
        parentLookup.set(url, parentUrl);
        if (!sectionRoots.has(parentUrl)) {
            ensureNode(parentUrl);
            ensureAncestors(parentUrl);
        }
    }

    for (const doc of filtered) {
        if (!sectionRoots.has(doc.url)) {
            ensureNode(doc.url);
            ensureAncestors(doc.url);
        }
    }

    for (const [url, node] of nodes) {
        const parentUrl = parentLookup.get(url);
        if (parentUrl && nodes.has(parentUrl)) {
            nodes.get(parentUrl).items.push(node);
        }
    }

    const expandAncestors = (url) => {
        let current = url;
        while (current !== null && current !== undefined) {
            const node = nodes.get(current);
            if (node) {
                node.expanded = true;
            }
            const parentUrl = parentLookup.get(current);
            if (!parentUrl || sectionRoots.has(parentUrl)) {
                break;
            }
            current = parentUrl;
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
        if (!parentUrl || sectionRoots.has(parentUrl) || !nodes.has(parentUrl)) {
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

function section_from_pathname(pathname){
    if(!pathname){return 'home';}
    const normalized = normalizePath(pathname);
    if(normalized.startsWith('http')){
        return 'external';
    }
    const parts = normalized.split('/').filter(Boolean);
    return parts[0] ?? 'home';
}

export {
    process_toc_list,
    buildNavigationMenus,
    buildAppBarMenu, 
    buildSectionMenu, 
    section_from_pathname
};
