import { entryKey, workoutOf, type EntryLogged, type LedgerEvent, type Workout } from './events';
import { fmtDate, spanLabel } from './labels';
import { isSet, type Measure } from './measure';
import { PRACTICES, allPracticesOn, type Discipline, type Goal, type Goals, type PracticeId } from './plan';
import type { History, HistoryEntry } from './progression';

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

/** The rest between sets this person set, or null for the programme's own: the last RestSet wins. */
export function restSeconds(events: LedgerEvent[]): number | null {
	for (let i = events.length - 1; i >= 0; i--) {
		const e = events[i];
		if (e.type === 'RestSet') return e.data.seconds;
	}
	return null;
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
