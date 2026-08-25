import { countOf, loadOf, type Measure } from './measure';
import type { Exercise, Loaded } from './plan';
import { nextRung, prevRung, snapToRack } from './racks';

/**
 * The rule — policy, not projection. Everything here is a pure function of
 * (what happened for this exercise, the exercise, the time): it knows
 * nothing about events, sessions or screens. The read model hands it a
 * History (projections.historyFor); the floor and Today read the answer.
 *
 * Three axes, chosen by the exercise's kind (plan.ts):
 *   load — each set climbs on its own: top of the range → the next size up
 *          for THAT set; the same set missed twice inside a fortnight → one
 *          size down; more than a fortnight away → every set one size down
 *   hold — ring the bell → +inc seconds next time, capped at the ceiling
 *   reps — carry last time's count, capped at the ceiling
 *
 * The ± on the tiles is the same function as the rule's one-size step
 * (bumpLoad / bumpCount), so a hand-dialled number and a suggested one
 * always land on a size that exists.
 */

/** One session's sets for one exercise, newest first — what the rule reads. */
export type HistoryEntry = { at: string; dateLabel: string; sets: Measure[] };
export type History = HistoryEntry[];

/**
 * The window that turns two misses into an adjustment, and an absence into a
 * re-entry. Fourteen days: long enough that a once-a-week lifter is never
 * "away", short enough that a fortnight off is treated as what it is.
 */
export const REENTRY_DAYS = 14;
/** Warn from day 11 — three days of runway before the re-entry rule fires. */
export const REENTRY_WARN_DAYS = 11;
const DAY = 86400000;

/** Days of runway before the re-entry haircut — the nudge's number, never below 1. */
export const daysUntilReentry = (daysSince: number): number => Math.max(1, Math.ceil(REENTRY_DAYS - daysSince));

/* ---------- one size, up or down ---------------------------------------- */

/** One level-up: the next size on the rack, or +inc where a rack can't say. */
export function increasedWeight(weight: number, ex: Loaded): number {
	return ex.rack ? nextRung(weight, ex.rack) : weight + ex.inc;
}

/** One size down: the previous rung, or −inc off a rack. Never negative. */
export function decreasedWeight(weight: number, ex: Loaded): number {
	return ex.rack ? prevRung(weight, ex.rack) : Math.max(0, weight - ex.inc);
}

/** The ± tile on a load: anything you pick up walks the rack's ladder; a machine steps its inc. */
export function bumpLoad(ex: Loaded, weight: number, dir: 1 | -1): number {
	return dir > 0 ? increasedWeight(weight, ex) : decreasedWeight(weight, ex);
}

/**
 * The ± tile on a count. A hold moves by its inc and stops at the range —
 * the ceiling is the top of the range, past it the answer is a harder
 * variation, never a longer hold. Reps move by one inside the decider's bounds.
 */
export function bumpCount(ex: Exercise, count: number, dir: 1 | -1): number {
	if (ex.kind === 'hold') return Math.min(ex.hi, Math.max(ex.lo, count + dir * ex.inc));
	return Math.min(100, Math.max(1, count + dir));
}

/* ---------- reading a set against its range ----------------------------- */

/** A set that reached the top of the range — the thing the rule acts on. */
export function setEarned(m: Measure, ex: Exercise): boolean {
	return countOf(m) >= ex.hi;
}

/** Some set of this entry earned its increase — the ledger's ↑ pill. */
export function anySetEarned(sets: Measure[], ex: Exercise): boolean {
	return sets.some((m) => setEarned(m, ex));
}

/** Every set at the ceiling, on a full entry: make it harder, not longer. */
export function atCeiling(entry: { sets: Measure[] } | null, ex: Exercise): boolean {
	if (!entry || entry.sets.length < ex.sets) return false;
	return entry.sets.every((m) => countOf(m) >= ex.hi);
}

/* ---------- the suggestion ----------------------------------------------- */

