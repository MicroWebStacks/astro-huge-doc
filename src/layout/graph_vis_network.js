import {
    graphEdges,
    graphNeighborhood,
    graphNodes,
    graphTheme,
    initialGraphPositions,
    prefersReducedMotion
} from './graph_renderer_shared.js';

function visNetworkData(payload, palette) {
    const nodes = graphNodes(payload);
    const edges = graphEdges(payload, nodes);
    const positions = initialGraphPositions(nodes, payload.center.sid);
    const visibleNeighbors = new Map(nodes.map((node) => [node.sid, new Set()]));
    edges.forEach((edge) => {
        visibleNeighbors.get(edge.source)?.add(edge.target);
        visibleNeighbors.get(edge.target)?.add(edge.source);
    });

    return {
        sourceNodes: nodes,
        sourceEdges: edges,
        nodes: nodes.map((node) => {
            const position = positions.get(node.sid) ?? {x: 0, y: 0};
            const isCenter = node.sid === payload.center.sid;
            return {
                id: node.sid,
                label: node.title,
                x: position.x,
                y: position.y,
                fixed: isCenter ? {x: true, y: true} : false,
                physics: true,
                shape: 'dot',
                size: isCenter ? 26 : Math.min(22, 12 + (visibleNeighbors.get(node.sid)?.size ?? 0) * 1.4),
                borderWidth: isCenter ? 4 : 2,
                color: {
                    background: palette.surface,
                    border: isCenter ? palette.accent : palette.border,
                    highlight: {background: palette.accent, border: palette.foreground},
                    hover: {background: palette.surface, border: palette.accent}
                },
                font: {
                    color: palette.foreground,
                    face: 'sans-serif',
                    size: isCenter ? 15 : node.ring >= 2 ? 11 : 13,
                    strokeColor: palette.background,
                    strokeWidth: 4
                },
                margin: 8,
                opacity: 1,
                url: node.url ?? '',
                titleText: node.title,
                ring: node.ring,
                locallyExpanded: Boolean(node.locallyExpanded),
                hiddenNeighborCount: Math.max(0, (Number(node.neighborCount) || 0) - (visibleNeighbors.get(node.sid)?.size ?? 0))
            };
        }),
        edges: edges.map((edge, index) => {
            const kind = edge.source === payload.center.sid
                ? 'outgoing'
                : edge.target === payload.center.sid ? 'backlink' : 'related';
            const color = kind === 'outgoing'
                ? palette.accent
                : kind === 'backlink' ? palette.backlink : palette.muted;
            return {
                id: `edge-${index}-${edge.source}-${edge.target}`,
                from: edge.source,
                to: edge.target,
                arrows: {to: {enabled: true, scaleFactor: 0.55}},
                color: {color, highlight: color, hover: color, opacity: kind === 'related' ? 0.55 : 0.9},
                dashes: kind === 'backlink',
                width: kind === 'related' ? 1.2 : 2,
                smooth: {enabled: true, type: 'continuous', roundness: 0.16},
                kind,
                titleText: [
                    edge.source_heading ? `under "${edge.source_heading}"` : '',
                    edge.link_text ? `"${edge.link_text}"` : ''
                ].filter(Boolean).join(' ')
            };
        })
    };
}

function isNavigableGraphNode(node, centerSid) {
    return Boolean(node?.url && node.id !== centerSid);
}

function clickedGraphNodeId(params) {
    const item = params?.items?.find((candidate) => (
        candidate && Object.hasOwn(candidate, 'nodeId')
    ));
    if (item) {
        return item.nodeId;
    }
    return params?.nodes?.length === 1 ? params.nodes[0] : null;
}

