import type { LedgerEvent, RunLogged } from './events';
import { nextRung, prevRung, rungLabel, snapToRack } from './racks';
import type { Exercise, Plan } from './types';

/**
 * Projections: the read-side. Each is a pure fold over the event list that
 * answers exactly one question for the UI. None of them are stored — with a
 * single-user ledger it is cheap to re-run them per request, which keeps the
 * model honest: if it's not derivable from events, it doesn't exist.
 *
 * Time is an INPUT here, never read from the clock inside a fold: `nextLoad`
 * takes `now`, so the same events give the same answer in a test as on the
 * gym floor.
 */

/**
 * One logged set. Weight lives HERE, per set, not once per exercise — you can
 * start a set heavy and drop it, and both facts are already in the stream.
 * `unit`/`target` ride along from the event so a timed hold stays a timed
 * hold even after its exercise has left every plan.
 */
export type SessionSet = { weight: number; reps: number; unit?: 'reps' | 's'; target?: number };
export type SessionRow = { exercise: string; sets: SessionSet[] };
export type SessionView = {
	id: string;
	day: string;
	plan: string;
	at: string;
	dateLabel: string;
	finished: boolean;
	rows: SessionRow[];
};
export type RunView = { at: string; dateLabel: string; minutes: number };
export type PlanSwitchView = { at: string; dateLabel: string; plan: string };
export type LastEntry = { sets: SessionSet[]; dateLabel: string; at: string };

export function fmtDate(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric'
	});
}

/**
 * Sessions newest-first, each with its logged rows. Removed sessions are
 * excluded HERE, and only here — every consumer (lastEntryFor, nextDay,
 * nextLoad, the Ledger tab) goes through this fold, so one exclusion makes
 * the whole app behave as if the workout never happened, while the events
 * themselves stay in the stream.
 */
export function projectSessions(events: LedgerEvent[]): SessionView[] {
	const removed = new Set(
		events.filter((e) => e.type === 'SessionRemoved').map((e) => e.data.session)
	);
	const map = new Map<string, SessionView>();
	for (const e of events) {
		if (e.type === 'SessionStarted') {
			map.set(e.data.session, {
				id: e.data.session,
				day: e.data.day,
				plan: e.data.plan,
				at: e.data.at,
				dateLabel: fmtDate(e.data.at),
				finished: false,
				rows: []
			});
		} else if (e.type === 'SetLogged') {
			const s = map.get(e.data.session);
			if (!s) continue;
			let row = s.rows.find((r) => r.exercise === e.data.exercise);
			if (!row) {
				row = { exercise: e.data.exercise, sets: [] };
				s.rows.push(row);
			}
			// append, never overwrite: a single row.weight made the last set win,
			// so dropping the load mid-exercise erased the heavier sets before it
			row.sets.push({
				weight: e.data.weight,
				reps: e.data.reps,
				...(e.data.unit ? { unit: e.data.unit } : {}),
				...(e.data.target !== undefined ? { target: e.data.target } : {})
			});
		} else if (e.type === 'SessionFinished') {
			const s = map.get(e.data.session);
			if (s) s.finished = true;
		}
	}
	return Array.from(map.values())
		.filter((s) => !removed.has(s.id))
		.sort((a, b) => b.at.localeCompare(a.at));
}

/** RunRemoved events point at a run's `at` timestamp — its natural id. */
function removedRunSet(events: LedgerEvent[]): Set<string> {
	return new Set(events.filter((e) => e.type === 'RunRemoved').map((e) => e.data.run));
}

/** Runs newest-first, removed ones excluded. */
export function projectRuns(events: LedgerEvent[]): RunView[] {
	const removed = removedRunSet(events);
	return events
		.filter((e): e is RunLogged => e.type === 'RunLogged' && !removed.has(e.data.at))
		.map((e) => ({ at: e.data.at, dateLabel: fmtDate(e.data.at), minutes: e.data.minutes }))
		.sort((a, b) => b.at.localeCompare(a.at));
}

/** Plan switches newest-first, for the ledger. */
export function projectPlanSwitches(events: LedgerEvent[]): PlanSwitchView[] {
	return events
		.filter((e) => e.type === 'PlanSelected')
		.map((e) => ({ at: e.data.at, dateLabel: fmtDate(e.data.at), plan: e.data.plan }))
		.sort((a, b) => b.at.localeCompare(a.at));
}

/** Active plan is itself a projection: the last PlanSelected wins. */
export function activePlanId(events: LedgerEvent[]): string | null {
	for (let i = events.length - 1; i >= 0; i--) {
		const e = events[i];
		if (e.type === 'PlanSelected') return e.data.plan;
	}
	return null;
}

