#!/usr/bin/env node
/**
 * Bake the exercise glyphs: src/lib/design/glyph-frames.json from the generator.
 *
 *   node tools/glyphs/bake.mjs          # rewrite the JSON
 *   node tools/glyphs/bake.mjs --check  # exit 1 unless the JSON is what the generator makes
 *
 * glyphs.js (grid constants), rig.js (the angle tables) and athlete.js (the
 * rig, the poses, the shading) are Claude Design's, copied from the "Workout
 * app design review" project — see its HANDOFF.md — with the yoga and
 * bodyweight poses pushed in from the later "Yoga and Bodyweight Workouts"
 * project. They attach to `window`, so this script lends them one. To
 * change a figure, edit a pose in athlete.js and bake; the app runs none of
 * this geometry, it only stamps the frames.
 *
 * Every pose names its MOTION, and the JSON carries the timing for each gear
 * so the app's clock takes the gear instead of assuming one:
 *   rep    — twelve stamps out and back along d, then a 900 ms hold on frame 0
 *   breath — four stamps along [0, .5, 1, .5] at 800 ms: the hold, breathing
 *   still  — one stamp at d = 1: the pose, not the standing-up it leans in from
 *
 * A frame is 31 rows of 31 characters, top row first, '#' lit. The generator
 * counts rows from the ground up (j), so grid row r is j = 30 − r.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../../src/lib/design/glyph-frames.json', import.meta.url));
const GRID = 31;

globalThis.window = globalThis;
await import('./glyphs.js');
await import('./rig.js');
await import('./athlete.js');
const G = window.LedgerGlyphs, A = window.AthleteRig;
const shaded = A.STYLES.find((s) => s.id === 'shaded');

/** the three gears: which depths to stamp, and how the clock runs them */
const MOTIONS = {
	rep: { seq: G.SEQ, frameMs: G.FRAME_MS, holdMs: 900 },
	breath: { seq: [0, 0.5, 1, 0.5], frameMs: 800, holdMs: 0 },
	still: { seq: [1], frameMs: 0, holdMs: 0 }
};

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
	const motion = ex.motion ?? 'rep';
	if (!MOTIONS[motion]) throw new Error(`${ex.id}: unknown motion "${motion}"`);
	const frames = MOTIONS[motion].seq.map((d, k) => frame(ex, A.massesForExercise(ex, d), k));
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
