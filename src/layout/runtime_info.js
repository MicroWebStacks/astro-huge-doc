import './runtime_info.css';

/*
 * In-viewer runtime info surface (extension preview / lite dev runs only —
 * Layout.astro loads this behind extensionPreviewEnabled()).
 *
 * Everything shown here is fetched from the same-origin /__lite/* endpoints
 * and stays on this machine (no-telemetry policy). The surface exists so a
 * run-mode mismatch — wrong server behind the tab, drifted port, stale
 * engine — is one click to diagnose instead of a log hunt; see
 * specification/run-modes/spec.md, Observability.
 *
 * Reliability contract: observability must never be destructive. The dialog
 * is a native <dialog> shown with showModal() — top-layer rendering, native
 * Esc/close state, focus restore — and every handler is error-contained: a
 * failure inside this surface renders as text in the dialog (or a console
 * warning), never as a broken page.
 */

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

async function probe(path) {
    const startedAt = performance.now();
    try {
        const response = await fetch(path, {cache: 'no-store'});
        const contentType = response.headers.get('content-type') ?? '';
        const ms = Math.round(performance.now() - startedAt);
        const ok = response.ok && contentType.includes('application/json');
        let payload = null;
        if (contentType.includes('application/json')) {
            try {
                payload = await response.json();
            } catch {
                payload = null;
            }
        }
        return {ok, status: response.status, contentType, ms, payload};
    } catch (error) {
        return {ok: false, status: null, contentType: null, ms: Math.round(performance.now() - startedAt), error: error.message};
    }
}

function engineLabel(engine) {
    if (!engine) return 'unknown';
    const parts = [engine.version ?? 'unknown'];
    if (engine.commit) parts.push(`(${engine.commit}${engine.dirty ? ', dirty' : ''})`);
    parts.push(engine.source === 'workspace' ? '- source checkout' : `- ${engine.source} build`);
    return parts.join(' ');
}

/* Diagrams on the current page: a pure DOM read of already-rendered markup
   (.diagram-shell[data-language], set by DiagramCode.astro) — no fetch, no
   re-render, nothing the page was not already going to compute. */
function diagramsOnPage(diagramLanguages) {
    const byLanguage = new Map();
    for (const shell of document.querySelectorAll('.diagram-shell[data-language]')) {
        const language = shell.dataset.language || 'unknown';
        byLanguage.set(language, (byLanguage.get(language) ?? 0) + 1);
    }
    return [...byLanguage.entries()].map(([language, count]) => ({
        language,
        count,
        renderer: diagramLanguages?.[language] ?? 'unknown'
    }));
}

function healthLabel(result) {
    if (result.ok) return `OK - ${result.status}, ${result.ms} ms`;
    if (result.status === null) return `FAILED - ${result.error ?? 'network error'}`;
    return `FAILED - ${result.status}, '${result.contentType || 'no content type'}'`;
}

function addRow(list, label, value, {warn = false} = {}) {
    list.append(el('dt', undefined, label));
    const dd = el('dd', warn ? 'warn' : undefined, value);
    list.append(dd);
    return dd;
}

