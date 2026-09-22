import { IllegalStateError, ValidationError } from '@event-driven-io/emmett';
import { describe, expect, it } from 'vitest';
import type { LedgerCommand } from './commands';
import { currentState, decide, evolve, initialState, latestSessionOf } from './decider';
import type { LedgerEvent } from './events';
import type { Measure } from './measure';

const AT = '2026-08-23T18:00:00.000Z';
const started: LedgerEvent = { type: 'SessionStarted', data: { session: 's1', plan: 'p', discipline: 'lift', routine: 'A', at: AT, mode: 'live' } };
const open = () => evolve(initialState(), started);
const log = (measure: Measure, over: Partial<Extract<LedgerCommand, { type: 'LogEntry' }>['data']> = {}): LedgerCommand => ({
	type: 'LogEntry',
	data: { session: 's1', item: 'Goblet Squat', index: 1, at: AT, measure, ...over }
});
const set = (load = 35, reps = 10) => log({ of: 'load', load, reps });

describe('decide — sessions', () => {
	it('refuses a second session while one is open', () => {
		expect(() =>
			decide({ type: 'StartSession', data: { session: 's2', plan: 'p', discipline: 'lift', routine: 'B', at: AT } }, open())
		).toThrow(IllegalStateError);
	});
	it('opens a live session that says what it is', () => {
		const [e] = decide({ type: 'StartSession', data: { session: 's1', plan: 'p', discipline: 'lift', routine: 'A', at: AT } }, initialState());
		expect(e).toEqual(started);
		expect(() =>
			decide({ type: 'StartSession', data: { session: 's1', plan: 'p', discipline: 'stretch' as never, routine: 'S', at: AT } }, initialState())
		).toThrow(ValidationError);
	});
	it('refuses an entry with no session in progress', () => {
		expect(() => decide(set(), initialState())).toThrow(IllegalStateError);
	});
	it('finishes the session in progress by id alone', () => {
		expect(decide({ type: 'FinishSession', data: { at: AT } }, open())).toEqual([
			{ type: 'SessionFinished', data: { session: 's1', at: AT } }
		]);
		expect(() => decide({ type: 'FinishSession', data: { at: AT } }, initialState())).toThrow(IllegalStateError);
	});
});

describe('evolve — the one live slot', () => {
	it('a start takes the slot only when nothing is open', () => {
		const second: LedgerEvent = { type: 'SessionStarted', data: { session: 's2', plan: 'p', discipline: 'lift', routine: 'B', at: AT, mode: 'live' } };
		const state = evolve(open(), second);
		expect(state.activeSession).toBe('s1');
		expect(state.started).toEqual(['s1', 's2']);
		expect(latestSessionOf(state)).toBe('s2');
	});
	it('a finish for another session leaves the slot alone', () => {
		const state = evolve(open(), { type: 'SessionFinished', data: { session: 's2', at: AT } });
		expect(state.activeSession).toBe('s1');
	});
});

