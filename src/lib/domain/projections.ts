import { entryKey, workoutOf, type EntryLogged, type LedgerEvent, type Workout } from './events';
import { capitalise, disciplineLabel, fmtDate, fmtShort, needsLine, setsPhrase, spanLabel, unitLabel, weekLine } from './labels';
import { countOf, isSet, loadOf, type Measure } from './measure';
import {
	BLOCK_IDS,
	DISCIPLINES,
	cycleDisciplines,
	routineTitle,
	type BlockId,
	type Cycle,
	type Discipline,
	type Exercise,
	type Plan
} from './plan';
import { DEFAULT_PREFERENCES, missingFor, weightedUp, type Preferences } from './preferences';
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
export type SessionRow = {
	item: string;
	/** every set, in set order — what the rule and the ledger line read */
	sets: Measure[];
	/**
	 * the set number each of `sets` was logged as. Usually 1, 2, 3 — but the
	 * floor lets you skip a set, and a correction must name the set that
	 * exists, not the position it sits in.
	 */
	indices: number[];
};
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
	/** the lifts: one row per exercise, its sets in order */
	rows: SessionRow[];
	/** minutes from duration entries — a run session's whole point */
	minutes: number;
	/** each duration entry, by identity — what a correction to the run names */
	durations: { item: string; index: number; minutes: number }[];
	/** prep steps that happened (warm-up, cooldown, walks) — tracked, never a ledger line */
	prep: number;
	/** every entry, whatever it measured */
	entries: number;
};

/**
 * Sessions newest-first, each with its logged rows. Removed sessions are
 * excluded HERE, and only here — every consumer (historyFor, nextInCycle, the
 * Ledger) goes through this fold, so one exclusion makes the whole app
 * behave as if the workout never happened, while the events themselves stay
 * in the stream. A correction REPLACES the entry it names, in place: the set
 * keeps its number, every reader downstream sees the corrected measure, and
 * the original stays in the stream too. Events arrive in the current
 * vocabulary: the read boundary (readLedgerEvents) upcast them once, so no
 * fold sniffs shapes.
 */
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
			// insertion order is arrival order; a repeat of an identity can't
			// happen (the decider refuses it), but if one did, the first wins
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
					// every set, never collapsed: a single row.weight once made the
					// last set win, so dropping the load mid-exercise erased the
					// heavier sets before it. Sets sit in set order, whatever order
					// they arrived in.
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

/**
 * One session's entries as the floor sees them — every EntryLogged with any
 * correction applied, in arrival order. A correction changes the measure and
 * nothing else: the original `at` stays, so the rest clock that ran from it
 * doesn't restart.
 */
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

/** The programme the week lifts on is itself a projection: the last ProgrammeSelected wins. */
export function activeProgramme(events: LedgerEvent[]): string | null {
	for (let i = events.length - 1; i >= 0; i--) {
		const e = events[i];
		if (e.type === 'ProgrammeSelected') return e.data.programme;
	}
	return null;
}

/** Which blocks of the week are on: everything, until a switch says otherwise. */
export function blocksOn(events: LedgerEvent[]): BlockId[] {
	const on: Record<BlockId, boolean> = { yoga: true, mob: true, run: true };
	for (const e of events) if (e.type === 'BlockToggled') on[e.data.block] = e.data.on;
	return BLOCK_IDS.filter((b) => on[b]);
}

/**
 * When the week changed, newest first — a programme switch and the block
 * switches made at the same moment read as one change (a stored plan
 * choice comes back as several events with one `at`).
 */