/** Every logged entry for an exercise, newest first (excluding a session id). */
export function historyFor(
	events: LedgerEvent[],
	exercise: string,
	excludeSession?: string
): LastEntry[] {
	const out: LastEntry[] = [];
	for (const s of projectSessions(events)) {
		if (s.id === excludeSession) continue;
		const row = s.rows.find((r) => r.exercise === exercise);
		if (row && row.sets.length) out.push({ sets: row.sets, dateLabel: s.dateLabel, at: s.at });
	}
	return out;
}

/** Most recent logged entry for an exercise (excluding a given session id). */
export function lastEntryFor(
	events: LedgerEvent[],
	exercise: string,
	excludeSession?: string
): LastEntry | null {
	return historyFor(events, exercise, excludeSession)[0] ?? null;
}

/** True when every set was at the same load. */
export function uniformLoad(sets: SessionSet[]): boolean {
	return sets.every((s) => s.weight === sets[0].weight);
}

/** A set that reached the top of the range — the thing the rule acts on. */
export function setEarned(s: SessionSet, ex: Exercise): boolean {
	return s.reps >= ex.hi;
}

/** Some set of this entry earned its increase — the ledger's ↑ pill. */
export function anySetEarned(sets: SessionSet[], ex: Exercise): boolean {
	return sets.some((s) => setEarned(s, ex));
}

/** A timed hold that hit the ceiling on every hold: make it harder, not longer. */
export function holdMaxed(entry: { sets: SessionSet[] } | null, ex: Exercise): boolean {
	if (!entry || entry.sets.length < ex.sets) return false;
	return entry.sets.every((s) => s.reps >= ex.hi);
}

/** One level-up: the next size on the rack, or +inc where a rack can't say. */
export function increasedWeight(weight: number, ex: Exercise): number {
	return ex.rack ? nextRung(weight, ex.rack) : weight + ex.inc;
}

/** One size down: the previous rung, or −inc off a rack. Never negative. */
export function decreasedWeight(weight: number, ex: Exercise): number {
	return ex.rack ? prevRung(weight, ex.rack) : Math.max(0, weight - ex.inc);
}

/**
 * The window that turns two misses into an adjustment, and an absence into a
 * re-entry. Fourteen days: long enough that a once-a-week lifter is never
 * "away", short enough that a fortnight off is treated as what it is.
 */
export const REENTRY_DAYS = 14;
const DAY = 86400000;

export type SetReason = 'start' | 'increase' | 'hold' | 'adjust' | 'reentry';
export type SetSuggestion = {
	weight: number;
	reason: SetReason;
	/** the count to preload: the bottom of the range after any move, else last time's */
	reps: number;
	/** last time this set fell below the range (only meaningful on a hold) */
	missed: boolean;
};
export type LoadSuggestion = {
	/** one per set, index = set number − 1; always ex.sets long */
	sets: SetSuggestion[];
	/** the headline: start > reentry > adjust > increase > hold */
	reason: SetReason;
	/** some set goes up — Today's ↑ */
	up: boolean;
	/** something comes down (re-entry or an adjustment) — Today's ↓ */
	down: boolean;
	/** set 1's weight, for the callers that only need one number */
	weight: number;
	/** whole days since the last entry, or null when there is none */
	daysSince: number | null;
};

