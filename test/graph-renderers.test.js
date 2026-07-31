import test from 'node:test';
import assert from 'node:assert/strict';
import {
    clickedGraphNodeId,
    isNavigableGraphNode,
    visNetworkData
} from '../src/layout/graph_vis_network.js';
import {
    graphEdges,
    graphNeighborhood,
    graphNodeHref,
    graphNodes,
    initialGraphPositions
} from '../src/layout/graph_renderer_shared.js';
import {
    connectedGraphPayload,
    graphMaxDepth,
    graphPayloadAtDepth,
    loadVisRenderer,
    synchronizedGraphDepth
} from '../src/layout/graph_entry.js';

const palette = {
    background: '#111111',
    foreground: '#eeeeee',
    muted: '#777777',
    surface: '#303030',
    border: '#888888',
    accent: '#0088dd',
    backlink: '#8b5cf6'
};

function samplePayload() {
    return {
        center: {sid: 'A', url: 'alpha', title: 'Alpha', type: 'concept'},
        nodes: [
            {sid: 'A', url: 'alpha', title: 'Alpha', type: 'concept', ring: 0, neighborCount: 2},
            {sid: 'B', url: 'bravo', title: 'Bravo', type: 'concept', ring: 1, neighborCount: 2},
            {sid: 'C', url: 'charlie', title: 'Charlie', type: 'concept', ring: 1, neighborCount: 1},
            {sid: 'D', url: null, title: 'Delta', type: null, ring: 2, neighborCount: 3}
        ],
        edges: [
            {source: 'A', target: 'B', link_text: 'Bravo', source_heading: 'intro'},
            {source: 'C', target: 'A', link_text: null, source_heading: null},
            {source: 'B', target: 'D', link_text: null, source_heading: null},
            {source: 'A', target: 'missing', link_text: null, source_heading: null}
        ]
    };
}

test('shared graph model deduplicates the center and drops edges to absent nodes', () => {
    const payload = samplePayload();
    const nodes = graphNodes(payload);
    const edges = graphEdges(payload, nodes);

    assert.deepEqual(nodes.map((node) => node.sid), ['A', 'B', 'C', 'D']);
    assert.equal(edges.length, 3);
    assert.deepEqual(edges.map((edge) => `${edge.source}->${edge.target}`), ['A->B', 'C->A', 'B->D']);
});

test('initial graph positions are deterministic, centered, and separated by depth', () => {
    const nodes = graphNodes(samplePayload());
    const first = initialGraphPositions(nodes, 'A');
    const second = initialGraphPositions([...nodes].reverse(), 'A');

    assert.deepEqual(first.get('A'), {x: 0, y: 0});
    assert.deepEqual(first.get('B'), second.get('B'));
    assert.deepEqual(first.get('D'), second.get('D'));
    assert.ok(Math.abs(Math.hypot(first.get('B').x, first.get('B').y) - 180) < 0.001);
    assert.ok(Math.abs(Math.hypot(first.get('D').x, first.get('D').y) - 330) < 0.001);
});

test('shared neighborhood model includes both incoming and outgoing adjacency', () => {
    const payload = samplePayload();
    const nodes = graphNodes(payload);
    const edges = graphEdges(payload, nodes);
    const {neighbors, incidentEdges} = graphNeighborhood(nodes, edges);

    assert.deepEqual([...neighbors.get('A')].sort(), ['B', 'C']);
    assert.deepEqual([...neighbors.get('B')].sort(), ['A', 'D']);
    assert.deepEqual([...incidentEdges.get('A')], [0, 1]);
});

test('graph node href normalizes route prefixes and rejects static nodes', () => {
    assert.equal(graphNodeHref({url: '/bravo'}, '/docs/'), '/docs/bravo');
    assert.equal(graphNodeHref({url: 'bravo'}, ''), '/bravo');
    assert.equal(graphNodeHref({url: null}, '/docs'), null);
});

test('vis-network adapter emits pinned center, physics nodes, and arrowed edges', () => {
    const data = visNetworkData(samplePayload(), palette);
    const center = data.nodes.find((node) => node.id === 'A');
    const neighbor = data.nodes.find((node) => node.id === 'B');

    assert.deepEqual(center.fixed, {x: true, y: true});
    assert.equal(neighbor.fixed, false);
    assert.equal(neighbor.physics, true);
    assert.equal(data.edges.length, 3);
    assert.equal(data.edges.every((edge) => edge.arrows.to.enabled), true);
    assert.equal(data.edges.find((edge) => edge.to === 'A').dashes, true);
    assert.equal(data.nodes.find((node) => node.id === 'D').label, 'Delta');
    assert.equal(data.nodes.find((node) => node.id === 'D').hiddenNeighborCount, 2);
});

test('click hit detection accepts both node circles and their labels without selection', () => {
    assert.equal(clickedGraphNodeId({items: [{nodeId: 'B'}], nodes: []}), 'B');
    assert.equal(clickedGraphNodeId({items: [{nodeId: 'C', labelId: 0}], nodes: []}), 'C');
    assert.equal(clickedGraphNodeId({items: [], nodes: ['D']}), 'D');
    assert.equal(clickedGraphNodeId({items: [], nodes: []}), null);
});

