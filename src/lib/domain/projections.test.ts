import { describe, expect, it } from 'vitest';
import type { LedgerEvent, StoredEvent } from './events';
import { countOf } from './measure';
import type { Discipline, Exercise, Plan } from './plan';
import { suggest } from './progression';
import { activeProgramme, goals, historyFor, monthGrid, practicesOn, projectSessions, restSeconds, sessionEntries, weekChanges, weekStrip } from './projections';
import { nextInCycle, queue, staleness, weekProgress, weekTally } from './week';
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

/** Written in the retired SetLogged shape on purpose, so every fold below also proves the read boundary. */
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

const plan: Plan = {
	id: 'p', name: 'P', schedule: '',
	cycles: [
		{ id: 'lift', title: 'Lift', routines: ['A', 'B'], target: 3 },
		{ id: 'mob', title: 'Stretch', routines: ['S'], target: 3 },
		{ id: 'run', title: 'Run', routines: ['run'], target: 3 },
		{ id: 'floor', title: 'Floor', routines: ['bw1'], target: 0, standsInFor: 'lift' }
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
const [LIFT, MOB, RUN, FLOOR] = plan.cycles;

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
		expect(nextInCycle(ledger('Chest Press', [{ daysAgo: 4, sets: [[45, 10]], day: 'B' }, { daysAgo: 2, sets: [[45, 10]], day: 'B' }]), plan, LIFT)).toBe('A');
		expect(nextInCycle(ledger('Goblet Squat', [{ daysAgo: 2, sets: [[35, 10]], removed: true }]), plan, LIFT)).toBe('A');
		expect(nextInCycle(did('o', 'A', 'lift', 2, 'other'), plan, LIFT)).toBe('A');
		expect(nextInCycle([...did('h', 'S', 'mobility', 2)], plan, FLOOR)).toBe('bw1');
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
		expect(weekProgress(ev, plan, FLOOR, NOW)).toEqual({ done: 0, target: 0 });
		expect(staleness(ev, plan, NOW).map((s) => [s.cycle, s.daysSince === null ? null : Math.round(s.daysSince)])).toEqual([
			['lift', 1], ['mob', 3], ['run', 2], ['floor', null]
		]);
		expect(staleness([], plan, NOW).every((s) => s.daysSince === null)).toBe(true);
	});
	it('counts a floor session as a lift — the floor stands in, the lift’s pointer stays put', () => {
		const ev = [...ledger('Goblet Squat', [{ daysAgo: 6, sets: [[35, 10]] }]), ...did('f', 'bw1', 'bodyweight', 1)];
		expect(weekProgress(ev, plan, LIFT, NOW)).toEqual({ done: 2, target: 3 });
		expect(weekProgress(ev, plan, FLOOR, NOW)).toEqual({ done: 1, target: 0 });
		expect(nextInCycle(ev, plan, LIFT)).toBe('B');
		expect(staleness(ev, plan, NOW).map((s) => [s.cycle, s.daysSince === null ? null : Math.round(s.daysSince)])).toEqual([
			['lift', 1], ['mob', null], ['run', null], ['floor', 1]
		]);
	});
});

