import test from 'node:test';
import assert from 'node:assert/strict';
import {computeGraphUniverse, computeNeighbors, MAX_RING1, MAX_RING2} from '../src/libs/graph.js';

/* Fake structure-db backend: computeNeighbors only ever calls getDocument /
   getOutgoing / getBacklinks, so a tiny in-memory graph exercises the same
   ring/edge/cap logic the real sqlite, JSON, and lite backends drive in
   production, without collecting a real dataset. */
function makeBackend(docs, edges) {
    const docBySid = new Map(docs.map((doc) => [doc.sid, doc]));
    const outgoingBySource = new Map();
    const incomingByTarget = new Map();
    for (const edge of edges) {
        if (!outgoingBySource.has(edge.source)) outgoingBySource.set(edge.source, []);
        outgoingBySource.get(edge.source).push(edge);
        if (!incomingByTarget.has(edge.target)) incomingByTarget.set(edge.target, []);
        incomingByTarget.get(edge.target).push(edge);
    }
    return {
        getDocumentsFull: () => docs,
        getDocument: ({sid}) => docBySid.get(sid) ?? null,
        getOutgoing: (sid) => (outgoingBySource.get(sid) ?? []).map((edge) => ({
            target_sid: edge.target,
            status: edge.status ?? 'resolved',
            link_text: edge.link_text ?? null,
            source_heading: edge.source_heading ?? null,
            fragment: edge.fragment ?? null
        })),
        getBacklinks: (sid) => (incomingByTarget.get(sid) ?? [])
            .filter((edge) => (edge.status ?? 'resolved') === 'resolved')
            .map((edge) => ({
                source_sid: edge.source,
                status: 'resolved',
                link_text: edge.link_text ?? null,
                source_heading: edge.source_heading ?? null,
                fragment: edge.fragment ?? null
            }))
    };
}

test('computeGraphUniverse emits every document and resolved relation once', () => {
    const docs = [
        {sid: 'A', url: 'a', title: 'Alpha', type: 'concept'},
        {sid: 'B', url: 'b', title: 'Bravo', type: 'concept'},
        {sid: 'C', url: 'c', title: 'Charlie', type: 'concept'}
    ];
    const backend = makeBackend(docs, [
        {source: 'A', target: 'B'},
        {source: 'B', target: 'C'},
        {source: 'A', target: 'C', status: 'unresolved'}
    ]);

    const graph = computeGraphUniverse(backend);

    assert.deepEqual(graph.nodes.map((node) => node.sid), ['A', 'B', 'C']);
    assert.deepEqual(graph.edges.map((edge) => `${edge.source}->${edge.target}`).sort(), ['A->B', 'B->C']);
    assert.deepEqual(graph.nodes.map((node) => node.neighborCount), [1, 2, 1]);
});

test('computeGraphUniverse falls back to lite file-tree documents when full documents are empty', () => {
    const docs = [
        {sid: 'A', url: 'a', title: 'Alpha', type: 'concept'},
        {sid: 'B', url: 'b', title: 'Bravo', type: 'concept'}
    ];
    const backend = makeBackend(docs, [{source: 'A', target: 'B'}]);
    backend.getDocumentsFull = () => [];
    backend.getDocuments = () => docs.map(({url, title}) => ({url, title}));
    backend.getDocument = ({sid, url}) => (
        docs.find((doc) => doc.sid === sid || doc.url === url) ?? null
    );

    const graph = computeGraphUniverse(backend);

    assert.deepEqual(graph.nodes.map((node) => node.sid), ['A', 'B']);
    assert.deepEqual(graph.edges.map((edge) => `${edge.source}->${edge.target}`), ['A->B']);
});

test('computeNeighbors returns null for an unknown center', () => {
    const backend = makeBackend([], []);
    assert.equal(computeNeighbors('missing', backend), null);
});

