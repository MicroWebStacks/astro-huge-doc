import matter from 'gray-matter';

// Front matter belongs to document content, not to the collector's control
// plane. A malformed YAML block must therefore not prevent every other
// document from being collected (or leave an extension preview blank).
// Preserve the complete source so downstream Markdown rendering can show the
// original file, and make the affected path visible in the collector output.
function parseMarkdownFrontmatter(markdownText, filePath){
    try{
        return matter(markdownText)
    }catch(error){
        console.warn(`(!) malformed YAML front matter in '${filePath}'; rendering the source unchanged: ${error.message}`)
        return {data:{}, content:markdownText}
    }
}

export {parseMarkdownFrontmatter};
