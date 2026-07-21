function nodeText(node) {
    if (!node) return '';
    if (typeof node.value === 'string') return node.value;
    if (node.type === 'image' && typeof node.alt === 'string') return node.alt;
    if (Array.isArray(node.children)) return node.children.map(nodeText).join('');
    return '';
}

function inlineTokens(nodes, resolveLink) {
    const output = [];
    for (const node of nodes ?? []) {
        if (!node) continue;
        if (node.type === 'text') {
            output.push({type: 'text', value: String(node.value ?? '')});
        } else if (node.type === 'inlineCode' || node.type === 'code') {
            output.push({type: 'inlineCode', value: String(node.value ?? '')});
        } else if (node.type === 'break') {
            output.push({type: 'break'});
        } else if (node.type === 'strong' || node.type === 'emphasis' || node.type === 'delete') {
            output.push({type: node.type, children: inlineTokens(node.children, resolveLink)});
        } else if (node.type === 'link') {
            output.push({type: 'link', ...resolveLink(node), children: inlineTokens(node.children, resolveLink)});
        } else if (node.type === 'image') {
            output.push({type: 'text', value: String(node.alt ?? '')});
        } else if (Array.isArray(node.children)) {
            output.push(...inlineTokens(node.children, resolveLink));
        } else if (typeof node.value === 'string') {
            // Raw HTML and unknown value-bearing nodes remain inert text.
            output.push({type: 'text', value: node.value});
        }
    }
    return output;
}

function cellModel(cell, resolveLink) {
    return {text: nodeText(cell), content: inlineTokens(cell?.children, resolveLink)};
}

function buildRichTableModel(node, resolveLink = () => ({})) {
    const tableRows = Array.isArray(node?.children) ? node.children.filter((row) => row?.type === 'tableRow') : [];
    if (!tableRows.length) return {headers: [], rows: []};
    const width = Math.max(...tableRows.map((row) => row.children?.length ?? 0));
    const headerCells = tableRows[0]?.children ?? [];
    const headers = Array.from({length: width}, (_, index) => {
        const cell = cellModel(headerCells[index], resolveLink);
        if (!cell.text) {
            cell.text = `Column ${index + 1}`;
            cell.content = [{type: 'text', value: cell.text}];
        }
        return {...cell, align: node.align?.[index] ?? null};
    });
    const rows = tableRows.slice(1).map((row) =>
        Array.from({length: width}, (_, index) => cellModel(row.children?.[index], resolveLink))
    );
    return {headers, rows};
}

export {buildRichTableModel, inlineTokens, nodeText};
