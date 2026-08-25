import { describe, expect, it } from 'vitest';
import type { StoredEvent } from './events';
import { runSessionId, upcast, upcastAll } from './upcast';

const AT = '2026-08-23T18:00:00.000Z';
const row = (type: string, data: unknown): StoredEvent => ({ type, data });

describe('the read boundary — old rows read back in the current vocabulary', () => {
	it('fills mode on a SessionStarted written before it existed, and strips what entries never needed', () => {
		expect(upcast(row('SessionStarted', { session: 's1', plan: 'p', day: 'A', at: AT }))).toEqual([
			{ type: 'SessionStarted', data: { session: 's1', plan: 'p', at: AT, mode: 'live', kind: 'lift', day: 'A' } }
		]);
		expect(
			upcast(row('EntryLogged', { session: 's1', plan: 'p', day: 'A', item: 'Warm-up', index: 1, at: AT, measure: { of: 'step' } }))
		).toEqual([{ type: 'EntryLogged', data: { session: 's1', item: 'Warm-up', index: 1, at: AT, measure: { of: 'step' } } }]);
		expect(upcast(row('SessionFinished', { session: 's1', plan: 'p', day: 'A', at: AT }))).toEqual([
			{ type: 'SessionFinished', data: { session: 's1', at: AT } }
		]);
	});

	it('passes a current row through unchanged', () => {
		const started = row('SessionStarted', { session: 's1', plan: 'p', at: AT, mode: 'after', kind: 'lift', day: 'A' });
		expect(upcast(started)).toEqual([started]);
		const removed = row('SessionRemoved', { session: 's1', at: AT });
		expect(upcast(removed)).toEqual([removed]);
		const chosen = row('PlanSelected', { plan: 'p', at: AT });
		expect(upcast(chosen)).toEqual([chosen]);
	});

	it('reads the sentinel run day as the run kind, and a kind as itself', () => {
		expect(upcast(row('SessionStarted', { session: 'r', plan: '', day: 'run', at: AT, mode: 'after' }))).toEqual([
			{ type: 'SessionStarted', data: { session: 'r', plan: '', at: AT, mode: 'after', kind: 'run' } }
		]);
		const run = row('SessionStarted', { session: 'r', plan: 'p', at: AT, mode: 'live', kind: 'run' });
		expect(upcast(run)).toEqual([run]);
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
			data: { session: runSessionId(AT), plan: '', at: '2026-08-23T17:30:00.000Z', mode: 'after', kind: 'run' }
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
