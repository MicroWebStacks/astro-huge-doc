import vizUrl from '@plantuml/core/viz-global.js?url';
import {injectPlantumlTheme} from '../../../libs/plantuml-theme.js';
import {registerDiagramRenderer} from './diagram-client-runtime.js';

const STATE_KEY = '__mwsPlantumlRendererState';
const state = window[STATE_KEY] ?? (window[STATE_KEY] = {
  vizPromise: null,
  enginePromise: null,
  renderQueue: Promise.resolve(),
  generations: new WeakMap(),
  svgCache: new Map(),
});

const currentTheme = () => document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';

function loadViz() {
  if (globalThis.Viz) return Promise.resolve();
  if (!state.vizPromise) {
    state.vizPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = vizUrl;
      script.async = true;
      script.dataset.plantumlViz = 'true';
      script.addEventListener('load', resolve, {once: true});
      script.addEventListener('error', () => reject(new Error('Failed to load PlantUML Graphviz runtime')), {once: true});
      document.head.appendChild(script);
    });
  }
  return state.vizPromise;
}

function loadEngine() {
  state.enginePromise ??= Promise.all([loadViz(), import('@plantuml/core')]).then(([, engine]) => engine);
  return state.enginePromise;
}

function enqueueRender(task) {
  const result = state.renderQueue.then(task, task);
  state.renderQueue = result.catch(() => {});
  return result;
}

function renderToSvg(engine, source, options) {
  return new Promise((resolve, reject) => engine.renderToString(
    source.split(/\r\n|\r|\n/),
    resolve,
    (error) => reject(new Error(String(error ?? 'Unknown PlantUML render error'))),
    options,
  ));
}

function readSource(container) {
  const payload = container.querySelector('script[data-plantuml-source][type="application/json"]');
  try {
    return JSON.parse(payload?.textContent ?? '""');
  } catch (error) {
    throw new Error(`Invalid PlantUML source payload: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/* Mirror mermaid's responsive contract: the svg stretches to the panel width
 * (width="100%") but an inline max-width pins it to its natural pixel size,
 * so narrow/tall diagrams are never upscaled past 100%. The natural width is
 * also published on the shell as --diagram-natural-width so the shell can
 * grow past the prose measure for wide diagrams (width-contract packet). */
function fitSvgToWidth(mount) {
  const svg = mount.querySelector('svg');
  if (!svg) return;
  const width = Number.parseFloat(svg.getAttribute('width') ?? '');
  const height = Number.parseFloat(svg.getAttribute('height') ?? '');
  if (!svg.hasAttribute('viewBox')) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }
  if (svg.getAttribute('preserveAspectRatio') === 'none') svg.removeAttribute('preserveAspectRatio');
  svg.style.removeProperty('width');
  svg.style.removeProperty('height');
  if (Number.isFinite(width) && width > 0) {
    svg.style.maxWidth = `${width}px`;
    mount.closest('.diagram-shell')?.style.setProperty('--diagram-natural-width', `${width}px`);
  }
  svg.setAttribute('width', '100%');
  svg.removeAttribute('height');
}

async function renderPlantuml(container) {
  const mount = container.querySelector('[data-plantuml-output]');
  if (!mount) return;
  const generation = (state.generations.get(container) ?? 0) + 1;
  state.generations.set(container, generation);
  const theme = currentTheme();
  const source = injectPlantumlTheme(readSource(container), theme);
  const cacheKey = `${theme}\0${source}`;
  let svg = state.svgCache.get(cacheKey);
  if (!svg) {
    const engine = await loadEngine();
    svg = await enqueueRender(() => renderToSvg(engine, source, {dark: theme === 'dark'}));
    state.svgCache.set(cacheKey, svg);
  }
  if (state.generations.get(container) === generation) {
    mount.innerHTML = svg;
    fitSvgToWidth(mount);
  }
}

registerDiagramRenderer('plantuml', renderPlantuml);
