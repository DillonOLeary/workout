import type { LedgerEvent, RunLogged } from './events';
import type { Exercise, Plan } from './types';

/**
 * Projections: the read-side. Each is a pure fold over the event list that
 * answers exactly one question for the UI. None of them are stored — with a
 * single-user ledger it is cheap to re-run them per request, which keeps the
 * model honest: if it's not derivable from events, it doesn't exist.
 *
 * (Ported 1:1 from the design project's app/domain.js.)
 */

export type SessionRow = { exercise: string; weight: number; reps: number[] };
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
export type LastEntry = { weight: number; reps: number[]; dateLabel: string };

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
 * earnedIncrease, the Ledger tab) goes through this fold, so one exclusion
 * makes the whole app behave as if the workout never happened, while the
 * events themselves stay in the stream.
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
				row = { exercise: e.data.exercise, weight: e.data.weight, reps: [] };
				s.rows.push(row);
			}
			row.weight = e.data.weight;
			row.reps.push(e.data.reps);
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
		if (row && row.reps.length) out.push({ weight: row.weight, reps: row.reps, dateLabel: s.dateLabel });
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

/** The one rule: all sets at/above the top of the range → earned an increase. */
export function earnedIncrease(entry: { weight: number; reps: number[] } | null, ex: Exercise): boolean {
	return !!entry && entry.reps.length >= ex.sets && entry.reps.every((r) => r >= ex.hi);
}

/** Consecutive stalls at the current weight before the ledger backs you off. */
export const STALL_LIMIT = 3;

/**
 * How many sessions in a row sat at the SAME weight without earning the
 * increase. Counting back from the top and stopping at the first different
 * weight is what makes a deload self-limiting: once the load drops, the new
 * weight is a fresh streak, so a stubborn lift steps down once and rebuilds
 * rather than spiralling.
 */
export function stallStreak(events: LedgerEvent[], ex: Exercise, excludeSession?: string): number {
	const history = historyFor(events, ex.name, excludeSession);
	const top = history[0];
	if (!top || earnedIncrease(top, ex)) return 0;
	let n = 0;
	for (const entry of history) {
		if (entry.weight !== top.weight || earnedIncrease(entry, ex)) break;
		n++;
	}
	return n;
}

/**
 * A stall deload: ~10% off, snapped to whole `inc` steps so the result is
 * still loadable (every weight is start + n·inc, so start + (n−k)·inc is a
 * plate/bell that exists), at least one full step, never below start.
 */
export function deloadWeight(weight: number, ex: Exercise): number {
	const steps = Math.max(1, Math.round((weight * 0.1) / ex.inc));
	return Math.max(ex.start, weight - steps * ex.inc);
}

export type LoadReason = 'start' | 'increase' | 'hold' | 'deload';
export type LoadSuggestion = { weight: number; reason: LoadReason; stalls: number };

/**
 * The full progression decision, with its reason — the rule can now move a
 * weight DOWN. Without a deload path the ledger only ever held or added, so a
 * lift you could no longer complete came back at the same load forever; the
 * only ways out were grinding it or quietly stopping.
 */
export function nextLoad(
	events: LedgerEvent[],
	ex: Exercise,
	excludeSession?: string
): LoadSuggestion {
	const entry = lastEntryFor(events, ex.name, excludeSession);
	if (!entry) return { weight: ex.start, reason: 'start', stalls: 0 };
	if (earnedIncrease(entry, ex))
		return { weight: entry.weight + ex.inc, reason: 'increase', stalls: 0 };
	const stalls = stallStreak(events, ex, excludeSession);
	if (stalls >= STALL_LIMIT) {
		const down = deloadWeight(entry.weight, ex);
		// already at the floor — nothing to give back, so it's still a hold
		if (down < entry.weight) return { weight: down, reason: 'deload', stalls };
	}
	return { weight: entry.weight, reason: 'hold', stalls };
}

/** Weight to preload next session. */
export function suggestedWeight(events: LedgerEvent[], ex: Exercise, excludeSession?: string): number {
	return nextLoad(events, ex, excludeSession).weight;
}

/**
 * Bodyweight twin of suggestedWeight: the progressible axis is the count
 * itself (seconds or reps). Best of last session, +inc if earned; never
 * below lo, capped at the decider's validation ceilings.
 */
export function suggestedCount(events: LedgerEvent[], ex: Exercise, excludeSession?: string): number {
	const entry = lastEntryFor(events, ex.name, excludeSession);
	if (!entry) return ex.lo;
	const best = Math.max(...entry.reps);
	const next = earnedIncrease(entry, ex) ? best + ex.inc : best;
	return Math.min(Math.max(ex.lo, next), ex.mode === 'seconds' ? 600 : 100);
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
export function weekRunMinutes(events: LedgerEvent[]): number {
	const cutoff = Date.now() - 7 * 86400000;
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

/** "3 sets" · "2 sets, one per side" — what a "set" counts on this movement. */
export function setsLabel(ex: Exercise): string {
	return ex.side === 'sets' ? `${ex.sets} sets, one per side` : `${ex.sets} sets`;
}

/** Display title for a day: dayInfo title if present, else "Workout X". */
export function dayTitle(plan: Plan | undefined, d: string): string {
	return plan?.dayInfo?.[d]?.title ?? 'Workout ' + d;
}