describe('decide — the measure validates on its own branch', () => {
	it('bounds reps 1–100, with or without a load', () => {
		expect(() => decide(set(35, 0), open())).toThrow(ValidationError);
		expect(() => decide(set(35, 101), open())).toThrow(ValidationError);
		expect(() => decide(log({ of: 'reps', reps: 0 }), open())).toThrow(ValidationError);
		expect(decide(log({ of: 'reps', reps: 8 }), open())).toHaveLength(1);
	});
	it('bounds weight 0–2000', () => {
		expect(() => decide(set(-1), open())).toThrow(ValidationError);
		expect(() => decide(set(2001), open())).toThrow(ValidationError);
		expect(decide(set(0), open())).toHaveLength(1);
	});
	it('bounds holds 1–600 and their targets', () => {
		expect(() => decide(log({ of: 'hold', seconds: 601 }), open())).toThrow(ValidationError);
		expect(() => decide(log({ of: 'hold', seconds: 20, target: 0 }), open())).toThrow(ValidationError);
		expect(decide(log({ of: 'hold', seconds: 600 }), open())).toHaveLength(1);
	});
	it('bounds minutes 1–600 and lands them whole', () => {
		expect(() => decide(log({ of: 'duration', minutes: 0 }), open())).toThrow(ValidationError);
		const [e] = decide(log({ of: 'duration', minutes: 31.6 }), open());
		expect(e.type === 'EntryLogged' && e.data.measure).toEqual({ of: 'duration', minutes: 32 });
	});
	it('accepts a bare step', () => {
		expect(decide(log({ of: 'step' }, { item: 'Warm-up' }), open())).toHaveLength(1);
	});
	it('needs an identity', () => {
		expect(() => decide(set(), open())).not.toThrow();
		expect(() => decide(log({ of: 'step' }, { item: '' }), open())).toThrow(ValidationError);
		expect(() => decide(log({ of: 'step' }, { index: 0 }), open())).toThrow(ValidationError);
	});
	it('treats a repeated identity as already landed', () => {
		const state = evolve(open(), decide(set(), open())[0]);
		expect(decide(set(), state)).toEqual([]);
		expect(decide(log({ of: 'load', load: 35, reps: 9 }, { index: 2 }), state)).toHaveLength(1);
		expect(decide(log({ of: 'step' }, { item: 'Warm-up', index: 1 }), state)).toHaveLength(1);
	});
	it('rejects the shape a form could smuggle past the type', () => {
		expect(() => decide(log({ of: 'nope' } as unknown as Measure), open())).toThrow(ValidationError);
	});
});

describe('decide — LogAfter writes a closed session in one shot', () => {
	type AfterData = Omit<Extract<LedgerCommand, { type: 'LogAfter' }>['data'], 'routine' | 'discipline'>;
	const after = (over: Partial<AfterData> = {}): LedgerCommand => ({
		type: 'LogAfter',
		data: {
			session: 'r1', plan: 'p', discipline: 'run', routine: 'run',
			startAt: '2026-08-23T17:28:00.000Z', at: AT,
			entries: [{ item: 'Easy run', index: 1, measure: { of: 'duration', minutes: 32 } }],
			...over
		}
	});
	it('emits started (after) · entries · finished, all backdated', () => {
		const out = decide(after(), initialState());
		expect(out.map((e) => e.type)).toEqual(['SessionStarted', 'EntryLogged', 'SessionFinished']);
		expect(out[0].type === 'SessionStarted' && out[0].data).toMatchObject({ mode: 'after', discipline: 'run', routine: 'run' });
		expect(out[0].data.at).toBe('2026-08-23T17:28:00.000Z');
		expect(out[2]).toEqual({ type: 'SessionFinished', data: { session: 'r1', at: AT } });
	});
	it('never leaves a session open — with or without a lift in progress', () => {
		const busy = decide(after(), open()).reduce(evolve, open());
		expect(busy.activeSession).toBe('s1');
		expect(busy.started).toContain('r1');
		const idle = decide(after(), initialState()).reduce(evolve, initialState());
		expect(idle.activeSession).toBeNull();
		expect(idle.started).toContain('r1');
	});
	it('refuses an empty session, a duplicate id, or a session that ends before it starts', () => {
		expect(() => decide(after({ entries: [] }), initialState())).toThrow(ValidationError);
		const state = decide(after(), initialState()).reduce(evolve, initialState());
		expect(() => decide(after(), state)).toThrow(IllegalStateError);
		expect(() => decide(after({ startAt: '2026-08-24T00:00:00.000Z' }), initialState())).toThrow(ValidationError);
	});
	it('validates every entry and refuses a repeated identity', () => {
		expect(() =>
			decide(after({ entries: [{ item: 'Run', index: 1, measure: { of: 'duration', minutes: 0 } }] }), initialState())
		).toThrow(ValidationError);
		expect(() =>
			decide(
				after({
					entries: [
						{ item: 'Goblet Squat', index: 1, measure: { of: 'load', load: 35, reps: 10 } },
						{ item: 'Goblet Squat', index: 1, measure: { of: 'load', load: 35, reps: 9 } }
					]
				}),
				initialState()
			)
		).toThrow(ValidationError);
	});
});

