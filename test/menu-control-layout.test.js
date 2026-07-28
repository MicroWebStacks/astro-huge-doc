import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..');
const layoutSource = readFileSync(join(root, 'src/layout/Layout.astro'), 'utf8');
const sideMenuSource = readFileSync(join(root, 'src/layout/SideMenu.astro'), 'utf8');
const lazyMenuSource = readFileSync(join(root, 'src/layout/lazy_navigation.css'), 'utf8');

test('Pages depth controls stay left-anchored while the right edge is clipped', () => {
    assert.match(
        sideMenuSource,
        /\.depth-controls\s*\{[^}]*justify-content:\s*flex-start;[^}]*overflow:\s*hidden;/s
    );
    assert.match(
        lazyMenuSource,
        /nav\.pages_menu\[data-lazy-navigation\] \.depth-controls\s*\{[^}]*justify-content:\s*flex-start;[^}]*overflow:\s*hidden;/s
    );
});

test('depth buttons keep stable widths as the Pages pane is resized', () => {
    assert.match(sideMenuSource, /\.depth-btn\s*\{[^}]*flex:\s*0 0 auto;/s);
    assert.match(
        lazyMenuSource,
        /nav\.pages_menu\[data-lazy-navigation\] \.depth-btn\s*\{[^}]*flex:\s*0 0 auto;/s
    );
});

test('On this page depth controls remain centered', () => {
    assert.match(
        sideMenuSource,
        /nav\.toc_menu \.depth-controls\s*\{\s*justify-content:\s*center;/s
    );
});

test('desktop sidebar wrappers share the same non-shrinking flex contract', () => {
    assert.match(
        layoutSource,
        /#wide-nav\s*\{[^}]*flex-grow:\s*0;[^}]*flex-shrink:\s*0;[^}]*overflow:\s*hidden;/s
    );
    assert.match(
        layoutSource,
        /#toc-nav-div\s*\{[^}]*flex-grow:\s*0;[^}]*flex-shrink:\s*0;[^}]*overflow:\s*hidden;/s
    );
});

test('resize handles retain their width and suppress selection during a drag', () => {
    assert.match(
        layoutSource,
        /\.nav-resize\s*\{[^}]*flex:\s*0 0 1px;[^}]*touch-action:\s*none;[^}]*user-select:\s*none;/s
    );
    assert.match(
        layoutSource,
        /body\.nav-resizing[^}]*user-select:\s*none !important;[^}]*cursor:\s*col-resize !important;/s
    );
});
