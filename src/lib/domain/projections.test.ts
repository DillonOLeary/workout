import { describe, expect, it } from 'vitest';
import type { LedgerEvent, StoredEvent } from './events';
import { upcastAll } from './upcast';
import {
	REENTRY_DAYS,
	anySetEarned,
	holdMaxed,
	loadHint,
	nextLoad,
	suggestedCount,
	suggestedWeight
} from './projections';
import type { Exercise } from './types';

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
				data: {
					session,
					plan: 'p',
					day: 'A',
					exercise: name,
					weight,
					reps,
					set: j + 1,
					at,
					...(e.unit ? { unit: e.unit } : {}),
					...(target !== undefined ? { target } : {})
				}
			})
		);
		out.push({ type: 'SessionFinished', data: { session, plan: 'p', day: 'A', at } });
		if (e.removed) out.push({ type: 'SessionRemoved', data: { session, at } });
	});
	return upcastAll(out);
}

const goblet: Exercise = { name: 'Goblet Squat', equip: '', tag: '', sets: 3, lo: 6, hi: 12, start: 35, inc: 5, rack: 'dumbbell' };
const rdl: Exercise = { ...goblet, name: 'Romanian Deadlift', start: 40, each: true };
const press: Exercise = { name: 'Chest Press', equip: '', tag: '', sets: 3, lo: 8, hi: 12, start: 45, inc: 5 };
const plank: Exercise = { name: 'Long-Lever Plank', equip: '', tag: '', sets: 3, lo: 10, hi: 20, start: 0, inc: 5, mode: 'seconds', bodyweight: true };
const copenhagen: Exercise = { name: 'Copenhagen Plank', equip: '', tag: '', sets: 2, lo: 5, hi: 15, start: 0, inc: 1, bodyweight: true, side: 'sets' };

const weights = (ex: Exercise, ev: LedgerEvent[]) => nextLoad(ev, ex, undefined, NOW).sets.map((s) => s.weight);
const reasons = (ex: Exercise, ev: LedgerEvent[]) => nextLoad(ev, ex, undefined, NOW).sets.map((s) => s.reason);

describe('nextLoad — first time', () => {
	it('starts every set at the plan weight, snapped to the rack', () => {
		const load = nextLoad([], { ...goblet, start: 37 }, undefined, NOW);
		expect(load.reason).toBe('start');
		expect(load.sets.map((s) => s.weight)).toEqual([35, 35, 35]);
		expect(load.sets.map((s) => s.reps)).toEqual([6, 6, 6]);
		expect(load.daysSince).toBeNull();
		expect(nextLoad([], press, undefined, NOW).weight).toBe(45);
		expect(loadHint(load, goblet)).toBeNull();
	});
});

