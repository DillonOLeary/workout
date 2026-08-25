import { describe, expect, it } from 'vitest';
import { fmtDate } from './labels';
import type { Measure } from './measure';
import type { Exercise } from './plan';
import {
	REENTRY_DAYS,
	atCeiling,
	anySetEarned,
	bumpCount,
	bumpLoad,
	daysUntilReentry,
	nextSet,
	suggest,
	type History
} from './progression';

const DAY = 86400000;
const NOW = Date.parse('2026-08-23T18:00:00Z');

const load = (w: number, r: number): Measure => ({ of: 'load', load: w, reps: r });
const hold = (s: number, target?: number): Measure => ({ of: 'hold', seconds: s, ...(target !== undefined ? { target } : {}) });
const reps = (r: number): Measure => ({ of: 'reps', reps: r });

/** A history, newest first — exactly what historyFor hands the rule. No events needed. */
const hist = (entries: { daysAgo: number; sets: Measure[] }[]): History =>
	entries.map((e) => {
		const at = new Date(NOW - e.daysAgo * DAY).toISOString();
		return { at, dateLabel: fmtDate(at), sets: e.sets };
	});
const one = (daysAgo: number, ...sets: Measure[]) => hist([{ daysAgo, sets }]);

const goblet: Exercise = { name: 'Goblet Squat', equip: '', tag: '', kind: 'load', sets: 3, lo: 6, hi: 12, start: 35, inc: 5, rack: 'dumbbell' };
const rdl: Exercise = { ...goblet, name: 'Romanian Deadlift', start: 40, each: true };
const press: Exercise = { name: 'Chest Press', equip: '', tag: '', kind: 'load', sets: 3, lo: 8, hi: 12, start: 45, inc: 5 };
const plank: Exercise = { name: 'Long-Lever Plank', equip: '', tag: '', kind: 'hold', sets: 3, lo: 10, hi: 20, inc: 5 };
const copenhagen: Exercise = { name: 'Copenhagen Plank', equip: '', tag: '', kind: 'reps', sets: 2, lo: 5, hi: 15, side: 'sets' };

const weights = (ex: Exercise, h: History) => {
	const s = suggest(h, ex, NOW);
	return s.kind === 'load' ? s.sets.map((x) => x.weight) : [];
};
const reasons = (ex: Exercise, h: History) => {
	const s = suggest(h, ex, NOW);
	return s.kind === 'load' ? s.sets.map((x) => x.reason) : [];
};
const loaded = (ex: Exercise, h: History) => {
	const s = suggest(h, ex, NOW);
	if (s.kind !== 'load') throw new Error('expected a load suggestion');
	return s;
};
const counted = (ex: Exercise, h: History) => {
	const s = suggest(h, ex, NOW);
	if (s.kind === 'load') throw new Error('expected a count suggestion');
	return s;
};

describe('suggest — first time', () => {
	it('starts every set at the plan weight, snapped to the rack', () => {
		const s = loaded({ ...goblet, start: 37 }, []);
		expect(s.reason).toBe('start');
		expect(s.sets.map((x) => x.weight)).toEqual([35, 35, 35]);
		expect(s.sets.map((x) => x.reps)).toEqual([6, 6, 6]);
		expect(s.daysSince).toBeNull();
		expect(loaded(press, []).weight).toBe(45);
	});
	it('starts a hold and a count at the bottom of the range', () => {
		expect(suggest([], plank, NOW)).toEqual({ kind: 'hold', sets: [{ count: 10, reason: 'start' }, { count: 10, reason: 'start' }, { count: 10, reason: 'start' }], ceiling: false, daysSince: null });
		expect(counted(copenhagen, []).sets.map((x) => x.count)).toEqual([5, 5]);
	});
});