export type WeekChange = { at: string; dateLabel: string; programme?: string; blocks: { block: BlockId; on: boolean }[] };
export function weekChanges(events: LedgerEvent[]): WeekChange[] {
	const out: WeekChange[] = [];
	for (const e of events) {
		if (e.type !== 'ProgrammeSelected' && e.type !== 'BlockToggled') continue;
		let c = out.find((x) => x.at === e.data.at);
		if (!c) {
			c = { at: e.data.at, dateLabel: fmtDate(e.data.at), blocks: [] };
			out.push(c);
		}
		if (e.type === 'ProgrammeSelected') c.programme = e.data.programme;
		else c.blocks.push({ block: e.data.block, on: e.data.on });
	}
	return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** What you last said you were after — the last snapshot wins, over the defaults. */
export function preferences(events: LedgerEvent[]): Preferences {
	for (let i = events.length - 1; i >= 0; i--) {
		const e = events[i];
		if (e.type === 'PreferencesSet') return { intents: e.data.intents, equipment: e.data.equipment };
	}
	return DEFAULT_PREFERENCES;
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

const DAY = 86400000;

/* ---------- cycles: where each one is turned to, and how far behind --------
   Two different questions, answered by two different rules, named once:
     a cycle COUNTS sessions by discipline, whatever plan offered them — yoga
       is yoga (weekProgress, staleness, the queue's "days since");
     a cycle TURNS on its own routines — only a finished session of THIS
       plan's routine key can say where the list is (nextInCycle, the
       re-entry warning). */

/** The sessions this cycle counts: those of its disciplines, any plan, newest first. */
const countedBy = (sessions: SessionView[], plan: Plan, cycle: Cycle): SessionView[] => {
	const ds = cycleDisciplines(plan, cycle);
	return sessions.filter((s) => ds.includes(s.discipline));
};
/** The sessions that turned this cycle: finished, this plan, a routine on its list — newest first. */
const turnedBy = (sessions: SessionView[], plan: Plan, cycle: Cycle): SessionView[] =>
	sessions.filter((s) => s.finished && s.plan === plan.id && cycle.routines.includes(s.workout.routine));
/** The last finished session this cycle counts, if any. */
const lastCounted = (sessions: SessionView[], plan: Plan, cycle: Cycle): SessionView | undefined =>
	countedBy(sessions, plan, cycle).find((s) => s.finished);

/**
 * The routine after the last one of this cycle you finished — position is
 * DERIVED, never stored. Do B twice and the pointer sits after B: the cycle
 * follows you, not a calendar. Nothing finished yet → the first.
 */
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

/* ---------- the queue: one candidate per cycle, ranked ---------------------- */

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
	/** ruled out by equipment — still in the list, never first */
	out: boolean;
	/** under its cycle's weekly target — what "due" means */
	due: boolean;
};

/** How many cadences overdue a cycle is; never done counts as very. Whole tiers, so ties are common and minutes can decide. */
function staleTier(daysSince: number | null, target: number): number {
	if (daysSince === null) return 4;
	const cadence = target > 0 ? 7 / target : 7;
	return Math.min(9, Math.floor(daysSince / cadence));
}

/**
 * What to offer, and in what order — one candidate per cycle, each carrying
 * its own reason line, so Today can never grow a menu it didn't ask for.
 * Score, in order of weight: shortfall (sessions under this cycle's weekly
 * target, plus one when an intent names its discipline) → staleness (whole
 * cadences since it last turned) → minutes (shorter first) → plan order.
 * No discipline is privileged: a lift you owe rises because it is owed. A
 * routine that needs what you haven't got is ruled OUT, not hidden — it
 * sits at the bottom and says so. A cycle with target 0 is offered only
 * when the cycle it stands in for is ruled out (it takes that target), or
 * when everything else is behind — and then never first.
 */
export function queue(events: LedgerEvent[], plan: Plan, prefs: Preferences, now: number): Candidate[] {
	const sessions = projectSessions(events);
	const up = weightedUp(prefs);
	type Scored = { c: Candidate; shortfall: number; owed: boolean; order: number };
	const scored: Scored[] = [];
	for (const [order, cycle] of plan.cycles.entries()) {
		const routine = nextInCycle(events, plan, cycle);
		// parsePlan: a cycle names only routines the plan has, and every routine has its info
		const { discipline, title } = plan.routineInfo[routine];
		const missing = missingFor(discipline, prefs);
		const out = missing.length > 0;
		let target = cycle.target;
		let standingIn = false;
		if (target === 0 && cycle.standsInFor) {
			const standIn = plan.cycles.find((c) => c.id === cycle.standsInFor);
			if (standIn && missingFor(plan.routineInfo[nextInCycle(events, plan, standIn)].discipline, prefs).length) {
				target = standIn.target;
				standingIn = true;
			}
		}
		const { done } = weekProgress(events, plan, cycle, now);
		const shortfall = Math.max(0, target - done);
		const tier = shortfall + (up.has(discipline) ? 1 : 0);
		const lastIn = lastCounted(sessions, plan, cycle);
		const stale = staleTier(lastIn ? (now - Date.parse(lastIn.at)) / DAY : null, target);
		const workout = { routine };
		const minutes = estimateMinutes(sessionSteps(plan, workout));
		const why = out ? needsLine(missing) : whyLine(events, sessions, plan, cycle, routine, lastIn, now, done, target, up.has(discipline));
		const score = out ? -1 : tier * 1e6 + stale * 1e3 + (999 - Math.min(999, minutes));
		scored.push({
			c: { cycle: cycle.id, workout, discipline, title, why, minutes, score, out, due: shortfall > 0 },
			shortfall: cycle.target === 0 && !standingIn ? 0 : shortfall,
			owed: cycle.target > 0 || standingIn,
			order
		});
	}
	// a cycle nobody asked for this week appears only when everything that
	// was asked for is behind — as "something else", never first
	const allBehind = scored.filter((s) => s.owed && !s.c.out).every((s) => s.shortfall > 0);
	return scored
		.filter((s) => s.owed || allBehind)
		.sort((a, b) => b.c.score - a.c.score || a.order - b.order)
		.map((s) => s.c);
}

/**
 * The one mono line under a candidate: the re-entry warning if one is due,
 * how long since this cycle last turned, then the first thing the rule is
 * about to move — or, when nothing moves, where the week stands. Every
 * candidate says its own why, or it is not a candidate.
 */
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
	asked: boolean
): string {
	const exercises: Exercise[] = plan.routines[routine];
	// the first exercise the rule moves, so the line says something useful
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
	// the routine that is due, about to take the haircut: say so first
	const lastOfRoutine = exercises.some((ex) => ex.kind === 'load')
		? turnedBy(sessions, plan, cycle).find((s) => s.workout.routine === routine)
		: undefined;
	const since = lastOfRoutine ? (now - Date.parse(lastOfRoutine.at)) / DAY : null;
	const warn =
		since !== null && since >= REENTRY_WARN_DAYS && since <= REENTRY_DAYS
			? `Re-entry haircut in ${daysUntilReentry(since)} ${daysUntilReentry(since) === 1 ? 'day' : 'days'}`
			: null;
	// the last session this cycle counts may be another plan's: then its own
	// word is the only honest title for it
	let sinceLine = 'First session';
	if (lastIn) {
		const title = (lastIn.plan === plan.id ? routineTitle(plan, lastIn.workout.routine) : undefined) ?? disciplineLabel(lastIn.discipline);
		const lastAge = Math.floor((now - Date.parse(lastIn.at)) / DAY);
		sinceLine = lastAge === 0 ? `${title} today` : `${lastAge} ${lastAge === 1 ? 'day' : 'days'} since ${title}`;
	}
	const week = target > 0 ? weekLine(done, target) : cycle.title;
	return [warn, sinceLine, movedLine ?? week, asked ? 'you asked for this' : null].filter(Boolean).join(' · ');
}

