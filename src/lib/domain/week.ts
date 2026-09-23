import type { LedgerEvent, Workout } from './events';
import { disciplineLabel, setsPhrase, standInLine, weekLine } from './labels';
import { cycleDisciplines, routineTitle, type Cycle, type Discipline, type Exercise, type Plan } from './plan';
import { REENTRY_DAYS, REENTRY_WARN_DAYS, daysUntilReentry, suggest } from './progression';
import { historyFor, projectSessions, type SessionView } from './projections';
import { estimateMinutes, sessionSteps } from './steps';

/**
 * The week's three rules over the read model: owed (`weekProgress`), next (`nextInCycle`) and the deal (`queue`) —
 * with the stand-in folded into how a cycle counts (`countedBy`). Pure folds; `now` is an argument. README.md is the contract.
 */

const DAY = 86400000;

/** The sessions this cycle counts: those of its disciplines — and of any cycle standing in for it — whatever plan offered them, newest first. */
const countedBy = (sessions: SessionView[], plan: Plan, cycle: Cycle): SessionView[] => {
	const ds = plan.cycles.filter((c) => c === cycle || c.standsInFor === cycle.id).flatMap((c) => cycleDisciplines(plan, c));
	return sessions.filter((s) => ds.includes(s.discipline));
};
/** The sessions that turned this cycle: finished, this plan, a routine on its list — newest first. */
const turnedBy = (sessions: SessionView[], plan: Plan, cycle: Cycle): SessionView[] =>
	sessions.filter((s) => s.finished && s.plan === plan.id && cycle.routines.includes(s.workout.routine));
/** The last finished session this cycle counts, if any. */
const lastCounted = (sessions: SessionView[], plan: Plan, cycle: Cycle): SessionView | undefined =>
	countedBy(sessions, plan, cycle).find((s) => s.finished);

/** The routine after the last one of this cycle you finished — derived, never stored; nothing finished → the first. */
export function nextInCycle(events: LedgerEvent[], plan: Plan, cycle: Cycle): string {
	const last = turnedBy(projectSessions(events), plan, cycle)[0];
	if (!last) return cycle.routines[0];
	const i = cycle.routines.indexOf(last.workout.routine);
	return cycle.routines[(i + 1) % cycle.routines.length];
}

/** Sessions of this cycle in the trailing seven days, against its target. An unfinished one today counts. */
export function weekProgress(events: LedgerEvent[], plan: Plan, cycle: Cycle, now: number): { done: number; target: number } {
	const cutoff = now - 7 * DAY;
	const done = countedBy(projectSessions(events), plan, cycle).filter((s) => {
		const t = Date.parse(s.at);
		return t > cutoff && t <= now;
	}).length;
	return { done, target: cycle.target };
}

/** Days since each cycle last turned — null when it never has. */
export function staleness(events: LedgerEvent[], plan: Plan, now: number): { cycle: string; daysSince: number | null }[] {
	const sessions = projectSessions(events);
	return plan.cycles.map((c) => {
		const last = lastCounted(sessions, plan, c);
		return { cycle: c.id, daysSince: last ? (now - Date.parse(last.at)) / DAY : null };
	});
}

/** One offer for Today: a cycle's next routine, with its reason and its rank. */
export type Candidate = {
	/** the cycle that offers it */
	cycle: string;
	workout: Workout;
	discipline: Discipline;
	title: string;
	/** one mono line, in the grammar Today already speaks */
	why: string;
	minutes: number;
	/** ordering only; never shown */
	score: number;
	/** under its cycle's weekly target — what "due" means */
	due: boolean;
	/** the cycle this one's sessions count toward — the floor stands in for the lift */
	standsInFor?: string;
};

/** Cadences overdue, in whole tiers; never done counts as very. */
function staleTier(daysSince: number | null, target: number): number {
	if (daysSince === null) return 4;
	const cadence = target > 0 ? 7 / target : 7;
	return Math.min(9, Math.floor(daysSince / cadence));
}

/**
 * One candidate per cycle, ranked: owed → shortfall → staleness → minutes → plan order.
 * A target-0 cycle is always dealt and never above anything owed — the floor is one "Something else" away.
 */
