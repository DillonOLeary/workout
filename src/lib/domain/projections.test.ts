import { describe, expect, it } from 'vitest';
import { RUN, lift, type LedgerEvent, type StoredEvent } from './events';
import { countOf } from './measure';
import type { Exercise, Plan } from './plan';
import { REENTRY_WARN_DAYS, suggest } from './progression';
import { dayAges, dayTitle, historyFor, nextDay, nextWorkout, projectRuns, projectSessions, sessionEntries, trendFor, weekRunMinutes, weekStrip } from './projections';
import { upcastAll } from './upcast';

const DAY = 86400000;
const NOW = Date.parse('2026-08-23T18:00:00Z');

type Entry = {
	daysAgo: number;
	sets: [weight: number, reps: number, target?: number][];
	unit?: 's';
	removed?: boolean;
	session?: string;
	day?: string;
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
		out.push({ type: 'SessionStarted', data: { session, plan: 'p', day: e.day ?? 'A', at } });
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

describe('corrections — the last word on an entry', () => {
	const at = new Date(NOW - DAY).toISOString();
	const base: LedgerEvent[] = [
		{ type: 'SessionStarted', data: { session: 'x', plan: 'p', kind: 'lift', day: 'A', at, mode: 'live' } },
		{ type: 'EntryLogged', data: { session: 'x', item: 'Goblet Squat', index: 1, at, measure: { of: 'load', load: 35, reps: 10 } } },
		{ type: 'EntryLogged', data: { session: 'x', item: 'Goblet Squat', index: 2, at, measure: { of: 'load', load: 35, reps: 9 } } },
		{ type: 'EntryLogged', data: { session: 'x', item: 'Run', index: 1, at, measure: { of: 'duration', minutes: 30 } } }
	];
	const fixed: LedgerEvent[] = [
		...base,
		{ type: 'EntryCorrected', data: { session: 'x', item: 'Goblet Squat', index: 1, at: new Date(NOW).toISOString(), measure: { of: 'load', load: 40, reps: 8 } } },
		{ type: 'EntryCorrected', data: { session: 'x', item: 'Run', index: 1, at: new Date(NOW).toISOString(), measure: { of: 'duration', minutes: 32 } } },
		{ type: 'EntryCorrected', data: { session: 'x', item: 'Goblet Squat', index: 3, at, measure: { of: 'load', load: 1, reps: 1 } } } // never logged: ignored
	];
	it('replaces the set in place, so the rule and the ledger read the corrected number', () => {
		const [s] = projectSessions(fixed);
		expect(s.rows).toEqual([{ item: 'Goblet Squat', sets: [{ of: 'load', load: 40, reps: 8 }, { of: 'load', load: 35, reps: 9 }], indices: [1, 2] }]);
		expect(s.minutes).toBe(32);
		expect(s.entries).toBe(3);
		expect(historyFor(fixed, 'Goblet Squat')[0].sets[0]).toEqual({ of: 'load', load: 40, reps: 8 });
	});
	it('keeps sets in set order whatever order they arrived, and says which set each was', () => {
		const swapped = [base[0], base[2], base[1]];
		expect(projectSessions(swapped)[0].rows[0].sets.map((m) => countOf(m))).toEqual([10, 9]);
		// set 1 skipped: the row still knows the one set it has is set 2
		const skipped = [base[0], base[2]];
		expect(projectSessions(skipped)[0].rows[0]).toEqual({ item: 'Goblet Squat', sets: [{ of: 'load', load: 35, reps: 9 }], indices: [2] });
	});
	it('hands the floor its entries with the correction applied and the original clock kept', () => {
		const entries = sessionEntries(fixed, 'x');
		expect(entries.map((e) => e.measure)).toEqual([
			{ of: 'load', load: 40, reps: 8 },
			{ of: 'load', load: 35, reps: 9 },
			{ of: 'duration', minutes: 32 }
		]);
		expect(entries[0].at).toBe(at);
		expect(sessionEntries(fixed, 'other')).toEqual([]);
	});
});

describe('nextWorkout — the pick, and why', () => {
	const stretch: Exercise = { name: 'Calf stretch', equip: 'Mat', tag: '', kind: 'hold', sets: 2, lo: 45, hi: 45, inc: 0, side: 'sets' };
	const plan: Plan = {
		id: 'p', name: 'P', schedule: '',
		dayInfo: { A: { title: 'Squat & Shove' }, B: { title: 'Hinge & Haul' }, S: { title: 'Morning stretch', kind: 'stretch' } },
		days: { A: [goblet], B: [press], S: [stretch] }
	};
	it('says "first session" before any history', () => {
		expect(nextWorkout([], plan, NOW)).toEqual({ day: 'A', why: 'First session' });
	});
	it('alternates lifts, skipping the stretch day, and names what the rule moves', () => {
		// A two days ago with set 1 at the top → B is due, and A's stretch session yesterday changes nothing
		const ev: LedgerEvent[] = [
			...ledger('Goblet Squat', [{ daysAgo: 2, sets: [[35, 12], [35, 9], [35, 5]] }]),
			{ type: 'SessionStarted', data: { session: 'st', plan: 'p', kind: 'lift', day: 'S', at: new Date(NOW - DAY).toISOString(), mode: 'live' } },
			{ type: 'SessionFinished', data: { session: 'st', at: new Date(NOW - DAY).toISOString() } }
		];
		expect(nextDay(ev, plan)).toBe('B');
		expect(nextWorkout(ev, plan, NOW)).toEqual({ day: 'B', why: '2 days since Squat & Shove' });
		// the day that is due has something to say
		const back: LedgerEvent[] = [
			...ledger('Chest Press', [{ daysAgo: 4, sets: [[45, 12], [45, 12], [45, 10]], day: 'B', session: 'b' }]),
			...ledger('Goblet Squat', [{ daysAgo: 2, sets: [[35, 10]], session: 'a' }])
		];
		expect(nextWorkout(back, plan, NOW).why).toBe('2 days since Squat & Shove · sets 1–2 go up on the Chest Press');
	});
	it('folds the re-entry warning into the line, and a haircut into the move', () => {
		// A twelve days ago → B is the pick; B has no age of its own, so no warning — just the distance
		const evA = ledger('Goblet Squat', [{ daysAgo: 12, sets: [[35, 10], [35, 10], [35, 10]] }]);
		expect(nextWorkout(evA, plan, NOW)).toEqual({ day: 'B', why: '12 days since Squat & Shove' });
		// B twelve days ago and A yesterday → B is the pick, and about to take the haircut
		const evB = [
			...ledger('Chest Press', [{ daysAgo: 12, sets: [[45, 10], [45, 10], [45, 10]], day: 'B', session: 'b' }]),
			...ledger('Goblet Squat', [{ daysAgo: 1, sets: [[35, 10], [35, 10], [35, 10]], session: 'a' }])
		];
		expect(nextWorkout(evB, plan, NOW)).toEqual({ day: 'B', why: 'Re-entry haircut in 2 days · 1 day since Squat & Shove' });
		// past the fortnight, the move says so instead (55 → 50: re-entry never goes below the plan's start)
		const gone = [
			...ledger('Chest Press', [{ daysAgo: 16, sets: [[55, 10], [55, 10], [55, 10]], day: 'B', session: 'b' }]),
			...ledger('Goblet Squat', [{ daysAgo: 2, sets: [[35, 10]], session: 'a' }])
		];
		expect(nextWorkout(gone, plan, NOW)).toEqual({ day: 'B', why: '2 days since Squat & Shove · Chest Press comes back a size' });
	});
});

describe('weekStrip', () => {
	it('marks a stretch day as stretched, never lifted', () => {
		const plan: Plan = { id: 'p', name: 'P', schedule: '', dayInfo: { S: { title: 'Stretch', kind: 'stretch' } }, days: { A: [goblet], S: [] } };
		const at = new Date(NOW - 2 * DAY).toISOString();
		const ev: LedgerEvent[] = [
			{ type: 'SessionStarted', data: { session: 'st', plan: 'p', kind: 'lift', day: 'S', at, mode: 'live' } },
			{ type: 'SessionFinished', data: { session: 'st', at } }
		];
		const cells = weekStrip(ev, NOW, [plan]);
		expect(cells[4]).toMatchObject({ stretched: true, lifted: false });
		// without the plans, a stretch session reads as a lift — the plan's word is what tells them apart
		expect(weekStrip(ev, NOW)[4]).toMatchObject({ stretched: false, lifted: true });
	});
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
		expect(s.workout).toEqual(RUN);
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
			{ type: 'SessionStarted', data: { session: 'x', plan: 'p', kind: 'lift', day: 'A', at, mode: 'live' } },
			{ type: 'EntryLogged', data: { session: 'x', item: 'Warm-up', index: 1, at, measure: { of: 'step' } } },
			{ type: 'EntryLogged', data: { session: 'x', item: 'Goblet Squat', index: 1, at, measure: { of: 'load', load: 35, reps: 10 } } },
			{ type: 'EntryLogged', data: { session: 'x', item: 'Plank', index: 1, at, measure: { of: 'hold', seconds: 20, target: 20 } } }
		];
		const [s] = projectSessions(ev);
		expect(s.prep).toBe(1);
		expect(s.entries).toBe(3);
		expect(s.workout).toEqual(lift('A'));
		expect(s.mode).toBe('live');
		expect(s.rows).toEqual([
			{ item: 'Goblet Squat', sets: [{ of: 'load', load: 35, reps: 10 }], indices: [1] },
			{ item: 'Plank', sets: [{ of: 'hold', seconds: 20, target: 20 }], indices: [1] }
		]);
	});
	it('names a run by the plan', () => {
		expect(dayTitle(plan, RUN)).toBe('Easy run');
		expect(dayTitle(undefined, RUN)).toBe('Run');
		expect(dayTitle(plan, lift('A'))).toBe('Workout A');
	});
});
