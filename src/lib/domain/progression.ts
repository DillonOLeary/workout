import { countOf, loadOf, type Measure } from './measure';
import type { Counted, Exercise, Loaded } from './plan';
import { nextRung, prevRung, snapToRack } from './racks';

/** One session's sets for one exercise — what the rule reads. */
export type HistoryEntry = { at: string; dateLabel: string; sets: Measure[] };
/** Every entry for one exercise, newest first. */
export type History = HistoryEntry[];

/** Days inside which two misses count as two, and beyond which an absence is a re-entry. */
export const REENTRY_DAYS = 14;
/** Days since the last entry at which the nudge starts, before the re-entry rule fires. */
export const REENTRY_WARN_DAYS = 11;
const DAY = 86400000;

/** Days of runway before the re-entry haircut — never below 1. */
export const daysUntilReentry = (daysSince: number): number => Math.max(1, Math.ceil(REENTRY_DAYS - daysSince));

/** One size up: the next rung on the rack, or +inc where there is no rack. */
export function increasedWeight(weight: number, ex: Loaded): number {
	return ex.progress.rack ? nextRung(weight, ex.progress.rack) : weight + ex.progress.inc;
}

/** One size down: the previous rung, or −inc off a rack. Never negative. */
export function decreasedWeight(weight: number, ex: Loaded): number {
	return ex.progress.rack ? prevRung(weight, ex.progress.rack) : Math.max(0, weight - ex.progress.inc);
}

/** The ± tile on a load: one size along the exercise's own ladder. */
export function bumpLoad(ex: Loaded, weight: number, dir: 1 | -1): number {
	return dir > 0 ? increasedWeight(weight, ex) : decreasedWeight(weight, ex);
}

/** The ± tile on a count: a hold by its inc inside the range, a run by five minutes, reps by one. */
export function bumpCount(ex: Exercise, count: number, dir: 1 | -1): number {
	if (ex.kind === 'hold') {
		const inc = ex.progress.of === 'time' ? ex.progress.inc : 5;
		return Math.min(ex.hi, Math.max(ex.lo, count + dir * inc));
	}
	if (ex.kind === 'run') return Math.min(240, Math.max(5, count + dir * 5));
	return Math.min(100, Math.max(1, count + dir));
}

/** A set that reached the top of the range. */
export function setEarned(m: Measure, ex: Exercise): boolean {
	return countOf(m) >= ex.hi;
}

/** Some set of this entry reached the top of the range — the ledger's ↑ pill. */
export function anySetEarned(sets: Measure[], ex: Exercise): boolean {
	return sets.some((m) => setEarned(m, ex));
}

/** Every set of a full entry at the top of the range. */
export function atCeiling(entry: { sets: Measure[] } | null, ex: Exercise): boolean {
	if (!entry || entry.sets.length < ex.sets) return false;
	return entry.sets.every((m) => countOf(m) >= ex.hi);
}

/** Why a load set is what it is. */
export type Reason = 'start' | 'increase' | 'hold' | 'adjust' | 'reentry';
/** What one load set should be next time. */
export type LoadSet = {
	weight: number;
	reason: Reason;
	/** the count to preload: the bottom of the range after a move, else last time's */
	reps: number;
	/** last time this set fell below the range */
	missed: boolean;
};
/** Why a count set is what it is. */
export type CountReason = 'start' | 'increase' | 'hold' | 'ceiling';
/** What one count set should be next time. */
export type CountSet = { count: number; reason: CountReason };
/** Where a ladder exercise stands. */
export type Variant = {
	name: string;
	rung: number;
	/** the last session earned this rung — reps start over at the bottom */
	promoted: boolean;
	/** the last rung there is */
	top: boolean;
};

