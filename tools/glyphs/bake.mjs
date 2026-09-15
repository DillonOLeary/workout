#!/usr/bin/env node
// Bakes src/lib/design/glyph-frames.json from athlete.js — the repo's own generator, seeded from two Claude Design projects; `--check` exits 1 unless the JSON matches.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../../src/lib/design/glyph-frames.json', import.meta.url));
const GRID = 31;

// athlete.js attaches to `window`, so this script lends it one.
globalThis.window = globalThis;
await import('./athlete.js');
const A = window.AthleteRig;

const MOTIONS = {
	rep: { seq: A.SEQ, frameMs: A.FRAME_MS, holdMs: 900 },
	breath: { seq: [0, 0.5, 1, 0.5], frameMs: 800, holdMs: 0 },
	still: { seq: [1], frameMs: 0, holdMs: 0 }
};

// A frame is 31 rows of 31 characters, '#' lit; the generator counts rows from the ground up, so grid row r is j = 30 − r.
function frame(masses) {
	const rows = [];
	for (let r = 0; r < GRID; r++) {
		let row = '';
		for (let i = 0; i < GRID; i++) row += A.litAt(masses, i, GRID - 1 - r) ? '#' : '.';
		rows.push(row);
	}
	return rows;
}

const glyphs = {}, byName = {};
for (const ex of A.EXERCISES) {
	const motion = ex.motion ?? 'rep';
	if (!MOTIONS[motion]) throw new Error(`${ex.id}: unknown motion "${motion}"`);
	const frames = MOTIONS[motion].seq.map((d) => frame(A.massesForExercise(ex, d)));
	glyphs[ex.id] = { name: ex.name, aliases: ex.aliases || [], cue: ex.cue, motion, frames };
	byName[ex.name] = ex.id;
	for (const alias of ex.aliases || []) byName[alias] = ex.id;
}

const json = JSON.stringify({
	version: 4,
	grid: GRID,
	motions: MOTIONS,
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
	const n = Object.values(glyphs).reduce((acc, g) => ((acc[g.motion] = (acc[g.motion] ?? 0) + 1), acc), {});
	console.log(`wrote ${OUT}: ${Object.keys(glyphs).length} glyphs (${Object.entries(n).map(([m, c]) => `${c} ${m}`).join(', ')})`);
}