describe('the week — one programme, the blocks that are on, and when it changed', () => {
	const at = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
	it('lifts on the last programme chosen, and has every practice on until a switch says otherwise', () => {
		expect(activeProgramme([])).toBeNull();
		expect(practicesOn([])).toEqual(['lift', 'yoga', 'mob', 'run']);
		const ev: LedgerEvent[] = [
			{ type: 'ProgrammeSelected', data: { programme: 'ab-fullbody-v1', at: at(9) } },
			{ type: 'BlockToggled', data: { block: 'yoga', on: false, at: at(5) } },
			{ type: 'ProgrammeSelected', data: { programme: 'her-12-v1', at: at(3) } },
			{ type: 'BlockToggled', data: { block: 'run', on: false, at: at(2) } },
			{ type: 'BlockToggled', data: { block: 'yoga', on: true, at: at(1) } }
		];
		expect(activeProgramme(ev)).toBe('her-12-v1');
		expect(practicesOn(ev)).toEqual(['lift', 'yoga', 'mob']);
		expect(practicesOn([{ type: 'BlockToggled', data: { block: 'lift', on: false, at: at(1) } }])).toEqual(['yoga', 'mob', 'run']);
	});
	it('reads a stored plan choice as one change to the week, and lists changes newest first', () => {
		const ev = [
			...raw('PlanSelected', { plan: 'ab-fullbody-v1', at: at(9) }),
			...raw('BlockToggled', { block: 'run', on: false, at: at(2) }),
			...raw('GoalSet', { practice: 'lift', at: at(2), sessions: 4 })
		];
		expect(weekChanges(ev)).toEqual([
			{ at: at(2), dateLabel: expect.any(String), blocks: [{ block: 'run', on: false }], goals: [{ practice: 'lift', sessions: 4 }] },
			{ at: at(9), dateLabel: expect.any(String), programme: 'ab-fullbody-v1', blocks: [{ block: 'yoga', on: true }, { block: 'mob', on: true }, { block: 'run', on: true }], goals: [] }
		]);
	});
	it('reads the rest between sets as the last one set, or nothing', () => {
		expect(restSeconds([])).toBeNull();
		expect(restSeconds([{ type: 'RestSet', data: { seconds: 90, at: at(2) } }, { type: 'RestSet', data: { seconds: 120, at: at(1) } }])).toBe(120);
	});
	it('folds goals to the last one said per practice', () => {
		expect(goals([])).toEqual({});
		const ev: LedgerEvent[] = [
			{ type: 'GoalSet', data: { practice: 'lift', at: at(3), sessions: 4 } },
			{ type: 'GoalSet', data: { practice: 'run', at: at(2), sessions: 2, minutes: 40 } },
			{ type: 'GoalSet', data: { practice: 'lift', at: at(1), sessions: 2 } }
		];
		expect(goals(ev)).toEqual({ lift: { sessions: 2 }, run: { sessions: 2, minutes: 40 } });
	});
});