/** What every set should be next time, shaped by what the rule moves: weights-and-reps for a load, counts-and-a-ceiling for the rest. */
export type Suggestion =
	| {
			kind: 'load';
			/** one per set, index = set number − 1; always ex.sets long */
			sets: LoadSet[];
			/** the headline: start > reentry > adjust > increase > hold */
			reason: Reason;
			/** some set goes up */
			up: boolean;
			/** some set comes down (re-entry or an adjustment) */
			down: boolean;
			/** set 1's weight */
			weight: number;
			/** whole days since the last entry, or null when there is none */
			daysSince: number | null;
	  }
	| {
			kind: 'count';
			sets: CountSet[];
			/** every set of the last full entry at the top of the range, with nowhere higher to go */
			ceiling: boolean;
			daysSince: number | null;
			/** a ladder exercise: the rung to do it at */
			variant?: Variant;
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

function suggestLoad(history: History, ex: Loaded, now: number): Suggestion {
	const startWeight = ex.progress.rack ? snapToRack(ex.progress.start, ex.progress.rack) : ex.progress.start;
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
			// k = 0 always exists: historyFor drops empty rows
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
				prev !== undefined &&
				p !== undefined &&
				countOf(p) < ex.lo &&
				loadOf(p) === weight &&
				(Date.parse(last.at) - Date.parse(prev.at)) / DAY <= REENTRY_DAYS;
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

function suggestCount(history: History, ex: Exercise, now: number): Suggestion {
	const last = history[0];
	const sets: CountSet[] = [];
	if (!last) {
		for (let k = 0; k < ex.sets; k++) sets.push({ count: ex.lo, reason: 'start' });
		return { kind: 'count', sets, ceiling: false, daysSince: null };
	}
	const inc = ex.progress.of === 'time' ? ex.progress.inc : 0;
	for (let k = 0; k < ex.sets; k++) {
		const m = last.sets[Math.min(k, last.sets.length - 1)];
		const held = countOf(m);
		// holds logged before the timer existed carry no target: what you logged is what you held
		const target = m.of === 'hold' ? m.target : undefined;
		const rang = ex.progress.of === 'time' && held >= (target ?? held);
		const next = Math.min(ex.hi, Math.max(ex.lo, rang ? held + inc : held));
		sets.push({ count: next, reason: held >= ex.hi ? 'ceiling' : rang ? 'increase' : 'hold' });
	}
	return { kind: 'count', sets, ceiling: atCeiling(last, ex), daysSince: (now - Date.parse(last.at)) / DAY };
}

function suggestVariant(history: History, ex: Counted & { progress: { of: 'variant'; ladder: string[] } }, now: number): Suggestion {
	const ladder = ex.progress.ladder;
	const top = ladder.length - 1;
	let rung = 0;
	let promoted = false;
	for (let i = history.length - 1; i >= 0; i--) {
		promoted = rung < top && atCeiling(history[i], ex);
		if (promoted) rung++;
	}
	const last = history[0];
	const variant: Variant = { name: ladder[rung], rung, promoted, top: rung === top };
	if (!last) {
		const sets: CountSet[] = [];
		for (let k = 0; k < ex.sets; k++) sets.push({ count: ex.lo, reason: 'start' });
		return { kind: 'count', sets, ceiling: false, daysSince: null, variant };
	}
	const sets: CountSet[] = [];
	for (let k = 0; k < ex.sets; k++) {
		if (promoted) {
			sets.push({ count: ex.lo, reason: 'increase' });
			continue;
		}
		const held = countOf(last.sets[Math.min(k, last.sets.length - 1)]);
		sets.push({ count: Math.min(ex.hi, Math.max(ex.lo, held)), reason: held >= ex.hi ? 'ceiling' : 'hold' });
	}
	return {
		kind: 'count',
		sets,
		ceiling: !promoted && rung === top && atCeiling(last, ex),
		daysSince: (now - Date.parse(last.at)) / DAY,
		variant
	};
}

function suggestFixed(history: History, ex: Exercise, now: number): Suggestion {
	const last = history[0];
	const sets: CountSet[] = [];
	for (let k = 0; k < ex.sets; k++) sets.push({ count: ex.lo, reason: last ? 'hold' : 'start' });
	return { kind: 'count', sets, ceiling: false, daysSince: last ? (now - Date.parse(last.at)) / DAY : null };
}

/**
 * What every set of this exercise should be next time, set by set, in the axis the rule moves.
 * `adjust` (the same set missed twice inside REENTRY_DAYS) may go below `start`; `reentry` floors at `start` and never rises to it.
 */
export function suggest(history: History, ex: Exercise, now: number): Suggestion {
	switch (ex.progress.of) {
		case 'size':
			return suggestLoad(history, ex as Loaded, now);
		case 'time':
		case 'count':
			return suggestCount(history, ex, now);
		case 'variant':
			return suggestVariant(history, ex as Counted & { progress: { of: 'variant'; ladder: string[] } }, now);
		case 'none':
			return suggestFixed(history, ex, now);
	}
}

/** A set this session already logged for the exercise: which one, and what it measured. */
export type PriorSet = { index: number; measure: Measure };

/** The tiles for set k: the per-set suggestion, unless an earlier set this session overrode it — then the override sticks; a hold follows the last target, not the seconds held. */
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
