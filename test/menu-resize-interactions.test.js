import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

class ClassList {
    constructor(...names) {
        this.names = new Set(names);
    }

    add(name) {
        this.names.add(name);
    }

    remove(name) {
        this.names.delete(name);
    }

    contains(name) {
        return this.names.has(name);
    }
}

class Element {
    constructor({classes = [], clientWidth = 0} = {}) {
        this.attributes = new Map();
        this.classList = new ClassList(...classes);
        this.listeners = new Map();
        this.style = {};
        this.initialClientWidth = clientWidth;
        this.capturedPointer = null;
        this.dispatchedEvents = [];
    }

    get clientWidth() {
        const width = Number.parseFloat(this.style.width);
        return Number.isFinite(width) ? width : this.initialClientWidth;
    }

    addEventListener(type, listener) {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    emit(type, event = {}) {
        for(const listener of this.listeners.get(type) ?? []){
            listener(event);
        }
    }

    dispatchEvent(event) {
        this.dispatchedEvents.push(event);
    }

    getAttribute(name) {
        return this.attributes.get(name) ?? null;
    }

    setAttribute(name, value) {
        this.attributes.set(name, value);
    }

    setPointerCapture(pointerId) {
        this.capturedPointer = pointerId;
    }

    hasPointerCapture(pointerId) {
        return this.capturedPointer === pointerId;
    }

    releasePointerCapture(pointerId) {
        if(this.capturedPointer === pointerId){
            this.capturedPointer = null;
        }
    }
}

function pointerEvent({pointerId = 1, clientX, button = 0} = {}) {
    return {
        pointerId,
        clientX,
        button,
        defaultPrevented: false,
        preventDefault() {
            this.defaultPrevented = true;
        }
    };
}

function createResizeHarness({leftToRight, startWidth = 240} = {}) {
    const body = new Element();
    const handle = new Element();
    const nav = new Element({classes: ['open'], clientWidth: startWidth});
    const button = new Element();
    nav.style.width = `${startWidth}px`;
    nav.setAttribute('data-width', `${startWidth}px`);
    nav.setAttribute('data-state-key', 'resize-scope');

    const documentListeners = new Map();
    const windowListeners = new Map();
    const document = {
        body,
        documentElement: {clientWidth: 1000},
        addEventListener(type, listener) {
            documentListeners.set(type, listener);
        }
    };
    const window = {
        addEventListener(type, listener) {
            windowListeners.set(type, listener);
        }
    };
    const storage = new Map();
    const localStorage = {
        setItem(key, value) {
            storage.set(key, value);
        }
    };
    class CustomEvent {
        constructor(type, init) {
            this.type = type;
            this.detail = init?.detail;
        }
    }

    const source = readFileSync(
        new URL('../src/layout/menu_interactions_activation.js', import.meta.url),
        'utf8'
    );
    const context = {CustomEvent, document, localStorage, window};
    vm.runInNewContext(source, context);
    context.configure_resize(handle, nav, leftToRight, {
        button,
        storageKey: 'left_open'
    });

    return {body, button, handle, nav, storage, windowListeners};
}

test('left resize follows the pointer and clamps continuously at 40vw', () => {
    const {body, button, handle, nav, storage} = createResizeHarness({leftToRight: true});
    const down = pointerEvent({clientX: 240});
    handle.emit('pointerdown', down);

    assert.equal(down.defaultPrevented, true);
    assert.equal(handle.capturedPointer, 1);
    assert.equal(handle.classList.contains('is-resizing'), true);
    assert.equal(body.classList.contains('nav-resizing'), true);

    const move = pointerEvent({clientX: 340});
    handle.emit('pointermove', move);
    assert.equal(move.defaultPrevented, true);
    assert.equal(nav.style.width, '340px');
    assert.equal(nav.getAttribute('data-width'), '340px');

    handle.emit('pointermove', pointerEvent({clientX: 900}));
    assert.equal(nav.style.width, '400px');
    assert.equal(nav.getAttribute('data-width'), '400px');

    handle.emit('pointerup', pointerEvent({clientX: 900}));
    assert.equal(handle.capturedPointer, null);
    assert.equal(handle.classList.contains('is-resizing'), false);
    assert.equal(body.classList.contains('nav-resizing'), false);
    assert.equal(nav.classList.contains('open'), true);
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.equal(storage.get('resize-scope:left_open:open'), 'true');
});

test('right resize mirrors the left resize math', () => {
    const {handle, nav} = createResizeHarness({leftToRight: false});
    handle.emit('pointerdown', pointerEvent({clientX: 760}));
    handle.emit('pointermove', pointerEvent({clientX: 660}));

    assert.equal(nav.style.width, '340px');
    assert.equal(nav.getAttribute('data-width'), '340px');
});

test('the established minimum snap band is preserved before total collapse', () => {
    const {body, button, handle, nav, storage} = createResizeHarness({leftToRight: true});
    handle.emit('pointerdown', pointerEvent({clientX: 240}));

    handle.emit('pointermove', pointerEvent({clientX: 150}));
    assert.equal(nav.style.width, '240px');

    handle.emit('pointermove', pointerEvent({clientX: 60}));
    assert.equal(nav.style.width, '0px');
    assert.equal(nav.getAttribute('data-width'), '0px');

    handle.emit('pointerup', pointerEvent({clientX: 60}));
    assert.equal(nav.classList.contains('closed'), true);
    assert.equal(nav.getAttribute('data-width'), '20vw');
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(storage.get('resize-scope:left_open:open'), 'false');
    assert.equal(body.classList.contains('nav-resizing'), false);
});

test('pointer cancellation and window blur both clean up an active drag', () => {
    const cancelled = createResizeHarness({leftToRight: true});
    cancelled.handle.emit('pointerdown', pointerEvent({clientX: 240}));
    cancelled.handle.emit('pointercancel', pointerEvent({clientX: 240}));
    assert.equal(cancelled.body.classList.contains('nav-resizing'), false);

    const blurred = createResizeHarness({leftToRight: true});
    blurred.handle.emit('pointerdown', pointerEvent({clientX: 240}));
    blurred.windowListeners.get('blur')();
    assert.equal(blurred.body.classList.contains('nav-resizing'), false);
    assert.equal(blurred.handle.capturedPointer, null);
});
