import { IllegalStateError, ValidationError } from '@event-driven-io/emmett';
import { describe, expect, it } from 'vitest';
import type { LedgerCommand } from './commands';
import { currentState, decide, evolve, initialState } from './decider';
import { RUN_DAY, type LedgerEvent } from './events';
import type { Measure } from './measure';

const AT = '2026-08-23T18:00:00.000Z';
const started: LedgerEvent = { type: 'SessionStarted', data: { session: 's1', plan: 'p', day: 'A', at: AT, mode: 'live' } };
const open = () => evolve(initialState(), started);
const log = (measure: Measure, over: Partial<Extract<LedgerCommand, { type: 'LogEntry' }>['data']> = {}): LedgerCommand => ({
	type: 'LogEntry',
	data: { session: 's1', item: 'Goblet Squat', index: 1, at: AT, measure, ...over }
});
const set = (load = 35, reps = 10) => log({ of: 'load', load, reps });

describe('decide — sessions', () => {
	it('refuses a second session while one is open', () => {
		expect(() =>
			decide({ type: 'StartSession', data: { session: 's2', plan: 'p', day: 'B', at: AT } }, open())
		).toThrow(IllegalStateError);
	});
	it('opens a live session', () => {
		const [e] = decide({ type: 'StartSession', data: { session: 's1', plan: 'p', day: 'A', at: AT } }, initialState());
		expect(e).toEqual(started);
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
		const second: LedgerEvent = { type: 'SessionStarted', data: { session: 's2', plan: 'p', day: 'B', at: AT, mode: 'live' } };
		const state = evolve(open(), second);
		expect(state.activeSession?.id).toBe('s1');
		expect(state.sessions).toEqual({ s1: true, s2: true });
	});
	it('a finish for another session leaves the slot alone', () => {
		const state = evolve(open(), { type: 'SessionFinished', data: { session: 's2', at: AT } });
		expect(state.activeSession?.id).toBe('s1');
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
	const after = (over: Partial<Extract<LedgerCommand, { type: 'LogAfter' }>['data']> = {}): LedgerCommand => ({
		type: 'LogAfter',
		data: {
			session: 'r1', plan: 'p', day: RUN_DAY,
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
		expect(busy.activeSession?.id).toBe('s1');
		expect(busy.sessions.r1).toBe(true);
		const idle = decide(after(), initialState()).reduce(evolve, initialState());
		expect(idle.activeSession).toBeNull();
		expect(idle.sessions.r1).toBe(true);
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
		expect(state.activeSession?.id).toBe('s1');
		expect(decide(set(), state)).toEqual([]); // the duplicate rule counts the upcast set
		const struck = currentState([started, { type: 'SessionStruck', data: { session: 's1', at: AT } }]);
		expect(struck.removedSessions.s1).toBe(true);
		expect(struck.activeSession).toBeNull();
	});
});