describe('decide — CorrectEntry: freedom inside the latest session, immutability before it', () => {
	const correct = (session: string, index = 1, measure: Measure = { of: 'load', load: 40, reps: 8 }): LedgerCommand => ({
		type: 'CorrectEntry',
		data: { session, item: 'Goblet Squat', index, at: AT, measure }
	});
	const finish = (id: string): LedgerEvent => ({ type: 'SessionFinished', data: { session: id, at: AT } });
	const start = (id: string): LedgerEvent => ({ type: 'SessionStarted', data: { session: id, plan: 'p', discipline: 'lift', routine: 'B', at: AT, mode: 'live' } });
	const withSet = evolve(open(), decide(set(), open())[0]);

	it('corrects a set in the session in progress', () => {
		const [e] = decide(correct('s1'), withSet);
		expect(e).toEqual({ type: 'EntryCorrected', data: { session: 's1', item: 'Goblet Squat', index: 1, at: AT, measure: { of: 'load', load: 40, reps: 8 } } });
		expect(evolve(withSet, e)).toEqual(withSet);
	});
	it('corrects a set in the latest finished session, and no older one', () => {
		const latest = [finish('s1')].reduce(evolve, withSet);
		expect(latestSessionOf(latest)).toBe('s1');
		expect(decide(correct('s1'), latest)).toHaveLength(1);
		const older = [start('s2'), finish('s2')].reduce(evolve, latest);
		expect(latestSessionOf(older)).toBe('s2');
		expect(() => decide(correct('s1'), older)).toThrow('Only the latest session can be changed.');
	});
	it('refuses what was never logged, and validates the new measure', () => {
		expect(() => decide(correct('s1', 2), withSet)).toThrow('Nothing logged there to correct.');
		expect(() => decide(correct('s1', 1, { of: 'load', load: 40, reps: 0 }), withSet)).toThrow(ValidationError);
		expect(() => decide(correct('nope'), withSet)).toThrow(IllegalStateError);
	});
	it('keeps what the set measured — the numbers change, the variant never does', () => {
		expect(withSet.logged.s1['Goblet Squat#1']).toBe('load');
		expect(() => decide(correct('s1', 1, { of: 'hold', seconds: 20 }), withSet)).toThrow('A correction keeps what the set measured.');
		expect(() => decide(correct('s1', 1, { of: 'reps', reps: 8 }), withSet)).toThrow(IllegalStateError);
		expect(decide(correct('s1', 1, { of: 'load', load: 30, reps: 12 }), withSet)).toHaveLength(1);
	});
	it('falls back to the previous session when the latest is removed', () => {
		const two = [finish('s1'), start('s2'), finish('s2')].reduce(evolve, withSet);
		const removed = evolve(two, { type: 'SessionRemoved', data: { session: 's2', at: AT } });
		expect(latestSessionOf(removed)).toBe('s1');
		expect(decide(correct('s1'), removed)).toHaveLength(1);
	});
	it('still lets an OLDER session be removed — removal is how history gets fixed', () => {
		const older = [finish('s1'), start('s2'), finish('s2')].reduce(evolve, withSet);
		expect(decide({ type: 'RemoveSession', data: { session: 's1', at: AT } }, older)).toHaveLength(1);
	});
});

