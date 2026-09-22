import { entryKey, workoutOf, type EntryLogged, type LedgerEvent, type Workout } from './events';
import { capitalise, disciplineLabel, fmtDate, fmtShort, setsPhrase, spanLabel, standInLine, unitLabel, weekLine } from './labels';
import { countOf, isSet, loadOf, type Measure } from './measure';
import {
	PRACTICES,
	allPracticesOn,
	cycleDisciplines,
	routineTitle,
	type Cycle,
	type Discipline,
	type Exercise,
	type Goal,
	type Goals,
	type Plan,
	type PracticeId
} from './plan';
import {
	REENTRY_DAYS,
	REENTRY_WARN_DAYS,
	anySetEarned,
	daysUntilReentry,
	setEarned,
	suggest,
	type History,
	type HistoryEntry
} from './progression';
import { estimateMinutes, sessionSteps } from './steps';

/** One row of a session: an item and its sets, each set the Measure the entry carried. */
export type SessionRow = {
	item: string;
	/** every set, in set order */
	sets: Measure[];
	/** the set number each of `sets` was logged as — a correction names the set that exists, not its position */
	indices: number[];
};
/** One session as a screen reads it. */
export type SessionView = {
	id: string;
	/** what it was: the routine it ran */
	workout: Workout;
	/** what it was, as the session itself says — never looked up from the plan */
	discipline: Discipline;
	plan: string;
	at: string;
	dateLabel: string;
	finished: boolean;
	/** when it ended — what "48 min" on the Ledger measures for a lift */
	finishedAt?: string;
	/** 'after' = written in one shot, backdated; 'live' = walked on the floor */
	mode: 'live' | 'after';
	rows: SessionRow[];
	/** minutes from duration entries */
	minutes: number;
	/** each duration entry, by identity — what a correction to the run names */
	durations: { item: string; index: number; minutes: number }[];
	/** prep steps that happened (warm-up, cooldown, walks) — tracked, never a ledger line */
	prep: number;
	/** every entry, whatever it measured */
	entries: number;
};

/** Sessions newest-first with their rows; removed sessions are dropped here and only here; a correction replaces its entry in place. */
export function projectSessions(events: LedgerEvent[]): SessionView[] {
	const removed = new Set(events.filter((e) => e.type === 'SessionRemoved').map((e) => e.data.session));
	type Building = { view: SessionView; entries: Map<string, EntryLogged['data']> };
	const map = new Map<string, Building>();
	for (const e of events) {
		if (e.type === 'SessionStarted') {
			map.set(e.data.session, {
				view: {
					id: e.data.session,
					workout: workoutOf(e.data),
					discipline: e.data.discipline,
					plan: e.data.plan,
					at: e.data.at,
					dateLabel: fmtDate(e.data.at),
					finished: false,
					mode: e.data.mode,
					rows: [],
					minutes: 0,
					durations: [],
					prep: 0,
					entries: 0
				},
				entries: new Map()
			});
		} else if (e.type === 'EntryLogged') {
			const s = map.get(e.data.session);
			const key = entryKey(e.data.item, e.data.index);
			if (s && !s.entries.has(key)) s.entries.set(key, e.data);
		} else if (e.type === 'EntryCorrected') {
			const s = map.get(e.data.session);
			const key = entryKey(e.data.item, e.data.index);
			const was = s?.entries.get(key);
			if (s && was) s.entries.set(key, { ...was, measure: e.data.measure });
		} else if (e.type === 'SessionFinished') {
			const s = map.get(e.data.session);
			if (s) {
				s.view.finished = true;
				s.view.finishedAt = e.data.at;
			}
		}
	}
	return Array.from(map.values())
		.filter((b) => !removed.has(b.view.id))
		.map(({ view, entries }) => {
			const rows: SessionRow[] = [];
			for (const en of entries.values()) {
				view.entries++;
				const m = en.measure;
				if (m.of === 'step') view.prep++;
				else if (m.of === 'duration') {
					view.minutes += m.minutes;
					view.durations.push({ item: en.item, index: en.index, minutes: m.minutes });
				} else if (isSet(m)) {
					let row = rows.find((r) => r.item === en.item);
					if (!row) {
						row = { item: en.item, sets: [], indices: [] };
						rows.push(row);
					}
					// every set, never collapsed: sets sit in set order, whatever order they arrived in
					const at = row.indices.findIndex((i) => i > en.index);
					const pos = at < 0 ? row.sets.length : at;
					row.sets.splice(pos, 0, m);
					row.indices.splice(pos, 0, en.index);
				}
			}
			view.rows = rows;
			return view;
		})
		.sort((a, b) => b.at.localeCompare(a.at));
}

