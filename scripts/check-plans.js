#!/usr/bin/env node
// Cross-checks plans/open.md and plans/closed.md against the Progress marker
// in each packet's implementation.md, so a packet can't silently stay listed
// in the wrong index (see WORKFLOW.md "Plans" / AGENTS.md "Spec And Planning
// Workflow"). Run with `pnpm check:plans`.
import {readdir, readFile, stat} from 'fs/promises';
import {join, relative} from 'path';

const plansDir = new URL('../plans/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function slugFromDir(rootRelativePath) {
    return rootRelativePath.split(/[\\/]/).join('-');
}

function isValidMonth(month) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

function isValidDay(month, day) {
    if (!/^\d{2}$/.test(day)) {
        return false;
    }
    const [year, monthNumber] = month.split('-').map(Number);
    const dayNumber = Number(day);
    const date = new Date(Date.UTC(year, monthNumber - 1, dayNumber));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === monthNumber - 1
        && date.getUTCDate() === dayNumber;
}

async function findPacketDirs() {
    const problems = [];
    const topLevelDirs = (await readdir(plansDir, {withFileTypes: true}))
        .filter((entry) => entry.isDirectory());
    const monthDirs = topLevelDirs.filter((entry) => isValidMonth(entry.name));

    for (const entry of topLevelDirs) {
        if (entry.name !== 'archive' && !isValidMonth(entry.name)) {
            problems.push(`${entry.name}: unexpected plans directory; packets must use YYYY-MM/DD/<slug>/`);
        }
    }

    const packets = [];
    for (const monthDir of monthDirs) {
        const monthPath = join(plansDir, monthDir.name);
        const monthEntries = await readdir(monthPath, {withFileTypes: true});
        const dayDirs = monthEntries.filter((entry) => entry.isDirectory() && isValidDay(monthDir.name, entry.name));

        for (const entry of monthEntries) {
            if (!entry.isDirectory() || !isValidDay(monthDir.name, entry.name)) {
                problems.push(`${monthDir.name}/${entry.name}: invalid day directory; expected YYYY-MM/DD/<slug>/`);
            }
        }

        for (const dayDir of dayDirs) {
            const dayPath = join(monthPath, dayDir.name);
            const dayEntries = await readdir(dayPath, {withFileTypes: true});
            const packetDirs = dayEntries.filter((entry) => entry.isDirectory());

            if (!packetDirs.length) {
                problems.push(`${monthDir.name}/${dayDir.name}: empty day directory; expected at least one packet slug`);
            }

            for (const entry of dayEntries) {
                if (!entry.isDirectory()) {
                    problems.push(`${monthDir.name}/${dayDir.name}/${entry.name}: expected a packet slug directory at this level`);
                }
            }

            for (const packetDir of packetDirs) {
                const packetPath = join(dayPath, packetDir.name);
                const relPath = relative(plansDir, packetPath);
                if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(packetDir.name)) {
                    problems.push(`${relPath}: invalid packet slug; use lowercase letters, numbers, and hyphens`);
                    continue;
                }
                packets.push({slug: slugFromDir(relPath), path: packetPath});
            }
        }
    }
    return {packets, problems};
}

async function readIndexSlugs(indexFile) {
    const text = await readFile(join(plansDir, indexFile), 'utf-8');
    const slugs = new Set();
    for (const match of text.matchAll(/^\|\s*\[([^\]]+)\]/gm)) {
        slugs.add(match[1]);
    }
    return slugs;
}

async function progressStatus(packetPath) {
    const implPath = join(packetPath, 'implementation.md');
    try {
        await stat(implPath);
    } catch {
        return null; // no implementation.md yet: planning-only, not checked here
    }
    const text = await readFile(implPath, 'utf-8');
    // Bracket width tracks each packet's own phase count (e.g. "[####]" for a
    // 4-phase packet, "[######]" for 6) — only "fully filled, no '-'" means
    // done. Matching stray occurrences of the word "done" elsewhere in the
    // line (e.g. "footnotes done; math support next") would false-positive.
    const bracket = text.match(/^\[([#-]+)\]/m);
    if (!bracket) {
        return 'unknown';
    }
    return bracket[1].includes('-') ? 'in-progress' : 'done';
}

async function main() {
    const {packets, problems} = await findPacketDirs();
    const openSlugs = await readIndexSlugs('open.md');
    const closedSlugs = await readIndexSlugs('closed.md');

    for (const packet of packets) {
        const inOpen = openSlugs.has(packet.slug);
        const inClosed = closedSlugs.has(packet.slug);
        const status = await progressStatus(packet.path);

        if (!inOpen && !inClosed) {
            problems.push(`${packet.slug}: not listed in open.md or closed.md`);
            continue;
        }
        if (inOpen && inClosed) {
            problems.push(`${packet.slug}: listed in both open.md and closed.md`);
            continue;
        }
        if (status === 'unknown') {
            problems.push(`${packet.slug}: implementation.md exists but has no "[#{1,6}]" Progress marker as its own line (see WORKFLOW.md "Implementation Log")`);
            continue;
        }
        if (status === 'done' && inOpen) {
            problems.push(`${packet.slug}: implementation.md says Done, but the packet is still in open.md (move its row to closed.md)`);
        }
        if (status === 'in-progress' && inClosed) {
            problems.push(`${packet.slug}: implementation.md is not marked Done, but the packet is listed in closed.md`);
        }
    }

    if (problems.length) {
        console.error('plan index inconsistencies found:\n');
        for (const problem of problems) {
            console.error(`  - ${problem}`);
        }
        console.error('\nSee WORKFLOW.md "Plans" for the open.md/closed.md contract.');
        process.exit(1);
    }
    console.log(`check-plans: ${packets.length} packet(s) checked, open/closed indexes consistent.`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
