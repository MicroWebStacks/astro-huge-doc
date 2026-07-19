import {getDocuments, getSourceEntries, getDocument, getItems} from '../libs/structure-db.js';
import {basePrefix} from '../libs/blob-files.js';
import {config} from '../../config.js';
import {buildSectionMenuFromSourceEntries as buildSourceEntryMenu, firstDocumentUrl} from './source_navigation.js';

/* --- log.md recognition (OKF plan DD-8) ----------------------------------
   The reserved knowledge-history file is only given special treatment when a
   sanity check passes: a root-level log.md whose headings contain at least
   one date-like entry. Anything else stays a completely normal page. */
const LOG_ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

function headingReadsAsDate(label) {
    const text = String(label ?? '').trim();
    if (!text || !/\d/.test(text)) {
        return false;
    }
    if (LOG_ISO_DATE_PATTERN.test(text)) {
        return true;
    }
    return Number.isFinite(Date.parse(text));
}

function isValidLogStructure(headings) {
    const list = Array.isArray(headings) ? headings : [];
    return list.some((heading) => headingReadsAsDate(heading?.label ?? heading?.body_text));
}

/* Returns {url, title} when the bundle root carries a valid log.md, else
   null. In the lite profile the page's items exist only once it has been
   visited, so the app-bar icon appears after the log page first loads. */
function findKnowledgeLog() {
    try {
        const doc = getDocument({url: 'log'});
        const path = String(doc?.path ?? '');
        if (!doc || !/^log\.md$/i.test(path)) {
            return null;
        }
        const headingItems = getItems({doc_sid: doc.sid}, 'heading');
        if (!isValidLogStructure(headingItems)) {
            return null;
        }
        return {url: doc.url, title: doc.title ?? 'Log'};
    } catch {
        return null;
    }
}

function cloneHeading(heading) {
    const label = (heading.label ?? heading.body_text ?? '').trim();
    return {
        label,
        slug: heading.slug ?? '',
        depth: heading.depth ?? heading.level ?? 1,
        link: heading.link ?? '',
        uid: heading.uid ?? null,
        nodeKey: heading.nodeKey ?? heading.uid ?? heading.slug ?? heading.link ?? label,
        hasTable: Boolean(heading.hasTable),
        hasCode: Boolean(heading.hasCode),
        hasDiagram: Boolean(heading.hasDiagram),
        hasImage: Boolean(heading.hasImage)
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

// Strips the deployment base prefix so section/active-link resolution always
// works against the doc-relative path, whether it came from Astro.url.pathname
// (which includes `base` under a static base-path deployment) or from a link
// this module built itself with buildDocLink (also base-prefixed).
function stripBase(pathname) {
    const trimmedBase = String(config.base ?? '/').replace(/^\/+|\/+$/g, '');
    if (!trimmedBase) {
        return pathname;
    }
    const prefix = `/${trimmedBase}`;
    if (pathname === prefix) {
        return '/';
    }
    if (pathname.startsWith(`${prefix}/`)) {
        return pathname.slice(prefix.length);
    }
    return pathname;
}

function normalizePath(pathname) {
    const raw = typeof pathname === 'string' ? pathname : '/';
    const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
    const withoutBase = stripBase(withLeading);
    const cleaned = withoutBase.replace(/\/{2,}/g, '/');
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
    const cleaned = url ? String(url).replace(/^\/+|\/+$/g, '') : '';
    return `${basePrefix(config.base)}/${cleaned}`;
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

/* The set of top-level names that are real folders (sections of their own).
 * Anything not in this set — the root index and loose root files — belongs to
 * "home". A folder counts as a section when it has a folder page anywhere in
 * its subtree (dir-type doc) OR when it simply contains documents deeper down
 * (url with 2+ segments): a site whose root folders hold only deep markdown
 * and no top-level README.md must still surface those folders as sections.
 */
function topLevelSections(docs) {
    const sections = new Set();
    for (const doc of docs) {
        if (!doc.url) {
            continue;
        }
        const segments = doc.url.split('/').filter(Boolean);
        if (doc.url_type === 'dir' || segments.length >= 2) {
            sections.add(segments[0]);
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

    // A section whose folder has no top-level folder page (no <folder>/README.md
    // or <folder>/<folder>.md) has no 1-segment doc, so the loop above skipped
    // it. Without an app-bar entry such a section is unreachable: the closed
    // menu only lists loose root files, so a site made of deep-only folders
    // shows nothing but Home. Link the section to its shallowest document.
    for (const section of sections) {
        if (sectionMap.has(section)) {
            continue;
        }
        let entryDoc = null;
        for (const doc of docs) {
            if (doc.url !== section && !doc.url.startsWith(`${section}/`)) {
                continue;
            }
            if (!entryDoc
                || (doc.level ?? 0) < (entryDoc.level ?? 0)
                || ((doc.level ?? 0) === (entryDoc.level ?? 0)
                    && ((doc.sort_order ?? 0) < (entryDoc.sort_order ?? 0)
                        || ((doc.sort_order ?? 0) === (entryDoc.sort_order ?? 0)
                            && String(doc.url).localeCompare(String(entryDoc.url)) < 0)))) {
                entryDoc = doc;
            }
        }
        if (entryDoc) {
            sectionMap.set(section, entryDoc);
        }
    }

    const items = [];
    for (const [section, doc] of sectionMap) {
        const isHome = section === 'home';
        const link = isHome ? buildDocLink('') : buildDocLink(doc.url);
        // A synthesized entry links to a deep document; its title names that
        // page, not the folder, so the label derives from the section segment.
        const label = isHome
            ? homeLabel(doc)
            : (segmentCount(doc.url) > 1 ? labelFromUrl(section) : (doc.title ?? labelFromUrl(doc.url)));
        items.push({
            label,
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
                nodeKey: url || 'home',
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

function buildSectionMenuFromSourceEntries(sourceEntries, pathname, docs = null) {
    return buildSourceEntryMenu(sourceEntries, pathname, config.base, firstDocumentUrl(docs ?? getDocuments()));
}

function buildNavigationMenus(pathname) {
    const docs = getDocuments();
    const sourceEntries = getSourceEntries();
    return {
        appBarMenu: buildAppBarMenuFromDocs(docs, pathname),
        sectionMenu: sourceEntries.length
            ? buildSectionMenuFromSourceEntries(sourceEntries, pathname, docs)
            : buildSectionMenuFromDocs(docs, pathname)
    };
}

function buildAppBarMenu(pathname) {
    return buildAppBarMenuFromDocs(getDocuments(), pathname);
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
    buildSectionMenuFromSourceEntries,
    section_from_pathname,
    findKnowledgeLog,
    isValidLogStructure
};
