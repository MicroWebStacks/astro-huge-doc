import {registerDiagramRenderer} from './diagram-client-runtime.js';

const STATE_KEY = '__mwsMermaidRendererState';

const state = window[STATE_KEY] ?? (window[STATE_KEY] = {
  mermaidPromise: null,
  renderCount: 0,
});

function currentMermaidTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'default' : 'dark';
}

function loadMermaid() {
  if (!state.mermaidPromise) {
    state.mermaidPromise = import('mermaid').then((mod) => mod.default ?? mod);
  }
  return state.mermaidPromise;
}

function sanitizeId(value) {
  return String(value ?? 'diagram').replace(/[^A-Za-z0-9_-]/g, '-');
}

function readSource(container) {
  const sourceScript = container.querySelector('script[data-mermaid-source][type="application/json"]');
  if (sourceScript) {
    try {
      return JSON.parse(sourceScript.textContent ?? '""');
    } catch (error) {
      throw new Error(`Invalid Mermaid source payload: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const sourceTemplate = container.querySelector('template[data-mermaid-source]');
  return sourceTemplate?.textContent ?? '';
}

async function renderMermaid(container, {isCurrent}) {
  const mount = container.querySelector('[data-mermaid-output]');
  if (!mount) {
    return;
  }
  mount.innerHTML = '';

  const source = readSource(container);
  const mermaid = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: currentMermaidTheme(),
  });

  const renderId = `mermaid-${sanitizeId(container.getAttribute('data-uid'))}-${++state.renderCount}`;
  const {svg, bindFunctions} = await mermaid.render(renderId, source);

  if (!isCurrent()) {
    return;
  }

  mount.innerHTML = svg;
  bindFunctions?.(mount);
  publishNaturalWidth(container, mount);
}

/* Mermaid caps its svg at the diagram's natural size via an inline
 * max-width. Re-publish that width on the shell as --diagram-natural-width
 * so the shell can grow past the prose measure for wide diagrams
 * (width-contract packet). Falls back to the viewBox width when a diagram
 * type renders without the inline cap. */
function publishNaturalWidth(container, mount) {
  const svg = mount.querySelector('svg');
  if (!svg) return;
  let width = Number.parseFloat(svg.style.maxWidth);
  if (!Number.isFinite(width) || width <= 0) width = svg.viewBox?.baseVal?.width ?? NaN;
  if (!Number.isFinite(width) || width <= 0) return;
  container.closest('.diagram-shell')?.style.setProperty('--diagram-natural-width', `${width}px`);
}

registerDiagramRenderer('mermaid', renderMermaid);
