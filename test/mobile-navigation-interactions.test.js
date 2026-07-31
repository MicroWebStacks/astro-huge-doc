import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
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

    toggle(name, force) {
        if(force){
            this.add(name);
        }else{
            this.remove(name);
        }
    }
}

class Element {
    constructor(id, classes = []) {
        this.id = id;
        this.classList = new ClassList(...classes);
        this.attributes = new Map();
        this.listeners = new Map();
        this.style = {};
    }

    addEventListener(type, listener) {
        this.listeners.set(type, listener);
    }

    dispatchEvent() {}

    emit(type, event = {}) {
        this.listeners.get(type)?.(event);
    }

    getAttribute(name) {
        return this.attributes.get(name) ?? null;
    }

    setAttribute(name, value) {
        this.attributes.set(name, value);
    }

    removeAttribute(name) {
        this.attributes.delete(name);
    }

    contains(element) {
        return element === this.link;
    }

    focus() {}
}

// Mutable matchMedia stand-in: `matches` can be flipped and the change
// listeners fired, which is how the breakpoint-crossing cases are driven.
class MediaQuery {
    constructor(matches) {
        this.matches = matches;
        this.listeners = new Set();
    }

    addEventListener(type, listener) {
        if(type === 'change'){ this.listeners.add(listener); }
    }

    set(matches) {
        this.matches = matches;
        for(const listener of this.listeners){
            listener({matches});
        }
    }
}

function buildEnvironment({mobile}) {
    const body = new Element('body');
    const mobileWrapper = new Element('mobile-nav');
    const tocWrapper = new Element('toc-nav-div');
    // Both pages menus carry the same data-state-key, as the layout renders
    // them (the overlay copy is the rail copy).
    const wideNav = new Element('wide-pages', ['pages_menu', 'closed']);
    const mobileNav = new Element('mobile-pages', ['pages_menu', 'closed']);
    const tocNav = new Element('mobile-toc', ['toc_menu', 'closed']);
    const leftButton = new Element('nav-toggle-left');
    const rightButton = new Element('nav-toggle-right');
    const backdrop = new Element('mobile-nav-backdrop');
    for(const nav of [wideNav, mobileNav]){
        nav.attributes.set('data-state-key', 'pages-scope');
        nav.attributes.set('data-width', '20vw');
    }
    tocNav.attributes.set('data-state-key', 'toc-scope');
    tocNav.attributes.set('data-width', '20vw');
    const link = new Element('page-link');
    link.closest = () => link;
    mobileNav.link = link;

    const elements = new Map([
        ['mobile-nav', mobileWrapper],
        ['toc-nav-div', tocWrapper],
        ['nav-toggle-left', leftButton],
        ['nav-toggle-right', rightButton],
        ['mobile-nav-backdrop', backdrop]
    ]);
    const documentListeners = new Map();
    const document = {
        body,
        addEventListener(type, listener) {
            documentListeners.set(type, listener);
        },
        getElementById(id) {
            return elements.get(id) ?? null;
        },
        querySelector(selector) {
            if(selector === '#wide-nav nav.pages_menu') return wideNav;
            if(selector === '#mobile-nav nav.pages_menu') return mobileNav;
            if(selector === '#toc-nav-div nav.toc_menu') return tocNav;
            if(selector === '#mobile-nav.mobile-open, #toc-nav-div.mobile-open'){
                return mobileWrapper.classList.contains('mobile-open')
                    ? mobileWrapper
                    : (tocWrapper.classList.contains('mobile-open') ? tocWrapper : null);
            }
            return null;
        }
    };
    const storage = new Map();
    const localStorage = {
        getItem(key) {
            return storage.get(key) ?? null;
        },
        setItem(key, value) {
            storage.set(key, value);
        }
    };
    const media = new MediaQuery(mobile);

    const source = readFileSync(
        new URL('../src/layout/menu_interactions_activation.js', import.meta.url),
        'utf8'
    );
    vm.runInNewContext(source, {
        CustomEvent: class {},
        document,
        localStorage,
        window: {matchMedia: () => media, addEventListener() {}}
    });
    documentListeners.get('DOMContentLoaded')();

    return {
        body, mobileWrapper, tocWrapper, wideNav, mobileNav, tocNav,
        leftButton, rightButton, backdrop, link, media, storage
    };
}

