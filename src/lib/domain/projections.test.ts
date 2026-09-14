import { describe, expect, it } from 'vitest';
import type { LedgerEvent, StoredEvent } from './events';
import { countOf } from './measure';
import type { Discipline, Exercise, Plan } from './plan';
import { DEFAULT_PREFERENCES, type Preferences } from './preferences';
import { REENTRY_WARN_DAYS, suggest } from './progression';
import {
	historyFor, monthGrid, nextInCycle, preferences, projectSessions, queue, sessionEntries, staleness, trendFor, weekProgress, weeklyPace
} from './projections';
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
 * below also proves the read boundary. No lookup: every day reads as a lift.
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
/** A finished session in the current shape — a stretch, a yoga flow, whatever it says it was. */
const did = (session: string, routine: string, discipline: Discipline, daysAgo: number, plan = 'p'): LedgerEvent[] => {
	const at = new Date(NOW - daysAgo * DAY).toISOString();
	return [
		{ type: 'SessionStarted', data: { session, plan, discipline, routine, at, mode: 'live' } },
		{ type: 'SessionFinished', data: { session, at } }
	];
};

const goblet: Exercise = { name: 'Goblet Squat', equip: '', tag: '', kind: 'load', sets: 3, lo: 6, hi: 12, progress: { of: 'size', start: 35, inc: 5, rack: 'dumbbell' } };
const press: Exercise = { name: 'Chest Press', equip: '', tag: '', kind: 'load', sets: 3, lo: 8, hi: 12, progress: { of: 'size', start: 45, inc: 5 } };
const plank: Exercise = { name: 'Long-Lever Plank', equip: '', tag: '', kind: 'hold', sets: 3, lo: 10, hi: 20, progress: { of: 'time', inc: 5 } };
const stretch: Exercise = { name: 'Calf stretch', equip: 'Mat', tag: '', kind: 'hold', sets: 2, lo: 45, hi: 45, progress: { of: 'none' }, side: 'sets' };
const runEx: Exercise = { name: 'Easy run', equip: 'Shoes', tag: '', kind: 'run', sets: 1, lo: 30, hi: 30, progress: { of: 'none' } };
const pushup: Exercise = { name: 'Push-up', equip: '', tag: '', kind: 'reps', sets: 2, lo: 8, hi: 15, progress: { of: 'variant', ladder: ['Incline push-up', 'Push-up'] } };

