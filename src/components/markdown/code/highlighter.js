import {config} from '@/config.js'
import { log_debug } from '@/libs/utils';
import {bundledLanguages, createHighlighter} from 'shiki';

const highlighter = await createHighlighter({
    themes:[config.highlighter.theme],
    langs:config.highlighter.langs,
})
await highlighter.loadTheme(config.highlighter.theme)

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
    
    const html = highlighter.codeToHtml(code, { lang: lang, theme:config.highlighter.theme })
    return html
}

export{
    codeToHtml
}
