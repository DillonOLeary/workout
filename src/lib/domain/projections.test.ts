import { describe, expect, it } from 'vitest';
import { RUN_DAY, type LedgerEvent, type StoredEvent } from './events';
import type { Exercise, Plan } from './plan';
import { REENTRY_WARN_DAYS, suggest } from './progression';
import { dayAges, dayTitle, historyFor, nextDay, projectRuns, projectSessions, trendFor, weekRunMinutes, weekStrip } from './projections';
import { upcastAll } from './upcast';

const DAY = 86400000;
const NOW = Date.parse('2026-08-23T18:00:00Z');

type Entry = {
	daysAgo: number;
	sets: [weight: number, reps: number, target?: number][];
	unit?: 's';
	removed?: boolean;
	session?: string;
};

/**
 * A stream with one exercise logged across several sessions — written in the
 * RETIRED SetLogged shape on purpose and upcast on the way out, so every fold
 * below also proves the read boundary.
 */
function ledger(name: string, entries: Entry[], now = NOW): LedgerEvent[] {
	const out: StoredEvent[] = [];
	entries.forEach((e, i) => {
		const session = e.session ?? `s${i}`;
		const at = new Date(now - e.daysAgo * DAY).toISOString();
		out.push({ type: 'SessionStarted', data: { session, plan: 'p', day: 'A', at } });
		e.sets.forEach(([weight, reps, target], j) =>
			out.push({
				type: 'SetLogged',
				data: { session, plan: 'p', day: 'A', exercise: name, weight, reps, set: j + 1, at, ...(e.unit ? { unit: e.unit } : {}), ...(target !== undefined ? { target } : {}) }
			})
		);
		out.push({ type: 'SessionFinished', data: { session, plan: 'p', day: 'A', at } });
		if (e.removed) out.push({ type: 'SessionRemoved', data: { session, at } });
	});
	return upcastAll(out);
}
const raw = (type: string, data: unknown): LedgerEvent[] => upcastAll([{ type, data }]);

const goblet: Exercise = { name: 'Goblet Squat', equip: '', tag: '', kind: 'load', sets: 3, lo: 6, hi: 12, start: 35, inc: 5, rack: 'dumbbell' };
const press: Exercise = { name: 'Chest Press', equip: '', tag: '', kind: 'load', sets: 3, lo: 8, hi: 12, start: 45, inc: 5 };
const plank: Exercise = { name: 'Long-Lever Plank', equip: '', tag: '', kind: 'hold', sets: 3, lo: 10, hi: 20, inc: 5 };

describe('historyFor — the seam between the read model and the rule', () => {
	it('lists an exercise newest first, as measures, and leaves out the session in progress', () => {
		const ev = ledger('Goblet Squat', [
			{ daysAgo: 0, sets: [[35, 12], [35, 12], [35, 12]], session: 'live' },
			{ daysAgo: 4, sets: [[35, 8], [35, 8], [35, 8]] },
			{ daysAgo: 9, sets: [[30, 12]] }
		]);
		const h = historyFor(ev, 'Goblet Squat', 'live');
		expect(h.map((x) => x.sets.length)).toEqual([3, 1]);
		expect(h[0].sets[0]).toEqual({ of: 'load', load: 35, reps: 8 });
		expect(historyFor(ev, 'Goblet Squat')).toHaveLength(3);
		expect(historyFor(ev, 'Chest Press')).toEqual([]);
		// the rule reads it straight: excluded → hold, included → increase
		expect(suggest(historyFor(ev, 'Goblet Squat', 'live'), goblet, NOW).kind === 'load' && suggest(h, goblet, NOW)).toMatchObject({ reason: 'hold' });
		expect(suggest(historyFor(ev, 'Goblet Squat'), goblet, NOW)).toMatchObject({ reason: 'increase' });
	});
	it('ignores a removed session for both history and the clock', () => {
		const ev = ledger('Goblet Squat', [
			{ daysAgo: 2, sets: [[50, 12], [50, 12], [50, 12]], removed: true },
			{ daysAgo: 20, sets: [[45, 10], [45, 10], [45, 10]] }
		]);
		const s = suggest(historyFor(ev, 'Goblet Squat'), goblet, NOW);
		expect(s).toMatchObject({ reason: 'reentry', weight: 40 });
		expect(Math.floor(s.daysSince!)).toBe(20);
	});
});

