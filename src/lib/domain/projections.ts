import { RUN_DAY, type LedgerEvent } from './events';
import { countOf, isSet, loadOf, type Measure } from './measure';
import { nextRung, prevRung, rungLabel, snapToRack } from './racks';
import type { Exercise, Loaded, Plan } from './plan';

/**
 * Projections: the read-side. Each is a pure fold over the event list that
 * answers exactly one question for the UI. None of them are stored — with a
 * single-user ledger it is cheap to re-run them per request, which keeps the
 * model honest: if it's not derivable from events, it doesn't exist.
 *
 * Time is an INPUT here, never read from the clock inside a fold: every
 * fold that needs the time takes `now` — no default, so a caller cannot
 * forget — and the same events give the same answer in a test as on the
 * gym floor.
 */

/**
 * One row of a session: an item and its sets, each set the Measure the entry
 * carried — the read model speaks the vocabulary, it does not translate it.
 * Load lives per set, not once per exercise: you can start a set heavy and
 * drop it, and both facts are already in the stream. A hold stays a hold
 * even after its exercise has left every plan, because the measure says so.
 */
export type SessionRow = { item: string; sets: Measure[] };
export type SessionView = {
	id: string;
	day: string;
	plan: string;
	at: string;
	dateLabel: string;
	finished: boolean;
	/** 'after' = written in one shot, backdated; 'live' = walked on the floor */
	mode: 'live' | 'after';
	/** the lifts: one row per exercise, its sets in order (load and hold entries) */
	rows: SessionRow[];
	/** minutes from duration entries — a run session's whole point */
	minutes: number;
	/** a run: the run day, or any duration entry */
	isRun: boolean;
	/** prep steps that happened (warm-up, cooldown, walks) — tracked, never a ledger line */
	prep: number;
	/** every entry, whatever it measured */
	entries: number;
};
export type RunView = { at: string; dateLabel: string; minutes: number; session: string };
export type PlanSwitchView = { at: string; dateLabel: string; plan: string };
/** One session's sets for one exercise — what the progression rule reads. */
export type HistoryEntry = { at: string; dateLabel: string; sets: Measure[] };
export type History = HistoryEntry[];

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
	// events arrive in the current vocabulary: the read boundary
	// (readLedgerEvents) upcast them once, so no fold sniffs shapes
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
				mode: e.data.mode,
				rows: [],
				minutes: 0,
				isRun: e.data.day === RUN_DAY,
				prep: 0,
				entries: 0
			});
		} else if (e.type === 'EntryLogged') {
			const s = map.get(e.data.session);
			if (!s) continue;
			s.entries++;
			const m = e.data.measure;
			if (m.of === 'step') {
				s.prep++;
			} else if (m.of === 'duration') {
				s.minutes += m.minutes;
				s.isRun = true;
			} else if (isSet(m)) {
				let row = s.rows.find((r) => r.item === e.data.item);
				if (!row) {
					row = { item: e.data.item, sets: [] };
					s.rows.push(row);
				}
				// append, never overwrite: a single row.weight once made the last set
				// win, so dropping the load mid-exercise erased the heavier sets before it
				row.sets.push(m);
			}
		} else if (e.type === 'SessionFinished') {
			const s = map.get(e.data.session);
			if (s) s.finished = true;
		}
	}
	return Array.from(map.values())
		.filter((s) => !removed.has(s.id))
		.sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Runs newest-first. A run is a session like any other now; this is the
 * same fold, filtered — kept for the meter and the week strip, which only
 * want minutes and a day.
 */
export function projectRuns(events: LedgerEvent[]): RunView[] {
	return projectSessions(events)
		.filter((s) => s.minutes > 0)
		.map((s) => ({ at: s.at, dateLabel: s.dateLabel, minutes: s.minutes, session: s.id }));
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
): History {
	const out: History = [];
	for (const s of projectSessions(events)) {
		if (s.id === excludeSession) continue;
		const row = s.rows.find((r) => r.item === exercise);
		if (row && row.sets.length) out.push({ sets: row.sets, dateLabel: s.dateLabel, at: s.at });
	}
	return out;
}

/** Most recent logged entry for an exercise (excluding a given session id). */
export function lastEntryFor(
	events: LedgerEvent[],
	exercise: string,
	excludeSession?: string
): HistoryEntry | null {
	return historyFor(events, exercise, excludeSession)[0] ?? null;
}

