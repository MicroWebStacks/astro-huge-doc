/* Shared renderer routing and Kroki compatibility path. */
import {config} from '../../config.js';
import {PLANTUML_THEME_HEADER, injectPlantumlTheme} from './plantuml-theme.js';

const diagramConfig = config.diagram ?? {};
const languageAliases = diagramConfig.aliases ?? {puml: 'plantuml', mmd: 'mermaid'};

function normalizeDiagramLanguage(value) {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) return '';
    const trimmed = normalized.startsWith('.') ? normalized.slice(1) : normalized;
    return languageAliases[trimmed] ?? trimmed;
}

function resolveRendererName(language) {
    return (diagramConfig.languages ?? {})[language] ?? diagramConfig.default_renderer;
}

async function renderKrokiDiagram(language, code, theme) {
    const rendererName = resolveRendererName(language);
    const renderer = diagramConfig.renderers?.[rendererName];
    const server = renderer?.server ?? renderer?.base_url ?? config.kroki_server;
    if (!server) throw new Error(`No diagram renderer server configured for ${language}`);
    const body = language === 'plantuml' ? injectPlantumlTheme(code, theme) : code;
    const serverUrl = String(server).replace(/\/+$/, '');
    const response = await fetch(`${serverUrl}/${language}/svg/`, {
        method: 'POST',
        body,
        headers: {'Content-Type': 'text/plain'}
    });
    if (!response.ok) throw new Error(`${rendererName ?? 'diagram'} render failed (${response.status})`);
    return response.text();
}

export {
    normalizeDiagramLanguage,
    resolveRendererName,
    PLANTUML_THEME_HEADER,
    injectPlantumlTheme,
    renderKrokiDiagram
};
