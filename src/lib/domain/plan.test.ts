import { describe, expect, it } from 'vitest';
import { DEFAULT_PLANS } from './plans';
import { cooldownFor, cueFor, dayKind, hasRuns, isFixedHold, liftDays, parsePlan, prepSeconds, restFor, runTarget, stretchDays, warmupFor, type Exercise, type Plan } from './plan';

const day = (ex: Record<string, unknown>) => ({ id: 'p', name: 'P', days: { A: [ex] } });
const one = (ex: Record<string, unknown>) => parsePlan(day(ex)).days.A[0];
const goblet = { name: 'Goblet Squat', equip: 'Kettlebell', tag: 'Squat', kind: 'load', sets: 3, lo: 6, hi: 12, start: 35, inc: 5, rack: 'dumbbell' };
const stretch = { name: 'Calf stretch', equip: 'Mat', tag: 'Stretch', kind: 'hold', sets: 2, lo: 45, hi: 45, inc: 0, side: 'sets' };

describe('parsePlan — the plan’s read boundary', () => {
	it('reads every shipped plan back unchanged, from JSON', () => {
		for (const p of DEFAULT_PLANS) expect(parsePlan(JSON.stringify(p))).toEqual(p);
	});
	it('needs a kind — there is no older encoding to fall back on', () => {
		expect(one({ ...goblet, rack: undefined })).toMatchObject({ kind: 'load', start: 35, inc: 5 });
		expect(() => one({ ...goblet, kind: undefined })).toThrow(/kind must be load, hold or reps/);
		expect(() => one({ name: 'Plank', sets: 3, lo: 10, hi: 20, start: 0, inc: 5, mode: 'seconds', bodyweight: true })).toThrow(/kind must be/);
	});
	it('keeps only the fields a kind owns', () => {
		const held = one({ name: 'Plank', kind: 'hold', sets: 3, lo: 10, hi: 20, inc: 5, start: 0, rack: 'dumbbell', each: true });
		expect(held).not.toHaveProperty('start');
		expect(held).not.toHaveProperty('rack');
		expect(held).not.toHaveProperty('each');
	});
	it('reads timed prep items, and ignores a field it no longer knows', () => {
		const p = parsePlan({
			...day(goblet),
			warmup: ['Bike', { name: 'Carioca', seconds: 30, each: true }, { name: 'Easy jog', minutes: 3 }],
			run: { title: 'Easy run', minutes: 30, walk: 5 }
		});
		expect(p.warmup).toEqual(['Bike', { name: 'Carioca', seconds: 30, each: true }, { name: 'Easy jog', minutes: 3 }]);
		expect(p.warmup!.map(prepSeconds)).toEqual([0, 30, 180]);
		expect(p.run).toEqual({ title: 'Easy run', minutes: 30 });
	});
	it('reads a day’s kind, and refuses one it doesn’t know', () => {
		const p = parsePlan({ id: 'p', name: 'P', dayInfo: { S: { title: 'Stretch', kind: 'stretch' } }, days: { A: [goblet], S: [stretch] } });
		expect(dayKind(p, 'S')).toBe('stretch');
		expect(dayKind(p, 'A')).toBe('lift');
		expect(liftDays(p)).toEqual(['A']);
		expect(stretchDays(p)).toEqual(['S']);
		expect(() => parsePlan({ ...day(goblet), dayInfo: { A: { title: 'A', kind: 'rest' } } })).toThrow(/kind must be "lift" or "stretch"/);
		expect(isFixedHold({ name: 'Calf stretch', equip: '', tag: '', kind: 'hold', sets: 2, lo: 45, hi: 45, inc: 0 })).toBe(true);
		expect(isFixedHold({ name: 'Plank', equip: '', tag: '', kind: 'hold', sets: 2, lo: 10, hi: 20, inc: 5 })).toBe(false);
	});
	it('refuses what it cannot read, with a sentence', () => {
		expect(() => parsePlan('{"id":"p"}')).toThrow('needs id, name, days');
		expect(() => one({ ...goblet, name: '' })).toThrow('missing a name');
		expect(() => one({ ...goblet, start: undefined })).toThrow('"Goblet Squat" needs numeric start');
		expect(() => one({ ...goblet, rack: 'barbell' })).toThrow(/rack must be kettlebell, dumbbell, medball/);
		expect(() => one({ ...goblet, side: 'left' })).toThrow(/side must be/);
		expect(() => one({ ...goblet, kind: 'time' })).toThrow(/kind must be load, hold or reps/);
		expect(() => one({ name: 'Plank', kind: 'hold', sets: 3, lo: 10, hi: 20 })).toThrow('"Plank" needs numeric inc');
		expect(() => parsePlan({ id: 'p', name: 'P', days: {} })).toThrow('days must be a non-empty object');
		expect(() => parsePlan({ ...day(goblet), warmup: 5 })).toThrow('warmup must be a list of strings and timed items');
		expect(() => parsePlan({ ...day(goblet), warmup: 'Easy 5 min' })).toThrow(/warmup must be a list/);
		expect(() => parsePlan({ ...day(goblet), warmup: [{ name: 'Jog' }] })).toThrow(/warmup must be/);
		expect(() => parsePlan({ ...day(goblet), warmup: [{ name: 'Jog', seconds: 30, minutes: 1 }] })).toThrow(/warmup must be/);
		expect(() => parsePlan({ ...day(goblet), run: { title: 'Run' } })).toThrow('run needs a title and positive minutes');
	});
	it('refuses numbers that contradict each other', () => {
		expect(() => one({ ...goblet, lo: 12, hi: 6 })).toThrow('"Goblet Squat" lo must not exceed hi');
		expect(() => one({ ...stretch, sets: 3 })).toThrow(/side "sets" needs an even number of sets/);
		expect(one({ ...stretch, sets: 4 })).toMatchObject({ sets: 4 });
		expect(() => one({ name: 'Plank', kind: 'hold', sets: 3, lo: 10, hi: 20, inc: 0 })).toThrow('"Plank" needs a positive inc to progress');
		expect(one(stretch)).toMatchObject({ inc: 0 }); // a fixed hold has nowhere to climb
		expect(() => one({ ...stretch, inc: 5 })).toThrow('"Calf stretch" is a fixed hold: inc must be 0');
	});
	it('refuses a plan that contradicts itself', () => {
		expect(() =>
			parsePlan({ id: 'p', name: 'P', dayInfo: { S: { title: 'Stretch', kind: 'stretch' } }, days: { S: [stretch, goblet] } })
		).toThrow('day "S" is a stretch day: every exercise must be a hold');
		expect(() => parsePlan({ ...day(goblet), runs: false, run: { title: 'Run', minutes: 30 } })).toThrow('runs is false but a run is defined');
		expect(parsePlan({ ...day(goblet), runs: false }).runs).toBe(false);
	});
});

