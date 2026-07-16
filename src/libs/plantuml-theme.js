/* Browser-safe source of truth shared by client and Kroki PlantUML paths. */
const PLANTUML_THEME_COLORS = {
    dark: {surface: '#252526', ink: '#CCCCCC', line: '#888888', panel: '#2D2D2D', note: '#444551'},
    light: {surface: '#FFFFFF', ink: '#24292F', line: '#6B6B6B', panel: '#ECECEC', note: '#E8E8F6'}
};

const PLANTUML_PANEL_ELEMENTS = [
    'Actor', 'Participant', 'SequenceBox', 'SequenceGroup', 'Activity',
    'ActivityDiamond', 'Partition', 'State', 'Class', 'Object', 'Component',
    'Interface', 'Usecase', 'Rectangle', 'Database', 'Queue', 'Node', 'Package',
    'Frame', 'Folder', 'Cloud', 'Card', 'Agent', 'Boundary', 'Control', 'Entity',
    'Collections', 'Legend', 'Storage', 'Artifact', 'File', 'Stack', 'Hexagon',
    'Person'
];

function buildPlantumlThemeHeader({surface, ink, line, panel, note}) {
    const lines = [
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
        /* "automatic" resolves to black or white against the box the text
         * actually sits on, so authors' explicit element colors (e.g.
         * `rectangle Foo #LightBlue`) stay readable in both themes instead
         * of inheriting a fixed ink that only suits the themed panel. */
        'skinparam NoteFontColor automatic',
        'skinparam ClassAttributeFontColor automatic',
        'skinparam ObjectAttributeFontColor automatic'
    ];
    for (const element of PLANTUML_PANEL_ELEMENTS) {
        lines.push(`skinparam ${element}BackgroundColor ${panel}`);
        lines.push(`skinparam ${element}BorderColor ${line}`);
        lines.push(`skinparam ${element}FontColor automatic`);
    }
    return lines.join('\n');
}

const PLANTUML_THEME_HEADER = {
    dark: buildPlantumlThemeHeader(PLANTUML_THEME_COLORS.dark),
    light: buildPlantumlThemeHeader(PLANTUML_THEME_COLORS.light)
};

function injectPlantumlTheme(code, theme) {
    const header = PLANTUML_THEME_HEADER[theme];
    if (!header) return code;
    const source = String(code ?? '');
    const match = source.match(/^@start\w+.*$/m);
    if (!match) return `${header}\n${source}`;
    const insertAt = match.index + match[0].length;
    return `${source.slice(0, insertAt)}\n${header}${source.slice(insertAt)}`;
}

export {PLANTUML_THEME_COLORS, PLANTUML_THEME_HEADER, injectPlantumlTheme};