export function queue(events: LedgerEvent[], plan: Plan, now: number): Candidate[] {
	const sessions = projectSessions(events);
	type Scored = { c: Candidate; order: number };
	const scored: Scored[] = [];
	for (const [order, cycle] of plan.cycles.entries()) {
		const routine = nextInCycle(events, plan, cycle);
		// parsePlan: a cycle names only routines the plan has, and every routine has its info
		const { discipline, title } = plan.routineInfo[routine];
		const { done, target } = weekProgress(events, plan, cycle, now);
		const shortfall = Math.max(0, target - done);
		const lastIn = lastCounted(sessions, plan, cycle);
		const stale = staleTier(lastIn ? (now - Date.parse(lastIn.at)) / DAY : null, target);
		const workout = { routine };
		const minutes = estimateMinutes(sessionSteps(plan, workout));
		const standIn = cycle.standsInFor ? plan.cycles.find((c) => c.id === cycle.standsInFor) : undefined;
		const why = standIn
			? standInLine(routineTitle(plan, nextInCycle(events, plan, standIn)) ?? standIn.title, standIn.target)
			: whyLine(events, sessions, plan, cycle, routine, lastIn, now, done, target);
		// bands that cannot touch: owed 1e8 > shortfall·1e6 > stale·1e3 + shorter (≤ 999,009)
		const owed = cycle.target > 0;
		const shorter = 999 - Math.min(999, minutes);
		const score = (owed ? 1e8 : 0) + shortfall * 1e6 + stale * 1e3 + shorter;
		scored.push({
			c: { cycle: cycle.id, workout, discipline, title, why, minutes, score, due: shortfall > 0, ...(standIn ? { standsInFor: standIn.id } : {}) },
			order
		});
	}
	return scored.sort((a, b) => b.c.score - a.c.score || a.order - b.order).map((s) => s.c);
}

/** The week so far: every session in the trailing seven days against everything the on cycles ask, and which of them are behind. */
export function weekTally(events: LedgerEvent[], plan: Plan, now: number): { done: number; asked: number; gaps: string[] } {
	const cutoff = now - 7 * DAY;
	const done = projectSessions(events).filter((s) => {
		const t = Date.parse(s.at);
		return t > cutoff && t <= now;
	}).length;
	const owed = plan.cycles.filter((c) => c.target > 0);
	const asked = owed.reduce((n, c) => n + c.target, 0);
	const gaps = owed.filter((c) => weekProgress(events, plan, c, now).done < c.target).map((c) => c.title.toLowerCase());
	return { done, asked, gaps };
}

/** The mono line under a candidate: re-entry warning, days since the cycle last turned, then what the rule moves next — or where the week stands. */
function whyLine(
	events: LedgerEvent[],
	sessions: SessionView[],
	plan: Plan,
	cycle: Cycle,
	routine: string,
	lastIn: SessionView | undefined,
	now: number,
	done: number,
	target: number
): string {
	const exercises: Exercise[] = plan.routines[routine];
	const moved = exercises
		.map((ex) => ({ ex, s: suggest(historyFor(events, ex.name), ex, now) }))
		.find(({ s }) => s.kind === 'load' && (s.up || s.down));
	let movedLine: string | null = null;
	if (moved && moved.s.kind === 'load') {
		if (moved.s.up) {
			const up = moved.s.sets.map((x, i) => (x.reason === 'increase' ? i : -1)).filter((i) => i >= 0);
			movedLine = `${setsPhrase(up)} ${up.length === 1 ? 'goes' : 'go'} up on the ${moved.ex.name}`;
		} else movedLine = `${moved.ex.name} comes back a size`;
	}
	const lastOfRoutine = exercises.some((ex) => ex.kind === 'load')
		? turnedBy(sessions, plan, cycle).find((s) => s.workout.routine === routine)
		: undefined;
	const since = lastOfRoutine ? (now - Date.parse(lastOfRoutine.at)) / DAY : null;
	const warn =
		since !== null && since >= REENTRY_WARN_DAYS && since <= REENTRY_DAYS
			? `Re-entry haircut in ${daysUntilReentry(since)} ${daysUntilReentry(since) === 1 ? 'day' : 'days'}`
			: null;
	let sinceLine = 'First session';
	if (lastIn) {
		const title = (lastIn.plan === plan.id ? routineTitle(plan, lastIn.workout.routine) : undefined) ?? disciplineLabel(lastIn.discipline);
		const lastAge = Math.floor((now - Date.parse(lastIn.at)) / DAY);
		sinceLine = lastAge === 0 ? `${title} today` : `${lastAge} ${lastAge === 1 ? 'day' : 'days'} since ${title}`;
	}
	const week = target > 0 ? weekLine(done, target) : cycle.title;
	return [warn, sinceLine, movedLine ?? week].filter(Boolean).join(' · ');
}
