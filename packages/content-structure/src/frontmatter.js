import matter from 'gray-matter';

// Front matter belongs to one document, not to the collector's control plane.
// A malformed YAML block must therefore not prevent every other document from
// being collected (or leave an extension preview blank). Return a skip signal
// so callers can omit only the affected document while keeping YAML parsing
// strict and making the path visible in collector output.
function parseMarkdownFrontmatter(markdownText, filePath){
    try{
        return matter(markdownText)
    }catch(error){
        console.warn(`(!) malformed YAML front matter in '${filePath}'; skipping document: ${error.message}`)
        return null
    }
}

export {parseMarkdownFrontmatter};