describe('decide — idempotent removes, selects, switches and goals', () => {
	it('selects a programme once', () => {
		const first = decide({ type: 'SelectProgramme', data: { programme: 'p', at: AT } }, initialState());
		expect(first).toEqual([{ type: 'ProgrammeSelected', data: { programme: 'p', at: AT } }]);
		const state = evolve(initialState(), first[0]);
		expect(decide({ type: 'SelectProgramme', data: { programme: 'p', at: AT } }, state)).toEqual([]);
	});
	it('switches a practice once, refuses a practice the week has not got', () => {
		expect(decide({ type: 'TogglePractice', data: { practice: 'yoga', on: true, at: AT } }, initialState())).toEqual([]);
		const off = decide({ type: 'TogglePractice', data: { practice: 'yoga', on: false, at: AT } }, initialState());
		expect(off).toEqual([{ type: 'BlockToggled', data: { block: 'yoga', on: false, at: AT } }]);
		const state = evolve(initialState(), off[0]);
		expect(state.practices).toEqual({ lift: true, yoga: false, mob: true, run: true });
		expect(decide({ type: 'TogglePractice', data: { practice: 'yoga', on: false, at: AT } }, state)).toEqual([]);
		expect(decide({ type: 'TogglePractice', data: { practice: 'yoga', on: true, at: AT } }, state)).toHaveLength(1);
		const liftOff = decide({ type: 'TogglePractice', data: { practice: 'lift', on: false, at: AT } }, initialState());
		expect(liftOff).toEqual([{ type: 'BlockToggled', data: { block: 'lift', on: false, at: AT } }]);
		expect(decide({ type: 'TogglePractice', data: { practice: 'lift', on: false, at: AT } }, evolve(initialState(), liftOff[0]))).toEqual([]);
		expect(() => decide({ type: 'TogglePractice', data: { practice: 'bw' as never, on: false, at: AT } }, initialState())).toThrow(ValidationError);
	});
	it('removes a known session once, refuses an unknown one', () => {
		expect(() =>
			decide({ type: 'RemoveSession', data: { session: 'nope', at: AT } }, initialState())
		).toThrow(IllegalStateError);
		const once = decide({ type: 'RemoveSession', data: { session: 's1', at: AT } }, open());
		expect(once).toHaveLength(1);
		const state = evolve(open(), once[0]);
		expect(state.activeSession).toBeNull(); // removing the live session abandons it
		expect(decide({ type: 'RemoveSession', data: { session: 's1', at: AT } }, state)).toEqual([]);
	});
	it('records a goal once, inside the dial’s range, minutes for the run only', () => {
		const goal = (practice: string, sessions: number, minutes?: number): LedgerCommand => ({
			type: 'SetGoal',
			data: { practice: practice as never, at: AT, sessions, ...(minutes !== undefined ? { minutes } : {}) }
		});
		const [e] = decide(goal('lift', 4), initialState());
		expect(e).toEqual({ type: 'GoalSet', data: { practice: 'lift', at: AT, sessions: 4 } });
		const state = evolve(initialState(), e);
		expect(state.goals).toEqual({ lift: { sessions: 4 } });
		expect(decide(goal('lift', 4), state)).toEqual([]);
		expect(decide(goal('lift', 3), state)).toHaveLength(1);
		const [run] = decide(goal('run', 2, 40), state);
		expect(run).toEqual({ type: 'GoalSet', data: { practice: 'run', at: AT, sessions: 2, minutes: 40 } });
		const withRun = evolve(state, run);
		expect(decide(goal('run', 2, 40), withRun)).toEqual([]);
		expect(decide(goal('run', 2, 45), withRun)).toHaveLength(1);
		expect(decide(goal('run', 2), withRun)).toHaveLength(1); // dropping the minutes is a change too
		expect(() => decide(goal('lift', 0), state)).toThrow(ValidationError);
		expect(() => decide(goal('lift', 8), state)).toThrow(ValidationError);
		expect(() => decide(goal('lift', 2.5), state)).toThrow(ValidationError);
		expect(() => decide(goal('yoga', 2, 30), state)).toThrow(ValidationError);
		expect(() => decide(goal('run', 2, 5), state)).toThrow(ValidationError);
		expect(() => decide(goal('run', 2, 95), state)).toThrow(ValidationError);
		expect(() => decide(goal('swim', 2), state)).toThrow(ValidationError);
	});
});

describe('the fold reads raw history', () => {
	it('folds retired names and shapes through the upcaster', () => {
		const state = currentState([
			{ type: 'SessionStarted', data: { session: 's1', plan: 'p', day: 'A', at: AT } }, // no mode, no discipline: the first shape
			{ type: 'SetLogged', data: { session: 's1', plan: 'p', day: 'A', exercise: 'Goblet Squat', weight: 35, reps: 10, set: 1, at: AT } }
		]);
		expect(state.activeSession).toBe('s1');
		expect(decide(set(), state)).toEqual([]); // the duplicate rule counts the upcast set
		const struck = currentState([started, { type: 'SessionStruck', data: { session: 's1', at: AT } }]);
		expect(struck.removedSessions.s1).toBe(true);
		expect(struck.activeSession).toBeNull();
	});
});
