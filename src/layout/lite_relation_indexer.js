const POLL_MS = 500;
const GRACE_MS = 900;
const COMPLETE_HIDE_MS = 1400;

function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function requestStatus() {
    const response = await fetch('/__lite/index-status', {cache: 'no-store'});
    if (!response.ok) throw new Error(`index status returned ${response.status}`);
    return response.json();
}

async function control(action) {
    const response = await fetch(`/__lite/index-control?action=${encodeURIComponent(action)}`, {
        method: 'POST',
        cache: 'no-store',
        headers: {'content-type': 'application/json'}
    });
    if (!response.ok) throw new Error(`index ${action} returned ${response.status}`);
    return response.json();
}

function setCollapsed(view, collapsed) {
    view.bar.dataset.collapsed = collapsed ? 'true' : 'false';
    view.reopen.hidden = !collapsed;
}

function showError(view, message) {
    view.bar.dataset.state = 'stopped';
    view.bar.querySelector('[data-index-label]').textContent = message;
    setCollapsed(view, false);
}

function render(view, status) {
    const bar = view.bar;
    const progress = bar.querySelector('[data-index-progress]');
    const label = bar.querySelector('[data-index-label]');
    const pause = bar.querySelector('[data-index-action="pause"], [data-index-action="resume"]');
    const stop = bar.querySelector('[data-index-action="stop"]');
    const total = Math.max(0, Number(status.total) || 0);
    const current = Math.min(total, Math.max(0, Number(status.current) || 0));
    progress.max = Math.max(1, total);
    progress.value = current;

    let state = 'waiting';
    let text = 'Link index waiting';
    if (status.complete) {
        state = 'complete';
        text = `Link index complete · ${status.scanned}/${total} pages`;
    } else if (status.paused) {
        state = 'paused';
        text = `Link index paused · ${current}/${total}`;
    } else if (status.stopped) {
        state = 'stopped';
        text = `Link index stopped · ${current}/${total}`;
    } else if (status.running) {
        state = 'running';
        text = `Indexing links · ${current}/${total}`;
    }
    if (status.errors) text += ` · ${status.errors} skipped`;
    if (status.storeBytes != null) text += ` · ${formatBytes(status.storeBytes)}`;
    if (status.evicted) text += ` · ${status.evicted} evicted`;
    bar.dataset.state = state;
    label.textContent = text;

    // Pause/Stop only exist while there is an index run to act on; a finished
    // index leaves just the summary line and the collapse chevron.
    if (pause) {
        const action = status.paused || status.stopped ? 'resume' : 'pause';
        pause.dataset.indexAction = action;
        pause.textContent = action[0].toUpperCase() + action.slice(1);
        pause.hidden = Boolean(status.complete);
    }
    if (stop) stop.hidden = Boolean(status.complete || status.stopped);

    // Visibility: the bar shows itself only while a run is in flight (or held
    // by the user); on completion it slides down after a short beat, leaving
    // the reopen tab. Reopening a completed bar does not re-arm the timer.
    if (status.complete) {
        if (!view.completeHandled) {
            view.completeHandled = true;
            view.hideTimer = setTimeout(() => setCollapsed(view, true), COMPLETE_HIDE_MS);
        }
    } else {
        view.completeHandled = false;
        if (view.hideTimer) {
            clearTimeout(view.hideTimer);
            view.hideTimer = null;
        }
        const active = status.running || status.paused || status.stopped;
        if (active && !view.userCollapsed) setCollapsed(view, false);
    }
}

async function activateIndexer(view) {
    try {
        render(view, await control('start'));
    } catch (error) {
        showError(view, `Link index unavailable: ${error.message}`);
        return;
    }
    const poll = async () => {
        try {
            const status = await requestStatus();
            render(view, status);
            if (!status.complete) setTimeout(poll, POLL_MS);
        } catch (error) {
            showError(view, `Link index unavailable: ${error.message}`);
        }
    };
    setTimeout(poll, POLL_MS);
}

document.addEventListener('DOMContentLoaded', () => {
    const bar = document.querySelector('.lite-index-status');
    const reopen = document.querySelector('[data-index-reopen]');
    if (!bar || !reopen) return;
    const view = {bar, reopen, userCollapsed: false, completeHandled: false, hideTimer: null};
    let activated = false;
    const activate = () => {
        if (activated) return;
        activated = true;
        setTimeout(() => activateIndexer(view), GRACE_MS);
    };
    const navigation = document.querySelector('nav.pages_menu[data-lazy-navigation="true"]');
    navigation?.addEventListener('microwebstacks:navigation-ready', activate, {once: true});
    setTimeout(activate, GRACE_MS);
    bar.addEventListener('click', async (event) => {
        if (event.target.closest('[data-index-collapse]')) {
            view.userCollapsed = true;
            setCollapsed(view, true);
            return;
        }
        const button = event.target.closest('[data-index-action]');
        if (!button || button.disabled) return;
        button.disabled = true;
        try { render(view, await control(button.dataset.indexAction)); }
        finally { button.disabled = false; }
    });
    reopen.addEventListener('click', () => {
        view.userCollapsed = false;
        setCollapsed(view, false);
    });
}, false);