describe('suggest — each set climbs on its own', () => {
	const h = one(3, load(35, 12), load(35, 9), load(35, 5));
	it('raises only the set that reached the top of the range', () => {
		const s = loaded(goblet, h);
		expect(s.sets).toEqual([
			{ weight: 40, reason: 'increase', reps: 6, missed: false },
			{ weight: 35, reason: 'hold', reps: 9, missed: false },
			{ weight: 35, reason: 'hold', reps: 5, missed: true }
		]);
		expect(s.reason).toBe('increase');
		expect(s.up).toBe(true);
		expect(s.down).toBe(false);
		expect(Math.round(s.daysSince!)).toBe(3);
	});
	it('sweeps every set up, per hand where the lift is per hand', () => {
		expect(weights(rdl, one(2, load(40, 12), load(40, 12), load(40, 12)))).toEqual([45, 45, 45]);
	});
	it('steps a machine by inc where there is no rack', () => {
		expect(weights(press, one(2, load(45, 12), load(45, 12), load(45, 10)))).toEqual([50, 50, 45]);
	});
	it('prefills a plain hold with last time’s reps', () => {
		const s = loaded(goblet, one(2, load(35, 10), load(35, 9), load(35, 8)));
		expect(s.reason).toBe('hold');
		expect(s.sets.map((x) => x.reps)).toEqual([10, 9, 8]);
	});
	it('lets a missing set follow the one before it', () => {
		expect(reasons(goblet, one(2, load(35, 12)))).toEqual(['increase', 'increase', 'increase']);
		expect(weights(goblet, one(2, load(35, 12)))).toEqual([40, 40, 40]);
	});
	it('reads a set at its own weight when the load moved mid-exercise', () => {
		const h2 = one(2, load(45, 5), load(35, 12), load(35, 12));
		expect(weights(goblet, h2)).toEqual([45, 40, 40]);
		expect(loaded(goblet, h2).sets[0].missed).toBe(true);
	});
});

describe('suggest — misses', () => {
	it('warns after one miss and holds', () => {
		const s = loaded(goblet, one(2, load(35, 8), load(35, 8), load(35, 5)));
		expect(s.sets[2]).toEqual({ weight: 35, reason: 'hold', reps: 5, missed: true });
		expect(s.down).toBe(false);
	});
	it('backs the set off one size after two misses at one weight within the window', () => {
		const s = loaded(goblet, hist([
			{ daysAgo: 3, sets: [load(35, 8), load(35, 8), load(35, 5)] },
			{ daysAgo: 10, sets: [load(35, 8), load(35, 8), load(35, 4)] }
		]));
		expect(s.sets[2]).toEqual({ weight: 30, reason: 'adjust', reps: 6, missed: false });
		expect(s.reason).toBe('adjust');
		expect(s.down).toBe(true);
	});
	it('treats a different weight as a fresh streak', () => {
		const h = hist([
			{ daysAgo: 3, sets: [load(35, 8), load(35, 8), load(35, 5)] },
			{ daysAgo: 10, sets: [load(40, 8), load(40, 8), load(40, 4)] }
		]);
		expect(reasons(goblet, h)[2]).toBe('hold');
	});
	it('does not chain misses across more than the window', () => {
		const h = hist([
			{ daysAgo: 3, sets: [load(35, 8), load(35, 8), load(35, 5)] },
			{ daysAgo: 3 + REENTRY_DAYS + 3, sets: [load(35, 8), load(35, 8), load(35, 4)] }
		]);
		expect(reasons(goblet, h)[2]).toBe('hold');
	});
	it('cannot back off below the bottom of the rack', () => {
		const h = hist([
			{ daysAgo: 3, sets: [load(2.5, 5), load(2.5, 5), load(2.5, 5)] },
			{ daysAgo: 6, sets: [load(2.5, 5), load(2.5, 5), load(2.5, 5)] }
		]);
		expect(loaded(goblet, h).sets.every((x) => x.reason === 'hold' && x.missed)).toBe(true);
	});
});

describe('suggest — re-entry', () => {
	it('comes back one size lighter on every set after a fortnight away', () => {
		const s = loaded(goblet, one(15, load(45, 10), load(45, 10), load(45, 10)));
		expect(s.sets.map((x) => x.weight)).toEqual([40, 40, 40]);
		expect(s.reason).toBe('reentry');
		expect(s.down).toBe(true);
		expect(s.sets.map((x) => x.reps)).toEqual([6, 6, 6]);
	});
	it('never goes below the starting weight, and never up to it', () => {
		const s1 = loaded(goblet, one(20, load(35, 10), load(35, 10), load(35, 10)));
		expect(s1.sets.map((x) => x.weight)).toEqual([35, 35, 35]);
		expect(s1.reason).toBe('hold');
		// already under the plan's guess: re-entry neither pushes up to it nor digs further down
		const below = loaded(press, one(20, load(30, 10), load(30, 10), load(30, 10)));
		expect(below.sets.map((x) => x.weight)).toEqual([30, 30, 30]);
		expect(below.reason).toBe('hold');
	});
	it('counts the days of runway before the haircut, never below one', () => {
		expect(daysUntilReentry(11)).toBe(3);
		expect(daysUntilReentry(13.2)).toBe(1);
		expect(daysUntilReentry(14)).toBe(1);
	});
});

