#!/usr/bin/env node
// Snapshots every stamp of the live rig (src/lib/design/rig.ts) to glyph-frames.json — the reviewed figures.
// The app draws from the rig; this file is the check that a pose edit was meant: `--check` exits 1 unless the JSON matches.
// Node strips the rig's types itself, so the generator is the very code the app ships.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EXERCISES, GRID, MOTIONS, frameFor, motionOf, waypointOf } from '../../src/lib/design/rig.ts';

const OUT = fileURLToPath(new URL('./glyph-frames.json', import.meta.url));

const glyphs = {}, byName = {};
for (const ex of EXERCISES) {
	const motion = motionOf(ex);
	const frames = MOTIONS[motion].seq.map((d) => frameFor(ex, d));
	glyphs[ex.id] = { name: ex.name, aliases: ex.aliases ?? [], cue: ex.cue, motion, waypoint: waypointOf(ex), frames };
	byName[ex.name] = ex.id;
	for (const alias of ex.aliases ?? []) byName[alias] = ex.id;
}

const json = JSON.stringify({
	version: 5,
	grid: GRID,
	motions: MOTIONS,
	rows: 'top row first; "#" = lit dot, "." = unlit; column 0 is the left edge; the ground is the bottom row',
	glyphs,
	byName
});

if (process.argv.includes('--check')) {
	if (readFileSync(OUT, 'utf8') !== json) {
		console.error('glyph-frames.json is not what the rig draws — run: node tools/glyphs/bake.mjs');
		process.exit(1);
	}
	console.log('glyph-frames.json is what the rig draws');
} else {
	writeFileSync(OUT, json);
	const n = Object.values(glyphs).reduce((acc, g) => ((acc[g.motion] = (acc[g.motion] ?? 0) + 1), acc), {});
	console.log(`wrote ${OUT}: ${Object.keys(glyphs).length} glyphs (${Object.entries(n).map(([m, c]) => `${c} ${m}`).join(', ')})`);
}
