import matter from 'gray-matter';
import yaml from 'js-yaml';

// Metadata errors must never make the Markdown body disappear. Recover fields
// that ended before the YAML parser's error location when that prefix is safe.
function parseMarkdownFrontmatter(markdownText, filePath){
    try{
        return matter(markdownText)
    }catch(error){
        const block = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(markdownText)
        if(!block){
            console.warn(`(!) malformed YAML front matter in '${filePath}'; rendering source as Markdown: ${error.message}`)
            return {data:{}, content:markdownText}
        }
        const lines = block[1].split(/\r?\n/)
        // gray-matter reports the opening delimiter as line 1; the YAML block
        // starts one line later, and the failing line itself is excluded.
        const errorLine = Number.isInteger(error?.mark?.line) ? Math.max(0, error.mark.line - 1) : lines.length
        let data = {}
        try{
            const recovered = yaml.load(lines.slice(0, errorLine).join('\n'))
            if(recovered && typeof recovered === 'object' && !Array.isArray(recovered)){
                data = recovered
            }
        }catch(_recoveryError){
            // No safe prefix was parseable; the body still renders below.
        }
        console.warn(`(!) malformed YAML front matter in '${filePath}'; recovered ${Object.keys(data).length} field(s) and rendered its body: ${error.message}`)
        return {data, content:markdownText.slice(block[0].length)}
    }
}

export {parseMarkdownFrontmatter};
