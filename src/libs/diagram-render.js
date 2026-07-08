/*
 * Shared Kroki diagram rendering, usable from both the build script
 * (scripts/diagrams.js) and the Astro runtime (endpoints/components).
 */
import {config} from '../../config.js';

const diagramConfig = config.diagram ?? {};
const languageAliases = diagramConfig.aliases ?? {puml: 'plantuml', mmd: 'mermaid'};

function normalizeDiagramLanguage(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) {
        return '';
    }
    const trimmed = normalized.startsWith('.') ? normalized.slice(1) : normalized;
    return languageAliases[trimmed] ?? trimmed;
}

function resolveRendererName(language) {
    return (diagramConfig.languages ?? {})[language] ?? diagramConfig.default_renderer;
}

/*
 * PlantUML theme palettes. Kroki renders server-side and cannot read CSS
 * variables, so these hex values mirror the --plantuml-* tokens in
 * src/layout/colors.css — keep both sides in sync.
 */
const PLANTUML_THEME_COLORS = {
    dark: {
        surface: '#252526', // --plantuml-surface-bg
        ink: '#CCCCCC', // --plantuml-ink-color
        line: '#888888', // --plantuml-line-color
        panel: '#2D2D2D', // --plantuml-panel-bg
        note: '#444551' // --plantuml-note-bg
    },
    light: {
        surface: '#FFFFFF',
        ink: '#24292F',
        line: '#6B6B6B',
        panel: '#ECECEC',
        note: '#E8E8F6'
    }
};

// Elements that get the panel background + line border + ink text treatment.
// PlantUML silently ignores skinparam keys a given diagram type does not use.
const PLANTUML_PANEL_ELEMENTS = [
    'Actor', 'Participant', 'SequenceBox', 'SequenceGroup',
    'Activity', 'ActivityDiamond', 'Partition',
    'State', 'Class', 'Object', 'Component', 'Interface', 'Usecase',
    'Rectangle', 'Database', 'Queue', 'Node', 'Package', 'Frame',
    'Folder', 'Cloud', 'Card', 'Agent', 'Boundary', 'Control', 'Entity',
    'Collections', 'Legend'
];

function buildPlantumlThemeHeader({surface, ink, line, panel, note}) {
    const lines = [
        // A literal hex color (not "transparent") is required here: PlantUML/Kroki
        // only emits an inline `background:<color>` style on the root <svg> when
        // given a solid color. Browsers render <object>-embedded SVG documents on
        // their own opaque white canvas by default (unlike <img>, which respects
        // alpha) — "transparent" produces no such style, so the page's CSS behind
        // the <object> never shows through and the diagram silently stays white.
        `skinparam backgroundColor ${surface}`,
        'skinparam shadowing false',
        `skinparam defaultFontColor ${ink}`,
        `skinparam TitleFontColor ${ink}`,
        `skinparam ArrowColor ${line}`,
        `skinparam ArrowFontColor ${ink}`,
        `skinparam SequenceLifeLineBorderColor ${line}`,
        `skinparam SequenceDividerBackgroundColor ${panel}`,
        `skinparam SequenceDividerBorderColor ${line}`,
        `skinparam NoteBackgroundColor ${note}`,
        `skinparam NoteBorderColor ${line}`,
        `skinparam NoteFontColor ${ink}`
    ];
    for (const element of PLANTUML_PANEL_ELEMENTS) {
        lines.push(`skinparam ${element}BackgroundColor ${panel}`);
        lines.push(`skinparam ${element}BorderColor ${line}`);
        lines.push(`skinparam ${element}FontColor ${ink}`);
    }
    return lines.join('\n');
}

const PLANTUML_THEME_HEADER = {
    dark: buildPlantumlThemeHeader(PLANTUML_THEME_COLORS.dark),
    light: buildPlantumlThemeHeader(PLANTUML_THEME_COLORS.light)
};

function injectPlantumlTheme(code, theme) {
    const header = PLANTUML_THEME_HEADER[theme];
    if (!header) {
        return code;
    }
    const source = String(code ?? '');
    const match = source.match(/^@start\w+.*$/m);
    if (!match) {
        return `${header}\n${source}`;
    }
    const insertAt = match.index + match[0].length;
    return `${source.slice(0, insertAt)}\n${header}${source.slice(insertAt)}`;
}

async function renderKrokiDiagram(language, code, theme) {
    const rendererName = resolveRendererName(language);
    const renderer = diagramConfig.renderers?.[rendererName];
    const server = renderer?.server ?? renderer?.base_url ?? config.kroki_server;
    if (!server) {
        throw new Error(`No diagram renderer server configured for ${language}`);
    }
    const body = language === 'plantuml' ? injectPlantumlTheme(code, theme) : code;
    const serverUrl = String(server).replace(/\/+$/, '');
    const response = await fetch(`${serverUrl}/${language}/svg/`, {
        method: 'POST',
        body,
        headers: {'Content-Type': 'text/plain'}
    });
    if (!response.ok) {
        throw new Error(`${rendererName ?? 'diagram'} render failed (${response.status})`);
    }
    return response.text();
}

export {
    normalizeDiagramLanguage,
    resolveRendererName,
    PLANTUML_THEME_HEADER,
    injectPlantumlTheme,
    renderKrokiDiagram
};