/** One session's entries in arrival order, each with any correction applied to its measure. */
export function sessionEntries(events: LedgerEvent[], session: string): EntryLogged['data'][] {
	const out: EntryLogged['data'][] = [];
	for (const e of events) {
		if (e.type === 'EntryLogged' && e.data.session === session) {
			if (!out.some((x) => x.item === e.data.item && x.index === e.data.index)) out.push(e.data);
		} else if (e.type === 'EntryCorrected' && e.data.session === session) {
			const i = out.findIndex((x) => x.item === e.data.item && x.index === e.data.index);
			if (i >= 0) out[i] = { ...out[i], measure: e.data.measure };
		}
	}
	return out;
}

/** The programme the week lifts on: the last ProgrammeSelected wins. */
export function activeProgramme(events: LedgerEvent[]): string | null {
	for (let i = events.length - 1; i >= 0; i--) {
		const e = events[i];
		if (e.type === 'ProgrammeSelected') return e.data.programme;
	}
	return null;
}

/** Which practices of the week are on: everything, until a switch says otherwise. */
export function practicesOn(events: LedgerEvent[]): PracticeId[] {
	const on = allPracticesOn();
	for (const e of events) if (e.type === 'BlockToggled') on[e.data.block] = e.data.on;
	return PRACTICES.filter((p) => on[p]);
}

/** What each practice was asked for: the last goal per practice wins; nothing said means the programme's cadence. */
export function goals(events: LedgerEvent[]): Goals {
	const out: Goals = {};
	for (const e of events)
		if (e.type === 'GoalSet') out[e.data.practice] = { sessions: e.data.sessions, ...(e.data.minutes !== undefined ? { minutes: e.data.minutes } : {}) };
	return out;
}

/** One change to the week: a programme switch, practice switches and goals set at one moment. */
export type WeekChange = {
	at: string;
	dateLabel: string;
	programme?: string;
	blocks: { block: PracticeId; on: boolean }[];
	goals: ({ practice: PracticeId } & Goal)[];
};
/** When the week changed, newest first — events sharing one `at` read as one change. */
export function weekChanges(events: LedgerEvent[]): WeekChange[] {
	const out: WeekChange[] = [];
	for (const e of events) {
		if (e.type !== 'ProgrammeSelected' && e.type !== 'BlockToggled' && e.type !== 'GoalSet') continue;
		let c = out.find((x) => x.at === e.data.at);
		if (!c) {
			c = { at: e.data.at, dateLabel: fmtDate(e.data.at), blocks: [], goals: [] };
			out.push(c);
		}
		if (e.type === 'ProgrammeSelected') c.programme = e.data.programme;
		else if (e.type === 'BlockToggled') c.blocks.push({ block: e.data.block, on: e.data.on });
		else c.goals.push({ practice: e.data.practice, sessions: e.data.sessions, ...(e.data.minutes !== undefined ? { minutes: e.data.minutes } : {}) });
	}
	return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** Every logged entry for an exercise, newest first — what `suggest` reads; a session in progress is excluded by id. */
export function historyFor(events: LedgerEvent[], exercise: string, excludeSession?: string): History {
	const out: History = [];
	for (const s of projectSessions(events)) {
		if (s.id === excludeSession) continue;
		const row = s.rows.find((r) => r.item === exercise);
		if (row && row.sets.length) out.push({ sets: row.sets, dateLabel: s.dateLabel, at: s.at });
	}
	return out;
}

/** Most recent logged entry for an exercise (excluding a given session id). */
export function lastEntryFor(events: LedgerEvent[], exercise: string, excludeSession?: string): HistoryEntry | null {
	return historyFor(events, exercise, excludeSession)[0] ?? null;
}

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

/** Sessions a trend strip shows — sessions, not weeks. */
export const TREND_WINDOW = 7;

/** One session on a trend strip. */
export type TrendPoint = {
	at: string;
	dateLabel: string;
	/** the progressible axis: set 1's weight — or its count, for a hold or a bodyweight movement */
	load: number;
	sets: Measure[];
	/** some set reached the top of the range */
	earned: boolean;
	/** some set fell below the bottom of the range */
	missed: boolean;
};
/** Which way a trend's sentence points — what a trend row styles by. */
export type TrendTone = 'start' | 'up' | 'down' | 'warn' | 'flat';
/** One exercise over time: the sentence, and the strip that corroborates it. */
export type Trend = {
	/** the last TREND_WINDOW sessions, oldest first */
	points: TrendPoint[];
	/** what the rule has queued for set 1 next time (weight, or count) */
	next: number;
	/** one sentence about where this exercise stands */
	sentence: string;
	tone: TrendTone;
	/** total sessions on record, so the UI can say how many the window hides */
	sessions: number;
};

/** One exercise over time; precedence runs from what the rule will do next down to how long the load has sat still. */
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
		missed: h.sets.some((m) => countOf(m) < ex.lo)
	}));
	const s = suggest(history, ex, now);
	const next = s.kind === 'load' ? s.weight : s.sets[0].count;
	const base = { points, next, sessions: history.length };
	const last = history[0];
	if (!last) return { ...base, tone: 'start', sentence: `Starts at ${unitLabel(next, ex)}` };

	const days = s.daysSince ?? 0;
	if (s.kind === 'load') {
		if (s.reason === 'reentry')
			return {
				...base,
				tone: 'down',
				sentence: `Re-entry after ${Math.floor(days)} days — one size down, ${unitLabel(next, ex)} next time`
			};
		if (days >= REENTRY_WARN_DAYS && days <= REENTRY_DAYS) {
			const n = Math.max(1, Math.ceil(REENTRY_DAYS - days));
			return { ...base, tone: 'warn', sentence: `Re-entry haircut in ${n} ${n === 1 ? 'day' : 'days'}` };
		}
		const adjusted = s.sets.findIndex((x) => x.reason === 'adjust');
		if (adjusted >= 0) {
			const was = loadOf(last.sets[adjusted] ?? last.sets[0]);
			return {
				...base,
				tone: 'down',
				sentence: `Missed the bottom twice at ${was} — back to ${unitLabel(s.sets[adjusted].weight, ex)} next time`
			};
		}
	} else if (s.variant?.promoted) {
		return { ...base, tone: 'up', sentence: `Every set at the top — up a rung: ${s.variant.name}` };
	}
	const earnedIdx = last.sets.map((m, i) => (setEarned(m, ex) ? i : -1)).filter((i) => i >= 0);
	if (earnedIdx.length) {
		if (s.kind === 'count' && s.ceiling)
			return {
				...base,
				tone: 'up',
				sentence: s.variant ? `Top of the ladder (${s.variant.name}) — make it harder` : `At the ceiling (${ex.hi}s) — make it harder, not longer`
			};
		if (s.kind !== 'load')
			return { ...base, tone: 'up', sentence: `Hit the top of the range — ${unitLabel(next, ex)} next time` };
		const who = earnedIdx.length >= ex.sets ? 'Every set' : capitalise(setsPhrase(earnedIdx));
		const to = unitLabel(s.sets[Math.min(earnedIdx[0], s.sets.length - 1)].weight, ex);
		return { ...base, tone: 'up', sentence: `${who} at the top of the range — ${to} next time` };
	}
	if (s.kind === 'load') {
		const missedIdx = s.sets.map((x, i) => (x.missed ? i : -1)).filter((i) => i >= 0);
		if (missedIdx.length)
			return {
				...base,
				tone: 'warn',
				sentence: `${capitalise(setsPhrase(missedIdx))} missed last time — miss again and it backs off a size`
			};
	}
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

