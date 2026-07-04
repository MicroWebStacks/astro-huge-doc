const STATE_KEY = '__mwsMermaidRendererState';
const DIAGRAM_SELECTOR = '.mermaid-diagram[data-uid]';

const state = window[STATE_KEY] ?? (window[STATE_KEY] = {
  mermaidPromise: null,
  bound: false,
  renderEpoch: 0,
  renderCount: 0,
});

function getContainers() {
  return Array.from(document.querySelectorAll(DIAGRAM_SELECTOR));
}

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

function showError(container, error) {
  const mount = container.querySelector('[data-mermaid-output]');
  const errorBox = container.querySelector('[data-mermaid-error]');
  if (mount) {
    mount.innerHTML = '';
  }
  if (errorBox) {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown Mermaid render error');
    errorBox.textContent = `Mermaid render failed: ${message}`;
    errorBox.classList.remove('hidden');
    errorBox.classList.add('visible');
  }
}

function clearError(container) {
  const errorBox = container.querySelector('[data-mermaid-error]');
  if (!errorBox) {
    return;
  }
  errorBox.textContent = '';
  errorBox.classList.remove('visible');
  errorBox.classList.add('hidden');
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

async function renderContainer(container, epoch) {
  const mount = container.querySelector('[data-mermaid-output]');
  if (!mount) {
    return;
  }

  clearError(container);
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

  if (epoch !== state.renderEpoch) {
    return;
  }

  mount.innerHTML = svg;
  bindFunctions?.(mount);
}

async function renderAll() {
  const containers = getContainers();
  if (!containers.length) {
    return;
  }

  const epoch = ++state.renderEpoch;
  await Promise.all(
    containers.map((container) =>
      renderContainer(container, epoch).catch((error) => {
        if (epoch === state.renderEpoch) {
          showError(container, error);
        }
      }),
    ),
  );
}

function initMermaidRender() {
  void renderAll();

  if (state.bound) {
    return;
  }

  state.bound = true;
  document.addEventListener('mws:theme-change', () => {
    void renderAll();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMermaidRender, {once: true});
} else {
  initMermaidRender();
}
