import type { LedgerEvent, Workout } from './events';
import { disciplineLabel, levelLine, setsPhrase, weekLine } from './labels';
import { cycleDisciplines, levelsOf, routineTitle, type Cycle, type Discipline, type Exercise, type Plan } from './plan';
import { REENTRY_DAYS, REENTRY_WARN_DAYS, daysUntilReentry, nextRounds, roundsDone, suggest } from './progression';
import { historyFor, projectSessions, sessionEntries, type SessionView } from './projections';
import { estimateMinutes, sessionSteps } from './steps';

/**
 * The week's rules over the read model: owed (`weekProgress`), next (`nextInCycle`), a circuit's level (`roundsFor`), a pool's turn (`turnOf`),
 * the deal (`queue`) and the run of kept weeks (`weeksKept`). Pure folds; `now` is an argument. README.md is the contract.
 */

const DAY = 86400000;

/** The cycles that share one weekly count — a cycle and whatever pools with it, in plan order; alone, itself. */
export const poolOf = (plan: Plan, cycle: Cycle): Cycle[] => {
	const root = cycle.standsInFor ?? cycle.id;
	return plan.cycles.filter((c) => c.id === root || c.standsInFor === root);
};
/** The cycle a pool is named for: the one the others stand in for; alone, itself. */
export const poolRoot = (plan: Plan, cycle: Cycle): Cycle => plan.cycles.find((c) => c.id === cycle.standsInFor) ?? cycle;

const ofDisciplines = (sessions: SessionView[], plan: Plan, cycles: Cycle[]): SessionView[] => {
	const ds = cycles.flatMap((c) => cycleDisciplines(plan, c));
	return sessions.filter((s) => ds.includes(s.discipline));
};
/** The sessions this cycle's week counts: those of its pool's disciplines, whatever plan offered them, newest first. */
const countedBy = (sessions: SessionView[], plan: Plan, cycle: Cycle): SessionView[] => ofDisciplines(sessions, plan, poolOf(plan, cycle));
const inWeek = (s: SessionView, now: number): boolean => {
	const t = Date.parse(s.at);
	return t > now - 7 * DAY && t <= now;
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

/**
 * The rounds a circuit is dealt: one level up after its last finished session reached every count in every round, else that
 * session's level again; Level I when there is none. Derived, never stored — the session stamps what it was dealt. Undefined for straight sets.
 */
export function roundsFor(events: LedgerEvent[], plan: Plan, routine: string): number | undefined {
	const levels = levelsOf(plan, routine);
	if (!levels) return undefined;
	const last = projectSessions(events).find((s) => s.finished && s.workout.routine === routine);
	if (!last) return levels[0];
	const rounds = last.workout.rounds ?? levels[0];
	return nextRounds(levels, rounds, roundsDone(plan.routines[routine] ?? [], rounds, sessionEntries(events, last.id)));
}

/** Sessions of this cycle's pool in the trailing seven days, against the pool's target — the shares added up. An unfinished one today counts. */
export function weekProgress(events: LedgerEvent[], plan: Plan, cycle: Cycle, now: number): { done: number; target: number } {
	const done = countedBy(projectSessions(events), plan, cycle).filter((s) => inWeek(s, now)).length;
	return { done, target: poolOf(plan, cycle).reduce((n, c) => n + c.target, 0) };
}

/**
 * Whose turn it is in this cycle's pool: of the cycles with a share, the one furthest behind its own this week — level, the one done
 * longer ago, then plan order. A share of none never has the turn; alone, a cycle always does.
 */
export function turnOf(events: LedgerEvent[], plan: Plan, cycle: Cycle, now: number): Cycle {
	const pool = poolOf(plan, cycle);
	const sharing = pool.filter((c) => c.target > 0);
	if (sharing.length < 2) return sharing[0] ?? pool[0];
	const sessions = projectSessions(events);
	const ranked = sharing.map((c, order) => {
		const own = ofDisciplines(sessions, plan, [c]);
		const last = own.find((s) => s.finished);
		return { c, order, behind: c.target - own.filter((s) => inWeek(s, now)).length, last: last ? Date.parse(last.at) : -Infinity };
	});
	return ranked.sort((a, b) => b.behind - a.behind || a.last - b.last || a.order - b.order)[0].c;
}

const KEPT_LOOKBACK = 52; // weeks: a year of kept weeks is as far as anyone needs counted

/**
 * Weeks in a row every pool met its target — seven days at a time back from `now`, each held to TODAY's targets, so a week that grows
 * starts its count again. The week in progress counts once it is kept and never breaks the run; a week that asks nothing keeps nothing.
 */
export function weeksKept(events: LedgerEvent[], plan: Plan, now: number): number {
	if (!plan.cycles.some((c) => c.target > 0)) return 0;
	const kept = (at: number) =>
		plan.cycles.every((c) => {
			const w = weekProgress(events, plan, c, at);
			return w.target === 0 || w.done >= w.target;
		});
	let n = kept(now) ? 1 : 0;
	for (let k = 1; k <= KEPT_LOOKBACK && kept(now - k * 7 * DAY); k++) n++;
	return n;
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
	/** its week is under target — what "due" means; true of both ways to pay a pool */
	due: boolean;
	/** the cycle whose week this pays: its pool's root — itself, alone */
	week: string;
	/** its pool's pick right now — always, alone; only a turn is ranked as owed */
	turn: boolean;
};

/** Cadences overdue, in whole tiers; never done counts as very. */
function staleTier(daysSince: number | null, target: number): number {
	if (daysSince === null) return 4;
	const cadence = target > 0 ? 7 / target : 7;
	return Math.min(9, Math.floor(daysSince / cadence));
}

/**
 * One candidate per cycle, ranked: owed → shortfall → staleness → minutes → plan order.
 * In a pool only the turn carries what is owed; the other way to pay it is always dealt and never above anything owed.
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
		const rounds = roundsFor(events, plan, routine);
		const workout = rounds === undefined ? { routine } : { routine, rounds };
		const minutes = estimateMinutes(sessionSteps(plan, workout));
		const levels = levelsOf(plan, routine);
		const why = whyLine(events, sessions, plan, cycle, routine, lastIn, now, done, target, levels && rounds ? levelLine(levels, rounds) : undefined);
		const turn = turnOf(events, plan, cycle, now).id === cycle.id;
		// bands that cannot touch: owed 1e8 > shortfall·1e6 > stale·1e3 + shorter (≤ 999,009)
		const shorter = 999 - Math.min(999, minutes);
		const score = (turn && target > 0 ? 1e8 : 0) + (turn ? shortfall : 0) * 1e6 + stale * 1e3 + shorter;
		scored.push({
			c: {
				cycle: cycle.id, workout, discipline, title, why,
				minutes, score, due: shortfall > 0, week: poolRoot(plan, cycle).id, turn
			},
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
	const short = owed.filter((c) => {
		const week = weekProgress(events, plan, c, now);
		return week.done < week.target;
	});
	const gaps = [...new Set(short.map((c) => poolRoot(plan, c).title.toLowerCase()))];
	return { done, asked, gaps };
}

/** The mono line under a candidate: re-entry warning, days since the cycle last turned, then what the rule moves next — or where the week stands. A circuit says its `level` first, and leaves the week to the caption. */
function whyLine(
	events: LedgerEvent[],
	sessions: SessionView[],
	plan: Plan,
	cycle: Cycle,
	routine: string,
	lastIn: SessionView | undefined,
	now: number,
	done: number,
	target: number,
	level?: string
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
	return [warn, level, sinceLine, movedLine ?? (level ? null : week)].filter(Boolean).join(' · ');
}
