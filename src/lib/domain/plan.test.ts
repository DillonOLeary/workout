import { describe, expect, it } from 'vitest';
import { DEFAULT_PLANS } from './plans';
import { cooldownFor, cueFor, dayKind, hasRuns, isFixedHold, liftDays, parsePlan, prepSeconds, restFor, runTarget, stretchDays, warmupFor, type Exercise, type Plan } from './plan';

const day = (ex: Record<string, unknown>) => ({ id: 'p', name: 'P', days: { A: [ex] } });
const one = (ex: Record<string, unknown>) => parsePlan(day(ex)).days.A[0];
const goblet = { name: 'Goblet Squat', equip: 'Kettlebell', tag: 'Squat', sets: 3, lo: 6, hi: 12, start: 35, inc: 5, rack: 'dumbbell' };

describe('parsePlan — the plan’s read boundary', () => {
	it('reads every shipped plan back unchanged, from JSON', () => {
		for (const p of DEFAULT_PLANS) expect(parsePlan(JSON.stringify(p))).toEqual(p);
	});
	it('reads the legacy two-flag encoding as a kind', () => {
		expect(one({ ...goblet, rack: undefined })).toMatchObject({ kind: 'load', start: 35, inc: 5 });
		expect(one({ name: 'Plank', sets: 3, lo: 10, hi: 20, start: 0, inc: 5, mode: 'seconds', bodyweight: true })).toEqual({
			name: 'Plank', equip: '', tag: '', sets: 3, lo: 10, hi: 20, kind: 'hold', inc: 5
		});
		expect(one({ name: 'Dead Bug', sets: 3, lo: 8, hi: 12, start: 0, inc: 1, bodyweight: true, side: 'reps' })).toEqual({
			name: 'Dead Bug', equip: '', tag: '', sets: 3, lo: 8, hi: 12, side: 'reps', kind: 'reps'
		});
	});
	it('keeps only the fields a kind owns', () => {
		const held = one({ name: 'Plank', kind: 'hold', sets: 3, lo: 10, hi: 20, inc: 5, start: 0, rack: 'dumbbell', each: true });
		expect(held).not.toHaveProperty('start');
		expect(held).not.toHaveProperty('rack');
		expect(held).not.toHaveProperty('each');
	});
	it('reads a one-line warm-up as one step', () => {
		const p = parsePlan({ ...day(goblet), warmup: 'Easy 5 min', dayInfo: { A: { title: 'A', cooldown: 'Stretch' } } });
		expect(p.warmup).toEqual(['Easy 5 min']);
		expect(p.dayInfo?.A.cooldown).toEqual(['Stretch']);
	});
	it('reads timed prep items, and the retired run walk as one on each side', () => {
		const p = parsePlan({
			...day(goblet),
			warmup: ['Bike', { name: 'Carioca', seconds: 30, each: true }, { name: 'Easy jog', minutes: 3 }],
			run: { title: 'Easy run', minutes: 30, walk: 5 }
		});
		expect(p.warmup).toEqual(['Bike', { name: 'Carioca', seconds: 30, each: true }, { name: 'Easy jog', minutes: 3 }]);
		expect(p.run).toEqual({ title: 'Easy run', minutes: 30, warmup: [{ name: 'Walk', minutes: 5 }], cooldown: [{ name: 'Walk', minutes: 5 }] });
		expect(parsePlan({ ...day(goblet), run: { title: 'Run', minutes: 30, walk: 0 } }).run).toEqual({ title: 'Run', minutes: 30 });
		expect(p.warmup!.map(prepSeconds)).toEqual([0, 30, 180]);
	});
	it('reads a day’s kind, and refuses one it doesn’t know', () => {
		const p = parsePlan({ id: 'p', name: 'P', dayInfo: { S: { title: 'Stretch', kind: 'stretch' } }, days: { A: [goblet], S: [goblet] } });
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
		expect(() => parsePlan({ ...day(goblet), warmup: 5 })).toThrow('warmup must be a string or a list of strings and timed items');
		expect(() => parsePlan({ ...day(goblet), warmup: [{ name: 'Jog' }] })).toThrow(/warmup must be/);
		expect(() => parsePlan({ ...day(goblet), warmup: [{ name: 'Jog', seconds: 30, minutes: 1 }] })).toThrow(/warmup must be/);
		expect(() => parsePlan({ ...day(goblet), run: { title: 'Run' } })).toThrow('run needs a title and positive minutes');
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
