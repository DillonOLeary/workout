import { countOf, loadOf, uniformLoad, type Measure } from './measure';
import type { BlockId, Cycle, Discipline, Exercise, Plan, PrepItem } from './plan';
import { EQUIPMENT, type Equipment } from './preferences';
import { rungLabel } from './racks';
import type { Reason, Suggestion } from './progression';

/**
 * The words. Every phrase a screen shows about a set, a load, a range or a
 * week is written here once and tested as a string, because the per-hand
 * and per-side questions must be answered identically on the plan screen,
 * the gym floor and the ledger — two screens phrasing "3 × 8–12" differently
 * is how a lunge ends up meaning two different workouts.
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

/** "Aug 10 – Sep 12" — the window a strip or an average covers. */
export function spanLabel(fromIso: string, toIso: string): string {
	return `${fmtShort(fromIso)} – ${fmtShort(toIso)}`;
}

/* ---------- one number ---------- */

/** "40 lb each hand" vs "35 lb" — never a bare number for a two-dumbbell lift. */
export function loadLabel(weight: number, ex: Exercise): string {
	if (ex.kind !== 'load') return '';
	return ex.progress.each ? `${weight} lb each hand` : `${weight} lb`;
}

/** "40 /hand" · "35 lb" — the load as a tile says it. */
export function loadShort(weight: number, ex: Exercise): string {
	if (ex.kind !== 'load') return '';
	return ex.progress.each ? `${weight} /hand` : `${weight} lb`;
}

/** "35 lb" · "40 lb each hand" · "15s" · "8 reps" · "30 min" — one number in this exercise's own unit. */
export function unitLabel(n: number, ex: Exercise): string {
	switch (ex.kind) {
		case 'load':
			return loadLabel(n, ex);
		case 'hold':
			return `${n}s`;
		case 'run':
			return `${n} min`;
		case 'reps':
			return `${n} reps`;
	}
}

/** "lb" · "s" · "min" · "" — the unit a bare number wears next to it. */
export function unitOf(ex: Exercise): string {
	switch (ex.kind) {
		case 'load':
			return 'lb';
		case 'hold':
			return 's';
		case 'run':
			return 'min';
		case 'reps':
			return '';
	}
}

/* ---------- disciplines ---------- */

/** "Lift" · "Yoga" · "Bodyweight" · "Stretch" · "Run" — the word a chip or a tile wears. */
export function disciplineLabel(d: Discipline): string {
	switch (d) {
		case 'lift':
			return 'Lift';
		case 'yoga':
			return 'Yoga';
		case 'bodyweight':
			return 'Bodyweight';
		case 'mobility':
			return 'Stretch';
		case 'run':
			return 'Run';
	}
}

/** "lifts" · "yoga" · "floor sessions" · "stretches" · "runs" — counted, in a sentence. */
export function disciplineNoun(d: Discipline, n: number): string {
	const one = Math.round(n * 10) === 10;
	switch (d) {
		case 'lift':
			return one ? 'lift' : 'lifts';
		case 'yoga':
			return 'yoga';
		case 'bodyweight':
			return one ? 'floor session' : 'floor sessions';
		case 'mobility':
			return one ? 'stretch' : 'stretches';
		case 'run':
			return one ? 'run' : 'runs';
	}
}