describe('plan accessors — the defaults live in one place', () => {
	const ex: Exercise = { ...goblet, kind: 'load', rack: 'dumbbell' };
	const plan: Plan = {
		id: 'p', name: 'P', schedule: '', rest: 90, warmup: ['Bike'], cue: 'Breathe',
		dayInfo: { A: { title: 'A', warmup: ['Row'], cue: 'Exhale' } },
		days: { A: [ex], B: [] }
	};
	it('prefers the day, then the plan, then the default', () => {
		expect(warmupFor(plan, 'A')).toEqual(['Row']);
		expect(warmupFor(plan, 'B')).toEqual(['Bike']);
		expect(cooldownFor(plan, 'A')).toEqual([]);
		expect(cueFor(plan, 'A')).toBe('Exhale');
		expect(cueFor(plan, 'B')).toBe('Breathe');
		expect(restFor(plan, ex)).toBe(90);
		expect(restFor(plan, { ...ex, rest: 30 })).toBe(30);
		expect(restFor(undefined, ex)).toBe(60);
	});
	it('answers the run questions with their defaults', () => {
		expect(runTarget(plan)).toBe(150);
		expect(runTarget({ ...plan, runTarget: 90 })).toBe(90);
		expect(hasRuns(plan)).toBe(true);
		expect(hasRuns({ ...plan, runs: false })).toBe(false);
	});
});
