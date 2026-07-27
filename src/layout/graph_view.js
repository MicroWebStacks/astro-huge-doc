/*
 * Radial neighborhood graph renderer (OKF plan TP-13/DD-11): deterministic
 * layout, no force simulation. Emits a self-contained SVG string — the
 * existing panzoom modal clones its source SVG via XMLSerializer/DOMParser
 * (lib_panzoommodal.js's serializeAndDeserializeSVG), which drops any JS
 * event listeners on the original, so navigation and tooltips are done with
 * native <a href> / <title> elements (both survive the clone) instead of
 * click handlers. Styling is an embedded <style> inside the SVG itself for
 * the same reason: the clone lands in a shadow root that page stylesheets
 * cannot reach, but CSS custom properties still inherit across the shadow
 * boundary, so var(--front-blue) etc. resolve correctly either way.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const CENTER_R = 22;
const NODE_R = 14;
const RING1_RADIUS = 150;
const RING2_RADIUS = 280;
const PAD = 130;

function ringPositions(count, radius) {
    if (count === 0) {
        return [];
    }
    return Array.from({length: count}, (_, index) => {
        const angle = (-90 + (360 / count) * index) * (Math.PI / 180);
        return {x: Math.cos(angle) * radius, y: Math.sin(angle) * radius};
    });
}

function truncate(text, max = 22) {
    const value = String(text ?? '');
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function escapeXml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
    })[ch]);
}

/* The graph modal surface is themed (--content-bg-color, see AppBar.astro's
   .graph-entry overrides), unlike the always-light
   photo/diagram lightbox — so every color here must be a theme token that
   already carries contrast against the content surface in both light and
   dark mode (labels: content ink; fills: raised surface tokens). */
const GRAPH_STYLE = `
.graph-edge{stroke:var(--content-color-faint);stroke-width:1.5;}
.graph-edge-outgoing{stroke:var(--front-blue);}
.graph-edge-backlink{stroke:var(--article-anchor-color,var(--front-blue));stroke-dasharray:3 3;}
.graph-arrow-head{fill:var(--content-color-faint);}
.graph-node-circle{fill:var(--surface-2-bg);stroke:var(--menu-border-left-color);stroke-width:1.5;}
.graph-node-center .graph-node-circle{fill:var(--menu-active-color);stroke:var(--front-blue);stroke-width:2.5;}
.graph-node:hover .graph-node-circle{stroke:var(--front-blue);}
.graph-node-badge{font:600 9px sans-serif;fill:var(--content-color-faint);letter-spacing:0.04em;text-transform:uppercase;}
.graph-node-label{font:12px sans-serif;fill:var(--content-color);}
.graph-node-center .graph-node-label{font-weight:600;}
a.graph-node{cursor:pointer;}
g.graph-node-static{cursor:default;}
`;

function nodeMarkup(node, position, isCenter, prefix) {
    const radius = isCenter ? CENTER_R : NODE_R;
    const badge = node.type ? `<text class="graph-node-badge" x="${position.x}" y="${position.y - radius - 12}" text-anchor="middle">${escapeXml(truncate(node.type, 18))}</text>` : '';
    const extra = !isCenter && node.ring === 2 && node.neighborCount > 1 ? ` (+${node.neighborCount - 1})` : '';
    const label = `<text class="graph-node-label" x="${position.x}" y="${position.y + radius + 16}" text-anchor="middle">${escapeXml(truncate(node.title))}${escapeXml(extra)}</text>`;
    const tooltip = `<title>${escapeXml(node.title)}${node.type ? ` — ${escapeXml(node.type)}` : ''}</title>`;
    const body = `<circle class="graph-node-circle" cx="${position.x}" cy="${position.y}" r="${radius}"></circle>${badge}${label}${tooltip}`;
    const groupClass = `graph-node${isCenter ? ' graph-node-center' : ''}`;
    if (isCenter || !node.url) {
        return `<g class="${groupClass} graph-node-static">${body}</g>`;
    }
    return `<a class="${groupClass}" href="${escapeXml(`${prefix}/${node.url}`)}">${body}</a>`;
}

function edgeMarkup(edge, positions, centerSid) {
    const from = positions.get(edge.source);
    const to = positions.get(edge.target);
    if (!from || !to) {
        return '';
    }
    const cls = edge.source === centerSid ? 'graph-edge graph-edge-outgoing'
        : edge.target === centerSid ? 'graph-edge graph-edge-backlink'
            : 'graph-edge';
    const context = [
        edge.source_heading ? `under "${edge.source_heading}"` : null,
        edge.link_text ? `"${edge.link_text}"` : null
    ].filter(Boolean).join(' ');
    const tooltip = context ? `<title>${escapeXml(context)}</title>` : '';
    return `<line class="${cls}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" marker-end="url(#graph-arrow)">${tooltip}</line>`;
}

/* payload: {center, nodes, edges} from GET /graph/<sid>.json (see
   src/libs/graph.js). Returns an SVG markup string. */
export function buildGraphSvg(payload, {prefix = ''} = {}) {
    const {center, nodes, edges} = payload;
    const ring1 = nodes.filter((node) => node.ring === 1);
    const ring2 = nodes.filter((node) => node.ring === 2);

    const positions = new Map([[center.sid, {x: 0, y: 0}]]);
    ringPositions(ring1.length, RING1_RADIUS).forEach((pos, index) => positions.set(ring1[index].sid, pos));
    ringPositions(ring2.length, RING2_RADIUS).forEach((pos, index) => positions.set(ring2[index].sid, pos));

    const edgeLines = edges.map((edge) => edgeMarkup(edge, positions, center.sid)).join('');
    const nodes_svg = [
        nodeMarkup(center, positions.get(center.sid), true, prefix),
        ...ring1.map((node) => nodeMarkup(node, positions.get(node.sid), false, prefix)),
        ...ring2.map((node) => nodeMarkup(node, positions.get(node.sid), false, prefix))
    ].join('');

    const half = RING2_RADIUS + PAD;
    return `<svg xmlns="${SVG_NS}" viewBox="${-half} ${-half} ${half * 2} ${half * 2}" class="graph-svg">`
        + `<style>${GRAPH_STYLE}</style>`
        + '<defs><marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">'
        + '<path d="M0 0L10 5L0 10z" class="graph-arrow-head"></path></marker></defs>'
        + `<g class="graph-edges">${edgeLines}</g>`
        + `<g class="graph-nodes">${nodes_svg}</g>`
        + '</svg>';
}
