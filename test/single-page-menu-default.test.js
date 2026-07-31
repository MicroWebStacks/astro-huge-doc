/* A section whose file tree holds a single page has nothing to navigate to -
   that page is already rendered. The rail must start closed on every visit to
   such a section, even when the reader last left it open elsewhere, while
   multi-page sections keep restoring the stored preference. */
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
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    dispatchEvent() {}

    emit(type, event = {}) {
        for(const listener of this.listeners.get(type) ?? []){
            listener(event);
        }
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

    contains() {
        return false;
    }

    focus() {}
}

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

// `singlePage` mirrors what SideMenu.astro renders; `stored` is the persisted
// preference left behind by an earlier visit to some other section.
function buildEnvironment({singlePage = false, stored = null, mobile = false} = {}) {
    const body = new Element('body');
    const wideNav = new Element('wide-pages', ['pages_menu', 'closed']);
    const mobileNav = new Element('mobile-pages', ['pages_menu', 'closed']);
    const tocNav = new Element('toc', ['toc_menu', 'closed']);
    const leftButton = new Element('nav-toggle-left');
    const rightButton = new Element('nav-toggle-right');
    for(const nav of [wideNav, mobileNav]){
        nav.attributes.set('data-state-key', 'pages-scope');
        nav.attributes.set('data-width', '20vw');
        if(singlePage){
            nav.attributes.set('data-single-page', 'true');
        }
    }
    tocNav.attributes.set('data-state-key', 'toc-scope');
    tocNav.attributes.set('data-width', '20vw');

    const elements = new Map([
        ['nav-toggle-left', leftButton],
        ['nav-toggle-right', rightButton]
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
            return null;
        }
    };
    const storage = new Map();
    if(stored !== null){
        storage.set('pages-scope:left_open:open', stored);
        storage.set('pages-scope:mobile_left_open:open', stored);
    }
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

    return {wideNav, mobileNav, leftButton, media, storage};
}

test('a single-page tree stays closed even though the stored preference is open', () => {
    const env = buildEnvironment({singlePage: true, stored: 'true'});

    assert.equal(env.wideNav.classList.contains('open'), false);
    assert.equal(env.wideNav.classList.contains('closed'), true);
    assert.equal(env.wideNav.style.width, '0px');
    assert.equal(env.leftButton.getAttribute('aria-expanded'), 'false');
    // The preference belongs to the reader; the rule overrides how it is
    // applied here, it does not rewrite it for the next multi-page section.
    assert.equal(env.storage.get('pages-scope:left_open:open'), 'true');
});

test('a multi-page tree still opens from the stored preference', () => {
    const env = buildEnvironment({singlePage: false, stored: 'true'});

    assert.equal(env.wideNav.classList.contains('open'), true);
    assert.equal(env.wideNav.style.width, '20vw');
    assert.equal(env.leftButton.getAttribute('aria-expanded'), 'true');
});

test('the drawer follows the same rule on mobile', () => {
    const env = buildEnvironment({singlePage: true, stored: 'true', mobile: true});

    assert.equal(env.mobileNav.classList.contains('open'), false);
    assert.equal(env.leftButton.getAttribute('aria-expanded'), 'false');
});

test('opening a single-page tree by hand survives a breakpoint round trip', () => {
    const env = buildEnvironment({singlePage: true, stored: 'true'});

    env.leftButton.emit('click', {preventDefault() {}});
    assert.equal(env.wideNav.classList.contains('open'), true);
    assert.equal(env.wideNav.getAttribute('data-single-page'), null);

    env.media.set(true);
    env.media.set(false);
    assert.equal(env.wideNav.classList.contains('open'), true);
});

test('a lazily loaded rail closes once its items prove the section is single-page', () => {
    // The extension rail loads after first paint: it restores the stored "open"
    // while still a skeleton, then learns its page count.
    const env = buildEnvironment({singlePage: false, stored: 'true'});
    assert.equal(env.wideNav.classList.contains('open'), true);

    env.wideNav.setAttribute('data-single-page', 'true');
    env.wideNav.emit('microwebstacks:navigation-ready');

    assert.equal(env.wideNav.classList.contains('open'), false);
    assert.equal(env.leftButton.getAttribute('aria-expanded'), 'false');
});
