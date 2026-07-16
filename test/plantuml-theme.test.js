import test from 'node:test';
import assert from 'node:assert/strict';
import {PLANTUML_THEME_HEADER, injectPlantumlTheme} from '../src/libs/plantuml-theme.js';

/*
 * Guards the readability contract for author-colored elements: every themed
 * element must use `FontColor automatic` (contrast-picked against the box the
 * text sits on) instead of the fixed theme ink. A fixed light ink on an
 * author-supplied light box (`rectangle Foo #LightBlue`) is unreadable in
 * dark mode; the mirror problem exists in light mode with dark boxes.
 */
test('element font colors are automatic so explicit author colors stay readable', () => {
    for (const theme of ['dark', 'light']) {
        const header = PLANTUML_THEME_HEADER[theme];
        for (const line of header.split('\n')) {
            const match = line.match(/^skinparam (\w*FontColor) (\S+)$/);
            if (!match) continue;
            const [, name, value] = match;
            // Text drawn on the page background keeps the theme ink;
            // text drawn inside element boxes must contrast automatically.
            const pageLevel = ['defaultFontColor', 'TitleFontColor', 'ArrowFontColor'];
            if (pageLevel.includes(name)) {
                assert.notEqual(value, 'automatic', `${theme}: ${name} sits on the page background`);
            } else {
                assert.equal(value, 'automatic', `${theme}: ${name} must be automatic`);
            }
        }
        assert.match(header, /skinparam RectangleFontColor automatic/);
        assert.match(header, /skinparam NoteFontColor automatic/);
    }
});

test('theme header lands after the @start directive', () => {
    const themed = injectPlantumlTheme('@startuml\nA -> B\n@enduml', 'dark');
    assert.match(themed, /^@startuml\nskinparam backgroundColor/);
    const unmarked = injectPlantumlTheme('A -> B', 'dark');
    assert.match(unmarked, /^skinparam backgroundColor/);
});
