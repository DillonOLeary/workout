import { describe, expect, it } from 'vitest';
import { BLOCKS, DEFAULT_PROGRAMMES, FLOOR, SHIPPED_PLANS } from './plans';
import {
	composePlan,
	cooldownFor,
	cueFor,
	cycleDisciplines,
	cycleOf,
	disciplineOf,
	disciplinesOf,
	parsePlan,
	planExercises,
	prepSeconds,
	progresses,
	restFor,
	routineTitle,
	routinesOf,
	warmupFor,
	type Exercise,
	type Plan
} from './plan';

const goblet = { name: 'Goblet Squat', equip: 'Kettlebell', tag: 'Squat', kind: 'load', sets: 3, lo: 6, hi: 12, progress: { of: 'size', start: 35, inc: 5, rack: 'dumbbell' } };
const stretch = { name: 'Calf stretch', equip: 'Mat', tag: 'Stretch', kind: 'hold', sets: 2, lo: 45, hi: 45, progress: { of: 'none' }, side: 'sets' };
const plank = { name: 'Plank', kind: 'hold', sets: 3, lo: 10, hi: 20, progress: { of: 'time', inc: 5 } };
const pushup = { name: 'Push-up', kind: 'reps', sets: 3, lo: 8, hi: 15, progress: { of: 'variant', ladder: ['Incline', 'Floor'] } };
const run = { name: 'Easy run', kind: 'run', sets: 1, lo: 30, hi: 30, progress: { of: 'none' } };
const raw = (routines: Record<string, unknown[]>, routineInfo: Record<string, unknown>, cycles: unknown[]) => ({ id: 'p', name: 'P', routines, routineInfo, cycles });
const liftPlan = (ex: Record<string, unknown>) => raw({ A: [ex] }, { A: { title: 'A', discipline: 'lift' } }, [{ id: 'lift', title: 'Lift', routines: ['A'], target: 3 }]);
const one = (ex: Record<string, unknown>) => parsePlan(liftPlan(ex)).routines.A[0];

