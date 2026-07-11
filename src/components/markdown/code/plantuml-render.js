import vizUrl from '@plantuml/core/viz-global.js?url';
import {injectPlantumlTheme} from '../../../libs/plantuml-theme.js';

const STATE_KEY = '__mwsPlantumlRendererState';
const DIAGRAM_SELECTOR = '.client-diagram[data-language="plantuml"][data-uid]';
const state = window[STATE_KEY] ?? (window[STATE_KEY] = {
  vizPromise: null,
  enginePromise: null,
  renderQueue: Promise.resolve(),
  generations: new WeakMap(),
  svgCache: new Map(),
  bound: false,
});

const getContainers = () => Array.from(document.querySelectorAll(DIAGRAM_SELECTOR));
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

function showError(container, error) {
  const mount = container.querySelector('[data-plantuml-output]');
  const errorBox = container.querySelector('[data-plantuml-error]');
  if (mount) mount.innerHTML = '';
  if (errorBox) {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown PlantUML render error');
    errorBox.textContent = `PlantUML rendering failed\n${message}`;
    errorBox.classList.remove('hidden');
    errorBox.classList.add('visible');
  }
}

function clearError(container) {
  const errorBox = container.querySelector('[data-plantuml-error]');
  if (!errorBox) return;
  errorBox.textContent = '';
  errorBox.classList.remove('visible');
  errorBox.classList.add('hidden');
}

async function renderContainer(container) {
  const mount = container.querySelector('[data-plantuml-output]');
  if (!mount) return;
  const generation = (state.generations.get(container) ?? 0) + 1;
  state.generations.set(container, generation);
  clearError(container);
  const theme = currentTheme();
  const source = injectPlantumlTheme(readSource(container), theme);
  const cacheKey = `${theme}\0${source}`;
  let svg = state.svgCache.get(cacheKey);
  if (!svg) {
    const engine = await loadEngine();
    svg = await enqueueRender(() => renderToSvg(engine, source, {dark: theme === 'dark'}));
    state.svgCache.set(cacheKey, svg);
  }
  if (state.generations.get(container) === generation) mount.innerHTML = svg;
}

async function renderAll() {
  for (const container of getContainers()) {
    try {
      await renderContainer(container);
    } catch (error) {
      showError(container, error);
    }
  }
}

function initPlantumlRender() {
  void renderAll();
  if (state.bound) return;
  state.bound = true;
  document.addEventListener('mws:theme-change', () => void renderAll());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPlantumlRender, {once: true});
} else {
  initPlantumlRender();
}