describe('nextLoad — each set climbs on its own', () => {
	const ev = ledger('Goblet Squat', [{ daysAgo: 3, sets: [[35, 12], [35, 9], [35, 5]] }]);
	it('raises only the set that reached the top of the range', () => {
		const load = nextLoad(ev, goblet, undefined, NOW);
		expect(load.sets).toEqual([
			{ weight: 40, reason: 'increase', reps: 6, missed: false },
			{ weight: 35, reason: 'hold', reps: 9, missed: false },
			{ weight: 35, reason: 'hold', reps: 5, missed: true }
		]);
		expect(load.reason).toBe('increase');
		expect(load.up).toBe(true);
		expect(load.down).toBe(false);
		expect(Math.round(load.daysSince!)).toBe(3);
	});
	it('says which set moved and where the rest stay', () => {
		expect(loadHint(nextLoad(ev, goblet, undefined, NOW), goblet)).toBe(
			'Set 1 goes up to 40 lb — sets 2–3 stay at 35.'
		);
	});
	it('phrases a clean sweep as one move, per hand where the lift is per hand', () => {
		const sweep = ledger('Romanian Deadlift', [{ daysAgo: 2, sets: [[40, 12], [40, 12], [40, 12]] }]);
		const load = nextLoad(sweep, rdl, undefined, NOW);
		expect(weights(rdl, sweep)).toEqual([45, 45, 45]);
		expect(loadHint(load, rdl)).toBe('Every set goes up to 45 lb each hand.');
	});
	it('steps a machine by inc where there is no rack', () => {
		const ev2 = ledger('Chest Press', [{ daysAgo: 2, sets: [[45, 12], [45, 12], [45, 10]] }]);
		expect(weights(press, ev2)).toEqual([50, 50, 45]);
		expect(loadHint(nextLoad(ev2, press, undefined, NOW), press)).toBe(
			'Sets 1–2 go up to 50 lb — set 3 stays at 45.'
		);
	});
	it('prefills a plain hold with last time’s reps', () => {
		const ev2 = ledger('Goblet Squat', [{ daysAgo: 2, sets: [[35, 10], [35, 9], [35, 8]] }]);
		const load = nextLoad(ev2, goblet, undefined, NOW);
		expect(load.reason).toBe('hold');
		expect(load.sets.map((s) => s.reps)).toEqual([10, 9, 8]);
		expect(loadHint(load, goblet)).toBeNull();
	});
	it('lets a missing set follow the one before it', () => {
		const ev2 = ledger('Goblet Squat', [{ daysAgo: 2, sets: [[35, 12]] }]);
		expect(reasons(goblet, ev2)).toEqual(['increase', 'increase', 'increase']);
		expect(weights(goblet, ev2)).toEqual([40, 40, 40]);
	});
	it('excludes the session in progress', () => {
		const ev2 = ledger('Goblet Squat', [
			{ daysAgo: 0, sets: [[35, 12], [35, 12], [35, 12]], session: 'live' },
			{ daysAgo: 4, sets: [[35, 8], [35, 8], [35, 8]] }
		]);
		expect(nextLoad(ev2, goblet, 'live', NOW).reason).toBe('hold');
		expect(nextLoad(ev2, goblet, undefined, NOW).reason).toBe('increase');
	});
	it('reads a set at its own weight when the load moved mid-exercise', () => {
		const ev2 = ledger('Goblet Squat', [{ daysAgo: 2, sets: [[45, 5], [35, 12], [35, 12]] }]);
		expect(weights(goblet, ev2)).toEqual([45, 40, 40]);
		expect(nextLoad(ev2, goblet, undefined, NOW).sets[0].missed).toBe(true);
	});
});

describe('nextLoad — misses', () => {
	it('warns after one miss and holds', () => {
		const ev = ledger('Goblet Squat', [{ daysAgo: 2, sets: [[35, 8], [35, 8], [35, 5]] }]);
		const load = nextLoad(ev, goblet, undefined, NOW);
		expect(load.sets[2]).toEqual({ weight: 35, reason: 'hold', reps: 5, missed: true });
		expect(load.down).toBe(false);
		expect(loadHint(load, goblet)).toBe('Set 3 missed last time — miss again and it backs off a size.');
	});
	it('backs the set off one size after two misses at one weight within the window', () => {
		const ev = ledger('Goblet Squat', [
			{ daysAgo: 3, sets: [[35, 8], [35, 8], [35, 5]] },
			{ daysAgo: 10, sets: [[35, 8], [35, 8], [35, 4]] }
		]);
		const load = nextLoad(ev, goblet, undefined, NOW);
		expect(load.sets[2]).toEqual({ weight: 30, reason: 'adjust', reps: 6, missed: false });
		expect(load.reason).toBe('adjust');
		expect(load.down).toBe(true);
		expect(loadHint(load, goblet)).toBe('Set 3 back one size after 2 misses — 30 lb.');
	});
	it('treats a different weight as a fresh streak', () => {
		const ev = ledger('Goblet Squat', [
			{ daysAgo: 3, sets: [[35, 8], [35, 8], [35, 5]] },
			{ daysAgo: 10, sets: [[40, 8], [40, 8], [40, 4]] }
		]);
		expect(reasons(goblet, ev)[2]).toBe('hold');
	});
	it('does not chain misses across more than the window', () => {
		const ev = ledger('Goblet Squat', [
			{ daysAgo: 3, sets: [[35, 8], [35, 8], [35, 5]] },
			{ daysAgo: 3 + REENTRY_DAYS + 3, sets: [[35, 8], [35, 8], [35, 4]] }
		]);
		expect(reasons(goblet, ev)[2]).toBe('hold');
	});
	it('cannot back off below the bottom of the rack', () => {
		const ev = ledger('Goblet Squat', [
			{ daysAgo: 3, sets: [[2.5, 5], [2.5, 5], [2.5, 5]] },
			{ daysAgo: 6, sets: [[2.5, 5], [2.5, 5], [2.5, 5]] }
		]);
		const load = nextLoad(ev, goblet, undefined, NOW);
		expect(load.sets.every((s) => s.reason === 'hold' && s.missed)).toBe(true);
	});
});