describe('trendFor — the status sentence', () => {
	it('names the starting load before any history', () => {
		const t = trendFor([], goblet, undefined, NOW);
		expect(t.sentence).toBe('Starts at 35 lb');
		expect(t.tone).toBe('start');
		expect(t.points).toEqual([]);
		expect(t.next).toBe(35);
	});
	it('calls a stall by its length', () => {
		const ev = ledger('Goblet Squat', [
			{ daysAgo: 16, sets: [[35, 10], [35, 10], [35, 10]] },
			{ daysAgo: 9, sets: [[35, 10], [35, 10], [35, 10]] },
			{ daysAgo: 2, sets: [[35, 10], [35, 10], [35, 10]] }
		]);
		const t = trendFor(ev, goblet, undefined, NOW);
		expect(t.sentence).toMatch(/^35 lb since Aug 7 — 3 sessions, no change$/);
		expect(t.tone).toBe('flat');
		expect(t.points.map((p) => p.load)).toEqual([35, 35, 35]);
	});
	it('celebrates the set that earned its increase', () => {
		const ev = ledger('Goblet Squat', [{ daysAgo: 2, sets: [[35, 12], [35, 9], [35, 5]] }]);
		const t = trendFor(ev, goblet, undefined, NOW);
		expect(t.sentence).toBe('Set 1 at the top of the range — 40 lb next time');
		expect(t.tone).toBe('up');
		expect(t.points[0].earned).toBe(true);
		expect(t.points[0].missed).toBe(true);
	});
	it('reads a climb across the window', () => {
		const ev = ledger('Goblet Squat', [
			{ daysAgo: 9, sets: [[30, 11], [30, 10], [30, 10]] },
			{ daysAgo: 2, sets: [[35, 10], [35, 10], [35, 10]] }
		]);
		const t = trendFor(ev, goblet, undefined, NOW);
		expect(t.sentence).toBe('↑ 30 → 35 lb since Aug 14');
		expect(t.tone).toBe('up');
	});
	it('warns three days before the re-entry haircut — loads only', () => {
		const ev = ledger('Goblet Squat', [{ daysAgo: 12, sets: [[40, 10], [40, 10], [40, 10]] }]);
		const t = trendFor(ev, goblet, undefined, NOW);
		expect(t.sentence).toBe('Re-entry haircut in 2 days');
		expect(t.tone).toBe('warn');
		expect(REENTRY_WARN_DAYS).toBe(11);
		// a hold has no size to come back lighter at, so no warning either: it reads as what it is
		const held = ledger('Long-Lever Plank', [{ daysAgo: 12, unit: 's', sets: [[0, 20, 20], [0, 20, 20], [0, 20, 20]] }]);
		expect(trendFor(held, plank, undefined, NOW).sentence).toBe('At the ceiling (20s) — make it harder, not longer');
	});
	it('explains an adjustment', () => {
		const ev = ledger('Goblet Squat', [
			{ daysAgo: 9, sets: [[35, 5], [35, 9], [35, 9]] },
			{ daysAgo: 2, sets: [[35, 4], [35, 9], [35, 9]] }
		]);
		const t = trendFor(ev, goblet, undefined, NOW);
		expect(t.sentence).toBe('Missed the bottom twice at 35 — back to 30 lb next time');
		expect(t.tone).toBe('down');
	});
	it('caps a hold at its ceiling', () => {
		const ev = ledger('Long-Lever Plank', [{ daysAgo: 2, sets: [[0, 20, 20], [0, 20, 20], [0, 20, 20]], unit: 's' }]);
		const t = trendFor(ev, plank, undefined, NOW);
		expect(t.sentence).toBe('At the ceiling (20s) — make it harder, not longer');
		expect(t.next).toBe(20);
	});
	it('windows to the last seven sessions but counts them all', () => {
		const ev = ledger(
			'Goblet Squat',
			Array.from({ length: 9 }, (_, i) => ({ daysAgo: 2 + i * 3, sets: [[35, 10], [35, 10], [35, 10]] as [number, number][] }))
		);
		const t = trendFor(ev, goblet, undefined, NOW);
		expect(t.points).toHaveLength(7);
		expect(t.sessions).toBe(9);
	});
});

