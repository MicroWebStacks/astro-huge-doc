/*
 * Shared collapsible-band behaviour (homesmartmesh-parity WP-22 / R-10).
 *
 * One arrow control plus one persistence rule, so the three chrome surfaces
 * that collapse — the breadcrumb/metadata band, the relations footer, and the
 * link-index status bar — cannot drift into three slightly different
 * affordances. Bands are collapsed by default (R-10); only a band the user
 * opened is remembered, so the stored set stays empty for the common case.
 *
 * Markup contract: a root carrying data-collapsible-key, containing a
 * [data-collapsible-toggle] button and a [data-collapsible-content] element.
 * The root's data-collapsed attribute is the styling hook.
 */
/* One set of sticky booleans for every collapsible chrome surface. A key is
 * present when its flag is set and absent otherwise, so the default state
 * costs no storage and an unknown key reads as false. */
const STORAGE_KEY = 'chrome-band-flags';

function readFlags() {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
        return new Set(Array.isArray(stored) ? stored.filter(key => typeof key === 'string') : []);
    } catch {
        // Private mode, disabled storage, or corrupt value: behave as default.
        return new Set();
    }
}

/* Read/write one sticky flag. Exported so surfaces with their own visibility
 * rules — the index status bar, which is open by default and auto-hides when a
 * run finishes — reuse the persistence without inheriting the toggle markup.
 * They choose their own key and their own polarity. */
function readFlag(key) {
    return readFlags().has(key);
}

function writeFlag(key, value) {
    const flags = readFlags();
    if (value) flags.add(key);
    else flags.delete(key);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...flags]));
    } catch {
        // Persistence is a convenience; losing it must never break the toggle.
    }
}

// Bands are collapsed by default, so the flag they store is "the user opened
// this" and the stored set stays empty for the common case.
const isOpen = key => readFlag(key);
const setOpen = (key, open) => writeFlag(key, open);

function applyState(root, open) {
    const toggle = root.querySelector('[data-collapsible-toggle]');
    const content = root.querySelector('[data-collapsible-content]');
    root.dataset.collapsed = open ? 'false' : 'true';
    if (content) content.hidden = !open;
    if (toggle) {
        const label = root.dataset.collapsibleLabel ?? 'details';
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.setAttribute('aria-label', `${open ? 'Hide' : 'Show'} ${label}`);
        toggle.setAttribute('title', `${open ? 'Hide' : 'Show'} ${label}`);
    }
}

function bindCollapsible(root) {
    const key = root.dataset.collapsibleKey;
    if (!key || root.dataset.collapsibleBound === 'true') return;
    root.dataset.collapsibleBound = 'true';
    applyState(root, isOpen(key));
    root.querySelector('[data-collapsible-toggle]')?.addEventListener('click', () => {
        const open = root.dataset.collapsed !== 'false';
        setOpen(key, open);
        applyState(root, open);
    });
}

function bindAll(scope = document) {
    for (const root of scope.querySelectorAll('[data-collapsible-key]')) {
        bindCollapsible(root);
    }
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => bindAll(), {once: true});
    } else {
        bindAll();
    }
}

export {bindAll, bindCollapsible, isOpen, setOpen, readFlag, writeFlag};