/** Open to Work, in miniature: three cycles that turn on their own, and a no-gym block that stands in for the lift. */
const plan: Plan = {
	id: 'p', name: 'P', schedule: '',
	cycles: [
		{ id: 'lift', title: 'Lift', routines: ['A', 'B'], target: 3 },
		{ id: 'mob', title: 'Stretch', routines: ['S'], target: 3 },
		{ id: 'run', title: 'Run', routines: ['run'], target: 3 },
		{ id: 'bw', title: 'No gym', routines: ['bw1', 'S'], target: 0, standsInFor: 'lift' }
	],
	routineInfo: {
		A: { title: 'Squat & Shove', discipline: 'lift' },
		B: { title: 'Hinge & Haul', discipline: 'lift' },
		S: { title: 'Morning stretch', discipline: 'mobility' },
		run: { title: 'Easy run', discipline: 'run' },
		bw1: { title: 'Push & Squat', discipline: 'bodyweight' }
	},
	routines: { A: [goblet], B: [press], S: [stretch], run: [runEx], bw1: [pushup] }
};
const [LIFT, MOB, RUN, BW] = plan.cycles;

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
		expect(suggest(h, goblet, NOW)).toMatchObject({ reason: 'hold' });
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
	it('says when a ladder went up a rung, and when it has run out', () => {
		const up = ledger('Push-up', [{ daysAgo: 2, sets: [[0, 15], [0, 15]] }]);
		expect(trendFor(up, pushup, undefined, NOW)).toMatchObject({ tone: 'up', sentence: 'Every set at the top — up a rung: Push-up', next: 8 });
		const out = ledger('Push-up', [{ daysAgo: 2, sets: [[0, 15], [0, 15]] }, { daysAgo: 6, sets: [[0, 15], [0, 15]], session: 'x' }]);
		expect(trendFor(out, pushup, undefined, NOW).sentence).toBe('Top of the ladder (Push-up) — make it harder');
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
		{ type: 'SessionStarted', data: { session: 'x', plan: 'p', discipline: 'lift', routine: 'A', at, mode: 'live' } },
		{ type: 'EntryLogged', data: { session: 'x', item: 'Goblet Squat', index: 1, at, measure: { of: 'load', load: 35, reps: 10 } } },
		{ type: 'EntryLogged', data: { session: 'x', item: 'Goblet Squat', index: 2, at, measure: { of: 'load', load: 35, reps: 9 } } },
		{ type: 'EntryLogged', data: { session: 'x', item: 'Easy run', index: 1, at, measure: { of: 'duration', minutes: 30 } } }
	];
	const fixed: LedgerEvent[] = [
		...base,
		{ type: 'EntryCorrected', data: { session: 'x', item: 'Goblet Squat', index: 1, at: new Date(NOW).toISOString(), measure: { of: 'load', load: 40, reps: 8 } } },
		{ type: 'EntryCorrected', data: { session: 'x', item: 'Easy run', index: 1, at: new Date(NOW).toISOString(), measure: { of: 'duration', minutes: 32 } } },
		{ type: 'EntryCorrected', data: { session: 'x', item: 'Goblet Squat', index: 3, at, measure: { of: 'load', load: 1, reps: 1 } } } // never logged: ignored
	];
	it('replaces the set in place, so the rule and the ledger read the corrected number', () => {
		const [s] = projectSessions(fixed);
		expect(s.rows).toEqual([{ item: 'Goblet Squat', sets: [{ of: 'load', load: 40, reps: 8 }, { of: 'load', load: 35, reps: 9 }], indices: [1, 2] }]);
		expect(s.minutes).toBe(32);
		expect(s.durations).toEqual([{ item: 'Easy run', index: 1, minutes: 32 }]);
		expect(s.entries).toBe(3);
		expect(s.discipline).toBe('lift');
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

describe('cycles — where each one is turned to, and how far behind', () => {
	it('turns to the routine after the last one finished; a removed one, another plan’s, or an unfinished one does not count', () => {
		expect(nextInCycle([], plan, LIFT)).toBe('A');
		expect(nextInCycle(ledger('Goblet Squat', [{ daysAgo: 2, sets: [[35, 10]] }]), plan, LIFT)).toBe('B');
		expect(nextInCycle(ledger('Chest Press', [{ daysAgo: 2, sets: [[45, 10]], day: 'B' }]), plan, LIFT)).toBe('A');
		// B twice: the pointer sits after B — the cycle follows you, not a calendar
		expect(nextInCycle(ledger('Chest Press', [{ daysAgo: 4, sets: [[45, 10]], day: 'B' }, { daysAgo: 2, sets: [[45, 10]], day: 'B' }]), plan, LIFT)).toBe('A');
		expect(nextInCycle(ledger('Goblet Squat', [{ daysAgo: 2, sets: [[35, 10]], removed: true }]), plan, LIFT)).toBe('A');
		expect(nextInCycle(did('o', 'A', 'lift', 2, 'other'), plan, LIFT)).toBe('A');
		expect(nextInCycle([...did('h', 'S', 'mobility', 2)], plan, BW)).toBe('bw1'); // the mixed cycle turns on the shared routine
		// a session still open has not turned the cycle
		const open: LedgerEvent = { type: 'SessionStarted', data: { session: 'o', plan: 'p', discipline: 'lift', routine: 'A', at: new Date(NOW).toISOString(), mode: 'live' } };
		expect(nextInCycle([open], plan, LIFT)).toBe('A');
	});
	it('counts this cycle’s sessions in the trailing week, by what the session says it was', () => {
		const ev = [
			...ledger('Goblet Squat', [{ daysAgo: 1, sets: [[35, 10]] }, { daysAgo: 6, sets: [[35, 10]] }, { daysAgo: 8, sets: [[35, 10]] }]),
			...did('st', 'S', 'mobility', 3),
			...did('y', 'hips', 'yoga', 2, 'other'),
			...raw('RunLogged', { minutes: 30, at: new Date(NOW - 2 * DAY).toISOString() })
		];
		expect(weekProgress(ev, plan, LIFT, NOW)).toEqual({ done: 2, target: 3 });
		expect(weekProgress(ev, plan, MOB, NOW)).toEqual({ done: 1, target: 3 });
		expect(weekProgress(ev, plan, RUN, NOW)).toEqual({ done: 1, target: 3 });
		// the no-gym block is lifts and stretches: it counts both, and asks for nothing
		expect(weekProgress(ev, plan, BW, NOW)).toEqual({ done: 1, target: 0 });
		expect(staleness(ev, plan, NOW).map((s) => [s.cycle, s.daysSince === null ? null : Math.round(s.daysSince)])).toEqual([
			['lift', 1], ['mob', 3], ['run', 2], ['bw', 3]
		]);
		expect(staleness([], plan, NOW).every((s) => s.daysSince === null)).toBe(true);
	});
});

describe('preferences — the last snapshot wins', () => {
	it('folds to the defaults until something is said, then to the last thing said', () => {
		expect(preferences([])).toEqual(DEFAULT_PREFERENCES);
		const ev: LedgerEvent[] = [
			{ type: 'PreferencesSet', data: { at: new Date(NOW - DAY).toISOString(), intents: ['move-better'], equipment: ['gym', 'mat'] } },
			{ type: 'PreferencesSet', data: { at: new Date(NOW).toISOString(), intents: ['run-better'], equipment: ['shoes'] } }
		];
		expect(preferences(ev)).toEqual({ intents: ['run-better'], equipment: ['shoes'] });
	});
});

describe('queue — one candidate per cycle, ranked', () => {
	const first = (ev: LedgerEvent[], prefs: Preferences = DEFAULT_PREFERENCES) => queue(ev, plan, prefs, NOW)[0];
	it('offers every cycle once and says why in one line', () => {
		const q = queue([], plan, DEFAULT_PREFERENCES, NOW);
		// the no-gym block is not asked for — but with everything behind it shows up, last
		expect(q.map((c) => c.cycle)).toEqual(['mob', 'lift', 'run', 'bw']);
		expect(q.map((c) => c.workout.routine)).toEqual(['S', 'A', 'run', 'bw1']);
		expect(q.map((c) => c.discipline)).toEqual(['mobility', 'lift', 'run', 'bodyweight']);
		expect(q[1]).toMatchObject({ title: 'Squat & Shove', why: 'First session · 0 of 3 this week', out: false });
		expect(q.every((c) => c.why.length > 0 && c.minutes > 0)).toBe(true);
	});
	it('leads with what is owed, then what is stalest, then what is shortest', () => {
		// lifted yesterday and today, ran once, never stretched → the stretch is furthest behind
		const ev = [
			...ledger('Goblet Squat', [{ daysAgo: 1, sets: [[35, 10]] }]),
			...ledger('Chest Press', [{ daysAgo: 0, sets: [[45, 10]], day: 'B', session: 'b' }]),
			...raw('RunLogged', { minutes: 30, at: new Date(NOW - 3 * DAY).toISOString() })
		];
		// and with everything that was asked for behind, the no-gym block shows up — last
		expect(queue(ev, plan, DEFAULT_PREFERENCES, NOW).map((c) => c.cycle)).toEqual(['mob', 'run', 'lift', 'bw']);
		// everything done twice this week: all one short, the run a whole cadence staler — it leads,
		// and the other two fall to minutes, shortest first
		const even = [
			...ledger('Goblet Squat', [{ daysAgo: 1, sets: [[35, 10]] }, { daysAgo: 3, sets: [[35, 10]], day: 'B', session: 'b' }]),
			...raw('RunLogged', { minutes: 30, at: new Date(NOW - 3 * DAY).toISOString() }),
			...raw('RunLogged', { minutes: 30, at: new Date(NOW - 5 * DAY).toISOString() }),
			...did('s1', 'S', 'mobility', 1), ...did('s2', 'S', 'mobility', 2)
		];
		expect(queue(even, plan, DEFAULT_PREFERENCES, NOW).map((c) => c.cycle)).toEqual(['run', 'mob', 'lift', 'bw']);
	});
	it('says what the rule is about to move, in the grammar Today already speaks', () => {
		const back = [
			...ledger('Chest Press', [{ daysAgo: 4, sets: [[45, 12], [45, 12], [45, 10]], day: 'B', session: 'b' }]),
			...ledger('Goblet Squat', [{ daysAgo: 2, sets: [[35, 10]], session: 'a' }])
		];
		const lift = queue(back, plan, DEFAULT_PREFERENCES, NOW).find((c) => c.cycle === 'lift')!;
		expect(lift.workout.routine).toBe('B');
		expect(lift.why).toBe('2 days since Squat & Shove · sets 1–2 go up on the Chest Press');
		const gone = [
			...ledger('Chest Press', [{ daysAgo: 16, sets: [[55, 10], [55, 10], [55, 10]], day: 'B', session: 'b' }]),
			...ledger('Goblet Squat', [{ daysAgo: 2, sets: [[35, 10]], session: 'a' }])
		];
		expect(queue(gone, plan, DEFAULT_PREFERENCES, NOW).find((c) => c.cycle === 'lift')!.why).toBe('2 days since Squat & Shove · Chest Press comes back a size');
		// B twelve days ago and A yesterday → B is due, and about to take the haircut
		const warn = [
			...ledger('Chest Press', [{ daysAgo: 12, sets: [[45, 10], [45, 10], [45, 10]], day: 'B', session: 'b' }]),
			...ledger('Goblet Squat', [{ daysAgo: 1, sets: [[35, 10], [35, 10], [35, 10]], session: 'a' }])
		];
		expect(queue(warn, plan, DEFAULT_PREFERENCES, NOW).find((c) => c.cycle === 'lift')!.why).toBe('Re-entry haircut in 2 days · 1 day since Squat & Shove · 1 of 3 this week');
		const today = ledger('Goblet Squat', [{ daysAgo: 0, sets: [[35, 10]] }]);
		expect(queue(today, plan, DEFAULT_PREFERENCES, NOW).find((c) => c.cycle === 'lift')!.why).toBe('Squat & Shove today · 1 of 3 this week');
	});
	it('rules a routine out by equipment, never hides it, and lets the floor stand in for the gym', () => {
		const noGym = queue([], plan, { intents: [], equipment: ['mat', 'shoes'] }, NOW);
		const lift = noGym.find((c) => c.cycle === 'lift')!;
		expect(lift).toMatchObject({ out: true, why: 'needs a gym' });
		expect(noGym[noGym.length - 1].cycle).toBe('lift');
		const bw = noGym.find((c) => c.cycle === 'bw')!;
		expect(bw.out).toBe(false);
		expect(bw.why).toBe('First session · 0 of 3 this week'); // the lift's target, inherited
		// take the gym back and the block goes quiet again — on a week where not everything is behind
		const busy = [...ledger('Goblet Squat', [{ daysAgo: 1, sets: [[35, 10]] }, { daysAgo: 2, sets: [[35, 10]], day: 'B', session: 'b' }, { daysAgo: 3, sets: [[35, 10]], session: 'c' }])];
		expect(queue(busy, plan, DEFAULT_PREFERENCES, NOW).map((c) => c.cycle)).toEqual(['mob', 'run', 'lift']);
		// no shoes: the run drops to the bottom, and says so
		const noShoes = queue([], plan, { intents: [], equipment: ['gym', 'mat'] }, NOW);
		expect(noShoes.find((c) => c.cycle === 'run')).toMatchObject({ out: true, why: 'needs running shoes' });
	});
	it('weights a discipline up by one session when an intent names it', () => {
		const ev = [
			...ledger('Goblet Squat', [{ daysAgo: 1, sets: [[35, 10]] }]),
			...did('s1', 'S', 'mobility', 1), ...did('s2', 'S', 'mobility', 3),
			...raw('RunLogged', { minutes: 30, at: new Date(NOW - 2 * DAY).toISOString() }),
			...raw('RunLogged', { minutes: 30, at: new Date(NOW - 4 * DAY).toISOString() })
		];
		// the lift is two sessions short, the others one: the lift leads
		expect(first(ev).cycle).toBe('lift');
		// "move better" is one more stretch owed — a tie with the lift, and the shorter one wins it
		const asked = first(ev, { intents: ['move-better'], equipment: DEFAULT_PREFERENCES.equipment });
		expect(asked.cycle).toBe('mob');
		expect(asked.why).toMatch(/you asked for this$/);
		// everything at 1 of 3 and nothing stale: the shortest routine is the ask
		const flat = [
			...ledger('Goblet Squat', [{ daysAgo: 1, sets: [[35, 10]] }]),
			...did('s1', 'S', 'mobility', 1),
			...raw('RunLogged', { minutes: 30, at: new Date(NOW - 2 * DAY).toISOString() })
		];
		expect(first(flat).cycle).toBe('mob');
	});
});

describe('monthGrid', () => {
	const flat = (ev: LedgerEvent[]) => monthGrid(ev, NOW).weeks.flat();

	it('says what each session on a day was, in the order they happened', () => {
		const at = new Date(NOW - 2 * DAY).toISOString();
		const ev: LedgerEvent[] = [
			...did('st', 'S', 'mobility', 2),
			{ type: 'SessionStarted', data: { session: 'l', plan: 'p', discipline: 'lift', routine: 'A', at: new Date(Date.parse(at) + 3600000).toISOString(), mode: 'live' } }
		];
		// NOW is a Sunday: the grid ends on it, so two days ago is the 33rd of 35
		expect(flat(ev)[32].did).toEqual(['mobility', 'lift']);
		expect(flat(ev)[31].did).toEqual([]);
	});

	it('is five weeks of days, Monday first, ending on today', () => {
		const ev = [
			...ledger('Goblet Squat', [{ daysAgo: 2, sets: [[35, 10]] }, { daysAgo: 20, sets: [[35, 10]], session: 'old' }]),
			...raw('RunLogged', { minutes: 30, at: new Date(NOW - 5 * DAY).toISOString() })
		];
		const grid = monthGrid(ev, NOW);
		expect(grid.weekdays.join('')).toBe('MTWTFSS');
		expect(grid.weeks).toHaveLength(5);
		expect(grid.weeks.every((w) => w.length === 7)).toBe(true);
		const cells = grid.weeks.flat();
		expect(cells).toHaveLength(35);
		// the last cell is today, and nothing in the window is in the future
		expect(cells[34]).toMatchObject({ today: true, date: new Date(NOW).getDate() });
		expect(cells.filter((c) => c.today)).toHaveLength(1);
		expect(cells.every((c) => !c.future)).toBe(true);
		expect(cells[32].did).toEqual(['lift']);
		expect(cells[29].did).toEqual(['run']);
		// a session three weeks back is inside the month, where a week strip would have lost it
		expect(cells.filter((c) => c.did.includes('lift'))).toHaveLength(2);
		expect(cells[14].did).toEqual(['lift']);
		expect(cells[0].label).toBe('Mon, Jul 20');
		expect(grid.span).toBe('Jul 20 – Aug 23');
	});

	it('greys the rest of this week, and only this week', () => {
		const mid = Date.parse('2026-08-19T18:00:00Z'); // a Wednesday
		const cells = monthGrid([], mid).weeks.flat();
		expect(cells.filter((c) => c.future)).toHaveLength(4); // Thu → Sun
		expect(cells[30]).toMatchObject({ today: true, future: false });
	});
});

describe('weeklyPace — the running average', () => {
	it('averages sessions a week per discipline, against the window before', () => {
		const ev = [
			// four lifts in the trailing four weeks, two in the four before it
			...ledger('Goblet Squat', [
				{ daysAgo: 1, sets: [[35, 10]] },
				{ daysAgo: 8, sets: [[35, 10]] },
				{ daysAgo: 15, sets: [[35, 10]] },
				{ daysAgo: 22, sets: [[35, 10]] },
				{ daysAgo: 30, sets: [[35, 10]] },
				{ daysAgo: 44, sets: [[35, 10]] }
			]),
			...did('st', 'S', 'mobility', 3),
			...raw('RunLogged', { minutes: 30, at: new Date(NOW - 2 * DAY).toISOString() }),
			...raw('RunLogged', { minutes: 20, at: new Date(NOW - 2 * DAY + 3600000).toISOString() }), // twice in one day
			...raw('RunLogged', { minutes: 40, at: new Date(NOW - 9 * DAY).toISOString() }),
			...raw('RunLogged', { minutes: 60, at: new Date(NOW - 35 * DAY).toISOString() })
		];
		const pace = weeklyPace(ev, NOW);
		expect(pace.days).toBe(28);
		// a stretch is not a lift, and the rate is per week, not per window
		expect(pace.by.lift).toEqual({ per: 1, prev: 0.5 });
		expect(pace.by.mobility.per).toBe(0.25);
		expect(pace.by.run.per).toBe(0.75);
		expect(pace.by.run.prev).toBe(0.25);
		expect(pace.by.yoga).toEqual({ per: 0, prev: 0 });
	});

	it('divides by the window it was given, and leaves a removed session out', () => {
		const ev = ledger('Goblet Squat', [
			{ daysAgo: 1, sets: [[35, 10]] },
			{ daysAgo: 3, sets: [[35, 10]], removed: true }
		]);
		expect(weeklyPace(ev, NOW, 14).by.lift.per).toBe(0.5);
		expect(weeklyPace([], NOW).by.lift).toEqual({ per: 0, prev: 0 });
	});
});

describe('runs as sessions', () => {
	const at = new Date(NOW - 2 * DAY).toISOString();

	it('reads a retired RunLogged as a finished, backdated, one-entry run', () => {
		const ev = raw('RunLogged', { minutes: 32, at });
		const [s] = projectSessions(ev);
		expect(s.workout).toEqual({ routine: 'run' });
		expect(s.discipline).toBe('run');
		expect(s.minutes).toBe(32);
		expect(s.durations).toEqual([{ item: 'Run', index: 1, minutes: 32 }]);
		expect(s.mode).toBe('after');
		expect(s.finished).toBe(true);
		expect(s.rows).toEqual([]);
		expect(s.entries).toBe(1);
		expect(weekProgress(ev, plan, RUN, NOW).done).toBe(1);
		expect(weekProgress([...ev, ...raw('RunRemoved', { run: at, at })], plan, RUN, NOW).done).toBe(0);
	});
	it('keeps runs out of the lift rotation', () => {
		const ev = [...ledger('Goblet Squat', [{ daysAgo: 4, sets: [[35, 10]] }]), ...raw('RunLogged', { minutes: 30, at })];
		expect(nextInCycle(ev, plan, LIFT)).toBe('B');
	});
	it('counts prep entries without making them rows', () => {
		const ev: LedgerEvent[] = [
			{ type: 'SessionStarted', data: { session: 'x', plan: 'p', discipline: 'lift', routine: 'A', at, mode: 'live' } },
			{ type: 'EntryLogged', data: { session: 'x', item: 'Warm-up', index: 1, at, measure: { of: 'step' } } },
			{ type: 'EntryLogged', data: { session: 'x', item: 'Goblet Squat', index: 1, at, measure: { of: 'load', load: 35, reps: 10 } } },
			{ type: 'EntryLogged', data: { session: 'x', item: 'Plank', index: 1, at, measure: { of: 'hold', seconds: 20, target: 20 } } }
		];
		const [s] = projectSessions(ev);
		expect(s.prep).toBe(1);
		expect(s.entries).toBe(3);
		expect(s.workout).toEqual({ routine: 'A' });
		expect(s.mode).toBe('live');
		expect(s.rows).toEqual([
			{ item: 'Goblet Squat', sets: [{ of: 'load', load: 35, reps: 10 }], indices: [1] },
			{ item: 'Plank', sets: [{ of: 'hold', seconds: 20, target: 20 }], indices: [1] }
		]);
	});
});
