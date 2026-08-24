import { IllegalStateError, ValidationError } from '@event-driven-io/emmett';
import { describe, expect, it } from 'vitest';
import type { LedgerCommand } from './commands';
import { currentState, decide, evolve, initialState } from './decider';
import type { LedgerEvent } from './events';

const AT = '2026-08-23T18:00:00.000Z';
const started: LedgerEvent = { type: 'SessionStarted', data: { session: 's1', plan: 'p', day: 'A', at: AT } };
const open = () => evolve(initialState(), started);
const logSet = (over: Partial<Extract<LedgerCommand, { type: 'LogSet' }>['data']> = {}): LedgerCommand => ({
	type: 'LogSet',
	data: { session: 's1', plan: 'p', day: 'A', exercise: 'Goblet Squat', weight: 35, reps: 10, set: 1, at: AT, ...over }
});

describe('decide — sessions', () => {
	it('refuses a second session while one is open', () => {
		expect(() =>
			decide({ type: 'StartSession', data: { sessionId: 's2', plan: 'p', day: 'B', at: AT } }, open())
		).toThrow(IllegalStateError);
	});
	it('refuses a set with no session in progress', () => {
		expect(() => decide(logSet(), initialState())).toThrow(IllegalStateError);
	});
	it('enriches FinishSession from state', () => {
		expect(decide({ type: 'FinishSession', data: { at: AT } }, open())).toEqual([
			{ type: 'SessionFinished', data: { session: 's1', plan: 'p', day: 'A', at: AT } }
		]);
	});
});

describe('decide — LogSet validation', () => {
	it('bounds reps 1–100 and holds 1–600', () => {
		expect(() => decide(logSet({ reps: 0 }), open())).toThrow(ValidationError);
		expect(() => decide(logSet({ reps: 101 }), open())).toThrow(ValidationError);
		expect(() => decide(logSet({ reps: 601, unit: 's' }), open())).toThrow(ValidationError);
		expect(decide(logSet({ reps: 600, unit: 's' }), open())).toHaveLength(1);
	});
	it('bounds weight 0–2000', () => {
		expect(() => decide(logSet({ weight: -1 }), open())).toThrow(ValidationError);
		expect(() => decide(logSet({ weight: 2001 }), open())).toThrow(ValidationError);
		expect(decide(logSet({ weight: 0 }), open())).toHaveLength(1);
	});
	it('treats a duplicate set number as already landed', () => {
		const state = evolve(open(), decide(logSet(), open())[0]);
		expect(decide(logSet({ set: 1 }), state)).toEqual([]);
		expect(decide(logSet({ set: 2 }), state)).toHaveLength(1);
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
	it('folds the retired SessionStruck name through the upcaster', () => {
		const state = currentState([
			started,
			{ type: 'SessionStruck', data: { session: 's1', at: AT } } as unknown as LedgerEvent
		]);
		expect(state.removedSessions.s1).toBe(true);
		expect(state.activeSession).toBeNull();
	});
});
