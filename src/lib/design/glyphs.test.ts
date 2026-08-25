import { describe, expect, it } from 'vitest';
import { DEFAULT_PLANS } from '$lib/domain/plans';
import { GRID_STEP, POSES, POSE_BY_NAME, SEQ, poseFor, prints } from './glyphs';
import type { Pose } from './glyphs';

/** which grid cells print — the same walk the canvas does, minus the canvas */
function stamp(p: Pose): Set<string> {
	const [x0, x1, yt] = p.box;
	const out = new Set<string>();
	let i = 0;
	for (let gx = x0; gx <= x1 + 1e-6; gx += GRID_STEP, i++) {
		let j = 0;
		for (let gy = 0; gy <= yt + 1e-6; gy += GRID_STEP, j++) if (prints(p, gx, gy)) out.add(`${i},${j}`);
	}
	return out;
}

describe('exercise glyphs', () => {
	it('every lifting-plan exercise has a pose; the yoga plan has none', () => {
		for (const plan of DEFAULT_PLANS) {
			for (const ex of Object.values(plan.days).flat()) {
				if (plan.id === 'yoga-2day-v1') expect(poseFor(ex.name), ex.name).toBeNull();
				else expect(poseFor(ex.name), ex.name).not.toBeNull();
			}
		}
	});

	it('an unknown name gets nothing — never a stand-in', () => {
		expect(poseFor('Zercher Squat')).toBeNull();
		expect(poseFor('')).toBeNull();
	});

	it('every mapped key is a real pose', () => {
		for (const key of Object.values(POSE_BY_NAME)) expect(POSES[key], key).toBeTypeOf('function');
	});

	it('every pose prints at every frame, and stays in its box', () => {
		for (const [key, fn] of Object.entries(POSES)) {
			for (const d of SEQ) {
				const p = fn(d);
				const [x0, x1, yt] = p.box;
				for (const s of p.segs) {
					for (const n of s) expect(Number.isFinite(n), `${key}@${d}`).toBe(true);
					for (const x of [s[0], s[2]]) expect(x, `${key}@${d} x`).toBeGreaterThanOrEqual(x0 - 0.1);
					for (const x of [s[0], s[2]]) expect(x, `${key}@${d} x`).toBeLessThanOrEqual(x1 + 0.1);
					for (const y of [s[1], s[3]]) expect(y, `${key}@${d} y`).toBeGreaterThanOrEqual(-0.1);
					for (const y of [s[1], s[3]]) expect(y, `${key}@${d} y`).toBeLessThanOrEqual(yt + 0.1);
				}
				for (const c of p.circs) for (const n of c) expect(Number.isFinite(n), `${key}@${d}`).toBe(true);
				expect(stamp(p).size, `${key}@${d} dots`).toBeGreaterThan(40);
			}
		}
	});

	it('a rep moves: the working frame prints differently from rest', () => {
		for (const [key, fn] of Object.entries(POSES)) {
			const rest = stamp(fn(SEQ[0])), deep = stamp(fn(SEQ[3]));
			let diff = 0;
			for (const c of deep) if (!rest.has(c)) diff++;
			for (const c of rest) if (!deep.has(c)) diff++;
			expect(diff, key).toBeGreaterThan(0);
		}
	});
});