test('mobile navigation link closes the drawer and persists closed state', () => {
    const env = buildEnvironment({mobile: true});

    env.leftButton.emit('click', {preventDefault() {}});
    assert.equal(env.mobileWrapper.classList.contains('mobile-open'), true);
    assert.equal(env.body.classList.contains('mobile-nav-open'), true);

    env.mobileNav.emit('click', {target: env.link});
    assert.equal(env.mobileWrapper.classList.contains('mobile-open'), false);
    assert.equal(env.body.classList.contains('mobile-nav-open'), false);
    assert.equal(env.leftButton.getAttribute('aria-expanded'), 'false');
    assert.equal(env.storage.get('pages-scope:mobile_left_open:open'), 'false');
});

test('a viewport widened past the breakpoint re-aims the toggle at the rail', () => {
    // Loaded narrow (a preview panel opened at <= 700px), then widened.
    const env = buildEnvironment({mobile: true});

    env.leftButton.emit('click', {preventDefault() {}});
    assert.equal(env.mobileNav.classList.contains('open'), true);
    assert.equal(env.mobileWrapper.classList.contains('mobile-open'), true);

    env.media.set(false);
    // The overlay shell must not survive into the desktop layout: nothing there
    // can dismiss the backdrop or release the body scroll lock.
    assert.equal(env.mobileWrapper.classList.contains('mobile-open'), false);
    assert.equal(env.backdrop.classList.contains('visible'), false);
    assert.equal(env.body.classList.contains('mobile-nav-open'), false);

    // The same button now drives the rail rather than the hidden overlay copy.
    env.leftButton.emit('click', {preventDefault() {}});
    assert.equal(env.wideNav.classList.contains('open'), true);
    assert.equal(env.wideNav.style.width, '20vw');
    assert.equal(env.leftButton.getAttribute('aria-expanded'), 'true');
    assert.equal(env.storage.get('pages-scope:left_open:open'), 'true');
});

test('a viewport narrowed past the breakpoint re-aims the toggles at the drawers', () => {
    // Loaded wide, then narrowed - previously left both toggles bound to navs
    // the mobile stylesheet hides, and registered no drawer handlers at all.
    const env = buildEnvironment({mobile: false});

    env.leftButton.emit('click', {preventDefault() {}});
    assert.equal(env.wideNav.classList.contains('open'), true);

    env.media.set(true);
    assert.equal(env.mobileWrapper.classList.contains('mobile-open'), false);

    env.leftButton.emit('click', {preventDefault() {}});
    assert.equal(env.mobileNav.classList.contains('open'), true);
    assert.equal(env.mobileWrapper.classList.contains('mobile-open'), true);
    assert.equal(env.body.classList.contains('mobile-nav-open'), true);
    assert.equal(env.backdrop.classList.contains('visible'), true);

    // The toc toggle gets its drawer shell too, not just the width flip that
    // left it translated off-screen.
    env.rightButton.emit('click', {preventDefault() {}});
    assert.equal(env.tocWrapper.classList.contains('mobile-open'), true);
    assert.equal(env.mobileWrapper.classList.contains('mobile-open'), false);
    assert.equal(env.leftButton.getAttribute('aria-expanded'), 'false');

    // Escape and the backdrop are live even though the page loaded wide.
    env.backdrop.emit('click', {});
    assert.equal(env.body.classList.contains('mobile-nav-open'), false);
    assert.equal(env.tocWrapper.classList.contains('mobile-open'), false);
});

test('each mode restores its own persisted open state across a crossing', () => {
    const env = buildEnvironment({mobile: false});

    env.leftButton.emit('click', {preventDefault() {}});
    assert.equal(env.storage.get('pages-scope:left_open:open'), 'true');

    // Narrow: the drawer starts closed, its own key never having been set.
    env.media.set(true);
    assert.equal(env.mobileNav.classList.contains('open'), false);
    assert.equal(env.leftButton.getAttribute('aria-expanded'), 'false');

    // Wide again: the rail comes back open, as it was left.
    env.media.set(false);
    assert.equal(env.wideNav.classList.contains('open'), true);
    assert.equal(env.leftButton.getAttribute('aria-expanded'), 'true');
});
