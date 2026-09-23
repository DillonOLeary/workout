import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SHIPPED_PLANS } from '$lib/domain/plans';
import { planExercises } from '$lib/domain/plan';
import {
	EXERCISES, GRID, HOP_FRAMES, MOTIONS, STAND, TURN_FRAMES, WAYPOINTS, dissolve, figureFor, frame, frameFor, hopStamps,
	joints, lerp, normalize, restDepth, route, stand, viewOf, waypointOf, type Frame
} from './rig';

const lit = (f: Frame) => f.join('').split('#').length - 1;
const fig = (name: string) => figureFor(name)!;

describe('the rig', () => {
	it('every exercise and every named warm-up or cooldown line of every shipped plan has a figure — the run included', () => {
		for (const plan of SHIPPED_PLANS) {
			for (const ex of planExercises(plan)) expect(figureFor(ex.name), ex.name).not.toBeNull();
			const lines = [...(plan.warmup ?? []), ...(plan.cooldown ?? []), ...Object.values(plan.routineInfo).flatMap((r) => [...(r.warmup ?? []), ...(r.cooldown ?? [])])];
			for (const it of lines) if (typeof it !== 'string') expect(figureFor(it.name), it.name).not.toBeNull();
		}
	});

	it('normalize fills both legs and both arms and places every joint, so any two poses lerp', () => {
		for (const ex of EXERCISES) {
			const J = normalize(ex.pose(0));
			expect(J.legs, ex.id).toHaveLength(2);
			expect(J.arms, ex.id).toHaveLength(2);
			for (const l of J.legs) expect(l.knee.every(Number.isFinite) && l.ank.every(Number.isFinite)).toBe(true);
			for (const a of J.arms) expect(a.el.every(Number.isFinite) && a.hd.every(Number.isFinite)).toBe(true);
		}
		const one = normalize({ hip: [0, 0.6], legs: [{ ank: [0, 0.06] }], arms: [{ hand: [0.1, 0.5] }] });
		expect(one.legs[1].ank).toEqual(one.legs[0].ank);
		expect(one.arms[1].hd).toEqual(one.arms[0].hd);
	});

	it('lerp is the endpoints at 0 and 1 and halfway between at ½; the view and the world switch halfway', () => {
		const A = joints(fig('Goblet Squat'), 0), B = joints(fig('Warrior II'), 0);
		expect(lerp(A, B, 0)).toEqual({ ...A, view: A.view });
		expect(lerp(A, B, 1)).toEqual(B);
		const M = lerp(A, B, 0.5);
		expect(M.hip[1]).toBeCloseTo((A.hip[1] + B.hip[1]) / 2);
		expect(lerp(A, B, 0.49).view).toBe('side');
		expect(M.view).toBe('front');
		expect(lerp(A, B, 0.49).world).toBe(A.world);
	});

	it('every stamp is 31 rows of 31 dots, on or off, and prints; a rep moves, a breath rises, a still is one frame', () => {
		for (const ex of EXERCISES) {
			const motion = ex.motion ?? 'rep';
			const frames = MOTIONS[motion].seq.map((d) => frameFor(ex, d));
			for (const [k, f] of frames.entries()) {
				expect(f.length, `${ex.id}@${k} rows`).toBe(GRID);
				for (const row of f) expect(row, `${ex.id}@${k}`).toMatch(/^[#.]{31}$/);
				expect(lit(f), `${ex.id}@${k} dots`).toBeGreaterThan(40);
			}
			if (motion === 'still') expect(frames, ex.id).toHaveLength(1);
			else expect(frames[MOTIONS[motion].seq.indexOf(1)], ex.id).not.toEqual(frames[0]);
		}
	});

	it('the figures stand on one floor: feet on the bottom rows whatever the pose', () => {
		for (const name of ['Goblet Squat', 'Calf stretch', 'Low Lunge', 'Warrior II', 'Easy jog', STAND]) {
			const f = frameFor(fig(name), restDepth(fig(name)));
			expect(f.slice(-2).some((row) => row.includes('#')), name).toBe(true);
		}
	});

	it('a waypoint is declared or stand; the waypoint poses and both stands are drawable', () => {
		for (const ex of EXERCISES) expect(['stand', 'kneel', 'sit', 'back']).toContain(waypointOf(ex));
		expect(waypointOf(fig('Low Lunge'))).toBe('kneel');
		expect(waypointOf(fig('Seated Forward Fold'))).toBe('sit');
		expect(waypointOf(fig('Savasana'))).toBe('back');
		expect(waypointOf(fig('Goblet Squat'))).toBe('stand');
		for (const P of [...Object.values(WAYPOINTS), stand('side'), stand('front')]) expect(lit(frame(normalize(P)))).toBeGreaterThan(40);
	});

	it('the route: EXIT to the waypoint and the stand, TURN when the view changes, ENTER through the new waypoint', () => {
		const labels = (a: string, b: string) => route(fig(a), fig(b)).map((h) => h.label);
		expect(labels(STAND, 'Goblet Squat')).toEqual(['ENTER · → Goblet Squat']);
		expect(labels('Goblet Squat', STAND)).toEqual(['EXIT · → stand']);
		expect(labels(STAND, STAND)).toEqual([]);
		expect(labels('Low Lunge', 'Half Splits')).toEqual(['EXIT · Low Lunge → kneel', 'ENTER · → Half Splits']);
		expect(labels('Low Lunge', 'Savasana')).toEqual(['EXIT · Low Lunge → kneel', 'EXIT · → stand', 'ENTER · stand → back', 'ENTER · → Savasana']);
		expect(labels('Low Lunge', 'Warrior II')).toEqual(['EXIT · Low Lunge → kneel', 'EXIT · → stand', 'TURN', 'ENTER · → Warrior II']);
		expect(viewOf(fig('Warrior II'))).toBe('front');
		expect(route(fig('Warrior II'), fig('Cow-Face Arms')).map((h) => h.label)).toEqual(['EXIT · → stand', 'ENTER · → Cow-Face Arms']);
	});

	it('a route starts from wherever the body is, and a hop is six stamps ending on the pose', () => {
		const mid = lerp(joints(fig('Goblet Squat'), 0), joints(fig('Goblet Squat'), 1), 0.5);
		const hops = route(fig('Goblet Squat'), fig(STAND), mid);
		expect(hops[0].a).toBe(mid);
		const stamps = hopStamps(hops[0]);
		expect(stamps).toHaveLength(HOP_FRAMES);
		expect(stamps[HOP_FRAMES - 1].J).toEqual(hops[0].b);
		expect(stamps[HOP_FRAMES - 1].frame()).toEqual(frame(hops[0].b));
	});

	it('a turn dissolves one frame into the other over four stamps, the same way every time', () => {
		const turn = route(fig(STAND), fig('Warrior II')).find((h) => h.turn)!;
		const stamps = hopStamps(turn);
		expect(stamps).toHaveLength(TURN_FRAMES);
		const a = frame(turn.a), b = frame(turn.b);
		expect(dissolve(a, b, 0)).toEqual(a);
		expect(dissolve(a, b, 1)).toEqual(b);
		expect(stamps[1].frame()).toEqual(stamps[1].frame());
	});

	it('the reviewed snapshot is what the rig draws', () => {
		const bake = fileURLToPath(new URL('../../../tools/glyphs/bake.mjs', import.meta.url));
		expect(() => execFileSync(process.execPath, [bake, '--check'], { stdio: 'pipe' })).not.toThrow();
	});
});
