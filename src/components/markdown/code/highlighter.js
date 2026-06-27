import {config} from '@/config.js'
import { log_debug } from '@/libs/utils';
import {bundledLanguages, createHighlighter} from 'shiki';

// Dual-theme highlighting: Shiki emits both light and dark token colors as
// CSS variables (--shiki-light / --shiki-dark). The active palette is picked
// in CSS based on the <html data-theme> attribute (see Highlighter.astro),
// so code blocks follow the light/dark toggle without re-rendering.
const themes = config.highlighter.themes ?? {
    dark: config.highlighter.theme ?? 'dark-plus',
    light: config.highlighter.light_theme ?? 'light-plus'
}
const themeList = [...new Set(Object.values(themes))]

const highlighter = await createHighlighter({
    themes: themeList,
    langs: config.highlighter.langs,
})
for (const theme of themeList) {
    await highlighter.loadTheme(theme)
}

async function codeToHtml(code, highlighter_config){
    const requested_language = highlighter_config.lang
    let lang = requested_language
    if (    !highlighter.getLoadedLanguages().includes(lang) &&
            Object.keys(bundledLanguages).includes(requested_language)) {
                await highlighter.loadLanguage(lang)
    }
    if( (requested_language!= "text") &&
        !Object.keys(bundledLanguages).includes(requested_language)){
        log_debug(`  highlighter> (X) '${requested_language}' is not available, fall back on 'js'`)
        lang = 'js'
    }

    const html = highlighter.codeToHtml(code, { lang: lang, themes, defaultColor: false })
    return html
}

export{
    codeToHtml
}
