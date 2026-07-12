/* Single dispatcher for all client-rendered diagrams (mermaid, plantuml, ...).
 *
 * Container discovery reads the SSR-emitted data-language attribute as the
 * only source of truth, so a renderer file can never drift out of sync with
 * the markup by hardcoding its own selector. A language with no registered
 * renderer surfaces a visible error instead of silently staying blank. */

const STATE_KEY = '__mwsDiagramRuntimeState';
const CONTAINER_SELECTOR = '.client-diagram[data-language][data-uid]';

const state = window[STATE_KEY] ?? (window[STATE_KEY] = {
  renderers: new Map(),
  bound: false,
  renderEpoch: 0,
});

function getContainers() {
  return Array.from(document.querySelectorAll(CONTAINER_SELECTOR));
}

function showError(container, message) {
  const mount = container.querySelector('.client-diagram-output');
  const errorBox = container.querySelector('.client-diagram-error');
  if (mount) {
    mount.innerHTML = '';
  }
  if (errorBox) {
    errorBox.textContent = message;
    errorBox.classList.remove('hidden');
    errorBox.classList.add('visible');
  }
}

function clearError(container) {
  const errorBox = container.querySelector('.client-diagram-error');
  if (!errorBox) {
    return;
  }
  errorBox.textContent = '';
  errorBox.classList.remove('visible');
  errorBox.classList.add('hidden');
}

async function renderContainer(container, epoch) {
  const language = container.getAttribute('data-language');
  const renderFn = state.renderers.get(language);
  clearError(container);

  if (!renderFn) {
    showError(container, `No client renderer is registered for diagram language "${language}". This is a configuration bug — please report it.`);
    return;
  }

  try {
    await renderFn(container, {isCurrent: () => epoch === state.renderEpoch});
  } catch (error) {
    if (epoch !== state.renderEpoch) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown diagram render error');
    showError(container, `${language} render failed: ${message}`);
  }
}

async function renderAll() {
  const containers = getContainers();
  if (!containers.length) {
    return;
  }
  const epoch = ++state.renderEpoch;
  await Promise.all(containers.map((container) => renderContainer(container, epoch)));
}

function initDiagramDispatch() {
  void renderAll();

  if (state.bound) {
    return;
  }
  state.bound = true;
  document.addEventListener('mws:theme-change', () => {
    void renderAll();
  });
}

function registerDiagramRenderer(language, renderFn) {
  state.renderers.set(language, renderFn);
}

// readyState is already 'interactive' (not 'loading') while sibling module
// scripts are still executing their own top-level registerDiagramRenderer()
// calls, so 'complete' is the only state that safely means "everything that
// was going to register already has" — 'loading'/'interactive' must wait for
// DOMContentLoaded, which only fires once every deferred module script here
// (this one included) has finished running.
if (document.readyState === 'complete') {
  initDiagramDispatch();
} else {
  document.addEventListener('DOMContentLoaded', initDiagramDispatch, {once: true});
}

export {registerDiagramRenderer};
