const LOCK_MESSAGE = 'microwebstacks.previewLock';
const LOCK_STATE_MESSAGE = 'microwebstacks.previewLockState';

export function activatePreviewLock({
    parentWindow = window.parent,
    currentWindow = window
} = {}) {
    const toggle = document.querySelector('[data-preview-lock-toggle]');
    if (!toggle) {
        return;
    }
    if (parentWindow === currentWindow) {
        toggle.setAttribute('hidden', '');
        return;
    }

    const applyState = (locked) => {
        const isLocked = Boolean(locked);
        toggle.setAttribute('aria-pressed', String(isLocked));
        const label = isLocked
            ? 'Unlock preview (stop following the active editor)'
            : 'Lock preview to current page';
        toggle.setAttribute('title', label);
        toggle.setAttribute('aria-label', label);
    };

    toggle.addEventListener('click', () => {
        parentWindow.postMessage({
            type: LOCK_MESSAGE,
            locked: toggle.getAttribute('aria-pressed') !== 'true'
        }, '*');
    });
    currentWindow.addEventListener('message', (event) => {
        if (event.source !== parentWindow || event.data?.type !== LOCK_STATE_MESSAGE) {
            return;
        }
        applyState(event.data.locked);
    });
}

activatePreviewLock();
