import {basePrefix} from './blob-files.js';
import {config} from '../../config.js';

function slugifyFacet(value) {
    const slug = String(value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    return slug || 'section';
}

function facetValues(document, field) {
    const value = document?.[field];
    if (field === 'tags') {
        return Array.isArray(value) ? value : [];
    }
    return value == null ? [] : [value];
}

function groupDocumentsByFacet(documents, field) {
    const groups = new Map();
    for (const document of documents ?? []) {
        const seen = new Set();
        for (const rawValue of facetValues(document, field)) {
            const label = String(rawValue ?? '').trim();
            if (!label) continue;
            const slug = slugifyFacet(label);
            if (seen.has(slug)) continue;
            seen.add(slug);
            let group = groups.get(slug);
            if (!group) {
                group = {slug, label, variants: new Set(), documents: []};
                groups.set(slug, group);
            }
            group.variants.add(label);
            group.documents.push(document);
        }
    }
    return [...groups.values()]
        .map((group) => ({...group, variants: [...group.variants].sort((a, b) => a.localeCompare(b))}))
        .sort((a, b) => a.label.localeCompare(b.label));
}

function exploreHref(kind, value) {
    return `${basePrefix(config.base)}/explore/${kind}/${slugifyFacet(value)}`;
}

export {slugifyFacet, groupDocumentsByFacet, exploreHref};
