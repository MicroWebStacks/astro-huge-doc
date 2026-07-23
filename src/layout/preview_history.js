const ROUTE_MESSAGE = 'microwebstacks.previewRoute';
const ACTION_MESSAGE = 'microwebstacks.previewHistory';
const STATE_MESSAGE = 'microwebstacks.previewHistoryState';

export function activatePreviewHistory({
    root = document.documentElement,
    parentWindow = window.parent,
    currentWindow = window,
    pathname = window.location.pathname
} = {}) {
    const controls = document.querySelector('[data-preview-history-controls]');
    if (parentWindow === currentWindow || root.dataset.previewMode === 'true') {
        controls?.setAttribute('hidden', '');
        return;
    }

    const back = document.querySelector('[data-preview-history="back"]');
    const forward = document.querySelector('[data-preview-history="forward"]');
    const send = (message) => parentWindow.postMessage(message, '*');

    back?.addEventListener('click', () => {
        send({type: ACTION_MESSAGE, action: 'back'});
    });
    forward?.addEventListener('click', () => {
        send({type: ACTION_MESSAGE, action: 'forward'});
    });
    currentWindow.addEventListener('message', (event) => {
        if (event.source !== parentWindow || event.data?.type !== STATE_MESSAGE) {
            return;
        }
        if (back) {
            back.disabled = !event.data.canGoBack;
        }
        if (forward) {
            forward.disabled = !event.data.canGoForward;
        }
    });

    send({type: ROUTE_MESSAGE, route: pathname});
}

activatePreviewHistory();