function addSection(list, label) {
    list.append(el('dt', 'section', label));
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return 'unknown';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 'B';
    for (const next of units) {
        if (value < 1024) break;
        value /= 1024;
        unit = next;
    }
    return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${unit}`;
}

async function collectDiagnostics() {
    const navPath = `/__lite/navigation?pathname=${encodeURIComponent(window.location.pathname)}`;
    const [runtime, stats, version, navigation] = await Promise.all([
        probe('/__lite/runtime'),
        probe('/__lite/stats'),
        probe('/__lite/version'),
        probe(navPath)
    ]);
    return {
        collectedAt: new Date().toISOString(),
        origin: window.location.origin,
        page: window.location.pathname,
        runtime,
        stats,
        endpoints: {version, navigation},
        lazyNavigationLastResult: window.__mwsNavigationStatus ?? null
    };
}

function render(panel, diagnostics) {
    panel.replaceChildren();
    const runtime = diagnostics.runtime.payload;
    const list = el('dl', 'runtime-info-list');

    addRow(list, 'Origin', diagnostics.origin);
    if (runtime) {
        const configured = runtime.configuredServer ?? {};
        const pagePort = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
        const drifted = configured.port && String(configured.port) !== pagePort;
        addRow(list, 'Server', `${runtime.mode}${runtime.launcher ? `, launched by ${runtime.launcher}` : ', started manually (no launcher)'}`);
        addRow(list, 'Live reload', runtime.launcher
            ? 'polling (launcher bumps change stamps)'
            : 'off - no launcher signals changes, so pages do not poll');
        addRow(
            list,
            'Configured port',
            drifted
                ? `${configured.port} - but this tab is on ${pagePort} (auto-increment or another server; check which process owns this origin)`
                : String(configured.port ?? 'unknown'),
            {warn: Boolean(drifted)}
        );
        addRow(list, 'Engine', engineLabel(runtime.engine));
        addRow(list, 'Profile / backend / output', `${runtime.profile} / ${runtime.backend} / ${runtime.output}`);
        addRow(list, 'Docs root', runtime.docsRoot ?? 'unknown');
        addRow(list, 'Workspace root', runtime.workspaceRoot ?? 'unknown');
        addRow(list, 'Store (json dir)', runtime.jsonDir ?? 'unknown');
        addRow(list, 'Process', `node ${runtime.node}, pid ${runtime.pid}, up ${runtime.uptimeSeconds}s`);

        const diagrams = diagramsOnPage(runtime.diagram?.languages);
        if (diagrams.length > 0) {
            addSection(list, 'This page');
            addRow(list, 'Diagrams', diagrams.map((item) => `${item.language} ×${item.count} (${item.renderer})`).join(', '));
            const usesKroki = diagrams.some((item) => item.renderer === 'kroki');
            if (usesKroki && runtime.diagram?.krokiServer) {
                addRow(list, 'Kroki server', runtime.diagram.krokiServer);
            }
        }
    } else {
        addRow(list, 'Runtime endpoint', healthLabel(diagnostics.runtime), {warn: true});
        list.append(el('dd', 'runtime-info-hint',
            'No JSON from /__lite/runtime: this origin is not serving the extension-preview surface this page was rendered for. '
            + 'Likely a different or restarted server owns this port (specification/run-modes/spec.md).'));
    }

    const stats = diagnostics.stats.payload;
    if (stats) {
        addSection(list, 'Workspace');
        const workspace = stats.workspace ?? {};
        addRow(list, 'Files', `${workspace.files ?? '?'} files in ${workspace.dirs ?? '?'} folders, ${formatBytes(workspace.bytes)}`);
        addRow(list, 'Markdown pages', String(workspace.markdownDocuments ?? 'unknown'));
        if (Array.isArray(workspace.topExtensions) && workspace.topExtensions.length > 0) {
            addRow(list, 'File types', workspace.topExtensions.map((item) => `${item.ext} ×${item.count}`).join(', '));
        }
        if (workspace.newestMtimeMs) {
            addRow(list, 'Newest change', new Date(workspace.newestMtimeMs).toLocaleString());
        }
        if (stats.walk?.ms !== null && stats.walk?.ms !== undefined) {
            addRow(list, 'Tree walk', `${stats.walk.ms} ms${stats.walk.at ? ` at ${stats.walk.at}` : ''}`);
        }
        if (stats.walkHistory) {
            addRow(list, 'Tree walks (session)', `${stats.walkHistory.count}, avg ${stats.walkHistory.avgMs} ms, last ${stats.walkHistory.lastMs} ms`);
        }

        addSection(list, 'Lazy cache & process');
        const pages = stats.cache?.pages ?? {files: 0, bytes: 0};
        const blobs = stats.cache?.blobs ?? {files: 0, bytes: 0};
        const total = workspace.markdownDocuments;
        addRow(list, 'Parsed pages', total
            ? `${pages.files} of ${total} (parsed on demand), ${formatBytes(pages.bytes)}`
            : `${pages.files}, ${formatBytes(pages.bytes)}`);
        addRow(list, 'Blob cache', `${blobs.files} files, ${formatBytes(blobs.bytes)}`);
        if (stats.lastPage) {
            const hitLabel = {memory: 'in memory', disk: 'disk cache', parsed: 'freshly parsed'}[stats.lastPage.hit] ?? stats.lastPage.hit;
            addRow(list, 'Last page load', `${stats.lastPage.path} - ${hitLabel}${stats.lastPage.ms !== null ? `, ${stats.lastPage.ms} ms` : ''}`);
        }
        if (stats.memory?.rss) {
            addRow(list, 'Server memory', `${formatBytes(stats.memory.rss)} rss, ${formatBytes(stats.memory.heapUsed)} js heap`);
        }
    }

    addSection(list, 'Endpoints');
    addRow(list, 'Navigation endpoint', healthLabel(diagnostics.endpoints.navigation), {warn: !diagnostics.endpoints.navigation.ok});
    addRow(list, 'Live-reload endpoint', healthLabel(diagnostics.endpoints.version), {warn: !diagnostics.endpoints.version.ok});
    const last = diagnostics.lazyNavigationLastResult;
    if (last) {
        addRow(
            list,
            'Menu last load',
            last.ok ? `OK - ${last.ms} ms at ${last.at}` : `FAILED - ${last.error} (at ${last.at})`,
            {warn: !last.ok}
        );
    }
    panel.append(list);

    const actions = el('div', 'runtime-info-actions');
    const copy = el('button', 'runtime-info-copy', 'Copy diagnostics');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
            copy.textContent = 'Copied';
        } catch {
            copy.textContent = 'Copy failed - clipboard unavailable';
        }
        setTimeout(() => { copy.textContent = 'Copy diagnostics'; }, 2000);
    });
    actions.append(copy);
    panel.append(actions);
}

function buildDialog(toggle) {
    const dialog = el('dialog', 'runtime-info-dialog');
    dialog.setAttribute('aria-label', 'Preview runtime info');

    const header = el('div', 'runtime-info-header');
    header.append(el('span', 'runtime-info-title', 'Preview runtime'));
    const close = el('button', 'runtime-info-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close runtime info');
    close.addEventListener('click', () => dialog.close());
    header.append(close);
    dialog.append(header);

    const panel = el('div', 'runtime-info-body');
    dialog.append(panel);

    // A click that lands on the <dialog> element itself (padding is zero, so
    // content clicks target children) is a backdrop click: close.
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
    });
    // Single source of truth for "open" is the native dialog state; Esc
    // (native 'cancel' -> close) and every close path land here.
    dialog.addEventListener('close', () => {
        toggle.setAttribute('aria-expanded', 'false');
    });

    document.body.append(dialog);
    return {dialog, panel};
}

function init() {
    const toggle = document.getElementById('runtime-info-toggle');
    if (!toggle || typeof HTMLDialogElement === 'undefined') {
        return;
    }
    let ui = null;

    toggle.addEventListener('click', async () => {
        try {
            if (!ui) {
                ui = buildDialog(toggle);
            }
            if (ui.dialog.open) {
                ui.dialog.close();
                return;
            }
            ui.panel.replaceChildren(el('p', 'runtime-info-hint', 'Collecting…'));
            ui.dialog.showModal();
            toggle.setAttribute('aria-expanded', 'true');
            const diagnostics = await collectDiagnostics();
            if (ui.dialog.open) {
                render(ui.panel, diagnostics);
            }
        } catch (error) {
            // Never let the info surface break the page it observes.
            console.warn(`[lite] runtime info unavailable: ${error.message}`);
            if (ui?.dialog.open) {
                ui.panel.replaceChildren(el('p', 'runtime-info-hint', `Diagnostics failed: ${error.message}`));
            }
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, false);
} else {
    init();
}