/* ---------- exercises over time: the trends folds ----------------------
   Read-side only: no new events, no stored projections. The Ledger's "Am I
   getting stronger" list is these folds run per exercise at request time. */

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

/* ---------- the last month ---------- */

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
export type MonthGrid = {
	/** column headings, Monday first */
	weekdays: string[];
	/** oldest week first; today is always in the last row */
	weeks: DayCell[][];
	/** "Aug 10 – Sep 12" — the window the grid covers */
	span: string;
};

/** Five rows of seven: this week and the four before it — a month you can see at once. */
export const GRID_WEEKS = 5;

/** Local calendar day as a sortable number — the bucket every day-shaped fold counts in. */
const dayKey = (d: Date) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

/**
 * The last five weeks as a calendar, bucketed by LOCAL calendar day — which
 * is why this runs where `now` runs and never stores anything. A week is too
 * short a window to see a habit in: seven cells can only say "this week was
 * quiet", a month says whether that is the habit. The read side counts
 * SESSIONS, not days: a cell says what each one was, in order, and never
 * shows only the "important" one. An unfinished session today still counts.
 */
export function monthGrid(events: LedgerEvent[], now: number, weeks: number = GRID_WEEKS): MonthGrid {
	const did = new Map<number, Discipline[]>();
	for (const s of projectSessions(events).slice().reverse()) {
		const key = dayKey(new Date(s.at));
		did.set(key, [...(did.get(key) ?? []), s.discipline]);
	}
	const today = new Date(now);
	const todayKey = dayKey(today);
	// the Monday that opens the window: this week's Monday, `weeks - 1` weeks back
	const first = new Date(
		today.getFullYear(),
		today.getMonth(),
		today.getDate() - ((today.getDay() + 6) % 7) - (weeks - 1) * 7
	);
	const rows: DayCell[][] = [];
	for (let w = 0; w < weeks; w++) {
		rows.push(
			Array.from({ length: 7 }, (_, i) => {
				const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + w * 7 + i);
				const key = dayKey(d);
				return {
					key,
					date: d.getDate(),
					label: fmtDate(d.toISOString()),
					did: did.get(key) ?? [],
					today: key === todayKey,
					future: key > todayKey
				};
			})
		);
	}
	return { weekdays: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], weeks: rows, span: spanLabel(first.toISOString(), today.toISOString()) };
}

