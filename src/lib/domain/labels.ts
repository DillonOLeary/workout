import { countOf, loadOf, uniformLoad, type Measure } from './measure';
import type { BlockId, Cycle, Discipline, Exercise, Plan, PrepItem } from './plan';
import { EQUIPMENT, type Equipment } from './preferences';
import { rungLabel } from './racks';
import type { Reason, Suggestion } from './progression';

/** The words: every phrase a screen shows about a set, a load, a range or a week, written once and tested as a string. */

/** "Sun, Aug 23" */
export function fmtDate(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "Aug 23" — without the weekday */
export function fmtShort(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "Aug 10 – Sep 12" */
export function spanLabel(fromIso: string, toIso: string): string {
	return `${fmtShort(fromIso)} – ${fmtShort(toIso)}`;
}

/** "40 lb each hand" · "35 lb" */
export function loadLabel(weight: number, ex: Exercise): string {
	if (ex.kind !== 'load') return '';
	return ex.progress.each ? `${weight} lb each hand` : `${weight} lb`;
}

/** "40 /hand" · "35 lb" — as a tile says it */
export function loadShort(weight: number, ex: Exercise): string {
	if (ex.kind !== 'load') return '';
	return ex.progress.each ? `${weight} /hand` : `${weight} lb`;
}

/** "35 lb" · "40 lb each hand" · "15s" · "8 reps" · "30 min" */
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

/** "lb" · "s" · "min" · "" */
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

/** "Lift" · "Yoga" · "Bodyweight" · "Stretch" · "Run" */
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

/** "lifts" · "yoga" · "floor sessions" · "stretches" · "runs" — counted */
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

/** "2.3" · "3" · "68" — one decimal unless whole */
export function rateLabel(n: number): string {
	const r = Math.round(n * 10) / 10;
	return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** "↑ from 1.5" · "↓ from 3" · "same as before" */
export function paceLabel(per: number, prev: number): string {
	const a = Math.round(per * 10);
	const b = Math.round(prev * 10);
	if (!b) return a ? 'nothing before that' : 'nothing logged';
	if (a === b) return 'same as before';
	return `${a > b ? '↑' : '↓'} from ${rateLabel(prev)}`;
}

/** "asks 3 · ↑ from 2" · "asks 3 · same" · "asks 3 · ↑ from 0" */
export function paceSub(target: number, per: number, prev: number): string {
	const from = paceLabel(per, prev);
	const short = from === 'same as before' ? 'same' : from === 'nothing before that' ? '↑ from 0' : from === 'nothing logged' ? 'none yet' : from;
	return `asks ${target} · ${short}`;
}

/** "Showing up 6.5 times a week of the 11 the plan asks — lifts are the gap." · "Nothing logged in the last 4 weeks" */
export function paceSentence(p: { weeks: number; rates: { discipline: Discipline; per: number; target: number }[] }): string {
	const total = p.rates.reduce((n, r) => n + r.per, 0);
	if (Math.round(total * 10) === 0) return `Nothing logged in the last ${p.weeks} weeks`;
	const asked = p.rates.reduce((n, r) => n + r.target, 0);
	const gap = p.rates.map((r) => ({ r, short: r.target - r.per })).sort((a, b) => b.short - a.short)[0];
	const tail = gap && gap.short >= 0.5 ? ` — ${disciplineNoun(gap.r.discipline, 2)} ${gap.r.discipline === 'yoga' ? 'is' : 'are'} the gap.` : '.';
	return `Showing up ${rateLabel(total)} times a week of the ${rateLabel(asked)} the plan asks${tail}`;
}

/** "3 a week · 1 done" */
export const weekMeta = (target: number, done: number): string => `${target} a week · ${done} done`;

/** "takes Lift's 3 when there's no gym · dealt as Instead" */
export const standInMeta = (title: string, target: number): string => `takes ${title}'s ${target} when there's no gym · dealt as Instead`;

/** "yoga" · "stretch" · "run" · "no gym" */
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

/** "switched to Open to Work · yoga, stretch, run on" · "run off" */
export function weekChangeLine(c: { programme?: string; blocks: { block: BlockId; on: boolean }[] }, programmeName: (id: string) => string): string {
	const parts: string[] = [];
	if (c.programme) parts.push(`switched to ${programmeName(c.programme)}`);
	const on = c.blocks.filter((b) => b.on).map((b) => blockLabel(b.block));
	const off = c.blocks.filter((b) => !b.on).map((b) => blockLabel(b.block));
	if (on.length) parts.push(`${on.join(', ')} on`);
	if (off.length) parts.push(`${off.join(', ')} off`);
	return parts.join(' · ');
}

/** "11 sessions a week · about 6 h" */
export function weekHead(sessions: number, minutes: number): string {
	const time = minutes >= 90 ? `about ${rateLabel(Math.round(minutes / 30) / 2)} h` : `about ${minutes} min`;
	return `${sessions} sessions a week · ${time}`;
}

/** "Lift 3 · Yoga 2 · Stretch 3 · Run 3 — a week" */
export function scheduleLine(plan: Plan): string {
	const on = plan.cycles.filter((c) => c.target > 0);
	return on.length ? `${on.map((c) => `${c.title} ${c.target}`).join(' · ')} — a week` : plan.schedule;
}

/** "1 of 3 this week" */
export const weekLine = (done: number, target: number): string => `${done} of ${target} this week`;

/** "Lift · 1 of 2" · "No gym · 3 of 7" */
export function turnLabel(cycle: Cycle, routine: string): string {
	const i = cycle.routines.indexOf(routine);
	return cycle.routines.length === 1 ? cycle.title : `${cycle.title} · ${i + 1} of ${cycle.routines.length}`;
}

/** "needs a gym" · "needs a mat and running shoes" */
export function needsLine(missing: Equipment[]): string {
	const words = missing.map((m) => EQUIPMENT.find((e) => e.id === m)?.needed ?? m);
	return `needs ${listJoin(words)}`;
}

/** "2 going up · 3 flat · 1 backing off" — zeroes left out */
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

/** "20 sets · 48 min" · "9 holds · 11 min" · "32 min" · "nothing logged" */
export function sessionSummary(p: { sets: number; holds?: boolean; minutes: number }): string {
	const parts: string[] = [];
	if (p.sets) parts.push(`${p.sets} ${p.holds ? (p.sets === 1 ? 'hold' : 'holds') : p.sets === 1 ? 'set' : 'sets'}`);
	if (p.minutes) parts.push(`${p.minutes} min`);
	return parts.join(' · ') || 'nothing logged';
}

/** "40 lb · 3 × 8" · "45 /hand · 3 × 6" · "2 × 14" · "3 × 15s" · "30 min" · "skipped" — every set the same numbers */
export function lineValue(ex: Exercise, sets: number, weight: number, count: number): string {
	if (ex.kind === 'run') return `${count} min`;
	if (!sets) return 'skipped';
	const reps = `${sets} × ${count}${ex.kind === 'hold' ? 's' : ''}`;
	return ex.kind === 'load' ? `${loadShort(weight, ex)} · ${reps}` : reps;
}

const range = (ex: Exercise) => (ex.lo === ex.hi ? String(ex.lo) : `${ex.lo}–${ex.hi}`);

/** "8–12 reps per side" · "20–45 sec" · "30 min" */
export function rangeLabel(ex: Exercise): string {
	const unit = ex.kind === 'hold' ? 'sec' : ex.kind === 'run' ? 'min' : 'reps';
	return `${range(ex)} ${unit}${ex.side === 'reps' ? ' per side' : ''}`;
}

/** "3 × 6–12" · "3 × 10–20s" · "2 × 45s · L/R" · "3 × 8–12 · per side" · "30 min" */
export function doseLabel(ex: Exercise): string {
	if (ex.kind === 'run') return `${range(ex)} min`;
	return (
		`${ex.sets} × ${range(ex)}${ex.kind === 'hold' ? 's' : ''}` +
		(ex.side === 'sets' ? ' · L/R' : ex.side === 'reps' ? ' · per side' : '')
	);
}

/** "45s each side" · "45s" */
export function holdDose(ex: Exercise): string {
	return `${ex.lo}s${ex.side === 'sets' ? ' each side' : ''}`;
}

/** "HOLD 1 OF 2 · 45S EACH SIDE" */
export function holdLine(ex: Exercise, index: number): string {
	return `HOLD ${index} OF ${ex.sets} · ${ex.lo}S${ex.side === 'sets' ? ' EACH SIDE' : ''}`;
}

/** "Easy jog · 3 min" · "Carioca · 30s each" · "Sun Salutation A × 3" · "One light set of the first lift" */
export function prepLabel(item: PrepItem): string {
	if (typeof item === 'string') return item;
	if ('minutes' in item) return `${item.name} · ${item.minutes} min`;
	if ('reps' in item) return `${item.name} × ${item.reps}${item.each ? ' each' : ''}`;
	return `${item.name} · ${item.seconds}s${item.each ? ' each' : ''}`;
}

/** "30s" · "3 min" */
export function durationLabel(seconds: number): string {
	return seconds % 60 === 0 && seconds >= 60 ? `${seconds / 60} min` : `${seconds}s`;
}

/** "41 min · warm-up and cooldown done." */
export function receiptLine(minutes: number, warm: boolean, cool: boolean): string {
	const did = warm && cool ? 'warm-up and cooldown done' : warm ? 'warm-up done' : cool ? 'cooldown done' : null;
	return `${minutes} min${did ? ` · ${did}` : ''}.`;
}

/** "+5 lb" · "+5s" · "+1 rep" · "next rung" · "" — what a level-up costs */
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

/** "45 lb × 12" · "50 /hand × 10" · "30s" · "12 reps" · "32 min" · "45 lb × —" */
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

/** "35 lb × 6–12" · "10–20s" · "45s" · "5–15" · "30 min" */
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

/** "12" · "15s" · "30 min" */
export function countLabel(m: Measure): string {
	return m.of === 'hold' ? `${countOf(m)}s` : m.of === 'duration' ? `${countOf(m)} min` : String(countOf(m));
}

/** "35 lb · 12 · 12 · 11" · "45×5 · 35×12" · "8 L · 8 R" · "20s · 20s" — works without the exercise */
export function setsLine(sets: Measure[], ex?: Exercise): string {
	const hold = ex?.kind === 'hold' || sets.some((m) => m.of === 'hold');
	const n = (m: Measure) => (hold || m.of === 'hold' ? `${countOf(m)}s` : String(countOf(m)));
	if (ex?.side === 'sets') return sets.map((m, i) => `${n(m)} ${i % 2 === 0 ? 'L' : 'R'}`).join(' · ');
	const loaded = ex ? ex.kind === 'load' : sets.some((m) => loadOf(m) > 0);
	if (!loaded) return sets.map(n).join(' · ');
	if (uniformLoad(sets)) {
		const w = ex ? loadLabel(loadOf(sets[0]), ex) : `${loadOf(sets[0])} lb`;
		return `${w} · ${sets.map(n).join(' · ')}`;
	}
	return sets.map((m) => `${loadOf(m)}×${n(m)}`).join(' · ') + (ex?.kind === 'load' && ex.progress.each ? ' each hand' : '');
}

/** "set 1" · "sets 2–3" · "sets 1, 3" */
export function setsPhrase(indices: number[]): string {
	const n = indices.map((i) => i + 1);
	if (n.length === 1) return `set ${n[0]}`;
	const contiguous = n.every((v, i) => i === 0 || v === n[i - 1] + 1);
	return contiguous ? `sets ${n[0]}–${n[n.length - 1]}` : `sets ${n.join(', ')}`;
}
/** "set 1" → "Set 1" */
export const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "At the ceiling (45s) — make it harder, not longer." */
export const ceilingHint = (ex: Exercise) => `At the ceiling (${ex.hi}s) — make it harder, not longer.`;

/** "Re-entry after 16 days — one size down, build it back." · "Set 1 goes up to 40 lb — sets 2–3 stay at 35." · "Up a rung — …" · null — one sentence before set 1: re-entry, then an adjustment, then a level-up, then a miss */
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