/** "a, b and c" */
export function listJoin(items: string[]): string {
	if (items.length <= 1) return items.join('');
	return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/* ---------- rates ---------- */

/**
 * "2.3" · "3" · "68" — an average, at the precision it deserves: one decimal
 * unless the number lands whole, because "3.0 lifts a week" reads like a
 * measurement and "3" reads like the truth.
 */
export function rateLabel(n: number): string {
	const r = Math.round(n * 10) / 10;
	return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * "↑ from 1.5" · "↓ from 3" · "same as before" — where a running average came
 * from. The direction is the point: a number on its own can't tell you
 * whether you're drifting.
 */
export function paceLabel(per: number, prev: number): string {
	const a = Math.round(per * 10);
	const b = Math.round(prev * 10);
	if (!b) return a ? 'nothing before that' : 'nothing logged';
	if (a === b) return 'same as before';
	return `${a > b ? '↑' : '↓'} from ${rateLabel(prev)}`;
}

/**
 * "asks 3 · ↑ from 2" · "asks 3 · same" · "asks 3 · ↑ from 0" — the legend's
 * line under a rate: what the week asks, and where the rate came from, short
 * enough for a phone's column.
 */
export function paceSub(target: number, per: number, prev: number): string {
	const from = paceLabel(per, prev);
	const short = from === 'same as before' ? 'same' : from === 'nothing before that' ? '↑ from 0' : from === 'nothing logged' ? 'none yet' : from;
	return `asks ${target} · ${short}`;
}

/**
 * The Ledger's one-line answer to "am I doing enough?": how often you show
 * up against what the week asks, in total, and where the gap is. The
 * numbers per discipline are on the legend under it — this says what they
 * MEAN, which is the one thing a number cannot do.
 *
 *   "Showing up 6.5 times a week of the 11 the plan asks — lifts are the gap."
 *   "Showing up 11 times a week of the 11 the plan asks."
 *   "Nothing logged in the last 4 weeks"
 */
export function paceSentence(p: { weeks: number; rates: { discipline: Discipline; per: number; target: number }[] }): string {
	const total = p.rates.reduce((n, r) => n + r.per, 0);
	if (Math.round(total * 10) === 0) return `Nothing logged in the last ${p.weeks} weeks`;
	const asked = p.rates.reduce((n, r) => n + r.target, 0);
	const gap = p.rates.map((r) => ({ r, short: r.target - r.per })).sort((a, b) => b.short - a.short)[0];
	const tail = gap && gap.short >= 0.5 ? ` — ${disciplineNoun(gap.r.discipline, 2)} ${gap.r.discipline === 'yoga' ? 'is' : 'are'} the gap.` : '.';
	return `Showing up ${rateLabel(total)} times a week of the ${rateLabel(asked)} the plan asks${tail}`;
}

/** "3 a week · 1 done" — a cycle's cadence, and the week so far. */
export const weekMeta = (target: number, done: number): string => `${target} a week · ${done} done`;

/** "takes Lift's 3 when there's no gym · dealt as Instead" — a target-0 block's line on The Plan. */
export const standInMeta = (title: string, target: number): string => `takes ${title}'s ${target} when there's no gym · dealt as Instead`;

/** "yoga" · "stretch" · "run" · "no gym" — a block, in a sentence. */
export function blockLabel(b: BlockId): string {
	switch (b) {
		case 'yoga':
			return 'yoga';
		case 'mob':
			return 'stretch';
		case 'run':
			return 'run';
		case 'bw':
			return 'no gym';
	}
}

/**
 * "switched to Open to Work · yoga, stretch, run on" · "run off" — one
 * change to the week, as the Ledger's divider says it.
 */
export function weekChangeLine(c: { programme?: string; blocks: { block: BlockId; on: boolean }[] }, programmeName: (id: string) => string): string {
	const parts: string[] = [];
	if (c.programme) parts.push(`switched to ${programmeName(c.programme)}`);
	const on = c.blocks.filter((b) => b.on).map((b) => blockLabel(b.block));
	const off = c.blocks.filter((b) => !b.on).map((b) => blockLabel(b.block));
	if (on.length) parts.push(`${on.join(', ')} on`);
	if (off.length) parts.push(`${off.join(', ')} off`);
	return parts.join(' · ');
}

/** "11 sessions a week · about 6 h" — what the week comes to. */
export function weekHead(sessions: number, minutes: number): string {
	const time = minutes >= 90 ? `about ${rateLabel(Math.round(minutes / 30) / 2)} h` : `about ${minutes} min`;
	return `${sessions} sessions a week · ${time}`;
}

/** "Lift 3 · Yoga 2 · Stretch 3 · Run 3 — a week" — the plan's cadence, cycle by cycle. */
export function scheduleLine(plan: Plan): string {
	const on = plan.cycles.filter((c) => c.target > 0);
	return on.length ? `${on.map((c) => `${c.title} ${c.target}`).join(' · ')} — a week` : plan.schedule;
}

/** "1 of 3 this week" */
export const weekLine = (done: number, target: number): string => `${done} of ${target} this week`;

/** "Lift · 1 of 2" · "No gym · 3 of 7" — where a routine sits in its cycle. */
export function turnLabel(cycle: Cycle, routine: string): string {
	const i = cycle.routines.indexOf(routine);
	return cycle.routines.length === 1 ? cycle.title : `${cycle.title} · ${i + 1} of ${cycle.routines.length}`;
}

/** "needs a gym" · "needs a mat and running shoes" — why a routine is ruled out, never hidden. */
export function needsLine(missing: Equipment[]): string {
	const words = missing.map((m) => EQUIPMENT.find((e) => e.id === m)?.needed ?? m);
	return `needs ${listJoin(words)}`;
}

/**
 * The trend list's one-line answer, by what the RULE is about to do rather
 * than by how each exercise feels: "2 going up · 3 flat · 1 backing off".
 * Zeroes are left out, and an empty list has nothing to say.
 */
export function trendTally(tones: string[]): string {
	const words: [string, string][] = [
		['up', 'going up'],
		['warn', 'warned'],
		['down', 'backing off'],
		['flat', 'flat'],
		['start', 'not started']
	];
	return words
		.map(([tone, word]) => [tones.filter((t) => t === tone).length, word] as const)
		.filter(([n]) => n > 0)
		.map(([n, word]) => `${n} ${word}`)
		.join(' · ');
}

/**
 * A whole session folded to one line, for a list that would otherwise print
 * every set of every session: "20 sets · 48 min", "9 holds · 11 min",
 * "32 min" (a run), "nothing logged".
 */
export function sessionSummary(p: { sets: number; holds?: boolean; minutes: number }): string {
	const parts: string[] = [];
	if (p.sets) parts.push(`${p.sets} ${p.holds ? (p.sets === 1 ? 'hold' : 'holds') : p.sets === 1 ? 'set' : 'sets'}`);
	if (p.minutes) parts.push(`${p.minutes} min`);
	return parts.join(' · ') || 'nothing logged';
}

/**
 * "40 lb · 3 × 8" · "45 /hand · 3 × 6" · "2 × 14" · "3 × 15s" · "30 min" ·
 * "skipped" — one exercise of a session logged after the fact, as its line
 * says it: every set the same numbers.
 */
export function lineValue(ex: Exercise, sets: number, weight: number, count: number): string {
	if (ex.kind === 'run') return `${count} min`;
	if (!sets) return 'skipped';
	const reps = `${sets} × ${count}${ex.kind === 'hold' ? 's' : ''}`;
	return ex.kind === 'load' ? `${loadShort(weight, ex)} · ${reps}` : reps;
}

/* ---------- the plan's numbers ---------- */

const range = (ex: Exercise) => (ex.lo === ex.hi ? String(ex.lo) : `${ex.lo}–${ex.hi}`);

/** "8–12 reps per side" · "20–45 sec" · "30 min" — the range, with its side rule. */
export function rangeLabel(ex: Exercise): string {
	const unit = ex.kind === 'hold' ? 'sec' : ex.kind === 'run' ? 'min' : 'reps';
	return `${range(ex)} ${unit}${ex.side === 'reps' ? ' per side' : ''}`;
}

/** "3 × 6–12" · "3 × 10–20s" · "2 × 45s · L/R" · "3 × 8–12 · per side" · "30 min" — the plan row's dose. */
export function doseLabel(ex: Exercise): string {
	if (ex.kind === 'run') return `${range(ex)} min`;
	return (
		`${ex.sets} × ${range(ex)}${ex.kind === 'hold' ? 's' : ''}` +
		(ex.side === 'sets' ? ' · L/R' : ex.side === 'reps' ? ' · per side' : '')
	);
}

/** "45s each side" · "45s" — a stretch's dose, as a row offers it. */
export function holdDose(ex: Exercise): string {
	return `${ex.lo}s${ex.side === 'sets' ? ' each side' : ''}`;
}

/** "HOLD 1 OF 2 · 45S EACH SIDE" — a stretch's meta line: a fixed hold has no target to state. */
export function holdLine(ex: Exercise, index: number): string {
	return `HOLD ${index} OF ${ex.sets} · ${ex.lo}S${ex.side === 'sets' ? ' EACH SIDE' : ''}`;
}

/** "Easy jog · 3 min" · "Carioca · 30s each" · "Sun Salutation A × 3" · "One light set of the first lift" — a prep item, as the plan lists it. */
export function prepLabel(item: PrepItem): string {
	if (typeof item === 'string') return item;
	if ('minutes' in item) return `${item.name} · ${item.minutes} min`;
	if ('reps' in item) return `${item.name} × ${item.reps}${item.each ? ' each' : ''}`;
	return `${item.name} · ${item.seconds}s${item.each ? ' each' : ''}`;
}

/** "30s" · "3 min" — a countdown's length, as a button says it. */
export function durationLabel(seconds: number): string {
	return seconds % 60 === 0 && seconds >= 60 ? `${seconds / 60} min` : `${seconds}s`;
}

/** "41 min · warm-up and cooldown done." — the receipt's one line about what never reached the ledger. */
export function receiptLine(minutes: number, warm: boolean, cool: boolean): string {
	const did = warm && cool ? 'warm-up and cooldown done' : warm ? 'warm-up done' : cool ? 'cooldown done' : null;
	return `${minutes} min${did ? ` · ${did}` : ''}.`;
}

/** What a level-up costs here: a rack step, a fixed increment, a rung — or nothing. */
export function stepLabel(ex: Exercise): string {
	switch (ex.progress.of) {
		case 'size':
			return ex.progress.rack ? rungLabel(ex.progress.rack) : `+${ex.progress.inc} lb`;
		case 'time':
			return `+${ex.progress.inc}s`;
		case 'count':
			return '+1 rep';
		case 'variant':
			return 'next rung';
		case 'none':
			return '';
	}
}

/* ---------- a set ---------- */

/** "45 lb × 12" · "50 /hand × 10" · "30s" · "12 reps" · "32 min" · "45 lb × —" — a tile or table value. */
export function setValue(ex: Exercise, weight: number, count: number | null): string {
	if (count === null) return ex.kind === 'load' ? `${loadShort(weight, ex)} × —` : '—';
	switch (ex.kind) {
		case 'load':
			return `${loadShort(weight, ex)} × ${count}`;
		case 'hold':
			return `${count}s`;
		case 'run':
			return `${count} min`;
		case 'reps':
			return `${count} reps`;
	}
}

/** "35 lb × 6–12" · "10–20s" · "45s" · "5–15" · "30 min" — a set that hasn't happened yet. */
export function plannedValue(ex: Exercise, weight: number): string {
	switch (ex.kind) {
		case 'load':
			return `${loadShort(weight, ex)} × ${range(ex)}`;
		case 'hold':
			return `${range(ex)}s`;
		case 'run':
			return `${range(ex)} min`;
		case 'reps':
			return range(ex);
	}
}

/** "12" · "15s" · "30 min" — one set's count in its own unit, for the muted "last time" beside a row. */
export function countLabel(m: Measure): string {
	return m.of === 'hold' ? `${countOf(m)}s` : m.of === 'duration' ? `${countOf(m)} min` : String(countOf(m));
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
	return sets.map((m) => `${loadOf(m)}×${n(m)}`).join(' · ') + (ex?.kind === 'load' && ex.progress.each ? ' each hand' : '');
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
 * gets one line only: that it has reached its ceiling. A ladder says which
 * rung, when the rung just changed or has run out.
 */
export function loadHint(s: Suggestion, ex: Exercise): string | null {
	if (s.kind !== 'load') {
		if (s.variant?.promoted) return `Up a rung — ${s.variant.name} from here, reps from ${ex.lo}.`;
		if (s.variant && s.ceiling) return `Top of the ladder (${s.variant.name}) — make it harder.`;
		return ex.kind === 'hold' && s.ceiling ? ceilingHint(ex) : null;
	}
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