describe('parsePlan — the plan’s read boundary', () => {
	it('reads every shipped programme back unchanged, from JSON — whole or lift-only', () => {
		for (const p of [...DEFAULT_PROGRAMMES, ...SHIPPED_PLANS]) expect(parsePlan(JSON.stringify(p))).toEqual(p);
	});
	it('ships lift-only programmes: the floor and the blocks are the only other cycles', () => {
		for (const p of DEFAULT_PROGRAMMES) expect(p.cycles.map((c) => c.id)).toEqual(['lift']);
		expect(BLOCKS.map((b) => b.id)).toEqual(['yoga', 'mob', 'run']);
		expect(FLOOR.cycle).toMatchObject({ id: 'floor', target: 0, standsInFor: 'lift' });
		expect(FLOOR.cycle.routines.every((r) => FLOOR.routineInfo[r].discipline === 'bodyweight')).toBe(true);
	});
	it('needs a kind and a progress — there is no older encoding to fall back on', () => {
		expect(one({ ...goblet, progress: { of: 'size', start: 35, inc: 5 } })).toMatchObject({ kind: 'load', progress: { of: 'size', start: 35, inc: 5 } });
		expect(() => one({ ...goblet, kind: undefined })).toThrow(/kind must be load, hold, reps or run/);
		expect(() => one({ ...goblet, progress: undefined })).toThrow(/needs a progress/);
		expect(() => one({ name: 'Plank', kind: 'hold', sets: 3, lo: 10, hi: 20, inc: 5 })).toThrow(/needs a progress/);
		expect(() => one({ name: 'Plank', kind: 'hold', sets: 3, lo: 10, hi: 20, start: 0, mode: 'seconds', bodyweight: true })).toThrow(/needs a progress/);
	});
	it('allows only the legal pairings of kind and progress', () => {
		expect(() => one({ ...goblet, progress: { of: 'time', inc: 5 } })).toThrow(/load \+ time is not a legal pairing/);
		expect(() => one({ ...plank, progress: { of: 'count' } })).toThrow(/hold \+ count is not a legal pairing/);
		expect(() => one({ ...pushup, progress: { of: 'size', start: 0, inc: 5 } })).toThrow(/reps \+ size is not a legal pairing/);
		expect(() => one({ ...run, progress: { of: 'count' } })).toThrow(/run \+ count is not a legal pairing/);
		expect(one(plank)).toMatchObject({ kind: 'hold', progress: { of: 'time', inc: 5 } });
		expect(one(stretch)).toMatchObject({ kind: 'hold', progress: { of: 'none' } });
		expect(one({ ...pushup, progress: { of: 'count' } })).toMatchObject({ kind: 'reps', progress: { of: 'count' } });
		expect(one(pushup)).toMatchObject({ kind: 'reps', progress: { of: 'variant', ladder: ['Incline', 'Floor'] } });
		expect(one({ ...pushup, progress: { of: 'none' } })).toMatchObject({ kind: 'reps', progress: { of: 'none' } });
	});
	it('keeps only the fields a progress owns', () => {
		const held = one({ ...plank, progress: { of: 'time', inc: 5, start: 0, rack: 'dumbbell', each: true } });
		expect(held.progress).toEqual({ of: 'time', inc: 5 });
		const loaded = one({ ...goblet, progress: { of: 'size', start: 35, inc: 5, rack: 'dumbbell', each: true, ladder: ['x'] } });
		expect(loaded.progress).toEqual({ of: 'size', start: 35, inc: 5, rack: 'dumbbell', each: true });
	});
	it('reads timed and counted prep items, and refuses the rest', () => {
		const p = parsePlan({
			...liftPlan(goblet),
			warmup: ['Bike', { name: 'Carioca', seconds: 30, each: true }, { name: 'Easy jog', minutes: 3 }, { name: 'Sun Salutation A', reps: 3 }]
		});
		expect(p.warmup).toEqual(['Bike', { name: 'Carioca', seconds: 30, each: true }, { name: 'Easy jog', minutes: 3 }, { name: 'Sun Salutation A', reps: 3 }]);
		expect(p.warmup!.map(prepSeconds)).toEqual([0, 30, 180, 0]);
		const calf = { name: 'Calf stretch', equip: 'Mat', tag: '', kind: 'hold', sets: 2, lo: 45, hi: 45, progress: { of: 'none' }, side: 'sets', rest: 10 };
		const q = parsePlan({ ...liftPlan(goblet), cooldown: [calf, { name: 'Walk', minutes: 3 }] });
		expect(q.cooldown, 'a stretch from the catalogue is a cooldown line, parsed as the exercise it is').toEqual([calf, { name: 'Walk', minutes: 3 }]);
		expect(q.cooldown!.map(prepSeconds)).toEqual([45, 180]);
		expect(() => parsePlan({ ...liftPlan(goblet), cooldown: [{ ...calf, lo: 30 }] })).toThrow(/one length/);
		expect(() => parsePlan({ ...liftPlan(goblet), warmup: 5 })).toThrow('warmup must be a list of strings and timed items');
		expect(() => parsePlan({ ...liftPlan(goblet), warmup: 'Easy 5 min' })).toThrow(/warmup must be a list/);
		expect(() => parsePlan({ ...liftPlan(goblet), warmup: [{ name: 'Jog' }] })).toThrow(/warmup must be/);
		expect(() => parsePlan({ ...liftPlan(goblet), warmup: [{ name: 'Jog', seconds: 30, minutes: 1 }] })).toThrow(/warmup must be/);
		expect(() => parsePlan({ ...liftPlan(goblet), warmup: [{ name: 'Rounds', reps: 2.5 }] })).toThrow(/warmup must be/);
	});
	it('needs a discipline on every routine, and refuses one it doesn’t know', () => {
		expect(() => parsePlan(raw({ A: [goblet] }, { A: { title: 'A' } }, [{ id: 'l', title: 'L', routines: ['A'], target: 1 }]))).toThrow(
			/routineInfo "A" needs a discipline: lift, yoga, bodyweight, mobility, run/
		);
		expect(() => parsePlan(raw({ A: [goblet] }, { A: { title: 'A', discipline: 'stretch' } }, [{ id: 'l', title: 'L', routines: ['A'], target: 1 }]))).toThrow(/needs a discipline/);
		expect(() => parsePlan(raw({ A: [goblet] }, {}, [{ id: 'l', title: 'L', routines: ['A'], target: 1 }]))).toThrow(/routineInfo "A" needs a title/);
		expect(() => parsePlan({ id: 'p', name: 'P', days: { A: [goblet] } })).toThrow('needs id, name, routines, routineInfo, cycles');
	});
	it('refuses what it cannot read, with a sentence', () => {
		expect(() => parsePlan('{"id":"p"}')).toThrow('needs id, name, routines, routineInfo, cycles');
		expect(() => one({ ...goblet, name: '' })).toThrow('missing a name');
		expect(() => one({ ...goblet, progress: { of: 'size', inc: 5 } })).toThrow('"Goblet Squat" progress needs numeric start');
		expect(() => one({ ...goblet, progress: { of: 'size', start: 35, inc: 5, rack: 'barbell' } })).toThrow(/rack must be kettlebell, dumbbell, medball/);
		expect(() => one({ ...goblet, side: 'left' })).toThrow(/side must be/);
		expect(() => one({ ...goblet, progress: { of: 'weight' } })).toThrow(/progress must be size, time, count, variant or none/);
		expect(() => one({ ...pushup, progress: { of: 'variant', ladder: [] } })).toThrow(/needs a ladder of names/);
		expect(() => parsePlan(raw({}, {}, []))).toThrow('routines must be a non-empty object');
	});
	it('refuses numbers that contradict each other', () => {
		expect(() => one({ ...goblet, lo: 12, hi: 6 })).toThrow('"Goblet Squat" lo must not exceed hi');
		expect(() => one({ ...stretch, sets: 3 })).toThrow(/side "sets" needs an even number of sets/);
		expect(one({ ...stretch, sets: 4 })).toMatchObject({ sets: 4 });
		expect(() => one({ ...plank, progress: { of: 'time', inc: 0 } })).toThrow('"Plank" needs a positive inc to progress');
		expect(() => one({ ...plank, lo: 20, hi: 20 })).toThrow('"Plank" is a fixed hold: its progress is none');
		expect(() => one({ ...stretch, hi: 60 })).toThrow('"Calf stretch" does not progress, so it has one length: lo must equal hi');
	});
	it('refuses a plan that contradicts itself', () => {
		const info = { S: { title: 'Stretch', discipline: 'mobility' }, run: { title: 'Run', discipline: 'run' }, A: { title: 'A', discipline: 'lift' } };
		const cycles = [{ id: 'c', title: 'C', routines: ['S'], target: 1 }];
		expect(() => parsePlan(raw({ S: [stretch, goblet], run: [run], A: [goblet] }, info, cycles))).toThrow('routine "S" is mobility: every exercise must be a hold');
		expect(() => parsePlan(raw({ S: [stretch], run: [goblet], A: [goblet] }, info, cycles))).toThrow('routine "run" is a run: it needs exactly one run exercise');
		expect(() => parsePlan(raw({ S: [stretch], run: [run], A: [goblet, run] }, info, cycles))).toThrow('routine "A" has a run in it but is not a run');
		expect(() => parsePlan(raw({ A: [goblet] }, { A: info.A }, [{ id: 'c', title: 'C', routines: ['Z'], target: 1 }]))).toThrow('cycle "c" names a routine the plan doesn\'t have: "Z"');
		expect(() => parsePlan(raw({ A: [goblet] }, { A: info.A }, [{ id: 'c', title: 'C', routines: ['A'], target: 1.5 }]))).toThrow(/target must be a whole number/);
		expect(() => parsePlan(raw({ A: [goblet] }, { A: info.A }, [{ id: 'c', title: 'C', routines: ['A'], target: 0, standsInFor: 'x' }]))).toThrow(/stands in for a cycle the plan doesn't have/);
		expect(() => parsePlan(raw({ A: [goblet] }, { A: info.A }, [{ id: 'c', title: 'C', routines: ['A'], target: 1 }, { id: 'c', title: 'D', routines: ['A'], target: 1 }]))).toThrow('cycle "c" is listed twice');
		expect(() => parsePlan(raw({ A: [goblet] }, { A: info.A }, []))).toThrow('cycles must be a non-empty list');
		expect(parsePlan(raw({ A: [goblet] }, { A: info.A }, [{ id: 'c', title: 'C', routines: ['A'], target: 0 }])).cycles[0].target).toBe(0);
	});
});

describe('plan accessors — the defaults live in one place', () => {
	const ex: Exercise = { ...goblet, kind: 'load', progress: { of: 'size', start: 35, inc: 5, rack: 'dumbbell' } };
	const plan: Plan = {
		id: 'p', name: 'P', schedule: '', rest: 90, warmup: ['Bike'], cue: 'Breathe',
		cycles: [
			{ id: 'lift', title: 'Lift', routines: ['A', 'B'], target: 3 },
			{ id: 'mob', title: 'Stretch', routines: ['S'], target: 2 },
			{ id: 'floor', title: 'Floor', routines: ['B', 'S'], target: 0, standsInFor: 'lift' }
		],
		routineInfo: {
			A: { title: 'Squat & Shove', discipline: 'lift', warmup: ['Row'], cue: 'Exhale' },
			B: { title: 'Hinge & Haul', discipline: 'lift' },
			S: { title: 'Morning stretch', discipline: 'mobility' }
		},
		routines: { A: [ex], B: [ex], S: [{ ...stretch, kind: 'hold', progress: { of: 'none' }, side: 'sets' } as Exercise] }
	};
	it('prefers the routine, then the plan, then the default', () => {
		expect(warmupFor(plan, 'A')).toEqual(['Row']);
		expect(warmupFor(plan, 'B')).toEqual(['Bike']);
		expect(cooldownFor(plan, 'A')).toEqual([]);
		expect(cueFor(plan, 'A')).toBe('Exhale');
		expect(cueFor(plan, 'B')).toBe('Breathe');
		expect(restFor(plan, ex)).toBe(90);
		expect(restFor(plan, { ...ex, rest: 30 })).toBe(30);
		expect(restFor(undefined, ex)).toBe(60);
	});
	it('answers the routine questions', () => {
		expect(routineTitle(plan, 'A')).toBe('Squat & Shove');
		expect(routineTitle(plan, 'Z')).toBeUndefined();
		expect(routineTitle(undefined, 'run')).toBeUndefined();
		expect(progresses(ex)).toBe(true);
		expect(progresses(plan.routines.S[0])).toBe(false);
		expect(disciplineOf(plan, 'S')).toBe('mobility');
		expect(disciplineOf(plan, 'Z')).toBeUndefined();
		expect(routinesOf(plan, 'lift')).toEqual(['A', 'B']);
		expect(routinesOf(plan, 'yoga')).toEqual([]);
		expect(disciplinesOf(plan)).toEqual(['lift', 'mobility']);
		expect(cycleDisciplines(plan, plan.cycles[2])).toEqual(['lift', 'mobility']);
		expect(cycleOf(plan, 'S')?.id).toBe('mob');
		expect(cycleOf(plan, 'Z')).toBeUndefined();
		expect(planExercises(plan).map((e) => e.name)).toEqual(['Goblet Squat', 'Calf stretch']);
	});
});

describe('composePlan — the week is one programme, its floor, and the practices that are on', () => {
	const programme = DEFAULT_PROGRAMMES[0];
	it('adds the lift with its floor, then only the on blocks’ cycles', () => {
		expect(composePlan(programme, BLOCKS, FLOOR, ['lift', 'run']).cycles.map((c) => c.id)).toEqual(['lift', 'floor', 'run']);
		expect(composePlan(programme, BLOCKS, FLOOR, ['lift']).cycles.map((c) => c.id)).toEqual(['lift', 'floor']);
		expect(composePlan(programme, BLOCKS, FLOOR, ['run']).cycles.map((c) => c.id)).toEqual(['run']);
		expect(composePlan(programme, BLOCKS, FLOOR, ['lift', 'yoga', 'mob', 'run']).cycles.map((c) => c.id)).toEqual(['lift', 'floor', 'yoga', 'mob', 'run']);
	});
	it('knows every routine whether or not its practice is on — a session of something switched off still has a title', () => {
		const off = composePlan(programme, BLOCKS, FLOOR, []);
		expect(off.cycles).toEqual([]);
		expect(routineTitle(off, 'hips')).toBe('Hips & Hamstrings');
		expect(routineTitle(off, 'bw1')).toBe('Push & Squat');
		expect(routineTitle(off, 'A')).toBe('Squat & Shove');
		expect(disciplineOf(off, 'run')).toBe('run');
		const on = composePlan(programme, BLOCKS, FLOOR, ['lift', 'run']);
		expect(parsePlan(JSON.stringify(on))).toEqual(on);
	});
	it('lets a goal rewrite a cycle’s target, and the run’s minutes', () => {
		const week = composePlan(programme, BLOCKS, FLOOR, ['lift', 'yoga', 'run'], { lift: { sessions: 4 }, run: { sessions: 2, minutes: 40 } });
		expect(week.cycles.map((c) => [c.id, c.target])).toEqual([['lift', 4], ['floor', 0], ['yoga', 2], ['run', 2]]);
		expect(week.routines.run[0]).toMatchObject({ kind: 'run', lo: 40, hi: 40 });
		expect(composePlan(programme, BLOCKS, FLOOR, ['run'], { run: { sessions: 3 } }).routines.run[0]).toMatchObject({ lo: 30, hi: 30 });
		expect(parsePlan(JSON.stringify(week))).toEqual(week);
	});
	it('leaves the programme and the blocks themselves alone', () => {
		composePlan(programme, BLOCKS, FLOOR, ['lift', 'yoga', 'run'], { lift: { sessions: 5 }, run: { sessions: 1, minutes: 60 } });
		expect(programme.cycles.map((c) => [c.id, c.target])).toEqual([['lift', 3]]);
		expect(Object.keys(programme.routines)).toEqual(['A', 'B']);
		expect(BLOCKS.find((b) => b.id === 'run')!.routines.run[0]).toMatchObject({ lo: 30, hi: 30 });
	});
});
