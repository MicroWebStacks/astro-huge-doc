import katex from 'katex';

const namedHtmlEntities = new Map([
    ['amp', '&'],
    ['lt', '<'],
    ['gt', '>'],
    ['quot', '"'],
    ['apos', "'"],
    ['nbsp', '\u00A0']
]);

function decodeHtmlEntities(text) {
    return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
        if (entity[0] === '#') {
            const isHex = entity[1]?.toLowerCase() === 'x';
            const value = Number.parseInt(
                entity.slice(isHex ? 2 : 1),
                isHex ? 16 : 10
            );
            return Number.isFinite(value) ? String.fromCodePoint(value) : match;
        }

        return namedHtmlEntities.get(entity.toLowerCase()) ?? match;
    });
}

function renderFormula(source, displayMode) {
    const text = decodeHtmlEntities(String(source ?? '').trim());
    if (!text) {
        return null;
    }
    try {
        return katex.renderToString(text, {
            displayMode,
            output: 'htmlAndMathml',
            throwOnError: false,
            strict: 'warn'
        });
    } catch {
        return null;
    }
}

function findClosingDelimiter(html, startIndex, delimiter) {
    let insideTag = false;
    for (let index = startIndex; index < html.length; index += 1) {
        const char = html[index];
        if (insideTag) {
            if (char === '>') {
                insideTag = false;
            }
            continue;
        }
        if (char === '<') {
            insideTag = true;
            continue;
        }
        if (char === '\\') {
            index += 1;
            continue;
        }
        if (delimiter === '$$') {
            if (char === '$' && html[index + 1] === '$') {
                return index;
            }
            continue;
        }
        if (char === '$' && html[index + 1] !== '$') {
            return index;
        }
    }
    return -1;
}

function replaceMathDelimiters(html) {
    let output = '';
    let index = 0;
    let insideTag = false;

    while (index < html.length) {
        const char = html[index];
        if (insideTag) {
            output += char;
            if (char === '>') {
                insideTag = false;
            }
            index += 1;
            continue;
        }
        if (char === '<') {
            insideTag = true;
            output += char;
            index += 1;
            continue;
        }
        if (char === '\\' && html[index + 1] === '$') {
            output += '$';
            index += 2;
            continue;
        }
        if (char !== '$') {
            output += char;
            index += 1;
            continue;
        }

        const delimiter = html[index + 1] === '$' ? '$$' : '$';
        const closeIndex = findClosingDelimiter(html, index + delimiter.length, delimiter);
        if (closeIndex === -1) {
            output += char;
            index += 1;
            continue;
        }

        const formula = html.slice(index + delimiter.length, closeIndex);
        const rendered = renderFormula(formula, delimiter === '$$');
        if (!rendered) {
            output += html.slice(index, closeIndex + delimiter.length);
            index = closeIndex + delimiter.length;
            continue;
        }

        output += rendered;
        index = closeIndex + delimiter.length;
    }

    return output;
}

function renderMathInHtml(html) {
    const text = String(html ?? '');
    if (!text.includes('$')) {
        return text;
    }
    return replaceMathDelimiters(text);
}

export {
    renderMathInHtml
};