describe('nextLoad — re-entry', () => {
	it('comes back one size lighter on every set after a fortnight away', () => {
		const ev = ledger('Goblet Squat', [{ daysAgo: 15, sets: [[45, 10], [45, 10], [45, 10]] }]);
		const load = nextLoad(ev, goblet, undefined, NOW);
		expect(load.sets.map((s) => s.weight)).toEqual([40, 40, 40]);
		expect(load.reason).toBe('reentry');
		expect(load.down).toBe(true);
		expect(load.sets.map((s) => s.reps)).toEqual([6, 6, 6]);
		expect(loadHint(load, goblet)).toBe('Re-entry after 15 days — one size down, build it back.');
	});
	it('never goes below the starting weight, and never up to it', () => {
		const atStart = ledger('Goblet Squat', [{ daysAgo: 20, sets: [[35, 10], [35, 10], [35, 10]] }]);
		const l1 = nextLoad(atStart, goblet, undefined, NOW);
		expect(l1.sets.map((s) => s.weight)).toEqual([35, 35, 35]);
		expect(l1.reason).toBe('hold');
		expect(loadHint(l1, goblet)).toBeNull();
		// already under the plan's guess: re-entry neither pushes up to it nor digs further down
		const below = ledger('Chest Press', [{ daysAgo: 20, sets: [[30, 10], [30, 10], [30, 10]] }]);
		expect(weights(press, below)).toEqual([30, 30, 30]);
		expect(nextLoad(below, press, undefined, NOW).reason).toBe('hold');
	});
	it('ignores a removed session for both history and the clock', () => {
		const ev = ledger('Goblet Squat', [
			{ daysAgo: 2, sets: [[50, 12], [50, 12], [50, 12]], removed: true },
			{ daysAgo: 20, sets: [[45, 10], [45, 10], [45, 10]] }
		]);
		const load = nextLoad(ev, goblet, undefined, NOW);
		expect(load.reason).toBe('reentry');
		expect(Math.floor(load.daysSince!)).toBe(20);
		expect(load.weight).toBe(40);
	});
	it('exposes the per-set weight through suggestedWeight', () => {
		const ev = ledger('Goblet Squat', [{ daysAgo: 3, sets: [[35, 12], [35, 9], [35, 5]] }]);
		expect(suggestedWeight(ev, goblet, undefined, 0, NOW)).toBe(40);
		expect(suggestedWeight(ev, goblet, undefined, 2, NOW)).toBe(35);
		expect(suggestedWeight(ev, goblet, undefined, 9, NOW)).toBe(35);
	});
});

