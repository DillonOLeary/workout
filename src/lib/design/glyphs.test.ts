import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLANS } from '$lib/domain/plans';
import data from './glyph-frames.json';
import { CYCLE_MS, FRAME_MS, FRAMES, GRID, HOLD_MS, REP_MS, WORK, frameAt, framesFor } from './glyphs';
import type { Frame } from './glyphs';

const glyphs: Record<string, { frames: Frame[] }> = data.glyphs;
const byName: Record<string, string> = data.byName;
const lit = (f: Frame) => f.join('').split('#').length - 1;

describe('exercise glyphs', () => {
	it('every lifting-plan exercise has frames; the yoga plan has none', () => {
		for (const plan of DEFAULT_PLANS) {
			for (const ex of Object.values(plan.days).flat()) {
				if (plan.id === 'yoga-2day-v1') expect(framesFor(ex.name), ex.name).toBeNull();
				else expect(framesFor(ex.name), ex.name).not.toBeNull();
			}
		}
	});

	it('an unknown name gets nothing — never a stand-in', () => {
		expect(framesFor('Zercher Squat')).toBeNull();
		expect(framesFor('')).toBeNull();
	});

	it('every name maps to a real glyph', () => {
		for (const id of Object.values(byName)) expect(glyphs[id], id).toBeDefined();
	});

	it('the grid and the clock are what the renderer assumes', () => {
		expect(GRID).toBe(31);
		expect(FRAMES).toBe(12);
		expect(FRAME_MS).toBe(130);
		expect(HOLD_MS).toBe(900);
		expect(CYCLE_MS).toBe(2460);
		// the drive: out over frames 0–6 to depth 1, back over 7–11
		expect(WORK).toBe(6);
		for (let k = 1; k <= WORK; k++) expect(data.seq[k], `seq[${k}]`).toBeGreaterThan(data.seq[k - 1]);
		for (let k = WORK + 1; k < FRAMES; k++) expect(data.seq[k], `seq[${k}]`).toBeLessThan(data.seq[k - 1]);
	});

	it('every frame is 31 rows of 31 dots, on or off, and prints', () => {
		for (const [id, g] of Object.entries(glyphs)) {
			expect(g.frames.length, id).toBe(FRAMES);
			for (const [k, f] of g.frames.entries()) {
				expect(f.length, `${id}@${k} rows`).toBe(GRID);
				for (const row of f) expect(row, `${id}@${k}`).toMatch(/^[#.]{31}$/);
				expect(lit(f), `${id}@${k} dots`).toBeGreaterThan(40);
			}
		}
	});

	it('a rep moves: the working frame differs from the still', () => {
		for (const [id, g] of Object.entries(glyphs)) expect(g.frames[WORK], id).not.toEqual(g.frames[0]);
	});

	it('the clock: twelve stamps, a hold on the still, then again', () => {
		expect(frameAt(0)).toBe(0);
		expect(frameAt(FRAME_MS - 1)).toBe(0);
		expect(frameAt(FRAME_MS)).toBe(1);
		expect(frameAt(WORK * FRAME_MS)).toBe(WORK);
		expect(frameAt(REP_MS - 1)).toBe(FRAMES - 1);
		expect(frameAt(REP_MS)).toBe(0);
		expect(frameAt(CYCLE_MS - 1)).toBe(0);
		expect(frameAt(CYCLE_MS)).toBe(0);
		expect(frameAt(CYCLE_MS + FRAME_MS)).toBe(1);
	});

	it('the shipped frames are what the generator bakes', () => {
		const bake = fileURLToPath(new URL('../../../tools/glyphs/bake.mjs', import.meta.url));
		expect(() => execFileSync(process.execPath, [bake, '--check'], { stdio: 'pipe' })).not.toThrow();
	});
});
