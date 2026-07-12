import type { LedgerEvent } from './events';
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

/** Sessions newest-first, each with its logged rows. */
export function projectSessions(events: LedgerEvent[]): SessionView[] {
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
	return Array.from(map.values()).sort((a, b) => b.at.localeCompare(a.at));
}

/** Runs newest-first. */
export function projectRuns(events: LedgerEvent[]): RunView[] {
	return events
		.filter((e) => e.type === 'RunLogged')
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

/** Most recent logged entry for an exercise (excluding a given session id). */
export function lastEntryFor(
	events: LedgerEvent[],
	exercise: string,
	excludeSession?: string
): LastEntry | null {
	for (const s of projectSessions(events)) {
		if (s.id === excludeSession) continue;
		const row = s.rows.find((r) => r.exercise === exercise);
		if (row && row.reps.length) return { weight: row.weight, reps: row.reps, dateLabel: s.dateLabel };
	}
	return null;
}

/** The one rule: all sets at/above the top of the range → earned an increase. */
export function earnedIncrease(entry: { weight: number; reps: number[] } | null, ex: Exercise): boolean {
	return !!entry && entry.reps.length >= ex.sets && entry.reps.every((r) => r >= ex.hi);
}

/** Weight to preload next session: last weight, +inc if earned, else start. */
export function suggestedWeight(events: LedgerEvent[], ex: Exercise, excludeSession?: string): number {
	const entry = lastEntryFor(events, ex.name, excludeSession);
	if (!entry) return ex.start;
	return earnedIncrease(entry, ex) ? entry.weight + ex.inc : entry.weight;
}

/** Which day is due next: alternate from the most recent finished session. */
export function nextDay(events: LedgerEvent[], plan: Plan): string {
	const dayKeys = Object.keys(plan.days);
	const sessions = projectSessions(events).filter((s) => s.finished && s.plan === plan.id);
	if (!sessions.length) return dayKeys[0];
	const i = dayKeys.indexOf(sessions[0].day);
	return dayKeys[(i + 1) % dayKeys.length];
}

/** Run minutes in the trailing 7 days (WHO 150–300 target). */
export function weekRunMinutes(events: LedgerEvent[]): number {
	const cutoff = Date.now() - 7 * 86400000;
	return events
		.filter((e) => e.type === 'RunLogged' && new Date(e.data.at).getTime() > cutoff)
		.reduce((sum, e) => sum + (e.type === 'RunLogged' ? e.data.minutes : 0), 0);
}

/** Display title for a day: dayInfo title if present, else "Workout X". */
export function dayTitle(plan: Plan | undefined, d: string): string {
	return plan?.dayInfo?.[d]?.title ?? 'Workout ' + d;
}
