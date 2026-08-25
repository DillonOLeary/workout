import { countOf, loadOf, uniformLoad, type Measure } from './measure';
import type { Exercise } from './plan';
import { rungLabel } from './racks';
import type { Reason, Suggestion } from './progression';

/**
 * The words. Every phrase a screen shows about a set, a load or a range is
 * written here once and tested as a string, because the per-hand and
 * per-side questions must be answered identically on the plan screen, the
 * gym floor and the ledger — two screens phrasing "3 × 8–12" differently is
 * how a lunge ends up meaning two different workouts.
 */

/* ---------- dates ---------- */

/** "Sun, Aug 23" */
export function fmtDate(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "Aug 23" — the date without its weekday, for a sentence. */
export function fmtShort(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ---------- one number ---------- */

/** "40 lb each hand" vs "35 lb" — never a bare number for a two-dumbbell lift. */
export function loadLabel(weight: number, ex: Exercise): string {
	if (ex.kind !== 'load') return '';
	return ex.each ? `${weight} lb each hand` : `${weight} lb`;
}

/** "40 /hand" · "35 lb" — the load as a tile says it. */
export function loadShort(weight: number, ex: Exercise): string {
	if (ex.kind !== 'load') return '';
	return ex.each ? `${weight} /hand` : `${weight} lb`;
}

/** "35 lb" · "40 lb each hand" · "15s" · "8 reps" — one number in this exercise's own unit. */
export function unitLabel(n: number, ex: Exercise): string {
	if (ex.kind === 'load') return loadLabel(n, ex);
	return ex.kind === 'hold' ? `${n}s` : `${n} reps`;
}

/** "lb" · "s" · "" — the unit a bare number wears next to it. */
export function unitOf(ex: Exercise): string {
	return ex.kind === 'load' ? 'lb' : ex.kind === 'hold' ? 's' : '';
}

/* ---------- the plan's numbers ---------- */

/** "8–12 reps per side" · "20–45 sec" — the range, with its side rule. */
export function rangeLabel(ex: Exercise): string {
	const unit = ex.kind === 'hold' ? 'sec' : 'reps';
	return `${ex.lo}–${ex.hi} ${unit}${ex.side === 'reps' ? ' per side' : ''}`;
}

/** "3 × 6–12" · "3 × 10–20s" · "2 × 5–15 · L/R" · "3 × 8–12 · per side" — the plan row's dose. */
export function doseLabel(ex: Exercise): string {
	return (
		`${ex.sets} × ${ex.lo}–${ex.hi}${ex.kind === 'hold' ? 's' : ''}` +
		(ex.side === 'sets' ? ' · L/R' : ex.side === 'reps' ? ' · per side' : '')
	);
}

/** "3 sets" · "2 sets, one per side" — what a "set" counts on this movement. */
export function setsLabel(ex: Exercise): string {
	return ex.side === 'sets' ? `${ex.sets} sets, one per side` : `${ex.sets} sets`;
}

/** What a level-up costs here: a rack step, or a fixed increment. */
export function stepLabel(ex: Exercise): string {
	if (ex.kind === 'hold') return `+${ex.inc}s`;
	if (ex.kind === 'reps') return '+1 rep';
	if (ex.rack) return rungLabel(ex.rack);
	return `+${ex.inc} lb`;
}

/* ---------- a set ---------- */

/** "45 lb × 12" · "50 /hand × 10" · "30s" · "12 reps" · "45 lb × —" — a tile or table value. */
export function setValue(ex: Exercise, weight: number, count: number | null): string {
	const c = count === null ? '—' : ex.kind === 'hold' ? `${count}s` : String(count);
	if (ex.kind !== 'load') return ex.kind === 'hold' || count === null ? c : `${c} reps`;
	return `${loadShort(weight, ex)} × ${c}`;
}

/** "35 lb × 6–12" · "10–20s" · "5–15" — a set that hasn't happened yet. */
export function plannedValue(ex: Exercise, weight: number): string {
	if (ex.kind === 'hold') return `${ex.lo}–${ex.hi}s`;
	if (ex.kind === 'reps') return `${ex.lo}–${ex.hi}`;
	return `${loadShort(weight, ex)} × ${ex.lo}–${ex.hi}`;
}

/**
 * "35 lb · 12 · 12 · 11" · "45×5 · 35×12" · "8 L · 8 R" · "20s · 20s" — a
 * whole entry on one line. Works without the exercise too: the measures say
 * what they are, so a retired exercise still reads as it was logged.
 */
export function setsLine(sets: Measure[], ex?: Exercise): string {
	const hold = ex?.kind === 'hold' || sets.some((m) => m.of === 'hold');
	const n = (m: Measure) => (hold || m.of === 'hold' ? `${countOf(m)}s` : String(countOf(m)));
	// side: 'sets' — each set is one side, so say which (matches the floor)
	if (ex?.side === 'sets') return sets.map((m, i) => `${n(m)} ${i % 2 === 0 ? 'L' : 'R'}`).join(' · ');
	const loaded = ex ? ex.kind === 'load' : sets.some((m) => loadOf(m) > 0);
	if (!loaded) return sets.map(n).join(' · ');
	// a row whose load moved shows every set: collapsing it to one number is
	// what used to hide the heavier sets before a back-off
	if (uniformLoad(sets)) {
		const w = ex ? loadLabel(loadOf(sets[0]), ex) : `${loadOf(sets[0])} lb`;
		return `${w} · ${sets.map(n).join(' · ')}`;
	}
	return sets.map((m) => `${loadOf(m)}×${n(m)}`).join(' · ') + (ex?.kind === 'load' && ex.each ? ' each hand' : '');
}

/* ---------- the rule, explained ---------- */

/** "set 1" · "sets 2–3" · "sets 1, 3" — which sets a sentence is about. */
export function setsPhrase(indices: number[]): string {
	const n = indices.map((i) => i + 1);
	if (n.length === 1) return `set ${n[0]}`;
	const contiguous = n.every((v, i) => i === 0 || v === n[i - 1] + 1);
	return contiguous ? `sets ${n[0]}–${n[n.length - 1]}` : `sets ${n.join(', ')}`;
}
export const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The hold that has nowhere longer to go. */
export const ceilingHint = (ex: Exercise) => `At the ceiling (${ex.hi}s) — make it harder, not longer.`;

/**
 * The one line the gym floor shows before set 1, so a changed number is never
 * silent — an unexplained lighter bar reads as a bug, which is worse than no
 * adjustment at all. Precedence: re-entry, then an adjustment, then a
 * level-up, then a warning about a miss. One sentence, never a list. A hold
 * gets one line only: that it has reached its ceiling.
 */
export function loadHint(s: Suggestion, ex: Exercise): string | null {
	if (s.kind !== 'load') return s.kind === 'hold' && s.ceiling ? ceilingHint(ex) : null;
	if (s.reason === 'start' || ex.kind !== 'load') return null;
	const where = (r: Reason) => s.sets.map((x, i) => (x.reason === r ? i : -1)).filter((i) => i >= 0);
	if (s.reason === 'reentry')
		return `Re-entry after ${Math.floor(s.daysSince ?? 0)} days — one size down, build it back.`;
	const adjusted = where('adjust');
	if (adjusted.length) {
		const w = loadLabel(s.sets[adjusted[0]].weight, ex);
		return `${capitalise(setsPhrase(adjusted))} back one size after 2 misses — ${w}.`;
	}
	const up = where('increase');
	if (up.length) {
		const w = loadLabel(s.sets[up[0]].weight, ex);
		if (up.length === s.sets.length) return `Every set goes up to ${w}.`;
		const rest = s.sets.map((_, i) => i).filter((i) => !up.includes(i));
		const restW = s.sets[rest[0]].weight;
		const stay = rest.every((i) => s.sets[i].weight === restW)
			? `${setsPhrase(rest)} ${rest.length === 1 ? 'stays' : 'stay'} at ${restW}`
			: `the rest stay where they are`;
		const verb = up.length === 1 ? 'goes' : 'go';
		return `${capitalise(setsPhrase(up))} ${verb} up to ${w} — ${stay}.`;
	}
	const missed = s.sets.map((x, i) => (x.missed ? i : -1)).filter((i) => i >= 0);
	if (missed.length)
		return `${capitalise(setsPhrase(missed))} missed last time — miss again and it backs off a size.`;
	return null;
}