test('computeNeighbors builds ring 1 from outgoing and backlinks, ring 2 from ring-1 neighbors, and dedupes cross edges', () => {
    const docs = [
        {sid: 'A', url: 'a', title: 'Alpha', type: 'concept'},
        {sid: 'B', url: 'b', title: 'Bravo', type: 'concept'},
        {sid: 'C', url: 'c', title: 'Charlie', type: 'concept'},
        {sid: 'D', url: 'd', title: 'Delta', type: 'concept'},
        {sid: 'E', url: 'e', title: 'Echo', type: 'concept'}
    ];
    const edges = [
        {source: 'A', target: 'B', link_text: 'see Bravo', source_heading: 'intro'}, // A's outgoing -> B in ring 1
        {source: 'C', target: 'A', link_text: 'back to Alpha'},                      // A's backlink -> C in ring 1
        {source: 'B', target: 'C'},                                                  // ring1-ring1 cross edge
        {source: 'B', target: 'D'},                                                  // ring 2 via B
        {source: 'C', target: 'E'},                                                  // ring 2 via C
        {source: 'A', target: 'D', status: 'unresolved'}                             // must be ignored (not resolved)
    ];
    const backend = makeBackend(docs, edges);

    const graph = computeNeighbors('A', backend);

    assert.deepEqual(graph.center, {sid: 'A', url: 'a', title: 'Alpha', type: 'concept'});

    const bySid = new Map(graph.nodes.map((node) => [node.sid, node]));
    assert.equal(bySid.get('A').ring, 0);
    assert.equal(bySid.get('B').ring, 1);
    assert.equal(bySid.get('C').ring, 1);
    assert.equal(bySid.get('D').ring, 2);
    assert.equal(bySid.get('E').ring, 2);
    assert.equal(graph.nodes.length, 5);

    // ring 1 sorted by type then title: both "concept", so Bravo before Charlie
    const ring1Titles = graph.nodes.filter((node) => node.ring === 1).map((node) => node.title);
    assert.deepEqual(ring1Titles, ['Bravo', 'Charlie']);

    const edgeKeys = graph.edges.map((edge) => `${edge.source}->${edge.target}`).sort();
    assert.deepEqual(edgeKeys, ['A->B', 'B->C', 'B->D', 'C->A', 'C->E']);
    assert.equal(edgeKeys.includes('A->D'), false, 'unresolved edges are excluded');

    const aToB = graph.edges.find((edge) => edge.source === 'A' && edge.target === 'B');
    assert.equal(aToB.link_text, 'see Bravo');
    assert.equal(aToB.source_heading, 'intro');

    // neighborCount reflects each node's own distinct resolved-neighbor count
    // (outgoing targets + backlink sources), independent of ring membership.
    assert.equal(bySid.get('A').neighborCount, 2); // B (outgoing), C (backlink)
    assert.equal(bySid.get('B').neighborCount, 3); // C, D (outgoing), A (backlink)
    assert.equal(bySid.get('C').neighborCount, 3); // A, E (outgoing), B (backlink)
    assert.equal(bySid.get('D').neighborCount, 1); // B (backlink only)
    assert.equal(bySid.get('E').neighborCount, 1); // C (backlink only)
});

test('computeNeighbors caps ring 1 and ring 2 deterministically by type then title', () => {
    const docs = [{sid: 'center', url: 'center', title: 'Center', type: 'root'}];
    const edges = [];
    for (let i = 0; i < MAX_RING1 + 5; i += 1) {
        const sid = `r1-${String(i).padStart(2, '0')}`;
        docs.push({sid, url: sid, title: `Ring1 ${String(i).padStart(2, '0')}`, type: 'concept'});
        edges.push({source: 'center', target: sid});
    }
    const backend = makeBackend(docs, edges);

    const graph = computeNeighbors('center', backend);
    const ring1 = graph.nodes.filter((node) => node.ring === 1);
    assert.equal(ring1.length, MAX_RING1);
    // Deterministic truncation: the lexicographically first MAX_RING1 titles survive.
    assert.equal(ring1[0].title, 'Ring1 00');
    assert.equal(ring1.at(-1).title, `Ring1 ${String(MAX_RING1 - 1).padStart(2, '0')}`);
    assert.ok(MAX_RING2 > 0);
});
