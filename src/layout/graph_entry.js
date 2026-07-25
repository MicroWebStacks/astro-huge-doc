import {buildGraphSvg} from './graph_view.js';

/* Wires the RelationsFooter "Graph" affordance (OKF plan TP-13/DD-11): fetch
   the neighborhood payload once, build the SVG, then dispatch the same
   'open' CustomEvent the diagram toolbar uses so the existing panzoom modal
   (panzoom_common.js, already wired at DOMContentLoaded) takes over. */
/* Node navigation must not depend on native SVG <a> activation: the modal
   clone lives in a shadow root behind panzoom's mouse/touch handling, and
   native activation through that stack is environment-dependent (panzoom
   preventDefaults touch, and some hosts don't navigate shadow-DOM SVG links
   at all). Pointer events stay composed across the shadow boundary, so a
   delegated pointerdown/pointerup pair on the modal navigates explicitly —
   guarded by a small movement threshold so panning never counts as a click,
   and restricted to unmodified primary-button presses so ctrl/middle-click
   keep their native meaning where available. */
const CLICK_MOVE_TOLERANCE_PX = 5;

function graphAnchorFromEvent(event, modal) {
    for (const element of event.composedPath()) {
        if (element === modal) {
            break;
        }
        if (element instanceof Element && element.matches?.('a.graph-node')) {
            return element;
        }
    }
    return null;
}

function wireNodeNavigation(modal) {
    let pressed = null;
    modal.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
            pressed = null;
            return;
        }
        const anchor = graphAnchorFromEvent(event, modal);
        pressed = anchor ? {anchor, x: event.clientX, y: event.clientY} : null;
    });
    modal.addEventListener('pointerup', (event) => {
        const press = pressed;
        pressed = null;
        if (!press) {
            return;
        }
        if (graphAnchorFromEvent(event, modal) !== press.anchor) {
            return;
        }
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_MOVE_TOLERANCE_PX) {
            return;
        }
        const href = press.anchor.getAttribute('href');
        if (href) {
            window.location.assign(href);
        }
    });
    // The pointerup handler above owns plain-click navigation, so suppress
    // the native <a> activation that follows: without this, a pan that
    // started on a node still fires a native click on release (the svg pans
    // with the cursor, so press and release hit the same node) and navigates
    // away mid-exploration. Modified clicks keep their native behavior.
    modal.addEventListener('click', (event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
            return;
        }
        if (graphAnchorFromEvent(event, modal)) {
            event.preventDefault();
        }
    });
}

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

    wireNodeNavigation(modal);

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