export type Reason = 'start' | 'increase' | 'hold' | 'adjust' | 'reentry';
export type LoadSet = {
	weight: number;
	reason: Reason;
	/** the count to preload: the bottom of the range after any move, else last time's */
	reps: number;
	/** last time this set fell below the range (only meaningful on a hold) */
	missed: boolean;
};
export type CountReason = 'start' | 'increase' | 'hold' | 'ceiling';
export type CountSet = { count: number; reason: CountReason };

/**
 * What every set should be next time, in the exercise's own axis. The shape
 * follows the kind, so a screen switches once and never reads a weight of 0
 * as "bodyweight".
 */
export type Suggestion =
	| {
			kind: 'load';
			/** one per set, index = set number − 1; always ex.sets long */
			sets: LoadSet[];
			/** the headline: start > reentry > adjust > increase > hold */
			reason: Reason;
			/** some set goes up — Today's ↑ */
			up: boolean;
			/** something comes down (re-entry or an adjustment) — Today's ↓ */
			down: boolean;
			/** set 1's weight, for the callers that only need one number */
			weight: number;
			/** whole days since the last entry, or null when there is none */
			daysSince: number | null;
	  }
	| {
			kind: 'hold' | 'reps';
			sets: CountSet[];
			/** every set of the last full entry was at the top of the range */
			ceiling: boolean;
			daysSince: number | null;
	  };

function summarise(sets: LoadSet[], daysSince: number | null): Suggestion {
	const has = (r: Reason) => sets.some((s) => s.reason === r);
	const reason: Reason = has('start')
		? 'start'
		: has('reentry')
			? 'reentry'
			: has('adjust')
				? 'adjust'
				: has('increase')
					? 'increase'
					: 'hold';
	return {
		kind: 'load',
		sets,
		reason,
		up: has('increase'),
		down: has('reentry') || has('adjust'),
		weight: sets[0].weight,
		daysSince
	};
}

/**
 * The progression decision, SET BY SET — "dynamic double progression".
 *
 * Each set climbs on its own: hit the top of the range on set k → set k takes
 * the next size up next time, while the others keep climbing where they are.
 * Two things follow. A 20% rack jump (25 → 30 lb dumbbells, 24 → 28 kg
 * bells) gets absorbed one set at a time instead of all at once, and the
 * strongest set never waits for the weakest — which is what the old
 * "every set at the top, at one load" rule quietly did for weeks.
 *
 * Down has two paths, both one size at a time. Miss the bottom of the range
 * on the SAME set at the SAME weight twice within a fortnight → that set backs
 * off a size ('adjust': two misses are evidence, so this can go below `start`,
 * which was only ever a guess). Come back after more than a fortnight away →
 * every set comes back a size lighter ('reentry'), never below start — a
 * haircut, not a verdict. There is no "stall three sessions, drop 10%" any
 * more: at one session a week that rule punished absence as if it were
 * fatigue.
 */
function suggestLoad(history: History, ex: Loaded, now: number): Suggestion {
	const startWeight = ex.rack ? snapToRack(ex.start, ex.rack) : ex.start;
	const last = history[0];
	const sets: LoadSet[] = [];

	if (!last) {
		for (let k = 0; k < ex.sets; k++) sets.push({ weight: startWeight, reason: 'start', reps: ex.lo, missed: false });
		return summarise(sets, null);
	}

	const daysSince = (now - Date.parse(last.at)) / DAY;

	if (daysSince > REENTRY_DAYS) {
		let base = loadOf(last.sets[0]);
		for (let k = 0; k < ex.sets; k++) {
			base = last.sets[k] ? loadOf(last.sets[k]) : base;
			// never below start — but never UP to it either, for someone who was
			// honestly lifting less than the plan's guess
			const floor = Math.min(startWeight, base);
			const w = Math.max(floor, decreasedWeight(base, ex));
			sets.push({ weight: w, reason: w < base ? 'reentry' : 'hold', reps: ex.lo, missed: false });
		}
		return summarise(sets, daysSince);
	}

	const prev = history[1];
	for (let k = 0; k < ex.sets; k++) {
		const m = last.sets[k];
		if (!m) {
			// fewer sets logged than the plan asks: the missing set follows the one
			// before it (k = 0 always exists — historyFor drops empty rows)
			sets.push({ ...sets[k - 1] });
			continue;
		}
		const weight = loadOf(m);
		const count = countOf(m);
		if (count >= ex.hi) {
			sets.push({ weight: increasedWeight(weight, ex), reason: 'increase', reps: ex.lo, missed: false });
		} else if (count >= ex.lo) {
			sets.push({ weight, reason: 'hold', reps: count, missed: false });
		} else {
			const p = prev?.sets[k];
			const twice =
				!!p &&
				countOf(p) < ex.lo &&
				loadOf(p) === weight &&
				(Date.parse(last.at) - Date.parse(prev!.at)) / DAY <= REENTRY_DAYS;
			const down = decreasedWeight(weight, ex);
			if (twice && down < weight) {
				sets.push({ weight: down, reason: 'adjust', reps: ex.lo, missed: false });
			} else {
				sets.push({ weight, reason: 'hold', reps: count, missed: true });
			}
		}
	}
	return summarise(sets, daysSince);
}

