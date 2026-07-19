import './lazy_navigation.css';

const arrowSvg = '<svg viewBox="0 0 100 100" width="60" height="60" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M 20,10 L 70,50 L 20,90" stroke-width="20px" stroke="var(--menu-arrow-color)" stroke-linecap="round" stroke-linejoin="round"></path></svg>';

function maxDepth(items, level = 1) {
    let max = level;
    for (const item of items ?? []) {
        if (item.items?.length) {
            max = Math.max(max, maxDepth(item.items, level + 1));
        }
    }
    return max;
}

function hasActive(item) {
    return Boolean(item.active || item.items?.some(hasActive));
}

function renderList(items, level = 1, forceVisible = false) {
    const list = document.createElement('ul');
    list.className = level === 1 ? 'root lazy-menu-tree' : 'nested';
    list.dataset.level = String(level);
    if (level > 1 && !forceVisible) {
        list.classList.add('hidden');
    }

    for (const item of items ?? []) {
        const li = document.createElement('li');
        const entry = document.createElement('div');
        const activeBranch = hasActive(item);
        entry.classList.add('entry_container');
        entry.dataset.nodeKey = item.nodeKey ?? item.link ?? item.label ?? '';
        entry.classList.toggle('active', Boolean(item.active));
        entry.classList.toggle('parent', Boolean(item.items?.length));
        entry.classList.toggle('synthesized', Boolean(item.synthesized));
        entry.classList.toggle('expanded', Boolean(item.items?.length && activeBranch));
        if (item.synthesized) {
            entry.title = 'Added from the file tree; not explicitly linked in index.md';
        }

        if (item.items?.length) {
            const icon = document.createElement('span');
            icon.className = 'icon expand';
            icon.setAttribute('aria-label', `Toggle ${item.label ?? 'section'}`);
            icon.innerHTML = arrowSvg;
            entry.append(icon);
        }

        const text = document.createElement('span');
        text.className = `text${item.items?.length ? ' parent' : ''}${item.link ? ' href_hover' : ''}`;
        text.textContent = item.label ?? '';
        if (item.link) {
            const link = document.createElement('a');
            link.href = item.link;
            link.append(text);
            entry.append(link);
        } else {
            entry.append(text);
        }
        li.append(entry);
        if (item.items?.length) {
            li.append(renderList(item.items, level + 1, activeBranch));
        }
        list.append(li);
    }
    return list;
}

function depthControls() {
    const controls = document.createElement('div');
    controls.className = 'depth-controls';
    controls.dataset.category = 'pages_menu';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Tree depth');
    controls.innerHTML = [
        '<button type="button" class="depth-btn" data-action="min" title="Show top level" aria-label="Show top level">1</button>',
        '<button type="button" class="depth-btn" data-action="down" title="Show one less level" aria-label="Show one less level">&minus;</button>',
        '<button type="button" class="depth-btn auto manual" data-action="auto" data-mode="manual" title="Manual - click for auto fit height" aria-label="Manual - click for auto fit height"><span data-mode-label>Manual</span><span class="mode-level" aria-hidden="false" data-depth-label>1</span></button>',
        '<button type="button" class="depth-btn" data-action="up" title="Show one more level" aria-label="Show one more level">+</button>',
        '<button type="button" class="depth-btn all" data-action="max" title="Show all levels" aria-label="Show all levels">All</button>'
    ].join('');
    return controls;
}

function menuSourceToggle() {
    const toggle = document.createElement('div');
    toggle.className = 'menu-source-toggle';
    toggle.setAttribute('role', 'group');
    toggle.setAttribute('aria-label', 'Navigation source');
    toggle.innerHTML = '<button type="button" data-menu-source="contents" aria-pressed="true">Contents</button><button type="button" data-menu-source="files" aria-pressed="false">Files</button>';
    return toggle;
}

function treeContainer(source, items) {
    const container = document.createElement('div');
    container.className = 'menu-tree';
    container.dataset.menuTree = source;
    container.dataset.maxDepth = String(maxDepth(items));
    container.hidden = source === 'files';
    if (items.length > 0) {
        container.append(renderList(items));
    } else {
        const empty = document.createElement('p');
        empty.className = 'lazy-menu-empty';
        empty.textContent = source === 'contents' ? 'No authored index navigation in this section.' : 'No pages in this section.';
        container.append(empty);
    }
    return container;
}

function populate(nav, items, contentsItems) {
    nav.querySelector('.menu-skeleton')?.remove();
    nav.querySelector('.lazy-menu-error')?.remove();
    nav.querySelectorAll('.menu-tree, .depth-controls').forEach((node) => node.remove());
    const hasContents = contentsItems.length > 0;
    const depth = Math.max(maxDepth(items), maxDepth(contentsItems));
    nav.dataset.maxLevel = String(depth);
    nav.setAttribute('aria-busy', 'false');
    nav.classList.remove('loading');

    const title = nav.querySelector('.menu-title');
    if (title) {
        title.replaceChildren(...(hasContents ? [menuSourceToggle()] : [document.createTextNode('Pages')]));
    }
    if (depth > 1) {
        nav.append(depthControls());
    }
    if (hasContents) nav.append(treeContainer('contents', contentsItems));
    const filesTree = treeContainer('files', items);
    filesTree.hidden = hasContents;
    nav.append(filesTree);
    nav.dispatchEvent(new CustomEvent('microwebstacks:navigation-ready'));
}

function showError(nav) {
    nav.querySelector('.menu-skeleton')?.remove();
    nav.setAttribute('aria-busy', 'false');
    nav.classList.remove('loading');
    const message = document.createElement('p');
    message.className = 'lazy-menu-error';
    message.textContent = 'Pages could not be loaded — the ⓘ icon in the top bar has diagnostics.';
    nav.append(message);
}

async function loadNavigation() {
    const menus = [...document.querySelectorAll('nav.pages_menu[data-lazy-navigation="true"]')];
    if (menus.length === 0) {
        return;
    }
    const fetchSource = async (source) => {
        const endpoint = new URL('/__lite/navigation', window.location.origin);
        endpoint.searchParams.set('pathname', window.location.pathname);
        endpoint.searchParams.set('source', source);
        const response = await fetch(endpoint, {cache: 'no-store'});
        if (!response.ok) throw new Error(`${source} navigation request returned ${response.status}`);
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) {
            throw new Error(`${source} navigation answered with '${contentType || 'no content type'}' instead of JSON - run-mode mismatch`);
        }
        return response.json();
    };
    try {
        const [filesResult, contentsResult] = await Promise.allSettled([fetchSource('files'), fetchSource('contents')]);
        if (filesResult.status !== 'fulfilled') throw filesResult.reason;
        const payload = filesResult.value;
        const items = Array.isArray(payload.items) ? payload.items : [];
        const contentsItems = contentsResult.status === 'fulfilled' && Array.isArray(contentsResult.value.items)
            ? contentsResult.value.items
            : [];
        // Last-result record for the runtime info surface (runtime_info.js).
        window.__mwsNavigationStatus = {
            ok: true,
            ms: Math.max(payload.ms ?? 0, contentsResult.status === 'fulfilled' ? contentsResult.value.ms ?? 0 : 0),
            contents: contentsResult.status === 'fulfilled',
            at: new Date().toISOString()
        };
        menus.forEach((nav) => populate(nav, items, contentsItems));
    } catch (error) {
        window.__mwsNavigationStatus = {ok: false, error: error.message, at: new Date().toISOString()};
        console.warn(`[lite] navigation unavailable: ${error.message}`);
        menus.forEach(showError);
    }
}

document.addEventListener('DOMContentLoaded', loadNavigation, false);