describe('suggest — holds and counts', () => {
	it('carries last time’s reps for a bodyweight movement, capped at the top', () => {
		const s = suggest(one(2, reps(8), reps(20)), copenhagen, NOW);
		expect(s.kind).toBe('reps');
		expect(s.sets).toEqual([{ count: 8, reason: 'hold' }, { count: 15, reason: 'ceiling' }]);
	});
	it('asks for +inc after a hold that rang its bell, and caps at the ceiling', () => {
		const rang = counted(plank, one(2, hold(10, 10), hold(10, 10), hold(7, 10)));
		expect(rang.sets.map((x) => x.count)).toEqual([15, 15, 10]); // dropped early → what you held, floored at lo
		expect(rang.sets.map((x) => x.reason)).toEqual(['increase', 'increase', 'hold']);
		expect(rang.ceiling).toBe(false);
		const top = counted(plank, one(2, hold(20, 20), hold(20, 20), hold(20, 20)));
		expect(top.sets.map((x) => x.count)).toEqual([20, 20, 20]);
		expect(top.ceiling).toBe(true);
	});
	it('treats a hold logged before targets existed as having rung', () => {
		expect(counted(plank, one(2, hold(15))).sets[0].count).toBe(20);
	});
	it('reads a partial entry as not at the ceiling', () => {
		expect(atCeiling({ sets: [hold(20), hold(20), hold(20)] }, plank)).toBe(true);
		expect(atCeiling({ sets: [hold(20), hold(19), hold(20)] }, plank)).toBe(false);
		expect(atCeiling({ sets: [hold(20)] }, plank)).toBe(false);
		expect(atCeiling(null, plank)).toBe(false);
	});
});

describe('a set against its range', () => {
	it('lights the ledger pill when some set reached the top', () => {
		expect(anySetEarned([load(35, 12), load(35, 8)], goblet)).toBe(true);
		expect(anySetEarned([load(35, 11), load(35, 11)], goblet)).toBe(false);
	});
});

describe('the ± tiles are the rule’s own one-size step', () => {
	it('walks the rack, or the machine’s inc, never below zero', () => {
		expect(bumpLoad(goblet, 35, 1)).toBe(40);
		expect(bumpLoad(goblet, 35, -1)).toBe(30);
		expect(bumpLoad(press, 45, 1)).toBe(50);
		expect(bumpLoad(press, 0, -1)).toBe(0);
	});
	it('moves a hold by its inc inside the range, a count by one inside the bounds', () => {
		expect(bumpCount(plank, 10, 1)).toBe(15);
		expect(bumpCount(plank, 20, 1)).toBe(20); // the ceiling
		expect(bumpCount(plank, 10, -1)).toBe(10); // the floor
		expect(bumpCount(copenhagen, 8, 1)).toBe(9);
		expect(bumpCount(goblet, 1, -1)).toBe(1);
		expect(bumpCount(goblet, 100, 1)).toBe(100);
	});
});

describe('nextSet — what the tiles show inside a session', () => {
	const s = suggest(one(3, load(35, 12), load(35, 9), load(35, 5)), goblet, NOW); // [40, 35, 35]
	it('follows the suggestion for THIS set when the last set followed it too', () => {
		expect(nextSet(s, goblet, [], 0)).toEqual({ weight: 40, count: 6 });
		expect(nextSet(s, goblet, [{ index: 1, measure: load(40, 6) }], 1)).toEqual({ weight: 35, count: 9 });
	});
	it('sticks with an override for the rest of the exercise', () => {
		const prior = [{ index: 1, measure: load(45, 5) }];
		expect(nextSet(s, goblet, prior, 1)).toEqual({ weight: 45, count: 5 });
	});
	it('takes a hold’s target from this session’s last TARGET, not the seconds held', () => {
		const h = suggest(one(2, hold(10, 10), hold(10, 10), hold(10, 10)), plank, NOW); // 15s next
		expect(nextSet(h, plank, [], 0)).toEqual({ weight: 0, count: 15 });
		expect(nextSet(h, plank, [{ index: 1, measure: hold(7, 15) }], 1)).toEqual({ weight: 0, count: 15 });
		expect(nextSet(h, plank, [{ index: 1, measure: hold(25, 25) }], 1)).toEqual({ weight: 0, count: 20 }); // capped
	});
	it('carries a count from the set before', () => {
		const c = suggest(one(2, reps(8), reps(8)), copenhagen, NOW);
		expect(nextSet(c, copenhagen, [{ index: 1, measure: reps(11) }], 1)).toEqual({ weight: 0, count: 11 });
	});
});