/* ---------- the pace: a running average ---------- */

/** Four weeks: long enough that one quiet week doesn't decide it, short enough to still be news. */
export const PACE_DAYS = 28;

export type PaceStat = {
	/** the trailing window as a rate per week */
	per: number;
	/** the window before it, same rate — so a tile can say which way it's going */
	prev: number;
};
export type Pace = {
	/** the window each rate averages over, in days */
	days: number;
	/** sessions a week, per discipline — the unit every target is written in */
	by: Record<Discipline, PaceStat>;
};

/**
 * How much training a week, on average, over the trailing four weeks — and
 * over the four before that, so the answer to "am I doing less than I want?"
 * is a direction and not just a number. Rates are per week, whatever the
 * window: a fold that averages must divide by the window it was given, never
 * by the weeks it assumes. Per discipline, because that is what the session
 * says it was and what every cycle's target counts.
 */
export function weeklyPace(events: LedgerEvent[], now: number, days: number = PACE_DAYS): Pace {
	const sessions = projectSessions(events);
	const window = (endsDaysAgo: number) => {
		const to = now - endsDaysAgo * DAY;
		const from = to - days * DAY;
		const inside = sessions.filter((s) => {
			const t = Date.parse(s.at);
			return t > from && t <= to;
		});
		const perWeek = (n: number) => (n * 7) / days;
		const out = {} as Record<Discipline, number>;
		for (const d of DISCIPLINES) out[d] = perWeek(inside.filter((s) => s.discipline === d).length);
		return out;
	};
	const now4 = window(0);
	const before = window(days);
	const by = {} as Record<Discipline, PaceStat>;
	for (const d of DISCIPLINES) by[d] = { per: now4[d], prev: before[d] };
	return { days, by };
}
