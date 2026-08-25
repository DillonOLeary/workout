import { IllegalStateError, ValidationError } from '@event-driven-io/emmett';
import { describe, expect, it } from 'vitest';
import type { LedgerCommand } from './commands';
import { currentState, decide, evolve, initialState } from './decider';
import { RUN_DAY, runSessionId, upcastLedgerEvents, type LedgerEvent, type Measure } from './events';

const AT = '2026-08-23T18:00:00.000Z';
const started: LedgerEvent = { type: 'SessionStarted', data: { session: 's1', plan: 'p', day: 'A', at: AT } };
const open = () => evolve(initialState(), started);
const log = (measure: Measure, over: Partial<Extract<LedgerCommand, { type: 'LogEntry' }>['data']> = {}): LedgerCommand => ({
	type: 'LogEntry',
	data: { session: 's1', plan: 'p', day: 'A', item: 'Goblet Squat', index: 1, at: AT, measure, ...over }
});
const set = (load = 35, reps = 10) => log({ of: 'load', load, reps });

describe('decide — sessions', () => {
	it('refuses a second session while one is open', () => {
		expect(() =>
			decide({ type: 'StartSession', data: { sessionId: 's2', plan: 'p', day: 'B', at: AT } }, open())
		).toThrow(IllegalStateError);
	});
	it('refuses an entry with no session in progress', () => {
		expect(() => decide(set(), initialState())).toThrow(IllegalStateError);
	});
	it('enriches FinishSession from state', () => {
		expect(decide({ type: 'FinishSession', data: { at: AT } }, open())).toEqual([
			{ type: 'SessionFinished', data: { session: 's1', plan: 'p', day: 'A', at: AT } }
		]);
	});
});

describe('decide — the measure validates on its own branch', () => {
	it('bounds reps 1–100', () => {
		expect(() => decide(set(35, 0), open())).toThrow(ValidationError);
		expect(() => decide(set(35, 101), open())).toThrow(ValidationError);
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
});

describe('decide — LogAfter writes a closed session in one shot', () => {
	const after = (over: Partial<Extract<LedgerCommand, { type: 'LogAfter' }>['data']> = {}): LedgerCommand => ({
		type: 'LogAfter',
		data: {
			sessionId: 'r1', plan: 'p', day: RUN_DAY,
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
		expect(out[2].data.at).toBe(AT);
	});
	it('never opens a session — a lift in progress is untouched', () => {
		const state = decide(after(), open()).reduce(evolve, open());
		expect(state.activeSession?.id).toBe('s1');
		expect(state.sessions.r1).toBe(true);
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

describe('the upcaster — old rows read back in the current vocabulary', () => {
	const raw = (type: string, data: unknown) => ({ type, data }) as unknown as LedgerEvent;
	it('folds the retired SessionStruck name', () => {
		const state = currentState([started, raw('SessionStruck', { session: 's1', at: AT })]);
		expect(state.removedSessions.s1).toBe(true);
		expect(state.activeSession).toBeNull();
	});
	it('reads a SetLogged as a load entry, and a timed one as a hold', () => {
		const base = { session: 's1', plan: 'p', day: 'A', exercise: 'Goblet Squat', set: 2, at: AT };
		expect(upcastLedgerEvents(raw('SetLogged', { ...base, weight: 35, reps: 10 }))).toEqual([
			{ type: 'EntryLogged', data: { session: 's1', plan: 'p', day: 'A', item: 'Goblet Squat', index: 2, at: AT, measure: { of: 'load', load: 35, reps: 10 } } }
		]);
		const [hold] = upcastLedgerEvents(raw('SetLogged', { ...base, weight: 0, reps: 20, unit: 's', target: 20 }));
		expect(hold.type === 'EntryLogged' && hold.data.measure).toEqual({ of: 'hold', seconds: 20, target: 20 });
		const [loaded] = upcastLedgerEvents(raw('SetLogged', { ...base, weight: 14, reps: 45, unit: 's' }));
		expect(loaded.type === 'EntryLogged' && loaded.data.measure).toEqual({ of: 'hold', seconds: 45, load: 14 });
	});
	it('reads a RunLogged as a whole backdated run session — and its removal as a session removal', () => {
		const out = upcastLedgerEvents(raw('RunLogged', { minutes: 30, at: AT }));
		expect(out.map((e) => e.type)).toEqual(['SessionStarted', 'EntryLogged', 'SessionFinished']);
		expect(out[0].type === 'SessionStarted' && out[0].data.session).toBe(runSessionId(AT));
		expect(out[0].type === 'SessionStarted' && out[0].data.mode).toBe('after');
		expect(out[0].data.at).toBe('2026-08-23T17:30:00.000Z');
		expect(out[1].type === 'EntryLogged' && out[1].data.measure).toEqual({ of: 'duration', minutes: 30 });
		// the decider knows the run, so the ledger can remove it like any session
		const state = currentState([raw('RunLogged', { minutes: 30, at: AT })]);
		expect(state.sessions[runSessionId(AT)]).toBe(true);
		expect(state.activeSession).toBeNull();
		expect(decide({ type: 'RemoveSession', data: { session: runSessionId(AT), at: AT } }, state)).toHaveLength(1);
		const gone = currentState([raw('RunLogged', { minutes: 30, at: AT }), raw('RunRemoved', { run: AT, at: AT })]);
		expect(gone.removedSessions[runSessionId(AT)]).toBe(true);
	});
	it('counts the duplicate rule through an upcast set', () => {
		const state = currentState([
			started,
			raw('SetLogged', { session: 's1', plan: 'p', day: 'A', exercise: 'Goblet Squat', weight: 35, reps: 10, set: 1, at: AT })
		]);
		expect(decide(set(), state)).toEqual([]);
	});
});
