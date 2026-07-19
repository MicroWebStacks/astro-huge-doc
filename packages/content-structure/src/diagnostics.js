// Collection-scoped data-consistency diagnostics. The collector resets this
// store at the start of every run; parsers can record findings without
// threading a diagnostics object through the existing collection pipeline.
let diagnostics = [];

function resetDiagnostics() {
    diagnostics = [];
}

function recordDiagnostic(kind, path, message, relatedPath = null) {
    diagnostics.push({
        kind: String(kind ?? ''),
        path: path == null ? null : String(path),
        related_path: relatedPath == null ? null : String(relatedPath),
        message: String(message ?? '')
    });
}

function getDiagnostics() {
    return diagnostics.map((entry) => ({...entry}));
}

export {resetDiagnostics, recordDiagnostic, getDiagnostics};
