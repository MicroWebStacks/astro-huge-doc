import {config} from '@/config.js'
import { log_debug } from '@/libs/utils';
import {bundledLanguages, createHighlighter} from 'shiki';
import mermaidGrammarJson from './mermaid.tmLanguage.json?raw';

// Dual-theme highlighting: Shiki emits both light and dark token colors as
// CSS variables (--shiki-light / --shiki-dark). The active palette is picked
// in CSS based on the <html data-theme> attribute (see Highlighter.astro),
// so code blocks follow the light/dark toggle without re-rendering.
const themes = config.highlighter.themes ?? {
    dark: config.highlighter.theme ?? 'dark-plus',
    light: config.highlighter.light_theme ?? 'light-plus'
}
const themeList = [...new Set(Object.values(themes))]
const mermaidGrammar = JSON.parse(mermaidGrammarJson)
const mermaidLanguage = {
    name: 'mermaid',
    ...mermaidGrammar
}
const customLanguages = new Map([
    ['mermaid', mermaidLanguage],
    ['mmd', mermaidLanguage]
])
const configuredLangs = (config.highlighter.langs ?? [])
    .filter((lang) => !customLanguages.has(lang))

const highlighter = await createHighlighter({
    themes: themeList,
    langs: [...configuredLangs, mermaidLanguage],
    langAlias: {
        mmd: 'mermaid'
    }
})
for (const theme of themeList) {
    await highlighter.loadTheme(theme)
}

async function codeToHtml(code, highlighter_config){
    const requested_language = highlighter_config.lang
    let lang = requested_language
    if (!highlighter.getLoadedLanguages().includes(lang)) {
        if (Object.prototype.hasOwnProperty.call(bundledLanguages, requested_language)) {
            await highlighter.loadLanguage(lang)
        } else if (customLanguages.has(requested_language)) {
            await highlighter.loadLanguage(customLanguages.get(requested_language))
        }
    }
    if (
        (requested_language != "text") &&
        !Object.prototype.hasOwnProperty.call(bundledLanguages, requested_language) &&
        !customLanguages.has(requested_language)
    ) {
        log_debug(`  highlighter> (X) '${requested_language}' is not available, fall back on 'text'`)
        lang = 'text'
    }

    const html = highlighter.codeToHtml(code, { lang: lang, themes, defaultColor: false })
    return html
}

export{
    codeToHtml
}
