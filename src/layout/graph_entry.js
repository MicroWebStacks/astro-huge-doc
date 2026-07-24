import {buildGraphSvg} from './graph_view.js';

/* Wires the RelationsFooter "Graph" affordance (OKF plan TP-13/DD-11): fetch
   the neighborhood payload once, build the SVG, then dispatch the same
   'open' CustomEvent the diagram toolbar uses so the existing panzoom modal
   (panzoom_common.js, already wired at DOMContentLoaded) takes over. */
function activateGraphEntry({root = document.querySelector('[data-graph-root]')} = {}) {
    if (!root) {
        return;
    }
    const sid = root.getAttribute('data-graph-sid');
    const prefix = root.getAttribute('data-graph-prefix') ?? '';
    const trigger = root.querySelector('[data-action="open-graph"]');
    const target = root.querySelector('.graph-render-target');
    const modal = root.querySelector('.modal-background');
    if (!sid || !trigger || !target || !modal) {
        return;
    }

    let loaded = false;
    let loading = false;

    trigger.addEventListener('click', async () => {
        if (loading) {
            return;
        }
        if (!loaded) {
            loading = true;
            trigger.setAttribute('aria-busy', 'true');
            try {
                const response = await fetch(`${prefix}/graph/${encodeURIComponent(sid)}.json`);
                if (!response.ok) {
                    throw new Error(`graph fetch failed with status ${response.status}`);
                }
                const payload = await response.json();
                target.innerHTML = buildGraphSvg(payload, {prefix});
                loaded = true;
            } catch (error) {
                console.warn('microwebstacks: neighborhood graph failed to load', error);
                loading = false;
                trigger.removeAttribute('aria-busy');
                return;
            }
            loading = false;
            trigger.removeAttribute('aria-busy');
        }
        modal.dispatchEvent(new CustomEvent('open'));
    });
}

activateGraphEntry();

export {activateGraphEntry};
