#!/usr/bin/env node
/**
 * Bake the exercise glyphs: src/lib/design/glyph-frames.json from the generator.
 *
 *   node tools/glyphs/bake.mjs          # rewrite the JSON
 *   node tools/glyphs/bake.mjs --check  # exit 1 unless the JSON is what the generator makes
 *
 * glyphs.js (grid constants), rig.js (the angle tables) and athlete.js (the
 * rig, the poses, the shading) are Claude Design's, copied verbatim from the
 * "Workout app design review" project — see its HANDOFF.md. They attach to
 * `window`, so this script lends them one. To change a figure, edit a pose in
 * athlete.js (or re-import all three) and bake; the app runs none of this
 * geometry, it only stamps the frames.
 *
 * A frame is 31 rows of 31 characters, top row first, '#' lit. The generator
 * counts rows from the ground up (j), so grid row r is j = 30 − r.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../../src/lib/design/glyph-frames.json', import.meta.url));
const GRID = 31;
/** frame 0 is held this long after the rep, before the cycle repeats */
const HOLD_MS = 900;

globalThis.window = globalThis;
await import('./glyphs.js');
await import('./rig.js');
await import('./athlete.js');
const G = window.LedgerGlyphs, A = window.AthleteRig;
const shaded = A.STYLES.find((s) => s.id === 'shaded');

function frame(ex, masses, k) {
	const rows = [];
	for (let r = 0; r < GRID; r++) {
		let row = '';
		for (let i = 0; i < GRID; i++) row += A.litAt(shaded, ex, masses, i, GRID - 1 - r, k) ? '#' : '.';
		rows.push(row);
	}
	return rows;
}

const glyphs = {}, byName = {};
for (const ex of A.EXERCISES) {
	const frames = G.SEQ.map((d, k) => frame(ex, A.massesForExercise(ex, d), k));
	glyphs[ex.id] = { name: ex.name, aliases: ex.aliases || [], cue: ex.cue, frames };
	byName[ex.name] = ex.id;
	for (const alias of ex.aliases || []) byName[alias] = ex.id;
}

const json = JSON.stringify({
	version: 3,
	grid: GRID,
	frameMs: G.FRAME_MS,
	holdMs: HOLD_MS,
	seq: G.SEQ,
	rows: 'top row first; "#" = lit dot, "." = unlit; column 0 is the left edge; the ground is the bottom row',
	glyphs,
	byName
});

if (process.argv.includes('--check')) {
	if (readFileSync(OUT, 'utf8') !== json) {
		console.error('glyph-frames.json is not what the generator bakes — run: node tools/glyphs/bake.mjs');
		process.exit(1);
	}
	console.log('glyph-frames.json is what the generator bakes');
} else {
	writeFileSync(OUT, json);
	console.log(`wrote ${OUT}: ${Object.keys(glyphs).length} glyphs × ${G.SEQ.length} frames`);
}
