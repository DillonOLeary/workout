import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLANS } from '$lib/domain/plans';
import { planExercises } from '$lib/domain/plan';
import data from './glyph-frames.json';
import { GRID, MOTIONS, cycleMs, frameAt, framesFor, glyphFor, motionOf, repMs, workFrame } from './glyphs';
import type { Frame, Glyph, Motion } from './glyphs';

const glyphs = data.glyphs as Record<string, Glyph>;
const byName = data.byName as Record<string, string>;
const lit = (f: Frame) => f.join('').split('#').length - 1;
const gears = Object.keys(MOTIONS) as Motion[];

describe('exercise glyphs', () => {
	it('every exercise of every shipped plan has a figure — the run included', () => {
		for (const plan of DEFAULT_PLANS)
			for (const ex of planExercises(plan)) {
				if (ex.kind === 'run') continue; // the run is a clock, not a figure
				expect(framesFor(ex.name), ex.name).not.toBeNull();
			}
	});

	it('an unknown name gets nothing — never a stand-in', () => {
		expect(framesFor('Zercher Squat')).toBeNull();
		expect(framesFor('')).toBeNull();
		expect(motionOf('')).toBeNull();
	});

	it('every name maps to a real glyph', () => {
		for (const id of Object.values(byName)) expect(glyphs[id], id).toBeDefined();
	});

	it('is the three gears the clock assumes, on the grid the renderer assumes', () => {
		expect(GRID).toBe(31);
		expect(MOTIONS.rep).toMatchObject({ frameMs: 130, holdMs: 900 });
		expect(MOTIONS.rep.seq).toHaveLength(12);
		expect(MOTIONS.breath).toEqual({ seq: [0, 0.5, 1, 0.5], frameMs: 800, holdMs: 0 });
		expect(MOTIONS.still).toEqual({ seq: [1], frameMs: 0, holdMs: 0 });
		// the rep's drive: out over frames 0–6 to depth 1, back over 7–11
		expect(workFrame('rep')).toBe(6);
		for (let k = 1; k <= 6; k++) expect(MOTIONS.rep.seq[k], `seq[${k}]`).toBeGreaterThan(MOTIONS.rep.seq[k - 1]);
		for (let k = 7; k < 12; k++) expect(MOTIONS.rep.seq[k], `seq[${k}]`).toBeLessThan(MOTIONS.rep.seq[k - 1]);
		expect(workFrame('breath')).toBe(2);
		expect(workFrame('still')).toBe(0);
		expect(repMs('rep')).toBe(1560);
		expect(cycleMs('rep')).toBe(2460);
		expect(cycleMs('breath')).toBe(3200);
		expect(cycleMs('still')).toBe(0);
	});

	it('every frame is 31 rows of 31 dots, on or off, and prints; the count follows the gear', () => {
		for (const [id, g] of Object.entries(glyphs)) {
			expect(gears, `${id} motion`).toContain(g.motion);
			expect(g.frames.length, id).toBe(MOTIONS[g.motion].seq.length);
			for (const [k, f] of g.frames.entries()) {
				expect(f.length, `${id}@${k} rows`).toBe(GRID);
				for (const row of f) expect(row, `${id}@${k}`).toMatch(/^[#.]{31}$/);
				expect(lit(f), `${id}@${k} dots`).toBeGreaterThan(40);
			}
		}
	});

	it('a rep moves and a breath rises; a still is one frame', () => {
		for (const [id, g] of Object.entries(glyphs)) {
			if (g.motion === 'still') expect(g.frames, id).toHaveLength(1);
			else expect(g.frames[workFrame(g.motion)], id).not.toEqual(g.frames[0]);
		}
	});

	it('the shipped figures are in the gears the design classified', () => {
		expect(motionOf('Goblet Squat')).toBe('rep');
		expect(['Long-Lever Plank', 'Side Plank', 'Copenhagen Plank', 'Plank', 'Forearm Plank'].map(motionOf)).toEqual(['breath', 'breath', 'breath', 'breath', 'breath']);
		expect(['Calf stretch', 'Hip flexor stretch', 'Hamstring stretch', 'Figure-4 stretch', 'Doorway chest stretch'].map(motionOf)).toEqual(['still', 'still', 'still', 'still', 'still']);
		expect(['Pigeon', 'Sphinx', 'Supine Twist'].map(motionOf)).toEqual(['still', 'still', 'still']);
		expect(['Chair Pose', 'Warrior II', 'Downward Dog', 'Savasana', 'Hollow Hold', 'Superman Hold'].map(motionOf)).toEqual(['breath', 'breath', 'breath', 'breath', 'breath', 'breath']);
		expect(['Push-up', 'Bear Crawl', 'Bodyweight Squat', 'Reverse Lunge', 'Single-leg Calf Raise'].map(motionOf)).toEqual(['rep', 'rep', 'rep', 'rep', 'rep']);
		expect(glyphFor('Bodyweight Squat')?.name).toBe('Goblet Squat'); // one figure per ladder
		expect(Object.keys(glyphs)).toHaveLength(51);
	});

	it('the clock: the pass, a hold on the still, then again — per gear', () => {
		expect(frameAt(0, 'rep')).toBe(0);
		expect(frameAt(129, 'rep')).toBe(0);
		expect(frameAt(130, 'rep')).toBe(1);
		expect(frameAt(6 * 130, 'rep')).toBe(6);
		expect(frameAt(1559, 'rep')).toBe(11);
		expect(frameAt(1560, 'rep')).toBe(0);
		expect(frameAt(2459, 'rep')).toBe(0);
		expect(frameAt(2460, 'rep')).toBe(0);
		expect(frameAt(2460 + 130, 'rep')).toBe(1);
		// a breath has no rest: four frames, round and round
		expect([0, 799, 800, 1600, 2400, 3199, 3200].map((t) => frameAt(t, 'breath'))).toEqual([0, 0, 1, 2, 3, 3, 0]);
		// a still has nowhere to go; a clock before its start reads as its start
		expect(frameAt(12345, 'still')).toBe(0);
		expect(frameAt(-50, 'rep')).toBe(0);
	});

	it('the shipped frames are what the generator bakes', () => {
		const bake = fileURLToPath(new URL('../../../tools/glyphs/bake.mjs', import.meta.url));
		expect(() => execFileSync(process.execPath, [bake, '--check'], { stdio: 'pipe' })).not.toThrow();
	});
});