async function createVisNetworkGraph({container, payload, onActivate, onExpand, onStatus}) {
    const {DataSet, Network} = await import('vis-network/standalone');
    const palette = graphTheme(container);
    const reducedMotion = prefersReducedMotion();
    const centerSid = payload.center.sid;
    const model = visNetworkData(payload, palette);
    const nodes = new DataSet(model.nodes);
    const edges = new DataSet(model.edges);
    const {neighbors, incidentEdges} = graphNeighborhood(model.sourceNodes, model.sourceEdges);
    const baseNodes = new Map(model.nodes.map((node) => [node.id, node]));
    const baseEdges = new Map(model.edges.map((edge) => [edge.id, edge]));
    const initialPositions = initialGraphPositions(model.sourceNodes, centerSid);
    let destroyed = false;
    let settled = false;
    let fitAfterSettle = true;
    let lastMeaningfulDrag = 0;
    let dragStartPositions = null;

    const network = new Network(container, {nodes, edges}, {
        autoResize: true,
        layout: {
            improvedLayout: false
        },
        interaction: {
            dragNodes: true,
            dragView: true,
            hover: true,
            hoverConnectedEdges: false,
            keyboard: {
                enabled: true,
                bindToWindow: false,
                autoFocus: true,
                speed: {x: 10, y: 10, zoom: 0.025}
            },
            multiselect: false,
            selectable: false,
            tooltipDelay: 350,
            zoomSpeed: 0.6,
            zoomView: true
        },
        nodes: {
            chosen: false
        },
        edges: {
            chosen: false,
            selectionWidth: 0
        },
        physics: reducedMotion ? false : {
            enabled: true,
            solver: 'forceAtlas2Based',
            forceAtlas2Based: {
                theta: 0.5,
                gravitationalConstant: -72,
                centralGravity: 0.012,
                springLength: 125,
                springConstant: 0.055,
                damping: 0.42,
                avoidOverlap: 0.75
            },
            maxVelocity: 45,
            minVelocity: 0.35,
            stabilization: {
                enabled: true,
                iterations: 700,
                updateInterval: 25,
                fit: false
            },
            adaptiveTimestep: true
        }
    });

    const expansionButtons = new Map();
    for (const node of baseNodes.values()) {
        if (!node.hiddenNeighborCount && !node.locallyExpanded) {
            continue;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = node.locallyExpanded ? '−' : `+${node.hiddenNeighborCount}`;
        button.title = node.locallyExpanded
            ? `Collapse the locally expanded branch from ${node.titleText}`
            : `Reveal ${node.hiddenNeighborCount} hidden neighbor${node.hiddenNeighborCount === 1 ? '' : 's'} from ${node.titleText}`;
        button.setAttribute('aria-label', button.title);
        button.style.cssText = [
            'position:absolute',
            'z-index:2',
            'min-width:22px',
            'height:20px',
            'padding:0 4px',
            'border:1px solid var(--front-blue)',
            'border-radius:10px',
            'background:var(--surface-2-bg)',
            'color:var(--content-color)',
            'font:600 10px sans-serif',
            'cursor:pointer',
            'transform:translate(calc(-100% - 10px),-115%)'
        ].join(';');
        button.addEventListener('pointerdown', (event) => event.stopPropagation());
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            onExpand?.(node);
        });
        expansionButtons.set(node.id, button);
        container.append(button);
    }

    let openNodeId = null;
    let openHideTimer = null;
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.hidden = true;
    openButton.textContent = 'Open ↗';
    openButton.style.cssText = [
        'position:absolute',
        'z-index:3',
        'height:24px',
        'padding:0 7px',
        'border:1px solid var(--soft-border-color)',
        'border-radius:4px',
        'background:var(--surface-2-bg)',
        'color:var(--content-color)',
        'font:600 11px sans-serif',
        'cursor:pointer',
        'transform:translate(12px,-115%)'
    ].join(';');
    openButton.addEventListener('pointerdown', (event) => event.stopPropagation());
    openButton.addEventListener('pointerenter', () => clearTimeout(openHideTimer));
    openButton.addEventListener('pointerleave', () => {
        clearTimeout(openHideTimer);
        openHideTimer = setTimeout(() => {
            openNodeId = null;
            openButton.hidden = true;
        }, 100);
    });
    openButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const source = baseNodes.get(openNodeId);
        if (isNavigableGraphNode(source, centerSid)) {
            onActivate?.({sid: source.id, title: source.titleText, url: source.url}, event);
        }
    });
    container.append(openButton);

    function positionExpansionButtons() {
        for (const [nodeId, button] of expansionButtons) {
            const dom = network.canvasToDOM(network.getPosition(nodeId));
            button.style.left = `${dom.x}px`;
            button.style.top = `${dom.y}px`;
        }
    }

    function positionOpenButton() {
        if (!openNodeId || openButton.hidden) {
            return;
        }
        const dom = network.canvasToDOM(network.getPosition(openNodeId));
        openButton.style.left = `${dom.x}px`;
        openButton.style.top = `${dom.y}px`;
    }

    function showOpenButton(node) {
        clearTimeout(openHideTimer);
        if (!isNavigableGraphNode(node, centerSid)) {
            openNodeId = null;
            openButton.hidden = true;
            return;
        }
        openNodeId = node.id;
        openButton.title = `Open ${node.titleText}`;
        openButton.setAttribute('aria-label', openButton.title);
        openButton.hidden = false;
        positionOpenButton();
    }

    function scheduleOpenHide() {
        clearTimeout(openHideTimer);
        openHideTimer = setTimeout(() => {
            openNodeId = null;
            openButton.hidden = true;
        }, 100);
    }
    positionExpansionButtons();

    function restoreStyles() {
        nodes.update([...baseNodes.values()].map((node) => ({
            id: node.id,
            opacity: 1,
            borderWidth: node.borderWidth,
            color: node.color,
            font: node.font
        })));
        edges.update([...baseEdges.values()].map((edge) => ({
            id: edge.id,
            color: edge.color,
            width: edge.width
        })));
        network.redraw();
        if (settled) {
            network.stopSimulation();
        }
    }

    function clearHighlight() {
        if (!destroyed) {
            restoreStyles();
        }
    }

    function highlight(sid) {
        if (destroyed || !baseNodes.has(sid)) {
            return;
        }
        const visibleNodes = new Set([sid, ...(neighbors.get(sid) ?? [])]);
        const visibleEdgeIndexes = incidentEdges.get(sid) ?? new Set();
        nodes.update([...baseNodes.values()].map((node) => ({
            id: node.id,
            opacity: visibleNodes.has(node.id) ? 1 : 0.12,
            borderWidth: node.id === sid ? 4 : visibleNodes.has(node.id) ? 3 : 1,
            color: node.id === sid
                ? {...node.color, background: palette.accent, border: palette.foreground}
                : node.color
        })));
        edges.update([...baseEdges.values()].map((edge, index) => ({
            id: edge.id,
            color: {
                ...edge.color,
                opacity: visibleEdgeIndexes.has(index) ? 1 : 0.08
            },
            width: visibleEdgeIndexes.has(index) ? 3 : 1
        })));
        network.redraw();
        if (settled) {
            network.stopSimulation();
        }
    }

    network.on('hoverNode', ({node}) => {
        const source = baseNodes.get(node);
        container.style.cursor = 'grab';
        highlight(node);
        showOpenButton(source);
        const degree = neighbors.get(node)?.size ?? 0;
        const hidden = source?.hiddenNeighborCount ?? 0;
        onStatus?.(`${source?.titleText ?? node} · ${degree} shown${hidden ? ` · ${hidden} hidden` : ''}${source?.locallyExpanded ? ' · locally expanded' : ''}`);
    });
    network.on('blurNode', () => {
        container.style.cursor = '';
        scheduleOpenHide();
        clearHighlight();
        onStatus?.('vis-network · ForceAtlas2-based · hover a node to inspect its neighborhood');
    });
    network.on('dragStart', ({nodes: dragged}) => {
        container.style.cursor = dragged.length ? 'grabbing' : '';
        openNodeId = null;
        openButton.hidden = true;
        clearHighlight();
        if (dragged.length) {
            dragStartPositions = network.getPositions(dragged);
        }
    });
    network.on('dragEnd', ({nodes: dragged}) => {
        container.style.cursor = dragged.length ? 'grab' : '';
        if (!dragged.length) {
            return;
        }
        const current = network.getPositions(dragged);
        const moved = dragged.filter((id) => {
            const before = dragStartPositions?.[id];
            const after = current[id];
            return before && after && Math.hypot(after.x - before.x, after.y - before.y) >= 4;
        });
        dragStartPositions = null;
        if (!moved.length) {
            return;
        }
        lastMeaningfulDrag = Date.now();
        nodes.update(moved.map((id) => ({
            id,
            x: current[id].x,
            y: current[id].y,
            fixed: {x: true, y: true}
        })));
        settled = false;
        fitAfterSettle = false;
        onStatus?.(`${baseNodes.get(moved[0])?.titleText ?? 'Node'} pinned · reflowing its neighbors`);
        if (!reducedMotion) {
            network.startSimulation();
        }
    });
    network.on('click', (params) => {
        if (Date.now() - lastMeaningfulDrag < 120) {
            return;
        }
        const source = baseNodes.get(clickedGraphNodeId(params));
        if (!isNavigableGraphNode(source, centerSid)) {
            return;
        }
        onActivate?.({
            sid: source.id,
            title: source.titleText,
            url: source.url
        }, params.event?.srcEvent ?? params.event);
    });
    network.on('stabilized', () => {
        settled = true;
        network.stopSimulation();
        if (fitAfterSettle) {
            fitAfterSettle = false;
            network.fit({animation: reducedMotion ? false : {duration: 320, easingFunction: 'easeInOutQuad'}});
        }
        onStatus?.('vis-network · ForceAtlas2-based settled · drag a node to pin and reflow');
    });
    network.on('afterDrawing', () => {
        positionExpansionButtons();
        positionOpenButton();
    });
    network.on('zoom', () => {
        positionExpansionButtons();
        positionOpenButton();
    });

    if (reducedMotion) {
        network.fit({animation: false});
        onStatus?.('vis-network · static seeded layout because reduced motion is enabled');
    }

    return {
        name: 'vis',
        clearHighlight,
        highlight,
        fit() {
            network.fit({animation: reducedMotion ? false : {duration: 280, easingFunction: 'easeInOutQuad'}});
        },
        reset() {
            const updates = model.sourceNodes.map((node) => {
                const position = initialPositions.get(node.sid) ?? {x: 0, y: 0};
                return {
                    id: node.sid,
                    x: position.x,
                    y: position.y,
                    fixed: node.sid === centerSid ? {x: true, y: true} : false
                };
            });
            nodes.update(updates);
            restoreStyles();
            settled = false;
            fitAfterSettle = true;
            onStatus?.('vis-network positions reset · restarting physics');
            if (reducedMotion) {
                network.fit({animation: false});
            } else {
                network.startSimulation();
            }
        },
        destroy() {
            destroyed = true;
            clearTimeout(openHideTimer);
            expansionButtons.forEach((button) => button.remove());
            openButton.remove();
            container.style.cursor = '';
            network.destroy();
        }
    };
}

export {clickedGraphNodeId, createVisNetworkGraph, isNavigableGraphNode, visNetworkData};
