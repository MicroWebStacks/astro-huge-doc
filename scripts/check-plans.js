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

async function findPacketDirs() {
    const monthDirs = (await readdir(plansDir, {withFileTypes: true}))
        .filter((entry) => entry.isDirectory());
    const packets = [];
    for (const monthDir of monthDirs) {
        const monthPath = join(plansDir, monthDir.name);
        const dayDirs = (await readdir(monthPath, {withFileTypes: true}))
            .filter((entry) => entry.isDirectory());
        for (const dayDir of dayDirs) {
            const packetPath = join(monthPath, dayDir.name);
            const relPath = relative(plansDir, packetPath);
            packets.push({slug: slugFromDir(relPath), path: packetPath});
        }
    }
    return packets;
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
    const packets = await findPacketDirs();
    const openSlugs = await readIndexSlugs('open.md');
    const closedSlugs = await readIndexSlugs('closed.md');
    const problems = [];

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
