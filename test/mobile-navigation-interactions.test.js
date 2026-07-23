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

    contains(element) {
        return element === this.link;
    }

    focus() {}
}

test('mobile navigation link closes the drawer and persists closed state', () => {
    const body = new Element('body');
    const mobileWrapper = new Element('mobile-nav');
    const tocWrapper = new Element('toc-nav-div');
    const mobileNav = new Element('mobile-pages', ['pages_menu', 'closed']);
    const tocNav = new Element('mobile-toc', ['toc_menu', 'closed']);
    const leftButton = new Element('nav-toggle-left');
    const rightButton = new Element('nav-toggle-right');
    const backdrop = new Element('mobile-nav-backdrop');
    mobileNav.attributes.set('data-state-key', 'pages-scope');
    tocNav.attributes.set('data-state-key', 'toc-scope');
    mobileNav.attributes.set('data-width', '20vw');
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
            if(selector === '#wide-nav nav.pages_menu') return null;
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

    const source = readFileSync(
        new URL('../src/layout/menu_interactions_activation.js', import.meta.url),
        'utf8'
    );
    vm.runInNewContext(source, {
        CustomEvent: class {},
        document,
        localStorage,
        window: {matchMedia: () => ({matches: true})}
    });
    documentListeners.get('DOMContentLoaded')();

    leftButton.emit('click', {preventDefault() {}});
    assert.equal(mobileWrapper.classList.contains('mobile-open'), true);
    assert.equal(body.classList.contains('mobile-nav-open'), true);

    mobileNav.emit('click', {target: link});
    assert.equal(mobileWrapper.classList.contains('mobile-open'), false);
    assert.equal(body.classList.contains('mobile-nav-open'), false);
    assert.equal(leftButton.getAttribute('aria-expanded'), 'false');
    assert.equal(storage.get('pages-scope:mobile_left_open:open'), 'false');
});
