import { IllegalStateError, ValidationError } from '@event-driven-io/emmett';
import { describe, expect, it } from 'vitest';
import type { LedgerCommand } from './commands';
import { currentState, decide, evolve, initialState, latestSessionOf } from './decider';
import type { LedgerEvent } from './events';
import type { Measure } from './measure';

const AT = '2026-08-23T18:00:00.000Z';
const started: LedgerEvent = { type: 'SessionStarted', data: { session: 's1', plan: 'p', kind: 'lift', day: 'A', at: AT, mode: 'live' } };
const open = () => evolve(initialState(), started);
const log = (measure: Measure, over: Partial<Extract<LedgerCommand, { type: 'LogEntry' }>['data']> = {}): LedgerCommand => ({
	type: 'LogEntry',
	data: { session: 's1', item: 'Goblet Squat', index: 1, at: AT, measure, ...over }
});
const set = (load = 35, reps = 10) => log({ of: 'load', load, reps });

describe('decide — sessions', () => {
	it('refuses a second session while one is open', () => {
		expect(() =>
			decide({ type: 'StartSession', data: { session: 's2', plan: 'p', kind: 'lift', day: 'B', at: AT } }, open())
		).toThrow(IllegalStateError);
	});
	it('opens a live session', () => {
		const [e] = decide({ type: 'StartSession', data: { session: 's1', plan: 'p', kind: 'lift', day: 'A', at: AT } }, initialState());
		expect(e).toEqual(started);
	});
	it('carries a pick — a subset of the day — and refuses an empty one', () => {
		const [e] = decide(
			{ type: 'StartSession', data: { session: 's1', plan: 'p', kind: 'lift', day: 'S', at: AT, pick: ['Calf stretch'] } },
			initialState()
		);
		expect(e.type === 'SessionStarted' && e.data.pick).toEqual(['Calf stretch']);
		expect(() =>
			decide({ type: 'StartSession', data: { session: 's1', plan: 'p', kind: 'lift', day: 'S', at: AT, pick: [] } }, initialState())
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
		const second: LedgerEvent = { type: 'SessionStarted', data: { session: 's2', plan: 'p', kind: 'lift', day: 'B', at: AT, mode: 'live' } };
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
	// the overridable part: everything but the workout, which is the run throughout
	type AfterData = Omit<Extract<LedgerCommand, { type: 'LogAfter' }>['data'], 'kind' | 'day'>;
	const after = (over: Partial<AfterData> = {}): LedgerCommand => ({
		type: 'LogAfter',
		data: {
			session: 'r1', plan: 'p', kind: 'run',
			startAt: '2026-08-23T17:28:00.000Z', at: AT,
			entries: [{ item: 'Run', index: 1, measure: { of: 'duration', minutes: 32 } }],
			...over
		}
	});
	it('emits started (after) · entries · finished, all backdated', () => {
		const out = decide(after(), initialState());
		expect(out.map((e) => e.type)).toEqual(['SessionStarted', 'EntryLogged', 'SessionFinished']);
		expect(out[0].type === 'SessionStarted' && out[0].data.mode).toBe('after');
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
	// s1 open with one set, then finished; s2 started and finished after it
	const finish = (id: string): LedgerEvent => ({ type: 'SessionFinished', data: { session: id, at: AT } });
	const start = (id: string): LedgerEvent => ({ type: 'SessionStarted', data: { session: id, plan: 'p', kind: 'lift', day: 'B', at: AT, mode: 'live' } });
	const withSet = evolve(open(), decide(set(), open())[0]);

	it('corrects a set in the session in progress', () => {
		const [e] = decide(correct('s1'), withSet);
		expect(e).toEqual({ type: 'EntryCorrected', data: { session: 's1', item: 'Goblet Squat', index: 1, at: AT, measure: { of: 'load', load: 40, reps: 8 } } });
		// a correction changes what a reader sees, never what a rule needs
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

describe('decide — idempotent removes and selects', () => {
	it('selects a plan once', () => {
		const first = decide({ type: 'SelectPlan', data: { plan: 'p', at: AT } }, initialState());
		expect(first).toHaveLength(1);
		const state = evolve(initialState(), first[0]);
		expect(decide({ type: 'SelectPlan', data: { plan: 'p', at: AT } }, state)).toEqual([]);
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
});

describe('the fold reads raw history', () => {
	it('folds retired names and shapes through the upcaster', () => {
		const state = currentState([
			{ type: 'SessionStarted', data: { session: 's1', plan: 'p', day: 'A', at: AT } }, // no mode: the first shape
			{ type: 'SetLogged', data: { session: 's1', plan: 'p', day: 'A', exercise: 'Goblet Squat', weight: 35, reps: 10, set: 1, at: AT } }
		]);
		expect(state.activeSession).toBe('s1');
		expect(decide(set(), state)).toEqual([]); // the duplicate rule counts the upcast set
		const struck = currentState([started, { type: 'SessionStruck', data: { session: 's1', at: AT } }]);
		expect(struck.removedSessions.s1).toBe(true);
		expect(struck.activeSession).toBeNull();
	});
});
