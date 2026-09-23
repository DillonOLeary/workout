import type { Command } from '@event-driven-io/emmett';
import type { Workout } from './events';
import type { Measure } from './measure';
import type { Goal, PracticeId, Discipline } from './plan';

/** Open a live session; ids, timestamps and the discipline are generated at the edge and passed in. */
export type StartSession = Command<
	'StartSession',
	{ session: string; plan: string; at: string; discipline: Discipline } & Workout
>;

/** One entry, live, into the session in progress. */
export type LogEntry = Command<
	'LogEntry',
	{ session: string; item: string; index: number; at: string; measure: Measure }
>;

/** Fix an entry that already landed — the same identity, a new measure; latest session only. */
export type CorrectEntry = Command<
	'CorrectEntry',
	{ session: string; item: string; index: number; at: string; measure: Measure }
>;

/** What any entry is made of: an identity and a measure. */
export type AfterEntry = { item: string; index: number; measure: Measure };

/** A whole session in one shot, backdated: start, entries and finish append together. */
export type LogAfter = Command<
	'LogAfter',
	{
		session: string;
		plan: string;
		discipline: Discipline;
		/** when it began */
		startAt: string;
		/** when it ended — the entries' timestamp */
		at: string;
		entries: AfterEntry[];
	} & Workout
>;

export type FinishSession = Command<'FinishSession', { at: string }>;

export type RemoveSession = Command<'RemoveSession', { session: string; at: string }>;

export type SelectProgramme = Command<'SelectProgramme', { programme: string; at: string }>;

/** Switch a practice of the week on or off. */
export type TogglePractice = Command<'TogglePractice', { practice: PracticeId; on: boolean; at: string }>;

/** Ask a practice for so many sessions a week — and the run for so many minutes. */
export type SetGoal = Command<'SetGoal', { practice: PracticeId; at: string } & Goal>;

/** Set the rest between sets, in seconds, on the dial the Plan offers. */
export type SetRest = Command<'SetRest', { seconds: number; at: string }>;

export type LedgerCommand =
	| StartSession
	| LogEntry
	| CorrectEntry
	| LogAfter
	| FinishSession
	| RemoveSession
	| SelectProgramme
	| TogglePractice
	| SetGoal
	| SetRest;
