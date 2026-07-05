function togglePressed(button, pressed) {
    button.setAttribute('aria-pressed', String(pressed));
}

function findCodeShell(button) {
    return button.closest('[data-code-shell]');
}

function findCodeSurface(shell) {
    return shell?.querySelector('[data-code-surface]') ?? null;
}

function isCodeView(shell) {
    if (!shell?.hasAttribute('data-view')) {
        return true;
    }
    return shell.getAttribute('data-view') === 'code';
}

function syncCodeButtons(shell) {
    const surface = findCodeSurface(shell);
    if (!surface) {
        return;
    }

    const codeVisible = isCodeView(shell);
    const lineNumbers = surface.getAttribute('data-line-numbers') === 'true';
    const wrapLines = surface.getAttribute('data-wrap-lines') === 'true';

    shell.querySelectorAll('button[data-code-action="line-numbers"]').forEach((button) => {
        togglePressed(button, lineNumbers);
        button.disabled = !codeVisible && shell.hasAttribute('data-view');
    });

    shell.querySelectorAll('button[data-code-action="wrap"]').forEach((button) => {
        togglePressed(button, wrapLines);
        button.disabled = !codeVisible && shell.hasAttribute('data-view');
    });
}

function setCopiedState(button, copied) {
    if (copied) {
        button.setAttribute('data-copied', 'true');
        button.setAttribute('aria-label', 'Copied');
        button.setAttribute('title', 'Copied');
        return;
    }

    button.removeAttribute('data-copied');
    button.setAttribute('aria-label', 'Copy code');
    button.setAttribute('title', 'Copy code');
}

async function copyCode(button) {
    const shell = findCodeShell(button);
    const surface = findCodeSurface(shell);
    const codeText = surface?.querySelector('pre')?.textContent ?? '';
    if (!codeText) {
        return;
    }

    try {
        await navigator.clipboard.writeText(codeText);
        setCopiedState(button, true);
        window.setTimeout(() => setCopiedState(button, false), 1000);
    } catch (error) {
        console.error('Failed to copy code block:', error);
    }
}

function toggleSurfaceFlag(button, attributeName) {
    const shell = findCodeShell(button);
    const surface = findCodeSurface(shell);
    if (!surface) {
        return;
    }

    const nextValue = surface.getAttribute(attributeName) === 'true' ? 'false' : 'true';
    surface.setAttribute(attributeName, nextValue);
    syncCodeButtons(shell);
}

function handleCodeAction(event) {
    const button = event.currentTarget;
    const action = button.getAttribute('data-code-action');
    if (!action) {
        return;
    }

    if (action === 'copy') {
        copyCode(button);
        return;
    }

    if (button.disabled) {
        return;
    }

    if (action === 'line-numbers') {
        toggleSurfaceFlag(button, 'data-line-numbers');
    } else if (action === 'wrap') {
        toggleSurfaceFlag(button, 'data-wrap-lines');
    }
}

function initCodeControls() {
    document.querySelectorAll('[data-code-shell]').forEach((shell) => {
        if (shell.getAttribute('data-code-controls-ready') === 'true') {
            syncCodeButtons(shell);
            return;
        }

        shell.setAttribute('data-code-controls-ready', 'true');
        shell.querySelectorAll('button[data-code-action]').forEach((button) => {
            button.addEventListener('click', handleCodeAction);
        });
        syncCodeButtons(shell);
    });
}

document.addEventListener('microwebstacks:code-view-change', (event) => {
    const shell = event.target?.closest?.('[data-code-shell]') ?? event.target;
    if (shell instanceof HTMLElement) {
        syncCodeButtons(shell);
    }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCodeControls, false);
} else {
    initCodeControls();
}
