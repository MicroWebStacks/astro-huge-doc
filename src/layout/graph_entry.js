import {
    graphEdges,
    graphNeighborhood,
    graphNodeHref,
    graphNodes
} from './graph_renderer_shared.js';

const loadVisRenderer = async () => {
    const {createVisNetworkGraph} = await import('./graph_vis_network.js');
    return createVisNetworkGraph;
};

function connectedGraphPayload(universe, center, currentPayload = null) {
    const nodes = graphNodes({
        center,
        nodes: [
            ...(universe?.nodes ?? []),
            ...(currentPayload?.nodes ?? [])
        ]
    });
    const edgesByKey = new Map();
    for (const edge of [
        ...(universe?.edges ?? []),
        ...(currentPayload?.edges ?? [])
    ]) {
        if (edge?.source && edge?.target) {
            edgesByKey.set(`${edge.source}\0${edge.target}`, edge);
        }
    }
    const edges = graphEdges({edges: [...edgesByKey.values()]}, nodes);
    const {neighbors} = graphNeighborhood(nodes, edges);
    const distance = new Map([[center.sid, 0]]);
    const queue = [center.sid];

    for (let index = 0; index < queue.length; index += 1) {
        const sid = queue[index];
        for (const neighbor of neighbors.get(sid) ?? []) {
            if (distance.has(neighbor)) {
                continue;
            }
            distance.set(neighbor, distance.get(sid) + 1);
            queue.push(neighbor);
        }
    }

    const connectedNodes = nodes
        .filter((node) => distance.has(node.sid))
        .map((node) => ({...node, ring: distance.get(node.sid)}))
        .sort((a, b) => (
            a.ring - b.ring
            || a.title.localeCompare(b.title)
            || a.sid.localeCompare(b.sid)
        ));
    const connectedSids = new Set(connectedNodes.map((node) => node.sid));

    return {
        center,
        nodes: connectedNodes,
        edges: edges.filter((edge) => (
            connectedSids.has(edge.source) && connectedSids.has(edge.target)
        ))
    };
}

function graphMaxDepth(payload) {
    return Math.max(0, ...graphNodes(payload).map((node) => Number(node.ring) || 0));
}

function graphPayloadAtDepth(payload, depth, expandedNodeSids = []) {
    const limit = Math.max(0, Number(depth) || 0);
    const allNodes = graphNodes(payload);
    const allEdges = graphEdges(payload, allNodes);
    const {neighbors} = graphNeighborhood(allNodes, allEdges);
    const visible = new Set(
        allNodes
            .filter((node) => (Number(node.ring) || 0) <= limit)
            .map((node) => node.sid)
    );
    for (const sid of expandedNodeSids) {
        if (!visible.has(sid)) {
            continue;
        }
        for (const neighbor of neighbors.get(sid) ?? []) {
            visible.add(neighbor);
        }
    }
    const expanded = new Set(expandedNodeSids);
    const nodes = allNodes
        .filter((node) => visible.has(node.sid))
        .map((node) => ({...node, locallyExpanded: expanded.has(node.sid)}));
    return {
        center: payload.center,
        nodes,
        edges: allEdges.filter((edge) => (
            visible.has(edge.source) && visible.has(edge.target)
        ))
    };
}

function synchronizedGraphDepth(completePayload, visiblePayload, currentDepth) {
    const visible = new Set(graphNodes(visiblePayload).map((node) => node.sid));
    const maximum = graphMaxDepth(completePayload);
    let depth = currentDepth;
    while (depth < maximum) {
        const nextLevel = graphPayloadAtDepth(completePayload, depth + 1);
        if (!nextLevel.nodes.every((node) => visible.has(node.sid))) {
            break;
        }
        depth += 1;
    }
    return depth;
}