function summarise(sets: SetSuggestion[], daysSince: number | null): LoadSuggestion {
	const has = (r: SetReason) => sets.some((s) => s.reason === r);
	const reason: SetReason = has('start')
		? 'start'
		: has('reentry')
			? 'reentry'
			: has('adjust')
				? 'adjust'
				: has('increase')
					? 'increase'
					: 'hold';
	return {
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
export function nextLoad(
	events: LedgerEvent[],
	ex: Exercise,
	excludeSession?: string,
	now: number = Date.now()
): LoadSuggestion {
	const startWeight = ex.rack ? snapToRack(ex.start, ex.rack) : ex.start;
	const history = historyFor(events, ex.name, excludeSession);
	const last = history[0];
	const sets: SetSuggestion[] = [];

	if (!last) {
		for (let k = 0; k < ex.sets; k++)
			sets.push({ weight: ex.bodyweight ? 0 : startWeight, reason: 'start', reps: ex.lo, missed: false });
		return summarise(sets, null);
	}

	const daysSince = (now - Date.parse(last.at)) / DAY;

	// Bodyweight: no load to move. The count is the axis, and suggestedCount
	// owns it; this stays well-formed so Today can map a whole day blind.
	if (ex.bodyweight) {
		for (let k = 0; k < ex.sets; k++)
			sets.push({ weight: 0, reason: 'hold', reps: suggestedCount(events, ex, excludeSession, k), missed: false });
		return summarise(sets, daysSince);
	}

	if (daysSince > REENTRY_DAYS) {
		let base = last.sets[0].weight;
		for (let k = 0; k < ex.sets; k++) {
			base = last.sets[k]?.weight ?? base;
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
		const s = last.sets[k];
		if (!s) {
			// fewer sets logged than the plan asks: the missing set follows the one
			// before it (k = 0 always exists — historyFor drops empty rows)
			sets.push({ ...sets[k - 1] });
			continue;
		}
		if (s.reps >= ex.hi) {
			sets.push({ weight: increasedWeight(s.weight, ex), reason: 'increase', reps: ex.lo, missed: false });
		} else if (s.reps >= ex.lo) {
			sets.push({ weight: s.weight, reason: 'hold', reps: s.reps, missed: false });
		} else {
			const p = prev?.sets[k];
			const twice =
				!!p &&
				p.reps < ex.lo &&
				p.weight === s.weight &&
				(Date.parse(last.at) - Date.parse(prev!.at)) / DAY <= REENTRY_DAYS;
			const down = decreasedWeight(s.weight, ex);
			if (twice && down < s.weight) {
				sets.push({ weight: down, reason: 'adjust', reps: ex.lo, missed: false });
			} else {
				sets.push({ weight: s.weight, reason: 'hold', reps: s.reps, missed: true });
			}
		}
	}
	return summarise(sets, daysSince);
}

/** Weight to preload for one set (default: the first). */
export function suggestedWeight(
	events: LedgerEvent[],
	ex: Exercise,
	excludeSession?: string,
	set = 0,
	now?: number
): number {
	const { sets } = nextLoad(events, ex, excludeSession, now);
	return sets[Math.min(set, sets.length - 1)].weight;
}

/**
 * Bodyweight twin of suggestedWeight: the progressible axis is the count
 * itself, per set. A timed hold that rang its bell asks for +inc next time;
 * one dropped early asks for what was actually held. A rep-based bodyweight
 * movement simply carries last time's number. Both are CAPPED at the top of
 * the range — past that the instruction is "make it harder", carried by the
 * exercise note, never "make it longer".
 */
export function suggestedCount(
	events: LedgerEvent[],
	ex: Exercise,
	excludeSession?: string,
	set = 0
): number {
	const entry = lastEntryFor(events, ex.name, excludeSession);
	if (!entry) return ex.lo;
	const s = entry.sets[Math.min(set, entry.sets.length - 1)];
	let next = s.reps;
	if (ex.mode === 'seconds') {
		// holds logged before the timer existed carry no target: you counted
		// the seconds yourself, so what you logged is what you held
		const rang = s.reps >= (s.target ?? s.reps);
		next = rang ? s.reps + ex.inc : s.reps;
	}
	return Math.min(ex.hi, Math.max(ex.lo, next));
}

/** "set 1" · "sets 2–3" · "sets 1, 3" — which sets a sentence is about. */
function setsPhrase(indices: number[]): string {
	const n = indices.map((i) => i + 1);
	if (n.length === 1) return `set ${n[0]}`;
	const contiguous = n.every((v, i) => i === 0 || v === n[i - 1] + 1);
	return contiguous ? `sets ${n[0]}–${n[n.length - 1]}` : `sets ${n.join(', ')}`;
}
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The one line the gym floor shows before set 1, so a changed number is never
 * silent — an unexplained lighter bar reads as a bug, which is worse than no
 * adjustment at all. Precedence: re-entry, then an adjustment, then a
 * level-up, then a warning about a miss. One sentence, never a list.
 */
export function loadHint(load: LoadSuggestion, ex: Exercise): string | null {
	if (load.reason === 'start' || ex.bodyweight) return null;
	const where = (r: SetReason) =>
		load.sets.map((s, i) => (s.reason === r ? i : -1)).filter((i) => i >= 0);
	if (load.reason === 'reentry')
		return `Re-entry after ${Math.floor(load.daysSince ?? 0)} days — one size down, build it back.`;
	const adjusted = where('adjust');
	if (adjusted.length) {
		const w = loadLabel(load.sets[adjusted[0]].weight, ex);
		return `${capitalise(setsPhrase(adjusted))} back one size after 2 misses — ${w}.`;
	}
	const up = where('increase');
	if (up.length) {
		const w = loadLabel(load.sets[up[0]].weight, ex);
		if (up.length === load.sets.length) return `Every set goes up to ${w}.`;
		const rest = load.sets.map((_, i) => i).filter((i) => !up.includes(i));
		const restW = load.sets[rest[0]].weight;
		const stay = rest.every((i) => load.sets[i].weight === restW)
			? `${setsPhrase(rest)} ${rest.length === 1 ? 'stays' : 'stay'} at ${restW}`
			: `the rest stay where they are`;
		const verb = up.length === 1 ? 'goes' : 'go';
		return `${capitalise(setsPhrase(up))} ${verb} up to ${w} — ${stay}.`;
	}
	const missed = load.sets.map((s, i) => (s.missed ? i : -1)).filter((i) => i >= 0);
	if (missed.length)
		return `${capitalise(setsPhrase(missed))} missed last time — miss again and it backs off a size.`;
	return null;
}

/** The warm-up line for a day: its own, else the plan's. */
export function warmupFor(plan: Plan | undefined, day: string): string | undefined {
	return plan?.dayInfo?.[day]?.warmup ?? plan?.warmup;
}

/** Which day is due next: alternate from the most recent finished session. */
export function nextDay(events: LedgerEvent[], plan: Plan): string {
	const dayKeys = Object.keys(plan.days);
	const sessions = projectSessions(events).filter((s) => s.finished && s.plan === plan.id);
	if (!sessions.length) return dayKeys[0];
	const i = dayKeys.indexOf(sessions[0].day);
	return dayKeys[(i + 1) % dayKeys.length];
}

/** Run minutes in the trailing 7 days — compared against the plan's runTarget,
 *  which is per-plan (90 for Open to Work), not a fixed WHO figure. */
export function weekRunMinutes(events: LedgerEvent[], now: number = Date.now()): number {
	const cutoff = now - 7 * DAY;
	return projectRuns(events)
		.filter((r) => new Date(r.at).getTime() > cutoff)
		.reduce((sum, r) => sum + r.minutes, 0);
}

/**
 * Display helpers. These live next to the folds because the per-hand and
 * per-side questions must be answered identically on the plan screen and the
 * gym floor — two screens phrasing "3 × 8–12" differently is how a lunge ends
 * up meaning two different workouts.
 */

/** "40 lb each hand" vs "35 lb" — never a bare number for a two-dumbbell lift. */
export function loadLabel(weight: number, ex: Exercise): string {
	if (ex.bodyweight) return '';
	return ex.each ? `${weight} lb each hand` : `${weight} lb`;
}

/** "8–12 reps per side" · "20–45 sec" — the rep range, with its side rule. */
export function rangeLabel(ex: Exercise): string {
	const unit = ex.mode === 'seconds' ? 'sec' : 'reps';
	return `${ex.lo}–${ex.hi} ${unit}${ex.side === 'reps' ? ' per side' : ''}`;
}

/** "35 lb · 12 · 12 · 11", or per-set pairs when the load moved mid-exercise. */
export function setsLine(sets: SessionSet[], ex: Exercise): string {
	const n = (r: number) => (ex.mode === 'seconds' ? `${r}s` : String(r));
	if (ex.bodyweight) return sets.map((s) => n(s.reps)).join(' · ');
	if (uniformLoad(sets)) return `${loadLabel(sets[0].weight, ex)} · ${sets.map((s) => n(s.reps)).join(' · ')}`;
	return sets.map((s) => `${s.weight}×${n(s.reps)}`).join(' · ') + (ex.each ? ' each hand' : '');
}

/** What a level-up costs here: a rack step, or a fixed increment. */
export function stepLabel(ex: Exercise): string {
	// no "at the top" — the rule section under the list says when, once, and
	// repeating it per row pushed the column wide enough to wrap the name
	if (ex.bodyweight) return `+${ex.inc}${ex.mode === 'seconds' ? 's' : ' rep'}`;
	if (ex.rack) return rungLabel(ex.rack);
	return `+${ex.inc} lb`;
}

/** "3 sets" · "2 sets, one per side" — what a "set" counts on this movement. */
export function setsLabel(ex: Exercise): string {
	return ex.side === 'sets' ? `${ex.sets} sets, one per side` : `${ex.sets} sets`;
}

/** Display title for a day: dayInfo title if present, else "Workout X". */
export function dayTitle(plan: Plan | undefined, d: string): string {
	return plan?.dayInfo?.[d]?.title ?? 'Workout ' + d;
}
