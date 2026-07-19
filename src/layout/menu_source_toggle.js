function sourceStorageKey(nav) {
    return `${nav.dataset.stateKey || 'microwebstacks:pages_menu'}:source`;
}

function availableSource(nav, requested) {
    if (nav.querySelector(`[data-menu-tree="${requested}"]`)) return requested;
    return nav.querySelector('[data-menu-tree="contents"]') ? 'contents' : 'files';
}

function applySource(nav, requested, persist = false) {
    const source = availableSource(nav, requested);
    nav.dataset.menuSource = source;
    nav.querySelectorAll('[data-menu-tree]').forEach((tree) => {
        tree.hidden = tree.dataset.menuTree !== source;
    });
    nav.querySelectorAll('[data-menu-source]').forEach((button) => {
        button.setAttribute('aria-pressed', button.dataset.menuSource === source ? 'true' : 'false');
    });
    const tree = nav.querySelector(`[data-menu-tree="${source}"]`);
    if (tree?.dataset.maxDepth) nav.dataset.maxLevel = tree.dataset.maxDepth;
    if (persist) {
        try { localStorage.setItem(sourceStorageKey(nav), source); } catch { /* restricted storage */ }
    }
}

function initializeMenuSource(nav) {
    let saved = null;
    try { saved = localStorage.getItem(sourceStorageKey(nav)); } catch { /* restricted storage */ }
    applySource(nav, saved || (nav.querySelector('[data-menu-tree="contents"]') ? 'contents' : 'files'));
    nav.addEventListener('microwebstacks:navigation-ready', () => {
        let current = null;
        try { current = localStorage.getItem(sourceStorageKey(nav)); } catch { /* restricted storage */ }
        applySource(nav, current || 'contents');
    });
}

document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-menu-source]');
    const nav = button?.closest('nav.pages_menu');
    if (!button || !nav) return;
    const source = button.dataset.menuSource;
    document.querySelectorAll(`nav.pages_menu[data-state-key="${CSS.escape(nav.dataset.stateKey || '')}"]`)
        .forEach((candidate) => applySource(candidate, source, true));
});

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('nav.pages_menu').forEach(initializeMenuSource);
}, false);