function activateGraphEntry({root = document.querySelector('[data-graph-root]')} = {}) {
    if (!root || root.dataset.graphActive === 'true') {
        return null;
    }
    const sid = root.getAttribute('data-graph-sid');
    const prefix = root.getAttribute('data-graph-prefix') ?? '';
    const trigger = root.querySelector('[data-action="open-graph"]');
    const modal = root.querySelector('[data-graph-modal]');
    const viewport = root.querySelector('[data-graph-viewport]');
    const close = root.querySelector('[data-action="close-graph"]');
    const depthSlider = root.querySelector('[data-action="graph-depth-slider"]');
    const depthTicks = root.querySelector('[data-graph-depth-ticks]');
    const visibleCount = root.querySelector('[data-graph-visible-count]');
    const clearLocal = root.querySelector('[data-action="clear-graph-local"]');
    const fit = root.querySelector('[data-action="fit-graph"]');
    const reset = root.querySelector('[data-action="reset-graph"]');
    const status = root.querySelector('[data-graph-status]');
    if (!sid || !trigger || !modal || !viewport || !close || !depthSlider
        || !depthTicks || !visibleCount || !clearLocal || !fit || !reset || !status) {
        return null;
    }

    root.dataset.graphActive = 'true';
    const modalAnchor = document.createComment('graph-modal-anchor');
    modal.before(modalAnchor);
    let payload = null;
    let completePayload = null;
    let payloadPromise = null;
    let completePayloadPromise = null;
    let renderer = null;
    let renderGeneration = 0;
    let previousBodyOverflow = '';
    let expansionController = null;
    let currentDepth = 0;
    const expandedNodeSids = new Set();

    const setStatus = (message) => {
        status.textContent = message;
    };

    const loadPayload = () => {
        if (!payloadPromise) {
            payloadPromise = fetch(`${prefix}/graph/${encodeURIComponent(sid)}.json`)
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`graph fetch failed with status ${response.status}`);
                    }
                    return response.json();
                })
                .then((result) => {
                    payload = result;
                    return result;
                })
                .catch((error) => {
                    payloadPromise = null;
                    throw error;
                });
        }
        return payloadPromise;
    };

    const navigateToNode = (node, originalEvent) => {
        const href = graphNodeHref(node, prefix);
        if (!href) {
            return;
        }
        if (originalEvent?.ctrlKey || originalEvent?.metaKey || originalEvent?.shiftKey || originalEvent?.button === 1) {
            window.open(href, '_blank', 'noopener');
            return;
        }
        window.location.assign(href);
    };

    const updateDepthControls = () => {
        const maximum = completePayload ? graphMaxDepth(completePayload) : currentDepth;
        const minimum = maximum > 0 ? 1 : 0;
        const shown = payload?.nodes?.length ?? 0;
        const baseline = completePayload
            ? graphPayloadAtDepth(completePayload, currentDepth).nodes.length
            : shown;
        const local = Math.max(0, shown - baseline);
        depthSlider.min = String(minimum);
        depthSlider.max = String(Math.max(minimum, maximum));
        depthSlider.value = String(Math.min(maximum, Math.max(minimum, currentDepth)));
        depthSlider.disabled = !completePayload || maximum <= minimum;
        depthSlider.setAttribute('aria-valuetext', `Depth ${currentDepth}, ${baseline} global nodes${local ? ` plus ${local} local` : ''}`);
        visibleCount.textContent = `${shown} visible${local ? ` (+${local} local)` : ''}`;
        clearLocal.hidden = expandedNodeSids.size === 0;

        const tickNodes = [];
        if (completePayload) {
            for (let depth = minimum; depth <= maximum; depth += 1) {
                const count = graphPayloadAtDepth(completePayload, depth).nodes.length;
                const tick = document.createElement('span');
                tick.textContent = depth === maximum ? `All · ${count}` : `${depth} · ${count}`;
                tick.dataset.current = String(depth === currentDepth);
                tickNodes.push(tick);
            }
        } else {
            const tick = document.createElement('span');
            tick.textContent = 'Loading levels…';
            tickNodes.push(tick);
        }
        depthTicks.replaceChildren(...tickNodes);
    };

    const loadCompletePayload = () => {
        if (completePayload) {
            return Promise.resolve(completePayload);
        }
        if (!completePayloadPromise) {
            const controller = new AbortController();
            expansionController = controller;
            completePayloadPromise = fetch(`${prefix}/graph/all.json`, {signal: controller.signal})
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`full graph fetch failed with status ${response.status}`);
                    }
                    return response.json();
                })
                .then((universe) => {
                    completePayload = connectedGraphPayload(universe, payload.center, completePayload ?? payload);
                    updateDepthControls();
                    return completePayload;
                })
                .catch((error) => {
                    completePayloadPromise = null;
                    if (error.name !== 'AbortError') {
                        console.warn('microwebstacks: full graph metadata failed to load', error);
                        setStatus('Full graph depth is not available yet');
                    }
                    throw error;
                })
                .finally(() => {
                    if (expansionController === controller) {
                        expansionController = null;
                    }
                });
        }
        return completePayloadPromise;
    };

    const rebuildVisiblePayload = (complete, {synchronizeDepth = false} = {}) => {
        payload = graphPayloadAtDepth(complete, currentDepth, expandedNodeSids);
        if (synchronizeDepth) {
            currentDepth = synchronizedGraphDepth(complete, payload, currentDepth);
        }

        const baseline = graphPayloadAtDepth(complete, currentDepth);
        const baselineVisible = new Set(baseline.nodes.map((node) => node.sid));
        const allNodes = graphNodes(complete);
        const {neighbors} = graphNeighborhood(allNodes, graphEdges(complete, allNodes));
        for (const expandedSid of expandedNodeSids) {
            if (baselineVisible.has(expandedSid)
                && [...(neighbors.get(expandedSid) ?? [])].every((sid) => baselineVisible.has(sid))) {
                expandedNodeSids.delete(expandedSid);
            }
        }

        payload = graphPayloadAtDepth(complete, currentDepth, expandedNodeSids);
        const visible = new Set(payload.nodes.map((node) => node.sid));
        for (const expandedSid of expandedNodeSids) {
            if (!visible.has(expandedSid)) {
                expandedNodeSids.delete(expandedSid);
            }
        }
        payload = graphPayloadAtDepth(complete, currentDepth, expandedNodeSids);
    };

    const showDepth = async (depth) => {
        if (modal.hidden) {
            return;
        }
        try {
            const complete = await loadCompletePayload();
            const maximum = graphMaxDepth(complete);
            currentDepth = Math.min(maximum, Math.max(1, depth));
            rebuildVisiblePayload(complete);
            updateDepthControls();
            await renderGraph();
        } catch (error) {
            if (error.name !== 'AbortError') {
                updateDepthControls();
            }
        }
    };

    const expandNode = async (node) => {
        if ((!node?.locallyExpanded && (node?.hiddenNeighborCount ?? 0) <= 0) || modal.hidden) {
            return;
        }
        try {
            const complete = await loadCompletePayload();
            if (node.locallyExpanded) {
                expandedNodeSids.delete(node.id);
            } else {
                expandedNodeSids.add(node.id);
            }
            rebuildVisiblePayload(complete, {synchronizeDepth: true});
            updateDepthControls();
            await renderGraph();
        } catch { /* status is handled by loadCompletePayload */ }
    };

    const renderGraph = async () => {
        if (modal.hidden) {
            return;
        }
        const generation = ++renderGeneration;
        renderer?.destroy();
        renderer = null;
        viewport.replaceChildren();
        viewport.setAttribute('aria-busy', 'true');
        setStatus('Loading interactive graph');
        try {
            const createRenderer = await loadVisRenderer();
            if (generation !== renderGeneration || modal.hidden) {
                return;
            }
            const nextRenderer = await createRenderer({
                container: viewport,
                payload,
                onActivate: navigateToNode,
                onExpand: expandNode,
                onStatus: setStatus
            });
            if (generation !== renderGeneration || modal.hidden) {
                nextRenderer.destroy();
                return;
            }
            renderer = nextRenderer;
        } catch (error) {
            console.warn('microwebstacks: vis-network graph renderer failed', error);
            setStatus('Interactive graph failed to initialize');
        } finally {
            if (generation === renderGeneration) {
                viewport.removeAttribute('aria-busy');
            }
        }
    };

    const openModal = async () => {
        if (!modal.hidden) {
            return;
        }
        previousBodyOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        // The graph trigger lives inside the responsive app-bar disclosure,
        // whose overflow rules can clip descendants. Host the live modal at
        // the document level while it is open, then restore it on close.
        document.body.append(modal);
        modal.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        trigger.setAttribute('aria-busy', 'true');
        viewport.setAttribute('aria-busy', 'true');
        setStatus('Loading graph data');
        close.focus();
        try {
            await loadPayload();
            if (modal.hidden) {
                return;
            }
            if (!completePayload) {
                completePayload = connectedGraphPayload(payload, payload.center, payload);
                currentDepth = graphMaxDepth(completePayload);
                updateDepthControls();
                completePayload = null;
            }
            await renderGraph();
            void loadCompletePayload().catch(() => {});
        } catch (error) {
            console.warn('microwebstacks: neighborhood graph failed to load', error);
            setStatus('Graph data failed to load');
        } finally {
            trigger.removeAttribute('aria-busy');
            if (!renderer) {
                viewport.removeAttribute('aria-busy');
            }
        }
    };

    const closeModal = () => {
        if (modal.hidden) {
            return;
        }
        ++renderGeneration;
        expansionController?.abort();
        expansionController = null;
        renderer?.destroy();
        renderer = null;
        viewport.replaceChildren();
        viewport.removeAttribute('aria-busy');
        modal.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = previousBodyOverflow;
        if (modalAnchor.parentNode) {
            modalAnchor.parentNode.insertBefore(modal, modalAnchor.nextSibling);
        } else {
            modal.remove();
        }
        trigger.focus();
    };

    trigger.setAttribute('aria-expanded', 'false');
    updateDepthControls();
    trigger.addEventListener('click', openModal);
    close.addEventListener('click', closeModal);
    depthSlider.addEventListener('change', () => void showDepth(Number(depthSlider.value)));
    clearLocal.addEventListener('click', async () => {
        expandedNodeSids.clear();
        if (completePayload) {
            payload = graphPayloadAtDepth(completePayload, currentDepth);
            updateDepthControls();
            await renderGraph();
        }
    });
    fit.addEventListener('click', () => renderer?.fit());
    reset.addEventListener('click', () => renderer?.reset());
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });
    modal.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeModal();
        }
    });
    return {
        close: closeModal,
        showDepth,
        open: openModal,
        render: renderGraph
    };
}

if (typeof document !== 'undefined') {
    activateGraphEntry();
}

export {
    activateGraphEntry,
    connectedGraphPayload,
    graphMaxDepth,
    graphPayloadAtDepth,
    loadVisRenderer,
    synchronizedGraphDepth
};
