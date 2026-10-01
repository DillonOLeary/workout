import { describe, expect, it } from 'vitest';
import { entryKey } from './events';
import {
	estimateMinutes,
	loggedOutside,
	positionLabel,
	restUntil,
	routineExercises,
	runStart,
	sessionProgress,
	sessionSteps,
	type Entry
} from './steps';
import type { Plan } from './plan';

const NOW = Date.parse('2026-08-25T18:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const A = { routine: 'A' };
const S = { routine: 'S' };
const RUN = { routine: 'run' };

const plan: Plan = {
	id: 'p',
	name: 'P',
	schedule: '',
	rest: 60,
	cooldown: ['Stretch A', 'Stretch B'],
	cycles: [
		{ id: 'lift', title: 'Lift', routines: ['A'], target: 3 },
		{ id: 'mob', title: 'Stretch', routines: ['S'], target: 3 },
		{ id: 'run', title: 'Run', routines: ['run'], target: 3 }
	],
	routineInfo: {
		A: { title: 'Day A', discipline: 'lift', warmup: ['Bike 5 min', 'Squats ×10'] },
		S: { title: 'Stretch', discipline: 'mobility', warmup: [], cooldown: [] },
		run: {
			title: 'Easy run',
			discipline: 'run',
			warmup: [{ name: 'Easy jog', minutes: 3 }, { name: 'Carioca', seconds: 30, each: true }],
			cooldown: [{ name: 'Walk', minutes: 3 }]
		}
	},
	routines: {
		A: [
			{ name: 'Goblet Squat', equip: '', tag: '', kind: 'load', sets: 3, lo: 6, hi: 12, progress: { of: 'size', start: 35, inc: 5 } },
			{ name: 'Plank', equip: '', tag: '', kind: 'hold', sets: 2, lo: 10, hi: 20, progress: { of: 'time', inc: 5 }, rest: 30 }
		],
		S: [
			{ name: 'Calf stretch', equip: 'Mat', tag: '', kind: 'hold', sets: 2, lo: 45, hi: 45, progress: { of: 'none' }, side: 'sets', rest: 10 },
			{ name: 'Hip flexor stretch', equip: 'Mat', tag: '', kind: 'hold', sets: 2, lo: 45, hi: 45, progress: { of: 'none' }, side: 'sets', rest: 10 }
		],
		run: [{ name: 'Easy run', equip: 'Shoes', tag: 'Run', kind: 'run', sets: 1, lo: 30, hi: 30, progress: { of: 'none' } }]
	}
};

const entry = (item: string, index: number, at: string, measure: Entry['measure'] = { of: 'step' }): Entry => ({
	session: 's', item, index, at, measure
});

describe('sessionSteps', () => {
	it('walks warm-up, every set, then the cooldown — a rest is a clock, not a step', () => {
		const steps = sessionSteps(plan, A);
		expect(steps.map((s) => s.label)).toEqual([
			'STEP 1', 'STEP 2',
			'SET 1', 'SET 2', 'SET 3',
			'HOLD 1', 'HOLD 2',
			'STEP 1', 'STEP 2'
		]);
		expect(steps.map((s) => s.section)[2]).toBe('Goblet Squat');
		expect(steps[0].key).toBe(entryKey('Warm-up', 1));
		expect(steps[steps.length - 1].key).toBe(entryKey('Cooldown', 2));
		expect(steps.slice(2, 5).map((s) => s.estimate)).toEqual([45, 105, 105]);
		expect(steps.slice(5, 7).map((s) => s.estimate)).toEqual([20, 50]);
	});
	it('makes the run routine warm-up · run · cooldown, timed items counting down once per side', () => {
		const steps = sessionSteps(plan, RUN);
		expect(steps.map((s) => s.label)).toEqual(['STEP 1', 'STEP 2 · L', 'STEP 3 · R', 'RUN', 'STEP 1']);
		expect(steps.map((s) => s.kind)).toEqual(['timed', 'timed', 'timed', 'run', 'timed']);
		expect(steps.map((s) => s.section)).toEqual(['Warm-up', 'Warm-up', 'Warm-up', 'Easy run', 'Cooldown']);
		expect(steps[0]).toMatchObject({ text: 'Easy jog · 3 min', name: 'Easy jog', seconds: 180, estimate: 180 });
		expect(steps[1]).toMatchObject({ text: 'Carioca · 30s', seconds: 30, key: entryKey('Warm-up', 2) });
		expect(steps[3]).toMatchObject({ kind: 'run', minutes: 30, item: 'Easy run', index: 1, estimate: 1800 });
		const bare: Plan = { ...plan, routineInfo: { ...plan.routineInfo, run: { title: 'Run', discipline: 'run' } }, cooldown: undefined };
		expect(sessionSteps(bare, RUN).map((s) => s.label)).toEqual(['RUN']);
	});
	it('walks a stretch in the cooldown as holds in its own section, logged like one — and never as "outside" the routine', () => {
		const calf = plan.routines.S[0];
		const p: Plan = { ...plan, cooldown: [calf, 'Walk it off'] };
		const steps = sessionSteps(p, A);
		const tail = steps.slice(-3);
		expect(tail.map((s) => [s.kind, s.section, s.item, s.index, s.label])).toEqual([
			['set', 'Calf stretch', 'Calf stretch', 1, 'HOLD 1 · L'],
			['set', 'Calf stretch', 'Calf stretch', 2, 'HOLD 2 · R'],
			['prep', 'Cooldown', 'Cooldown', 1, 'STEP 1']
		]);
		expect(tail[0].kind === 'set' && tail[0].ex).toEqual(calf);
		const logged = [entry('Calf stretch', 1, iso(0), { of: 'hold', seconds: 45, target: 45 })];
		expect(loggedOutside(p, A, logged)).toEqual([]);
		expect(loggedOutside(plan, A, logged), 'the same hold on a plan whose cooldown is prose is an extra').toEqual(['Calf stretch']);
	});

	it('ticks a counted warm-up line like a sentence', () => {
		const p: Plan = { ...plan, routineInfo: { ...plan.routineInfo, A: { title: 'A', discipline: 'lift', warmup: [{ name: 'Sun Salutation A', reps: 3 }] } } };
		expect(sessionSteps(p, A)[0]).toMatchObject({ kind: 'prep', text: 'Sun Salutation A × 3', estimate: 75 });
	});
	it('estimates from the steps themselves', () => {
		// 2×75 + (45 + 105 + 105) + (20 + 50) + 2×60 = 595s ≈ 10 min
		expect(estimateMinutes(sessionSteps(plan, A))).toBe(10);
		// 180 + 30 + 30 + 1800 + 180 = 2220s = 37 min
		expect(estimateMinutes(sessionSteps(plan, RUN))).toBe(37);
	});
	it('gives an unknown routine nothing', () => {
		expect(sessionSteps(plan, { routine: 'Z' })).toEqual([]);
		expect(sessionSteps(undefined, A)).toEqual([]);
	});
	it('appends an added exercise as a section after the plan, once, from any routine', () => {
		const steps = sessionSteps(plan, A, ['Calf stretch', 'Calf stretch', 'Goblet Squat', 'Nope']);
		expect(steps.slice(-2).map((s) => s.label)).toEqual(['HOLD 1 · L', 'HOLD 2 · R']);
		expect(steps.filter((s) => s.section === 'Calf stretch')).toHaveLength(2);
		expect(steps.filter((s) => s.section === 'Goblet Squat')).toHaveLength(3);
		expect(sessionSteps(plan, RUN, ['Calf stretch']).slice(-1)[0].section).toBe('Calf stretch');
	});
	it('finds what a session logged outside its routine, so a reload keeps the section', () => {
		const logged = [
			entry('Goblet Squat', 1, iso(0), { of: 'load', load: 35, reps: 10 }),
			entry('Calf stretch', 1, iso(0), { of: 'hold', seconds: 45, target: 45 }),
			entry('Calf stretch', 2, iso(0), { of: 'hold', seconds: 45, target: 45 }),
			entry('Warm-up', 1, iso(0))
		];
		expect(loggedOutside(plan, A, logged)).toEqual(['Calf stretch']);
		expect(loggedOutside(plan, S, logged)).toEqual(['Goblet Squat']);
		expect(routineExercises(plan, RUN).map((e) => e.kind)).toEqual(['run']);
		expect(routineExercises(plan, { routine: 'Z' })).toEqual([]);
	});
	it('carries only what its kind needs', () => {
		for (const s of sessionSteps(plan, RUN)) {
			if (s.kind === 'timed') expect(s.seconds).toBeGreaterThan(0);
			if (s.kind === 'run') expect(s.minutes).toBe(30);
			expect('ex' in s).toBe(s.kind === 'set' || s.kind === 'run');
		}
	});
});

describe('sessionProgress', () => {
	const steps = sessionSteps(plan, A);
	it('starts at step one with nothing done', () => {
		const p = sessionProgress(steps, []);
		expect(p.current).toBe(0);
		expect(p.done.size).toBe(0);
	});
	it('lands on the next set right after a set — the rest runs under it', () => {
		const set1 = [entry('Warm-up', 1, iso(300000)), entry('Warm-up', 2, iso(240000)), entry('Goblet Squat', 1, iso(10000), { of: 'load', load: 35, reps: 10 })];
		expect(sessionProgress(steps, set1).current).toBe(3); // SET 2
		expect(sessionProgress(steps, set1).sets).toBe(1);
	});
	it('is finished when every step is', () => {
		const all: Entry[] = steps.map((s) =>
			entry(s.item, s.index, iso(0), s.kind === 'set' ? (s.ex.kind === 'hold' ? { of: 'hold', seconds: 10 } : { of: 'load', load: 35, reps: 10 }) : { of: 'step' })
		);
		const p = sessionProgress(steps, all);
		expect(p.current).toBe(steps.length);
		expect(p.sets).toBe(5);
	});
	it('starts the run clock when the step before it ended, else at the session', () => {
		const run = sessionSteps(plan, RUN);
		const jogged = [entry('Warm-up', 3, iso(30000))];
		expect(runStart(run, 3, jogged, iso(600000))).toBe(NOW - 30000);
		expect(runStart(run, 3, [], iso(600000))).toBe(NOW - 600000);
	});
});

describe('restUntil — the clock under the next set', () => {
	const steps = sessionSteps(plan, A);
	it('counts from the previous set’s own timestamp, local or not', () => {
		const set1 = [entry('Goblet Squat', 1, iso(10000), { of: 'load', load: 35, reps: 10 })];
		expect(restUntil(steps[3], set1, plan)).toBe(NOW - 10000 + 60000); // SET 2: 60s from set 1
		expect(restUntil(steps[6], [entry('Plank', 1, iso(0), { of: 'hold', seconds: 10 })], plan)).toBe(NOW + 30000);
	});
	it('has nothing to wait for on set 1, or when the set before never landed', () => {
		expect(restUntil(steps[2], [], plan)).toBeNull();
		expect(restUntil(steps[3], [], plan)).toBeNull();
		expect(restUntil(steps[0], [], plan)).toBeNull();
	});
});

describe('positionLabel — where you are, the way the crumb says it', () => {
	it('counts sets across the session and prep within its section', () => {
		const steps = sessionSteps(plan, A);
		expect(positionLabel(0, steps)).toBe('Warm-up 1/2');
		expect(positionLabel(3, steps)).toBe('Set 2/5');
		expect(positionLabel(6, steps)).toBe('Set 5/5');
		expect(positionLabel(8, steps)).toBe('Cooldown 2/2');
		expect(positionLabel(9, steps)).toBe('Done');
		expect(positionLabel(3, sessionSteps(plan, RUN))).toBe('Run');
		expect(positionLabel(1, sessionSteps(plan, S))).toBe('Hold 2/4');
	});
});