/** True when every set was at the same load. */
export function uniformLoad(sets: Measure[]): boolean {
	return sets.every((s) => loadOf(s) === loadOf(sets[0]));
}

/** A set that reached the top of the range — the thing the rule acts on. */
export function setEarned(s: Measure, ex: Exercise): boolean {
	return countOf(s) >= ex.hi;
}

/** Some set of this entry earned its increase — the ledger's ↑ pill. */
export function anySetEarned(sets: Measure[], ex: Exercise): boolean {
	return sets.some((s) => setEarned(s, ex));
}

/** A timed hold that hit the ceiling on every hold: make it harder, not longer. */
export function holdMaxed(entry: { sets: Measure[] } | null, ex: Exercise): boolean {
	if (!entry || entry.sets.length < ex.sets) return false;
	return entry.sets.every((s) => countOf(s) >= ex.hi);
}

/** One level-up: the next size on the rack, or +inc where a rack can't say. */
export function increasedWeight(weight: number, ex: Loaded): number {
	return ex.rack ? nextRung(weight, ex.rack) : weight + ex.inc;
}

/** One size down: the previous rung, or −inc off a rack. Never negative. */
export function decreasedWeight(weight: number, ex: Loaded): number {
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
	excludeSession: string | undefined,
	now: number
): LoadSuggestion {
	const history = historyFor(events, ex.name, excludeSession);
	const last = history[0];
	const sets: SetSuggestion[] = [];

	// No load to move: the count is the axis, and suggestedCount owns it.
	// This stays well-formed so Today can map a whole day blind.
	if (ex.kind !== 'load') {
		const since = last ? (now - Date.parse(last.at)) / DAY : null;
		for (let k = 0; k < ex.sets; k++)
			sets.push({ weight: 0, reason: last ? 'hold' : 'start', reps: suggestedCount(events, ex, excludeSession, k), missed: false });
		return summarise(sets, since);
	}

	const startWeight = ex.rack ? snapToRack(ex.start, ex.rack) : ex.start;
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

/** Weight to preload for one set (default: the first). */
export function suggestedWeight(
	events: LedgerEvent[],
	ex: Exercise,
	excludeSession: string | undefined,
	set: number,
	now: number
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
	const m = entry.sets[Math.min(set, entry.sets.length - 1)];
	let next = countOf(m);
	if (ex.kind === 'hold') {
		// holds logged before the timer existed carry no target: you counted
		// the seconds yourself, so what you logged is what you held
		const target = m.of === 'hold' ? m.target : undefined;
		const rang = next >= (target ?? next);
		next = rang ? next + ex.inc : next;
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
	if (load.reason === 'start' || ex.kind !== 'load') return null;
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

/** Which day is due next: alternate from the most recent finished LIFT (runs don't count). */
export function nextDay(events: LedgerEvent[], plan: Plan): string {
	const dayKeys = Object.keys(plan.days);
	const sessions = projectSessions(events).filter(
		(s) => s.finished && s.plan === plan.id && dayKeys.includes(s.day)
	);
	if (!sessions.length) return dayKeys[0];
	const i = dayKeys.indexOf(sessions[0].day);
	return dayKeys[(i + 1) % dayKeys.length];
}

/** Run minutes in the trailing 7 days — compared against the plan's runTarget,
 *  which is per-plan (90 for Open to Work), not a fixed WHO figure. */
export function weekRunMinutes(events: LedgerEvent[], now: number): number {
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
	if (ex.kind !== 'load') return '';
	return ex.each ? `${weight} lb each hand` : `${weight} lb`;
}

/** "8–12 reps per side" · "20–45 sec" — the rep range, with its side rule. */
export function rangeLabel(ex: Exercise): string {
	const unit = ex.kind === 'hold' ? 'sec' : 'reps';
	return `${ex.lo}–${ex.hi} ${unit}${ex.side === 'reps' ? ' per side' : ''}`;
}

/** "35 lb · 12 · 12 · 11", or per-set pairs when the load moved mid-exercise. */
export function setsLine(sets: Measure[], ex: Exercise): string {
	const n = (m: Measure) => (ex.kind === 'hold' ? `${countOf(m)}s` : String(countOf(m)));
	if (ex.kind !== 'load') return sets.map(n).join(' · ');
	if (uniformLoad(sets)) return `${loadLabel(loadOf(sets[0]), ex)} · ${sets.map(n).join(' · ')}`;
	return sets.map((m) => `${loadOf(m)}×${n(m)}`).join(' · ') + (ex.each ? ' each hand' : '');
}

/** What a level-up costs here: a rack step, or a fixed increment. */
export function stepLabel(ex: Exercise): string {
	// no "at the top" — the rule section under the list says when, once, and
	// repeating it per row pushed the column wide enough to wrap the name
	if (ex.kind === 'hold') return `+${ex.inc}s`;
	if (ex.kind === 'reps') return '+1 rep';
	if (ex.rack) return rungLabel(ex.rack);
	return `+${ex.inc} lb`;
}

/** "3 sets" · "2 sets, one per side" — what a "set" counts on this movement. */
export function setsLabel(ex: Exercise): string {
	return ex.side === 'sets' ? `${ex.sets} sets, one per side` : `${ex.sets} sets`;
}

/* ---------- exercises over time: the trends folds ----------------------
   Read-side only: no new events, no stored projections. Today's "How it's
   going" list is these folds run per exercise at request time. */

/** "35 lb" · "40 lb each hand" · "15s" · "8 reps" — one number in this exercise's own unit. */
export function unitLabel(n: number, ex: Exercise): string {
	if (ex.kind === 'load') return loadLabel(n, ex);
	return ex.kind === 'hold' ? `${n}s` : `${n} reps`;
}

/** "Jul 11" — the date without its weekday, for a sentence. */
export function fmtShort(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Sessions, not weeks: a week off would read as a gap, and a stall must read as a stall. */
export const TREND_WINDOW = 7;
/** Warn from day 11 — three days of runway before the re-entry rule fires. */
export const REENTRY_WARN_DAYS = 11;

export type TrendPoint = {
	at: string;
	dateLabel: string;
	/** the progressible axis: set 1's weight — or its count, for bodyweight */
	load: number;
	sets: Measure[];
	/** some set reached the top of the range */
	earned: boolean;
	/** some set fell below the bottom of the range */
	missed: boolean;
};
export type TrendTone = 'start' | 'up' | 'down' | 'warn' | 'flat';
export type Trend = {
	/** the last TREND_WINDOW sessions, oldest first */
	points: TrendPoint[];
	/** what the rule has queued for set 1 next time (weight, or count for bodyweight) */
	next: number;
	/** the hero: one sentence about where this exercise stands */
	sentence: string;
	tone: TrendTone;
	/** total sessions on record, so the UI can say how many the window hides */
	sessions: number;
};

/**
 * One exercise, over time. The sentence is the point and the strip is the
 * corroboration; precedence runs from what the rule will DO next (re-entry,
 * an adjustment, an earned increase) down to how long the load has sat still.
 */
export function trendFor(
	events: LedgerEvent[],
	ex: Exercise,
	excludeSession: string | undefined,
	now: number,
	window: number = TREND_WINDOW
): Trend {
	const history = historyFor(events, ex.name, excludeSession); // newest first
	const axis = (m: Measure) => (ex.kind !== 'load' ? countOf(m) : loadOf(m));
	const all = history.slice().reverse();
	const points: TrendPoint[] = all.slice(-window).map((h) => ({
		at: h.at,
		dateLabel: h.dateLabel,
		load: axis(h.sets[0]),
		sets: h.sets,
		earned: anySetEarned(h.sets, ex),
		missed: h.sets.some((s) => countOf(s) < ex.lo)
	}));
	const load = nextLoad(events, ex, excludeSession, now);
	const next = ex.kind !== 'load' ? suggestedCount(events, ex, excludeSession, 0) : load.weight;
	const base = { points, next, sessions: history.length };
	const last = history[0];
	if (!last) return { ...base, tone: 'start', sentence: `Starts at ${unitLabel(next, ex)}` };

	const days = load.daysSince ?? 0;
	if (load.reason === 'reentry')
		return {
			...base,
			tone: 'down',
			sentence: `Re-entry after ${Math.floor(days)} days — one size down, ${unitLabel(next, ex)} next time`
		};
	if (days >= REENTRY_WARN_DAYS && days <= REENTRY_DAYS) {
		const n = Math.max(1, Math.ceil(REENTRY_DAYS - days));
		return { ...base, tone: 'warn', sentence: `Re-entry haircut in ${n} ${n === 1 ? 'day' : 'days'}` };
	}
	const adjusted = load.sets.findIndex((s) => s.reason === 'adjust');
	if (adjusted >= 0) {
		const was = loadOf(last.sets[adjusted] ?? last.sets[0]);
		return {
			...base,
			tone: 'down',
			sentence: `Missed the bottom twice at ${was} — back to ${unitLabel(load.sets[adjusted].weight, ex)} next time`
		};
	}
	const earnedIdx = last.sets.map((s, i) => (setEarned(s, ex) ? i : -1)).filter((i) => i >= 0);
	if (earnedIdx.length) {
		if (ex.kind === 'hold' && holdMaxed(last, ex))
			return { ...base, tone: 'up', sentence: `At the ceiling (${ex.hi}s) — make it harder, not longer` };
		if (ex.kind !== 'load')
			return { ...base, tone: 'up', sentence: `Hit the top of the range — ${unitLabel(next, ex)} next time` };
		const who = earnedIdx.length >= ex.sets ? 'Every set' : capitalise(setsPhrase(earnedIdx));
		const to = unitLabel(load.sets[Math.min(earnedIdx[0], load.sets.length - 1)].weight, ex);
		return { ...base, tone: 'up', sentence: `${who} at the top of the range — ${to} next time` };
	}
	const missedIdx = load.sets.map((s, i) => (s.missed ? i : -1)).filter((i) => i >= 0);
	if (missedIdx.length)
		return {
			...base,
			tone: 'warn',
			sentence: `${capitalise(setsPhrase(missedIdx))} missed last time — miss again and it backs off a size`
		};
	// how long has set 1 sat at this load? (walk newest → oldest until it changes)
	const cur = axis(last.sets[0]);
	let streak = 0;
	for (const h of history) {
		if (axis(h.sets[0]) !== cur) break;
		streak++;
	}
	const since = fmtShort(history[streak - 1].at);
	const first = axis(all[0].sets[0]);
	if (streak >= 3)
		return { ...base, tone: 'flat', sentence: `${unitLabel(cur, ex)} since ${since} — ${streak} sessions, no change` };
	if (cur > first)
		return { ...base, tone: 'up', sentence: `↑ ${first} → ${unitLabel(cur, ex)} since ${fmtShort(all[0].at)}` };
	if (cur < first)
		return { ...base, tone: 'down', sentence: `↓ ${first} → ${unitLabel(cur, ex)} since ${fmtShort(all[0].at)}` };
	return {
		...base,
		tone: 'flat',
		sentence: streak === 1 ? `${unitLabel(cur, ex)} — first session` : `${unitLabel(cur, ex)} since ${since} — ${streak} sessions`
	};
}

/* ---------- this week ---------- */

export type WeekCell = {
	/** local yyyymmdd */
	key: number;
	label: string;
	lifted: boolean;
	ran: boolean;
	today: boolean;
	future: boolean;
};

/**
 * Seven cells, Monday first (to match the "this week" run meter), bucketed by
 * LOCAL calendar day — which is why this runs where `now` runs and never
 * stores anything. An unfinished session today still counts as lifted.
 */
export function weekStrip(events: LedgerEvent[], now: number): WeekCell[] {
	const dayKey = (d: Date) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
	const sessions = projectSessions(events);
	const lifted = new Set(sessions.filter((s) => !s.isRun).map((s) => dayKey(new Date(s.at))));
	const ran = new Set(sessions.filter((s) => s.minutes > 0).map((s) => dayKey(new Date(s.at))));
	const today = new Date(now);
	const todayKey = dayKey(today);
	const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
	return ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, i) => {
		const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
		const key = dayKey(d);
		return { key, label, lifted: lifted.has(key), ran: ran.has(key), today: key === todayKey, future: key > todayKey };
	});
}

/** Whole days since each plan day was last finished (null = never). */
export type DayAge = { day: string; daysSince: number | null };
export function dayAges(events: LedgerEvent[], plan: Plan, now: number): DayAge[] {
	const sessions = projectSessions(events).filter((s) => s.finished && s.plan === plan.id);
	return Object.keys(plan.days).map((day) => {
		const s = sessions.find((x) => x.day === day); // newest first
		return { day, daysSince: s ? (now - Date.parse(s.at)) / DAY : null };
	});
}

/** Display title for a day: dayInfo title if present, the run's title for a run, else "Workout X". */
export function dayTitle(plan: Plan | undefined, d: string): string {
	if (d === RUN_DAY) return plan?.run?.title ?? 'Run';
	return plan?.dayInfo?.[d]?.title ?? 'Workout ' + d;
}