test('only non-center nodes with URLs use clickable navigation behavior', () => {
    assert.equal(isNavigableGraphNode({id: 'B', url: 'bravo'}, 'A'), true);
    assert.equal(isNavigableGraphNode({id: 'A', url: 'alpha'}, 'A'), false);
    assert.equal(isNavigableGraphNode({id: 'D', url: ''}, 'A'), false);
});

test('full-depth payload keeps only the center connected component and assigns graph distance', () => {
    const payload = connectedGraphPayload({
        nodes: [
            {sid: 'A', url: 'alpha', title: 'Alpha'},
            {sid: 'B', url: 'bravo', title: 'Bravo'},
            {sid: 'C', url: 'charlie', title: 'Charlie'},
            {sid: 'D', url: 'delta', title: 'Delta'}
        ],
        edges: [
            {source: 'A', target: 'B'},
            {source: 'B', target: 'C'},
            {source: 'D', target: 'D'}
        ]
    }, {sid: 'A', url: 'alpha', title: 'Alpha'});

    assert.deepEqual(payload.nodes.map((node) => [node.sid, node.ring]), [
        ['A', 0],
        ['B', 1],
        ['C', 2]
    ]);
    assert.deepEqual(payload.edges.map((edge) => `${edge.source}->${edge.target}`), ['A->B', 'B->C']);
});

test('full graph expansion never drops nodes or edges from the visible neighborhood', () => {
    const current = {
        center: {sid: 'A', title: 'Alpha', url: 'alpha'},
        nodes: [
            {sid: 'A', title: 'Alpha', url: 'alpha', ring: 0},
            {sid: 'B', title: 'Bravo', url: 'bravo', ring: 1}
        ],
        edges: [{source: 'A', target: 'B'}]
    };

    const payload = connectedGraphPayload({nodes: [], edges: []}, current.center, current);

    assert.deepEqual(payload.nodes.map((node) => node.sid), ['A', 'B']);
    assert.deepEqual(payload.edges.map((edge) => `${edge.source}->${edge.target}`), ['A->B']);
});

test('depth views are reversible and expose predictable node counts', () => {
    const complete = connectedGraphPayload({
        nodes: [
            {sid: 'A', url: 'alpha', title: 'Alpha'},
            {sid: 'B', url: 'bravo', title: 'Bravo'},
            {sid: 'C', url: 'charlie', title: 'Charlie'},
            {sid: 'D', url: 'delta', title: 'Delta'}
        ],
        edges: [
            {source: 'A', target: 'B'},
            {source: 'B', target: 'C'},
            {source: 'C', target: 'D'}
        ]
    }, {sid: 'A', url: 'alpha', title: 'Alpha'});

    assert.equal(graphMaxDepth(complete), 3);
    assert.deepEqual(graphPayloadAtDepth(complete, 1).nodes.map((node) => node.sid), ['A', 'B']);
    assert.deepEqual(graphPayloadAtDepth(complete, 2).nodes.map((node) => node.sid), ['A', 'B', 'C']);
    assert.deepEqual(graphPayloadAtDepth(complete, 3).nodes.map((node) => node.sid), ['A', 'B', 'C', 'D']);
    assert.deepEqual(graphPayloadAtDepth(complete, 1).nodes.map((node) => node.sid), ['A', 'B']);
    const branch = graphPayloadAtDepth(complete, 1, ['B']);
    assert.deepEqual(branch.nodes.map((node) => node.sid), ['A', 'B', 'C']);
    assert.equal(branch.nodes.find((node) => node.sid === 'B').locallyExpanded, true);
    assert.equal(branch.nodes.find((node) => node.sid === 'C').locallyExpanded, false);
    assert.deepEqual(graphPayloadAtDepth(complete, 1, ['B', 'C']).nodes.map((node) => node.sid), ['A', 'B', 'C', 'D']);
    assert.equal(synchronizedGraphDepth(complete, branch, 1), 2);
    assert.equal(synchronizedGraphDepth(complete, graphPayloadAtDepth(complete, 1, ['B', 'C']), 1), 3);
});

test('vis-network adapter preserves the supported 71-node payload bound', () => {
    const nodes = Array.from({length: 71}, (_, index) => ({
        sid: `node-${index}`,
        url: `node-${index}`,
        title: `Node ${index} with a deliberately long comparison label`,
        type: 'fixture',
        ring: index === 0 ? 0 : index <= 20 ? 1 : 2,
        neighborCount: index === 0 ? 20 : 2
    }));
    const payload = {
        center: nodes[0],
        nodes,
        edges: nodes.slice(1).map((node, index) => ({
            source: index < 20 ? nodes[0].sid : nodes[1 + (index % 20)].sid,
            target: node.sid
        }))
    };

    const vis = visNetworkData(payload, palette);
    assert.equal(vis.nodes.length, 71);
    assert.equal(vis.edges.length, 70);
});

test('entrypoint exposes a deferred vis-network renderer loader', () => {
    assert.equal(typeof loadVisRenderer, 'function');
});