/**
 * The count is the axis, per set. A hold that rang its bell asks for +inc
 * next time; one dropped early asks for what was actually held. A rep-based
 * bodyweight movement simply carries last time's number. Both are CAPPED at
 * the top of the range — past that the instruction is "make it harder",
 * carried by the exercise note, never "make it longer".
 */
function suggestCount(history: History, ex: Exercise, now: number): Suggestion {
	const kind = ex.kind === 'hold' ? 'hold' : 'reps';
	const last = history[0];
	const sets: CountSet[] = [];
	if (!last) {
		for (let k = 0; k < ex.sets; k++) sets.push({ count: ex.lo, reason: 'start' });
		return { kind, sets, ceiling: false, daysSince: null };
	}
	for (let k = 0; k < ex.sets; k++) {
		const m = last.sets[Math.min(k, last.sets.length - 1)];
		const held = countOf(m);
		// holds logged before the timer existed carry no target: you counted
		// the seconds yourself, so what you logged is what you held
		const target = m.of === 'hold' ? m.target : undefined;
		const rang = ex.kind === 'hold' && held >= (target ?? held);
		const next = Math.min(ex.hi, Math.max(ex.lo, rang ? held + ex.inc : held));
		sets.push({ count: next, reason: held >= ex.hi ? 'ceiling' : rang ? 'increase' : 'hold' });
	}
	return { kind, sets, ceiling: atCeiling(last, ex), daysSince: (now - Date.parse(last.at)) / DAY };
}

/** What every set of this exercise should be next time. */
export function suggest(history: History, ex: Exercise, now: number): Suggestion {
	return ex.kind === 'load' ? suggestLoad(history, ex, now) : suggestCount(history, ex, now);
}

/* ---------- inside a session --------------------------------------------- */

/** A set this session already logged for the exercise: which one, and what it measured. */
export type PriorSet = { index: number; measure: Measure };

/**
 * What the tiles show for set k, given what this session has already done on
 * the exercise. The suggestion is per set — set 2 can legitimately ask for
 * LESS than set 1 — unless you overrode the ledger on the previous set (a
 * different machine, a sore shoulder). Then the override sticks for the rest
 * of the exercise, because "the ledger is wrong today" is true of every
 * remaining set. A hold's target follows this session's last TARGET, not the
 * seconds held: a dropped hold must not lower the next bell.
 */
export function nextSet(s: Suggestion, ex: Exercise, prior: PriorSet[], k: number): { weight: number; count: number } {
	const at = Math.min(k, ex.sets - 1);
	const last = prior[prior.length - 1];
	if (s.kind === 'load') {
		const suggestedPrev = last ? s.sets[Math.min(last.index - 1, ex.sets - 1)].weight : null;
		const overridden = last !== undefined && loadOf(last.measure) !== suggestedPrev;
		return overridden
			? { weight: loadOf(last.measure), count: countOf(last.measure) }
			: { weight: s.sets[at].weight, count: s.sets[at].reps };
	}
	if (!last) return { weight: 0, count: s.sets[at].count };
	const target = last.measure.of === 'hold' ? last.measure.target : undefined;
	return { weight: 0, count: Math.min(ex.hi, target ?? countOf(last.measure)) };
}