describe('bodyweight and holds', () => {
	it('keeps nextLoad well-formed with no load to move', () => {
		const ev = ledger('Copenhagen Plank', [{ daysAgo: 2, sets: [[0, 8], [0, 7]] }]);
		const load = nextLoad(ev, copenhagen, undefined, NOW);
		expect(load.sets.map((s) => s.weight)).toEqual([0, 0]);
		expect(load.up).toBe(false);
		expect(load.down).toBe(false);
		expect(loadHint(load, copenhagen)).toBeNull();
		expect(nextLoad([], copenhagen, undefined, NOW).reason).toBe('start');
	});
	it('carries last time’s reps for a bodyweight movement, capped at the top', () => {
		const ev = ledger('Copenhagen Plank', [{ daysAgo: 2, sets: [[0, 8], [0, 20]] }]);
		expect(suggestedCount(ev, copenhagen, undefined, 0)).toBe(8);
		expect(suggestedCount(ev, copenhagen, undefined, 1)).toBe(15);
		expect(suggestedCount([], copenhagen)).toBe(5);
	});
	it('asks for +inc after a hold that rang its bell, and caps at the ceiling', () => {
		const rang = ledger('Long-Lever Plank', [{ daysAgo: 2, unit: 's', sets: [[0, 10, 10], [0, 10, 10], [0, 7, 10]] }]);
		expect(suggestedCount(rang, plank, undefined, 0)).toBe(15);
		expect(suggestedCount(rang, plank, undefined, 2)).toBe(10); // dropped early → what you held, floored at lo
		const top = ledger('Long-Lever Plank', [{ daysAgo: 2, unit: 's', sets: [[0, 20, 20], [0, 20, 20], [0, 20, 20]] }]);
		expect(suggestedCount(top, plank)).toBe(20);
		expect(holdMaxed({ sets: [{ weight: 0, reps: 20 }, { weight: 0, reps: 20 }, { weight: 0, reps: 20 }] }, plank)).toBe(true);
		expect(holdMaxed({ sets: [{ weight: 0, reps: 20 }, { weight: 0, reps: 19 }, { weight: 0, reps: 20 }] }, plank)).toBe(false);
		expect(holdMaxed({ sets: [{ weight: 0, reps: 20 }] }, plank)).toBe(false);
	});
	it('treats a hold logged before targets existed as having rung', () => {
		const old = ledger('Long-Lever Plank', [{ daysAgo: 2, unit: 's', sets: [[0, 15]] }]);
		expect(suggestedCount(old, plank)).toBe(20);
	});
});

describe('anySetEarned', () => {
	it('lights the ledger pill when some set reached the top', () => {
		expect(anySetEarned([{ weight: 35, reps: 12 }, { weight: 35, reps: 8 }], goblet)).toBe(true);
		expect(anySetEarned([{ weight: 35, reps: 11 }, { weight: 35, reps: 11 }], goblet)).toBe(false);
	});
});

import { REENTRY_WARN_DAYS, dayAges, trendFor, weekStrip } from './projections';

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
	it('warns three days before the re-entry haircut', () => {
		const ev = ledger('Goblet Squat', [{ daysAgo: 12, sets: [[40, 10], [40, 10], [40, 10]] }]);
		const t = trendFor(ev, goblet, undefined, NOW);
		expect(t.sentence).toBe('Re-entry haircut in 2 days');
		expect(t.tone).toBe('warn');
		expect(REENTRY_WARN_DAYS).toBe(11);
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
			...upcastAll([{ type: 'RunLogged', data: { minutes: 30, at: new Date(NOW - 5 * DAY).toISOString() } }])
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
		const plan = { id: 'p', name: 'p', schedule: '', days: { A: [], B: [] } };
		const ev = ledger('Goblet Squat', [{ daysAgo: 12, sets: [[35, 10]] }]);
		const ages = dayAges(ev, plan, NOW);
		expect(ages.find((a) => a.day === 'A')?.daysSince).toBeCloseTo(12, 5);
		expect(ages.find((a) => a.day === 'B')?.daysSince).toBeNull();
	});
});

/* ---------- runs are sessions now ---------- */
import { RUN_DAY } from './events';
import { dayTitle, nextDay, projectRuns, projectSessions, weekRunMinutes } from './projections';
import type { Plan } from './types';

describe('runs as sessions', () => {
	const at = new Date(NOW - 2 * DAY).toISOString();
	const raw = (type: string, data: unknown): LedgerEvent[] => upcastAll([{ type, data }]);
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
			{ exercise: 'Goblet Squat', sets: [{ weight: 35, reps: 10 }] },
			{ exercise: 'Plank', sets: [{ weight: 0, reps: 20, unit: 's', target: 20 }] }
		]);
	});
	it('names a run by the plan', () => {
		expect(dayTitle(plan, RUN_DAY)).toBe('Easy run');
		expect(dayTitle(undefined, RUN_DAY)).toBe('Run');
	});
});
