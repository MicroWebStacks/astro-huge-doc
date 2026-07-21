function parseAst(value) {
    if (!value) return null;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return null; }
}

function astNodeText(node) {
    if (!node) return '';
    if (typeof node.value === 'string') return node.value;
    return Array.isArray(node.children) ? node.children.map(astNodeText).join('') : '';
}

function visitAstLinks(node, callback) {
    if (!node || typeof callback !== 'function') return;
    if (node.type === 'link') callback(node);
    for (const child of node.children ?? []) visitAstLinks(child, callback);
}

function transformStoredItemLinks(item, transform) {
    if (!item?.ast || (item.type !== 'link' && item.type !== 'table') || typeof transform !== 'function') {
        return item?.ast ?? null;
    }
    const ast = parseAst(item.ast);
    if (!ast) return item.ast;
    let changed = false;
    if (item.type === 'link') {
        changed = Boolean(transform(ast));
    } else {
        visitAstLinks(ast, (link) => {
            changed = Boolean(transform(link)) || changed;
        });
    }
    return changed ? JSON.stringify(ast) : item.ast;
}

function relationRowsFromItems(doc, items) {
    const rows = [];
    let currentHeading = null;
    const addRelation = (ast, linkText) => {
        const rel = ast?.rel;
        if (!rel) return;
        rows.push({
            source_sid: doc.sid,
            target_sid: rel.target_sid ?? null,
            target_raw: rel.raw ?? '',
            fragment: rel.fragment ?? null,
            link_text: linkText ?? null,
            source_heading: currentHeading,
            status: rel.status ?? null,
            external: Boolean(rel.external)
        });
    };
    for (const item of items ?? []) {
        if (item?.type === 'heading') {
            currentHeading = item.slug ?? null;
            continue;
        }
        const ast = parseAst(item.ast);
        if (item?.type === 'link') {
            addRelation(ast, item.body_text);
        } else if (item?.type === 'table') {
            visitAstLinks(ast, (link) => addRelation(link, astNodeText(link)));
        }
    }
    return rows;
}

export {astNodeText, relationRowsFromItems, transformStoredItemLinks, visitAstLinks};
