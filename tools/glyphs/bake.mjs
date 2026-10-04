#!/usr/bin/env node
// Snapshots every figure of the live rig (src/lib/design/rig.ts) to glyph-frames.json — the reviewed figures.
// The app draws from the rig; this file is the check that a pose edit was meant: `--check` exits 1 unless the JSON matches.
// Node strips the rig's types itself, so the generator is the very code the app ships.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FIGURES, GRID, cameraFor, dotAt, figureFrame, keyGrid, render } from '../../src/lib/design/rig.ts';

const OUT = fileURLToPath(new URL('./glyph-frames.json', import.meta.url));

/** a grid as text: what each dot draws, its ink in ten steps */
function rows(grid) {
	const out = [];
	for (let j = 0; j < grid.N; j++) {
		let row = '';
		for (let i = 0; i < grid.N; i++) {
			const k = grid.kind[j * grid.N + i], v = grid.val[j * grid.N + i], q = Math.min(9, Math.floor(v * 10));
			const { rad, c } = dotAt(grid, i, j, 'halftone');
			row += rad <= 0 ? ' ' : k === 2 ? String(q) : k === 3 ? 'abcdefghij'[q] : k === 4 ? '*' : c === 'floor' ? ',' : k === 1 ? ':' : '.';
		}
		out.push(row);
	}
	return out;
}

const glyphs = {}, byName = {};
for (const f of FIGURES) {
	const start = figureFrame(f, 'ambient', 0, 0, 0);
	glyphs[f.id] = {
		name: f.name, aliases: f.aliases ?? [], group: f.group, kind: f.kind, base: f.base, cue: f.cue,
		...(f.tempo ? { tempo: f.tempo } : {}), ...(f.breath ? { breath: f.breath, hold: f.hold } : {}),
		frames: { key: rows(keyGrid(f)), start: rows(render(start.scene, cameraFor(f), GRID, start.ground)) }
	};
	byName[f.name] = f.id;
	for (const alias of f.aliases ?? []) byName[alias] = f.id;
}

const json = JSON.stringify({
	version: 6,
	grid: GRID,
	rows: 'top row first; key = the pose under reduced motion, start = where a demo begins. "0"–"9" body ink, "a"–"j" a prop or furniture, ":" floor shadow, "," floor, "*" gravel, "." the grid behind',
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
	const n = Object.values(glyphs).reduce((acc, g) => ((acc[g.kind] = (acc[g.kind] ?? 0) + 1), acc), {});
	console.log(`wrote ${OUT}: ${Object.keys(glyphs).length} figures (${Object.entries(n).map(([m, c]) => `${c} ${m}`).join(', ')})`);
}
