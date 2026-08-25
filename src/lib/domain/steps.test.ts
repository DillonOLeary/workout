import { describe, expect, it } from 'vitest';
import { RUN_DAY, entryKey } from './events';
import {
	estimateMinutes,
	restStart,
	runStart,
	sessionProgress,
	sessionSteps,
	warmupSteps,
	type Entry
} from './steps';
import type { Plan } from './types';

const NOW = Date.parse('2026-08-25T18:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const plan: Plan = {
	id: 'p',
	name: 'P',
	schedule: '',
	rest: 60,
	cooldown: ['Stretch A', 'Stretch B'],
	run: { title: 'Easy run', minutes: 30, walk: 5 },
	dayInfo: { A: { title: 'Day A', warmup: ['Bike 5 min', 'Squats ×10'] } },
	days: {
		A: [
			{ name: 'Goblet Squat', equip: '', tag: '', sets: 3, lo: 6, hi: 12, start: 35, inc: 5 },
			{ name: 'Plank', equip: '', tag: '', sets: 2, lo: 10, hi: 20, start: 0, inc: 5, mode: 'seconds', bodyweight: true, rest: 30 }
		]
	}
};

const entry = (item: string, index: number, at: string, measure: Entry['measure'] = { of: 'step' }): Entry => ({
	session: 's', item, index, at, measure
});

describe('sessionSteps', () => {
	it('walks warm-up, every set with a rest before the next, then the cooldown', () => {
		const steps = sessionSteps(plan, 'A');
		expect(steps.map((s) => s.label)).toEqual([
			'STEP 1', 'STEP 2',
			'SET 1', 'REST', 'SET 2', 'REST', 'SET 3',
			'HOLD 1', 'REST', 'HOLD 2',
			'STEP 1', 'STEP 2'
		]);
		expect(steps.map((s) => s.section)[2]).toBe('Goblet Squat');
		expect(steps[3].seconds).toBe(60);
		expect(steps[8].seconds).toBe(30); // the exercise's own rest wins
		expect(steps[0].key).toBe(entryKey('Warm-up', 1));
		expect(steps[steps.length - 1].key).toBe(entryKey('Cooldown', 2));
	});
	it('reads a one-line warm-up as one step', () => {
		expect(warmupSteps({ ...plan, dayInfo: { A: { title: 'A', warmup: 'Easy 5 min' } } }, 'A')).toEqual(['Easy 5 min']);
	});
	it('makes a run walk · run · walk, and a plan without walks a bare run', () => {
		expect(sessionSteps(plan, RUN_DAY).map((s) => s.label)).toEqual(['WALK', 'RUN', 'WALK']);
		expect(sessionSteps({ ...plan, run: { title: 'Run', minutes: 20 } }, RUN_DAY).map((s) => s.label)).toEqual(['RUN']);
	});
	it('estimates from the steps themselves', () => {
		// 2×75 + 3×45 + 2×60 + 2×45 + 30 + 2×60 = 645s ≈ 11 min
		expect(estimateMinutes(sessionSteps(plan, 'A'))).toBe(11);
		expect(estimateMinutes(sessionSteps(plan, RUN_DAY))).toBe(40);
	});
	it('gives an unknown day nothing', () => {
		expect(sessionSteps(plan, 'Z')).toEqual([]);
		expect(sessionSteps(undefined, 'A')).toEqual([]);
	});
});

describe('sessionProgress', () => {
	const steps = sessionSteps(plan, 'A');
	it('starts at step one with nothing done', () => {
		const p = sessionProgress(steps, [], NOW);
		expect(p.current).toBe(0);
		expect(p.done.size).toBe(0);
	});
	it('lands on the rest timer right after a set, and past it once the clock has run out', () => {
		const set1 = [entry('Warm-up', 1, iso(300000)), entry('Warm-up', 2, iso(240000)), entry('Goblet Squat', 1, iso(10000), { of: 'load', load: 35, reps: 10 })];
		expect(sessionProgress(steps, set1, NOW).current).toBe(3); // REST before set 2, 50s left
		expect(restStart(steps[3], set1)).toBe(NOW - 10000);
		expect(sessionProgress(steps, set1, NOW + 60000).current).toBe(4); // SET 2
	});
	it('counts a rest as done when the set after it landed', () => {
		const two = [entry('Goblet Squat', 1, iso(100000), { of: 'load', load: 35, reps: 10 }), entry('Goblet Squat', 2, iso(1000), { of: 'load', load: 35, reps: 9 })];
		const p = sessionProgress(steps, two, NOW);
		expect(p.done.has(steps[3].key)).toBe(true);
		expect(p.current).toBe(0); // warm-up never happened — the first undone step
		expect(p.sets).toBe(2);
		expect(p.prep).toBe(0);
	});
	it('is finished when every non-rest step is', () => {
		const all: Entry[] = steps.filter((s) => s.kind !== 'rest').map((s) =>
			entry(s.item, s.index, iso(0), s.kind === 'set' ? (s.ex!.mode === 'seconds' ? { of: 'hold', seconds: 10 } : { of: 'load', load: 35, reps: 10 }) : { of: 'step' })
		);
		const p = sessionProgress(steps, all, NOW);
		expect(p.current).toBe(steps.length);
		expect(p.prep).toBe(4);
		expect(p.sets).toBe(5);
	});
	it('starts the run clock when the walk before it ended, else at the session', () => {
		const run = sessionSteps(plan, RUN_DAY);
		const walked = [entry('Warm-up', 1, iso(30000))];
		expect(runStart(run, 1, walked, iso(600000))).toBe(NOW - 30000);
		expect(runStart(run, 1, [], iso(600000))).toBe(NOW - 600000);
	});
});