describe('weekStrip', () => {
	it('marks lifts, runs and today, Monday first', () => {
		// NOW is a Sunday: the week runs Mon (6 days ago) → today
		const ev = [
			...ledger('Goblet Squat', [{ daysAgo: 2, sets: [[35, 10]] }]),
			...raw('RunLogged', { minutes: 30, at: new Date(NOW - 5 * DAY).toISOString() })
		];
		const cells = weekStrip(ev, NOW);
		expect(cells.map((c) => c.label).join('')).toBe('MTWTFSS');
		expect(cells[6].today).toBe(true);
		expect(cells[4].lifted).toBe(true);
		expect(cells[1].ran).toBe(true);
		expect(cells.filter((c) => c.lifted)).toHaveLength(1);
		expect(cells.every((c) => !c.future)).toBe(true);
	});
});

describe('dayAges', () => {
	it('reports days since each plan day was last finished', () => {
		const plan: Plan = { id: 'p', name: 'p', schedule: '', days: { A: [goblet], B: [press] } };
		const ev = ledger('Goblet Squat', [{ daysAgo: 12, sets: [[35, 10]] }]);
		const ages = dayAges(ev, plan, NOW);
		expect(ages.find((a) => a.day === 'A')?.daysSince).toBeCloseTo(12, 5);
		expect(ages.find((a) => a.day === 'B')?.daysSince).toBeNull();
	});
});

describe('runs as sessions', () => {
	const at = new Date(NOW - 2 * DAY).toISOString();
	const plan: Plan = { id: 'p', name: 'P', schedule: '', days: { A: [goblet], B: [press] }, run: { title: 'Easy run', minutes: 30 } };

	it('reads a retired RunLogged as a finished, backdated, one-entry run', () => {
		const ev = raw('RunLogged', { minutes: 32, at });
		const [s] = projectSessions(ev);
		expect(s.isRun).toBe(true);
		expect(s.minutes).toBe(32);
		expect(s.mode).toBe('after');
		expect(s.finished).toBe(true);
		expect(s.rows).toEqual([]);
		expect(s.entries).toBe(1);
		expect(projectRuns(ev)).toEqual([{ at: s.at, dateLabel: s.dateLabel, minutes: 32, session: s.id }]);
		expect(weekRunMinutes(ev, NOW)).toBe(32);
		expect(weekRunMinutes([...ev, ...raw('RunRemoved', { run: at, at })], NOW)).toBe(0);
	});
	it('keeps runs out of the day rotation', () => {
		const ev = [...ledger('Goblet Squat', [{ daysAgo: 4, sets: [[35, 10]] }]), ...raw('RunLogged', { minutes: 30, at })];
		expect(nextDay(ev, plan)).toBe('B');
	});
	it('counts prep entries without making them rows', () => {
		const ev: LedgerEvent[] = [
			{ type: 'SessionStarted', data: { session: 'x', plan: 'p', day: 'A', at, mode: 'live' } },
			{ type: 'EntryLogged', data: { session: 'x', item: 'Warm-up', index: 1, at, measure: { of: 'step' } } },
			{ type: 'EntryLogged', data: { session: 'x', item: 'Goblet Squat', index: 1, at, measure: { of: 'load', load: 35, reps: 10 } } },
			{ type: 'EntryLogged', data: { session: 'x', item: 'Plank', index: 1, at, measure: { of: 'hold', seconds: 20, target: 20 } } }
		];
		const [s] = projectSessions(ev);
		expect(s.prep).toBe(1);
		expect(s.entries).toBe(3);
		expect(s.isRun).toBe(false);
		expect(s.mode).toBe('live');
		expect(s.rows).toEqual([
			{ item: 'Goblet Squat', sets: [{ of: 'load', load: 35, reps: 10 }] },
			{ item: 'Plank', sets: [{ of: 'hold', seconds: 20, target: 20 }] }
		]);
	});
	it('names a run by the plan', () => {
		expect(dayTitle(plan, RUN_DAY)).toBe('Easy run');
		expect(dayTitle(undefined, RUN_DAY)).toBe('Run');
	});
});
