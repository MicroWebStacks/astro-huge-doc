import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGraphSvg} from '../src/layout/graph_view.js';

function samplePayload() {
    return {
        center: {sid: 'A', url: 'a', title: 'Alpha & <Root>', type: 'concept'},
        nodes: [
            {sid: 'A', url: 'a', title: 'Alpha & <Root>', type: 'concept', ring: 0, neighborCount: 1},
            {sid: 'B', url: 'b', title: 'Bravo', type: 'concept', ring: 1, neighborCount: 2},
            {sid: 'D', url: null, title: 'Untitled Delta', type: null, ring: 2, neighborCount: 3}
        ],
        edges: [
            {source: 'A', target: 'B', link_text: 'see "Bravo"', source_heading: 'intro', fragment: null},
            {source: 'B', target: 'D', link_text: null, source_heading: null, fragment: null}
        ]
    };
}

test('buildGraphSvg emits a self-contained SVG with an embedded style block', () => {
    const svg = buildGraphSvg(samplePayload(), {prefix: '/base'});
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[^"]+" class="graph-svg">/);
    assert.match(svg, /<style>[\s\S]*\.graph-node-circle[\s\S]*<\/style>/);
    assert.match(svg, /<marker id="graph-arrow"/);
    assert.ok(svg.trim().endsWith('</svg>'));
});

test('buildGraphSvg links nodes that have a url and leaves url-less nodes unlinked', () => {
    const svg = buildGraphSvg(samplePayload(), {prefix: '/base'});
    assert.match(svg, /<a class="graph-node" href="\/base\/b">/);
    // The center node is never a navigable link (it is the page already open).
    assert.match(svg, /<g class="graph-node graph-node-center graph-node-static">/);
    // D has no url, so it renders as a static group too, not an <a>.
    assert.doesNotMatch(svg, /href="\/base\/undefined"/);
    assert.doesNotMatch(svg, /href="\/base\/null"/);
});

test('buildGraphSvg escapes untrusted text in titles, types, and edge tooltips', () => {
    const svg = buildGraphSvg(samplePayload(), {prefix: ''});
    assert.doesNotMatch(svg, /Alpha & <Root>/);
    assert.match(svg, /Alpha &amp; &lt;Root&gt;/);
    assert.match(svg, /<title>under &quot;intro&quot; &quot;see &quot;Bravo&quot;&quot;<\/title>/);
});

test('buildGraphSvg places center at the origin and ring-1/ring-2 nodes on concentric circles', () => {
    const svg = buildGraphSvg(samplePayload(), {prefix: ''});
    assert.match(svg, /cx="0" cy="0" r="22"/); // center circle
    // ring 1/ring 2 nodes use the smaller node radius (14), distinct from the center's 22.
    assert.equal((svg.match(/r="14"/g) ?? []).length, 2);
});
