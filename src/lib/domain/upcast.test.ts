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

	it('asks the plans what discipline an old session was, and remembers the retired ones itself', () => {
		const lookup = (plan: string, routine: string) => (plan === 'p' && routine === 'S' ? ('mobility' as const) : undefined);
		const [s] = upcast(row('SessionStarted', { session: 's1', plan: 'p', day: 'S', at: AT, mode: 'live' }), lookup);
		expect(s.type === 'SessionStarted' && s.data.discipline).toBe('mobility');
		// a kind: 'lift' row with a day the lookup doesn't know is a lift
		const [l] = upcast(row('SessionStarted', { session: 's1', plan: 'p', kind: 'lift', day: 'A', at: AT, mode: 'live' }), lookup);
		expect(l.type === 'SessionStarted' && l.data).toMatchObject({ discipline: 'lift', routine: 'A' });
		// Hold Steady is gone from the table; its sessions still say yoga
		const [y] = upcast(row('SessionStarted', { session: 's1', plan: 'yoga-2day-v1', day: '2', at: AT, mode: 'live' }), lookup);
		expect(y.type === 'SessionStarted' && y.data).toMatchObject({ discipline: 'yoga', routine: '2' });
		// a row that already says what it was is believed over the plan
		const [k] = upcast(row('SessionStarted', { session: 's1', plan: 'p', routine: 'S', discipline: 'yoga', at: AT, mode: 'live' }), lookup);
		expect(k.type === 'SessionStarted' && k.data.discipline).toBe('yoga');
	});

	it('passes a current row through unchanged', () => {
		const started = row('SessionStarted', { session: 's1', plan: 'p', at: AT, mode: 'after', discipline: 'lift', routine: 'A' });
		expect(upcast(started)).toEqual([started]);
		const removed = row('SessionRemoved', { session: 's1', at: AT });
		expect(upcast(removed)).toEqual([removed]);
		const chosen = row('PlanSelected', { plan: 'p', at: AT });
		expect(upcast(chosen)).toEqual([chosen]);
		const prefs = row('PreferencesSet', { at: AT, intents: ['move-better'], equipment: ['mat'] });
		expect(upcast(prefs)).toEqual([prefs]);
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
