const DEFAULT_RING_RADIUS = Object.freeze({0: 0, 1: 180, 2: 330});

function graphNodes(payload) {
    const bySid = new Map();
    for (const node of [payload?.center, ...(payload?.nodes ?? [])]) {
        if (!node?.sid || bySid.has(node.sid)) {
            continue;
        }
        bySid.set(node.sid, {
            ...node,
            ring: node.sid === payload?.center?.sid ? 0 : (node.ring ?? 2),
            title: String(node.title ?? node.url ?? node.sid)
        });
    }
    return [...bySid.values()];
}

function graphEdges(payload, nodes = graphNodes(payload)) {
    const known = new Set(nodes.map((node) => node.sid));
    return (payload?.edges ?? []).filter((edge) => (
        edge?.source
        && edge?.target
        && edge.source !== edge.target
        && known.has(edge.source)
        && known.has(edge.target)
    ));
}

function stableHash(value) {
    let hash = 2166136261;
    for (const character of String(value ?? '')) {
        hash ^= character.codePointAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function initialGraphPositions(nodes, centerSid) {
    const positions = new Map([[centerSid, {x: 0, y: 0}]]);
    const rings = new Map();
    for (const node of nodes) {
        if (node.sid === centerSid) {
            continue;
        }
        const ring = Math.max(1, Number(node.ring) || 2);
        if (!rings.has(ring)) {
            rings.set(ring, []);
        }
        rings.get(ring).push(node);
    }

    for (const [ring, ringNodes] of rings) {
        ringNodes.sort((a, b) => a.sid.localeCompare(b.sid));
        const radius = DEFAULT_RING_RADIUS[ring] ?? (330 + (ring - 2) * 135);
        const rotation = ((stableHash(centerSid) % 360) - 90) * (Math.PI / 180);
        ringNodes.forEach((node, index) => {
            const angle = rotation + ((Math.PI * 2) / ringNodes.length) * index;
            positions.set(node.sid, {
                x: Math.cos(angle) * radius,
                y: Math.sin(angle) * radius
            });
        });
    }
    return positions;
}

function graphNeighborhood(nodes, edges) {
    const neighbors = new Map(nodes.map((node) => [node.sid, new Set()]));
    const incidentEdges = new Map(nodes.map((node) => [node.sid, new Set()]));
    edges.forEach((edge, index) => {
        neighbors.get(edge.source)?.add(edge.target);
        neighbors.get(edge.target)?.add(edge.source);
        incidentEdges.get(edge.source)?.add(index);
        incidentEdges.get(edge.target)?.add(index);
    });
    return {neighbors, incidentEdges};
}

function graphNodeHref(node, prefix = '') {
    if (!node?.url) {
        return null;
    }
    const cleanPrefix = String(prefix).replace(/\/+$/, '');
    const cleanUrl = String(node.url).replace(/^\/+/, '');
    return `${cleanPrefix}/${cleanUrl}` || '/';
}

function cssToken(style, name, fallback) {
    return style.getPropertyValue(name).trim() || fallback;
}

function graphTheme(container) {
    const style = getComputedStyle(container);
    return {
        background: cssToken(style, '--content-bg-color', '#1f1f1f'),
        foreground: cssToken(style, '--content-color', '#e7e7e7'),
        muted: cssToken(style, '--content-color-faint', '#888888'),
        surface: cssToken(style, '--surface-2-bg', '#303238'),
        border: cssToken(style, '--menu-border-left-color', '#777777'),
        accent: cssToken(style, '--front-blue', '#0088dd'),
        backlink: cssToken(style, '--article-anchor-color', '#8b5cf6')
    };
}

function prefersReducedMotion() {
    return typeof matchMedia === 'function'
        && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export {
    graphEdges,
    graphNeighborhood,
    graphNodeHref,
    graphNodes,
    graphTheme,
    initialGraphPositions,
    prefersReducedMotion
};
