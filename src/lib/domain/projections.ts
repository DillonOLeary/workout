import { RUN_DAY, type LedgerEvent } from './events';
import { capitalise, fmtDate, fmtShort, setsPhrase, unitLabel } from './labels';
import { countOf, isSet, loadOf, type Measure } from './measure';
import type { Exercise, Plan } from './plan';
import {
	REENTRY_DAYS,
	REENTRY_WARN_DAYS,
	anySetEarned,
	setEarned,
	suggest,
	type History,
	type HistoryEntry
} from './progression';

/**
 * Projections: the read side. Each is a pure fold over the event list that
 * answers exactly one question for a screen — and nothing else lives here.
 * The rule is progression.ts, the words are labels.ts; this file only says
 * what happened. None of it is stored: with a single-user ledger it is cheap
 * to re-run per request, which keeps the model honest — if it's not
 * derivable from events, it doesn't exist.
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
	/** the lifts: one row per exercise, its sets in order */
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

/**
 * Sessions newest-first, each with its logged rows. Removed sessions are
 * excluded HERE, and only here — every consumer (historyFor, nextDay, the
 * By day view) goes through this fold, so one exclusion makes the whole app
 * behave as if the workout never happened, while the events themselves stay
 * in the stream. Events arrive in the current vocabulary: the read boundary
 * (readLedgerEvents) upcast them once, so no fold sniffs shapes.
 */
export function projectSessions(events: LedgerEvent[]): SessionView[] {
	const removed = new Set(events.filter((e) => e.type === 'SessionRemoved').map((e) => e.data.session));
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
 * Runs newest-first. A run is a session like any other; this is the same
 * fold, filtered — kept for the meter and the week strip, which only want
 * minutes and a day.
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

/**
 * Every logged entry for an exercise, newest first — the seam between the
 * read model and the rule: this is what `suggest` reads. A session in
 * progress is excluded by id so the rule never grades the set it is
 * suggesting.
 */
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

const DAY = 86400000;

/** Run minutes in the trailing 7 days — compared against the plan's own runTarget. */
export function weekRunMinutes(events: LedgerEvent[], now: number): number {
	const cutoff = now - 7 * DAY;
	return projectRuns(events)
		.filter((r) => new Date(r.at).getTime() > cutoff)
		.reduce((sum, r) => sum + r.minutes, 0);
}

/* ---------- exercises over time: the trends folds ----------------------
   Read-side only: no new events, no stored projections. Today's "How it's
   going" list is these folds run per exercise at request time. */

/** Sessions, not weeks: a week off would read as a gap, and a stall must read as a stall. */
export const TREND_WINDOW = 7;

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
export type TrendTone = 'start' | 'up' | 'down' | 'warn' | 'flat';
export type Trend = {
	/** the last TREND_WINDOW sessions, oldest first */
	points: TrendPoint[];
	/** what the rule has queued for set 1 next time (weight, or count) */
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
		missed: h.sets.some((m) => countOf(m) < ex.lo)
	}));
	const s = suggest(history, ex, now);
	const next = s.kind === 'load' ? s.weight : s.sets[0].count;
	const base = { points, next, sessions: history.length };
	const last = history[0];
	if (!last) return { ...base, tone: 'start', sentence: `Starts at ${unitLabel(next, ex)}` };

	const days = s.daysSince ?? 0;
	if (s.kind === 'load') {
		// the two ways down, and the warning before one of them — loads only:
		// a hold or a count has no size to come back lighter at
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
	}
	const earnedIdx = last.sets.map((m, i) => (setEarned(m, ex) ? i : -1)).filter((i) => i >= 0);
	if (earnedIdx.length) {
		if (s.kind === 'hold' && s.ceiling)
			return { ...base, tone: 'up', sentence: `At the ceiling (${ex.hi}s) — make it harder, not longer` };
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
