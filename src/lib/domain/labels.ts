import { countOf, loadOf, uniformLoad, type Measure } from './measure';
import type { Discipline, Exercise, Goal, PracticeId, PrepItem } from './plan';
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

/** "workout" · "practice" · "stretch" · "run" — what Finish finishes */
export function sessionNoun(d: Discipline): string {
	switch (d) {
		case 'lift':
		case 'bodyweight':
			return 'workout';
		case 'yoga':
			return 'practice';
		case 'mobility':
			return 'stretch';
		case 'run':
			return 'run';
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

/** "2.3" · "3" · "68" — one decimal unless whole */
export function rateLabel(n: number): string {
	const r = Math.round(n * 10) / 10;
	return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** "Stands in for Hinge & Haul · counts toward 3 lifts a week" — the floor is the lift's fallback, so the noun is the lift's */
export const standInLine = (forTitle: string, target: number): string =>
	`Stands in for ${forTitle} · counts toward ${target} ${disciplineNoun('lift', target)} a week`;

/** "The programme says 3 a week — your goal is 4." · "The programme's cadence. Change it and Today follows your number." */
export const goalHint = (programmeTarget: number, goal: number): string =>
	goal === programmeTarget
		? 'The programme’s cadence. Change it and Today follows your number.'
		: `The programme says ${programmeTarget} a week — your goal is ${goal}.`;

/** "lift" · "yoga" · "stretch" · "run" */
export function practiceLabel(p: PracticeId): string {
	switch (p) {
		case 'lift':
			return 'lift';
		case 'yoga':
			return 'yoga';
		case 'mob':
			return 'stretch';
		case 'run':
			return 'run';
	}
}

/** "4 a week" · "3 a week · 35 min" */
export const goalLabel = (g: Goal): string => `${g.sessions} a week${g.minutes !== undefined ? ` · ${g.minutes} min` : ''}`;

/** "switched to Open to Work · yoga, stretch, run on" · "run off" · "lift 4 a week · run 3 a week · 35 min" */
export function weekChangeLine(
	c: { programme?: string; blocks: { block: PracticeId; on: boolean }[]; goals?: ({ practice: PracticeId } & Goal)[] },
	programmeName: (id: string) => string
): string {
	const parts: string[] = [];
	if (c.programme) parts.push(`switched to ${programmeName(c.programme)}`);
	const on = c.blocks.filter((b) => b.on).map((b) => practiceLabel(b.block));
	const off = c.blocks.filter((b) => !b.on).map((b) => practiceLabel(b.block));
	if (on.length) parts.push(`${on.join(', ')} on`);
	if (off.length) parts.push(`${off.join(', ')} off`);
	for (const g of c.goals ?? []) parts.push(`${practiceLabel(g.practice)} ${goalLabel(g)}`);
	return parts.join(' · ');
}

/** "11 sessions a week · about 6 h" */
export function weekHead(sessions: number, minutes: number): string {
	const time = minutes >= 90 ? `about ${rateLabel(Math.round(minutes / 30) / 2)} h` : `about ${minutes} min`;
	return `${sessions} sessions a week · ${time}`;
}

/** "1 of 3 this week" */
export const weekLine = (done: number, target: number): string => `${done} of ${target} this week`;

/** "SEPTEMBER · 11 sessions · 5 lift · 3 run · 3 stretch" — a month of the Ledger, folded to one line; the year only when it isn't this one */
export function monthLine(iso: string, sessions: number, counts: { discipline: Discipline; n: number }[], now: number): string {
	const d = new Date(iso);
	const month = d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
	const year = d.getFullYear() === new Date(now).getFullYear() ? '' : ` ${d.getFullYear()}`;
	const by = counts.filter((c) => c.n > 0).map((c) => `${c.n} ${disciplineLabel(c.discipline).toLowerCase()}`);
	return [`${month}${year}`, `${sessions} ${sessions === 1 ? 'session' : 'sessions'}`, ...by].join(' · ');
}

/** "20 sets · 48 min" · "9 holds · 11 min" · "32 min" · "nothing logged" */
export function sessionSummary(p: { sets: number; holds?: boolean; minutes: number }): string {
	const parts: string[] = [];
	if (p.sets) parts.push(`${p.sets} ${p.holds ? (p.sets === 1 ? 'hold' : 'holds') : p.sets === 1 ? 'set' : 'sets'}`);
	if (p.minutes) parts.push(`${p.minutes} min`);
	return parts.join(' · ') || 'nothing logged';
}

const range = (ex: Exercise) => (ex.lo === ex.hi ? String(ex.lo) : `${ex.lo}–${ex.hi}`);

/** "3 × 6–12" · "3 × 10–20s" · "2 × 45s · L/R" · "3 × 8–12 · per side" · "30 min" */
export function doseLabel(ex: Exercise): string {
	if (ex.kind === 'run') return `${range(ex)} min`;
	return (
		`${ex.sets} × ${range(ex)}${ex.kind === 'hold' ? 's' : ''}` +
		(ex.side === 'sets' ? ' · L/R' : ex.side === 'reps' ? ' · per side' : '')
	);
}

/** the first sentence of a note — what fits on the floor */
export function firstSentence(text: string): string {
	const m = /^(.+?[.!?])(\s|$)/.exec(text.trim());
	return m ? m[1] : text.trim();
}

/** "Easy jog · 3 min" · "Carioca · 30s each" · "Sun Salutation A × 3" · "One light set of the first lift" */
export function prepLabel(item: PrepItem): string {
	if (typeof item === 'string') return item;
	if ('kind' in item) return item.kind === 'hold' ? `${item.name} · ${item.lo}s${item.side === 'sets' ? ' each' : ''}` : `${item.name} · ${doseLabel(item)}`;
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

/** "L" · "Y" · "S" · "R" · "F" — one letter per discipline, for a day's cell */
export function disciplineLetter(d: Discipline): string {
	switch (d) {
		case 'lift':
			return 'L';
		case 'yoga':
			return 'Y';
		case 'mobility':
			return 'S';
		case 'run':
			return 'R';
		case 'bodyweight':
			return 'F';
	}
}

/** "L lift · Y yoga · S stretch · R run · F floor · today outlined" — the cells' legend, for the disciplines shown */
export const cellLegend = (ds: Discipline[]): string =>
	[...ds.map((d) => `${disciplineLetter(d)} ${d === 'bodyweight' ? 'floor' : disciplineLabel(d).toLowerCase()}`), 'today outlined'].join(' · ');

/** "Due · Lift · 1 of 3 this week" · "Extra · Run · 3 of 3 this week" · "Floor · counts as the lift" — the card's caption */
export function dealCaption(c: { due: boolean; standsInFor?: string }, practice: string, done: number, target: number): string {
	if (c.standsInFor) return `${practice} · counts as the lift`;
	return `${c.due ? 'Due' : 'Extra'} · ${practice} · ${weekLine(done, target)}`;
}

/** "6 of 9 this week — lift, run still owed." · "9 of 9 this week — all square." */
export const paceLine = (done: number, asked: number, gaps: string[]): string =>
	`${weekLine(done, asked)} — ${gaps.length ? `${gaps.join(', ')} still owed.` : 'all square.'}`;

/** "today" · "yesterday" · "6 days ago" · "Aug 23" past two weeks */
export function whenLabel(iso: string, now: number): string {
	const d = new Date(iso), n = new Date(now);
	const days = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
	if (days <= 0) return 'today';
	if (days === 1) return 'yesterday';
	if (days < 14) return `${days} days ago`;
	return fmtShort(iso);
}

/** "45 lb · 3 × 6–12" · "3 × 10–20s" · "30 min" — one exercise on Today's card, with the load the rule has queued */
export const itemDose = (ex: Exercise, weight: number): string =>
	ex.kind === 'load' ? `${loadShort(weight, ex)} · ${doseLabel(ex)}` : doseLabel(ex);
