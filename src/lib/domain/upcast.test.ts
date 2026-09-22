import { describe, expect, it } from 'vitest';
import type { StoredEvent } from './events';
import { runSessionId, upcast, upcastAll } from './upcast';

const AT = '2026-08-23T18:00:00.000Z';
const row = (type: string, data: unknown): StoredEvent => ({ type, data });

describe('the read boundary — old rows read back in the current vocabulary', () => {
	it('fills mode and discipline on a SessionStarted written before they existed, and strips what entries never needed', () => {
		expect(upcast(row('SessionStarted', { session: 's1', plan: 'p', day: 'A', at: AT }))).toEqual([
			{ type: 'SessionStarted', data: { session: 's1', plan: 'p', at: AT, mode: 'live', discipline: 'lift', routine: 'A' } }
		]);
		expect(
			upcast(row('EntryLogged', { session: 's1', plan: 'p', day: 'A', item: 'Warm-up', index: 1, at: AT, measure: { of: 'step' } }))
		).toEqual([{ type: 'EntryLogged', data: { session: 's1', item: 'Warm-up', index: 1, at: AT, measure: { of: 'step' } } }]);
		expect(upcast(row('SessionFinished', { session: 's1', plan: 'p', day: 'A', at: AT }))).toEqual([
			{ type: 'SessionFinished', data: { session: 's1', at: AT } }
		]);
	});

	it('knows what every old session was from what its plan said on the day, never from the live plans', () => {
		const was = (plan: string, day: string) => {
			const [s] = upcast(row('SessionStarted', { session: 's1', plan, day, at: AT, mode: 'live' }));
			return s.type === 'SessionStarted' && s.data.discipline;
		};
		expect(was('ab-fullbody-v1', 'S')).toBe('mobility');
		expect(was('ab-fullbody-v1', 'B')).toBe('lift');
		expect(was('her-12-v1', '1')).toBe('lift');
		expect(was('yoga-2day-v1', '2')).toBe('yoga');
		const [l] = upcast(row('SessionStarted', { session: 's1', plan: 'p', kind: 'lift', day: 'A', at: AT, mode: 'live' }));
		expect(l.type === 'SessionStarted' && l.data).toMatchObject({ discipline: 'lift', routine: 'A' });
		const [k] = upcast(row('SessionStarted', { session: 's1', plan: 'ab-fullbody-v1', routine: 'S', discipline: 'yoga', at: AT, mode: 'live' }));
		expect(k.type === 'SessionStarted' && k.data.discipline).toBe('yoga');
	});

	it('passes a current row through unchanged', () => {
		const started = row('SessionStarted', { session: 's1', plan: 'p', at: AT, mode: 'after', discipline: 'lift', routine: 'A' });
		expect(upcast(started)).toEqual([started]);
		const removed = row('SessionRemoved', { session: 's1', at: AT });
		expect(upcast(removed)).toEqual([removed]);
		const chosen = row('ProgrammeSelected', { programme: 'p', at: AT });
		expect(upcast(chosen)).toEqual([chosen]);
		const switched = row('BlockToggled', { block: 'run', on: false, at: AT });
		expect(upcast(switched)).toEqual([switched]);
		const goal = row('GoalSet', { practice: 'run', at: AT, sessions: 2, minutes: 40 });
		expect(upcast(goal)).toEqual([goal]);
	});

	it('reads the retired settings as nothing: the no-gym switch, and a preferences snapshot', () => {
		expect(upcast(row('BlockToggled', { block: 'bw', on: false, at: AT }))).toEqual([]);
		expect(upcast(row('BlockToggled', { block: 'bw', on: true, at: AT }))).toEqual([]);
		expect(upcast(row('PreferencesSet', { at: AT, intents: ['move-better'], equipment: ['mat'] }))).toEqual([]);
		expect(upcast(row('PreferencesSet', { at: AT, intents: ['show-up-more'], equipment: [] }))).toEqual([]);
	});

	it('reads a plan chosen as the programme it was and its blocks switched — one row, several facts', () => {
		expect(upcast(row('PlanSelected', { plan: 'ab-fullbody-v1', at: AT }))).toEqual([
			{ type: 'ProgrammeSelected', data: { programme: 'ab-fullbody-v1', at: AT } },
			{ type: 'BlockToggled', data: { block: 'yoga', on: true, at: AT } },
			{ type: 'BlockToggled', data: { block: 'mob', on: true, at: AT } },
			{ type: 'BlockToggled', data: { block: 'run', on: true, at: AT } }
		]);
		// Full Range of Motion: the run and nothing else
		expect(upcast(row('PlanSelected', { plan: 'her-12-v1', at: AT }))).toEqual([
			{ type: 'ProgrammeSelected', data: { programme: 'her-12-v1', at: AT } },
			{ type: 'BlockToggled', data: { block: 'yoga', on: false, at: AT } },
			{ type: 'BlockToggled', data: { block: 'mob', on: false, at: AT } },
			{ type: 'BlockToggled', data: { block: 'run', on: true, at: AT } }
		]);
		// Hold Steady had no lifting: choosing it switched the blocks and left the programme alone
		expect(upcast(row('PlanSelected', { plan: 'yoga-2day-v1', at: AT }))).toEqual([
			{ type: 'BlockToggled', data: { block: 'yoga', on: true, at: AT } },
			{ type: 'BlockToggled', data: { block: 'mob', on: false, at: AT } },
			{ type: 'BlockToggled', data: { block: 'run', on: false, at: AT } }
		]);
		expect(upcast(row('PlanSelected', { plan: 'p', at: AT }))).toEqual([{ type: 'ProgrammeSelected', data: { programme: 'p', at: AT } }]);
	});

	it('reads the sentinel run day, and the run kind, as the routine called run', () => {
		expect(upcast(row('SessionStarted', { session: 'r', plan: '', day: 'run', at: AT, mode: 'after' }))).toEqual([
			{ type: 'SessionStarted', data: { session: 'r', plan: '', at: AT, mode: 'after', discipline: 'run', routine: 'run' } }
		]);
		expect(upcast(row('SessionStarted', { session: 'r', plan: 'p', at: AT, mode: 'live', kind: 'run' }))).toEqual([
			{ type: 'SessionStarted', data: { session: 'r', plan: 'p', at: AT, mode: 'live', discipline: 'run', routine: 'run' } }
		]);
	});

	it('reads a bodyweight set written as a load of 0 as a reps measure', () => {
		const base = { session: 's1', item: 'Dead Bug', index: 1, at: AT };
		const [e] = upcast(row('EntryLogged', { ...base, measure: { of: 'load', load: 0, reps: 8 } }));
		expect(e.type === 'EntryLogged' && e.data.measure).toEqual({ of: 'reps', reps: 8 });
		const [kept] = upcast(row('EntryLogged', { ...base, measure: { of: 'load', load: 35, reps: 8 } }));
		expect(kept.type === 'EntryLogged' && kept.data.measure).toEqual({ of: 'load', load: 35, reps: 8 });
	});

	it('folds the retired SessionStruck name', () => {
		expect(upcast(row('SessionStruck', { session: 's1', at: AT }))).toEqual([
			{ type: 'SessionRemoved', data: { session: 's1', at: AT } }
		]);
	});

	it('reads a SetLogged as a load entry, a timed one as a hold, a zero-weight one as reps', () => {
		const base = { session: 's1', plan: 'p', day: 'A', exercise: 'Goblet Squat', set: 2, at: AT };
		expect(upcast(row('SetLogged', { ...base, weight: 35, reps: 10 }))).toEqual([
			{ type: 'EntryLogged', data: { session: 's1', item: 'Goblet Squat', index: 2, at: AT, measure: { of: 'load', load: 35, reps: 10 } } }
		]);
		const [hold] = upcast(row('SetLogged', { ...base, weight: 0, reps: 20, unit: 's', target: 20 }));
		expect(hold.type === 'EntryLogged' && hold.data.measure).toEqual({ of: 'hold', seconds: 20, target: 20 });
		const [loaded] = upcast(row('SetLogged', { ...base, weight: 14, reps: 45, unit: 's' }));
		expect(loaded.type === 'EntryLogged' && loaded.data.measure).toEqual({ of: 'hold', seconds: 45, load: 14 });
		const [bw] = upcast(row('SetLogged', { ...base, exercise: 'Sun Salutation A', weight: 0, reps: 3 }));
		expect(bw.type === 'EntryLogged' && bw.data.measure).toEqual({ of: 'reps', reps: 3 });
	});

	it('reads a RunLogged as a whole backdated run session — and its removal as a session removal', () => {
		const out = upcast(row('RunLogged', { minutes: 30, at: AT }));
		expect(out.map((e) => e.type)).toEqual(['SessionStarted', 'EntryLogged', 'SessionFinished']);
		expect(out[0]).toEqual({
			type: 'SessionStarted',
			data: { session: runSessionId(AT), plan: '', at: '2026-08-23T17:30:00.000Z', mode: 'after', discipline: 'run', routine: 'run' }
		});
		expect(out[1].type === 'EntryLogged' && out[1].data.measure).toEqual({ of: 'duration', minutes: 30 });
		expect(out[2]).toEqual({ type: 'SessionFinished', data: { session: runSessionId(AT), at: AT } });
		expect(upcast(row('RunRemoved', { run: AT, at: AT }))).toEqual([
			{ type: 'SessionRemoved', data: { session: runSessionId(AT), at: AT } }
		]);
	});

	it('refuses a name nobody can read', () => {
		expect(() => upcast(row('SetDeleted', {}))).toThrow(/Unknown event type "SetDeleted"/);
	});

	it('is idempotent: reading twice is reading once', () => {
		const rows = [
			row('SessionStarted', { session: 's1', plan: 'p', day: 'A', at: AT }),
			row('SetLogged', { session: 's1', plan: 'p', day: 'A', exercise: 'Dead Bug', weight: 0, reps: 8, set: 1, at: AT }),
			row('RunLogged', { minutes: 30, at: AT })
		];
		const once = upcastAll(rows);
		expect(upcastAll(once)).toEqual(once);
	});
});