describe('queue — one candidate per cycle, ranked', () => {
	const even = [
		...ledger('Goblet Squat', [{ daysAgo: 1, sets: [[35, 10]] }, { daysAgo: 3, sets: [[35, 10]], day: 'B', session: 'b' }]),
		...raw('RunLogged', { minutes: 30, at: new Date(NOW - 3 * DAY).toISOString() }),
		...raw('RunLogged', { minutes: 30, at: new Date(NOW - 5 * DAY).toISOString() }),
		...did('s1', 'S', 'mobility', 1), ...did('s2', 'S', 'mobility', 2)
	];
	const busy = [...ledger('Goblet Squat', [{ daysAgo: 1, sets: [[35, 10]] }, { daysAgo: 2, sets: [[35, 10]], day: 'B', session: 'b' }, { daysAgo: 3, sets: [[35, 10]], session: 'c' }])];
	it('offers every cycle once and says why in one line', () => {
		const q = queue([], plan, NOW);
		expect(q.map((c) => c.cycle)).toEqual(['mob', 'lift', 'run', 'floor']);
		expect(q.map((c) => c.workout.routine)).toEqual(['S', 'A', 'run', 'bw1']);
		expect(q.map((c) => c.discipline)).toEqual(['mobility', 'lift', 'run', 'bodyweight']);
		expect(q[1]).toMatchObject({ title: 'Squat & Shove', why: 'First session · 0 of 3 this week', due: true });
		expect(q[3]).toMatchObject({ title: 'Push & Squat', why: 'Stands in for Squat & Shove · counts toward 3 lifts a week', due: false, standsInFor: 'lift' });
		expect(q.every((c) => c.why.length > 0 && c.minutes > 0)).toBe(true);
	});
	it('leads with what is owed, then what is stalest, then what is shortest', () => {
		const ev = [
			...ledger('Goblet Squat', [{ daysAgo: 1, sets: [[35, 10]] }]),
			...ledger('Chest Press', [{ daysAgo: 0, sets: [[45, 10]], day: 'B', session: 'b' }]),
			...raw('RunLogged', { minutes: 30, at: new Date(NOW - 3 * DAY).toISOString() })
		];
		expect(queue(ev, plan, NOW).map((c) => c.cycle)).toEqual(['mob', 'run', 'lift', 'floor']);
		expect(queue(even, plan, NOW).map((c) => c.cycle)).toEqual(['run', 'mob', 'lift', 'floor']);
	});
	it('keeps the floor in the deck, last — never above anything owed — and lets it pay the lift’s debt', () => {
		const q = queue(busy, plan, NOW);
		expect(q.map((c) => c.cycle)).toEqual(['mob', 'run', 'lift', 'floor']);
		expect(q[3]).toMatchObject({ due: false, standsInFor: 'lift' });
		const paid = [...ledger('Goblet Squat', [{ daysAgo: 6, sets: [[35, 10]] }]), ...did('f1', 'bw1', 'bodyweight', 1), ...did('f2', 'bw1', 'bodyweight', 3)];
		const lift = queue(paid, plan, NOW).find((c) => c.cycle === 'lift')!;
		expect(lift).toMatchObject({ workout: { routine: 'B' }, due: false, why: '1 day since Push & Squat · 3 of 3 this week' });
		expect(queue(paid, plan, NOW).map((c) => c.cycle)).toEqual(['mob', 'run', 'lift', 'floor']);
	});
	it('says what the rule is about to move, in the grammar Today already speaks', () => {
		const back = [
			...ledger('Chest Press', [{ daysAgo: 4, sets: [[45, 12], [45, 12], [45, 10]], day: 'B', session: 'b' }]),
			...ledger('Goblet Squat', [{ daysAgo: 2, sets: [[35, 10]], session: 'a' }])
		];
		const lift = queue(back, plan, NOW).find((c) => c.cycle === 'lift')!;
		expect(lift.workout.routine).toBe('B');
		expect(lift.why).toBe('2 days since Squat & Shove · sets 1–2 go up on the Chest Press');
		const gone = [
			...ledger('Chest Press', [{ daysAgo: 16, sets: [[55, 10], [55, 10], [55, 10]], day: 'B', session: 'b' }]),
			...ledger('Goblet Squat', [{ daysAgo: 2, sets: [[35, 10]], session: 'a' }])
		];
		expect(queue(gone, plan, NOW).find((c) => c.cycle === 'lift')!.why).toBe('2 days since Squat & Shove · Chest Press comes back a size');
		const warn = [
			...ledger('Chest Press', [{ daysAgo: 12, sets: [[45, 10], [45, 10], [45, 10]], day: 'B', session: 'b' }]),
			...ledger('Goblet Squat', [{ daysAgo: 1, sets: [[35, 10], [35, 10], [35, 10]], session: 'a' }])
		];
		expect(queue(warn, plan, NOW).find((c) => c.cycle === 'lift')!.why).toBe('Re-entry haircut in 2 days · 1 day since Squat & Shove · 1 of 3 this week');
		const today = ledger('Goblet Squat', [{ daysAgo: 0, sets: [[35, 10]] }]);
		expect(queue(today, plan, NOW).find((c) => c.cycle === 'lift')!.why).toBe('Squat & Shove today · 1 of 3 this week');
		const elsewhere = did('o', 'X', 'mobility', 2, 'other');
		expect(queue(elsewhere, plan, NOW).find((c) => c.cycle === 'mob')!.why).toBe('2 days since Stretch · 1 of 3 this week');
	});
	it('tallies the week: every session in seven days against what the on cycles ask, and who is behind', () => {
		expect(weekTally([], plan, NOW)).toEqual({ done: 0, asked: 9, gaps: ['lift', 'stretch', 'run'] });
		expect(weekTally(even, plan, NOW)).toEqual({ done: 6, asked: 9, gaps: ['lift', 'stretch', 'run'] });
		expect(weekTally(busy, plan, NOW)).toEqual({ done: 3, asked: 9, gaps: ['stretch', 'run'] });
		const paid = [...busy, ...did('f', 'bw1', 'bodyweight', 8)];
		expect(weekTally(paid, plan, NOW).done).toBe(3); // eight days ago is last week
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
		expect(cells[34]).toMatchObject({ today: true, date: new Date(NOW).getDate() });
		expect(cells.filter((c) => c.today)).toHaveLength(1);
		expect(cells.every((c) => !c.future)).toBe(true);
		expect(cells[32].did).toEqual(['lift']);
		expect(cells[29].did).toEqual(['run']);
		expect(cells.filter((c) => c.did.includes('lift'))).toHaveLength(2);
		const strip = weekStrip(ev, NOW);
		expect(strip).toHaveLength(7);
		expect(strip[6]).toMatchObject({ today: true, date: new Date(NOW).getDate() });
		expect(strip.map((c) => c.did)).toEqual([[], ['run'], [], [], ['lift'], [], []]);
		expect(strip).toEqual(cells.slice(28));
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