/** One day of the month grid. */
export type DayCell = {
	/** local yyyymmdd */
	key: number;
	/** day of the month — what the cell prints */
	date: number;
	/** "Sun, Aug 23" — what a screen reader hears */
	label: string;
	/** one per session, in the order they happened: ['yoga', 'lift'] is a normal Tuesday */
	did: Discipline[];
	today: boolean;
	future: boolean;
};
/** The last few weeks as a calendar. */
export type MonthGrid = {
	/** column headings, Monday first */
	weekdays: string[];
	/** oldest week first; today is always in the last row */
	weeks: DayCell[][];
	/** "Aug 10 – Sep 12" — the window the grid covers */
	span: string;
};

/** Rows of the grid: this week and the four before it. */
export const GRID_WEEKS = 5;

/** Local calendar day as a sortable yyyymmdd number. */
const dayKey = (d: Date) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

/** `days` consecutive local days from `first`, bucketed by local day; a cell lists its sessions in order, an unfinished one today included. */
function dayCells(events: LedgerEvent[], first: Date, days: number, now: number): DayCell[] {
	const did = new Map<number, Discipline[]>();
	for (const s of projectSessions(events).slice().reverse()) {
		const key = dayKey(new Date(s.at));
		did.set(key, [...(did.get(key) ?? []), s.discipline]);
	}
	const todayKey = dayKey(new Date(now));
	return Array.from({ length: days }, (_, i) => {
		const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
		const key = dayKey(d);
		return { key, date: d.getDate(), label: fmtDate(d.toISOString()), did: did.get(key) ?? [], today: key === todayKey, future: key > todayKey };
	});
}

/** The last `weeks` weeks as a calendar, Monday first, today in the last row. */
export function monthGrid(events: LedgerEvent[], now: number, weeks: number = GRID_WEEKS): MonthGrid {
	const today = new Date(now);
	// the Monday that opens the window: this week's Monday, `weeks - 1` weeks back
	const first = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7) - (weeks - 1) * 7);
	const cells = dayCells(events, first, weeks * 7, now);
	const rows: DayCell[][] = [];
	for (let w = 0; w < weeks; w++) rows.push(cells.slice(w * 7, w * 7 + 7));
	return { weekdays: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], weeks: rows, span: spanLabel(first.toISOString(), today.toISOString()) };
}

/** The trailing seven days, today last — the strip Today glances at. */
export function weekStrip(events: LedgerEvent[], now: number): DayCell[] {
	const today = new Date(now);
	return dayCells(events, new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6), 7, now);
}
