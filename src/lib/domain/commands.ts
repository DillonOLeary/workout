import type { Command } from '@event-driven-io/emmett';
import type { Workout } from './events';
import type { Measure } from './measure';
import type { BlockId, Discipline } from './plan';
import type { Equipment, Intent } from './preferences';

/**
 * Commands are requests in the imperative ("StartSession") — they can be
 * rejected. Events are facts in the past tense ("SessionStarted") — they
 * cannot. The decider (decider.ts) is the judge between the two.
 *
 * Anything non-deterministic (ids, timestamps) is generated at the edge —
 * in the form actions — and passed IN, so the decider stays a pure function.
 * So is the discipline: the action reads it off the plan the routine belongs
 * to, and the session carries it from then on.
 */
export type StartSession = Command<
	'StartSession',
	{ session: string; plan: string; at: string; discipline: Discipline } & Workout
>;

/** One entry, live, into the session in progress. */
export type LogEntry = Command<
	'LogEntry',
	{ session: string; item: string; index: number; at: string; measure: Measure }
>;

/**
 * Fix an entry that already landed — the same identity, a new measure.
 * Allowed on the session in progress and on the latest one; anything older
 * is history, and the decider says so.
 */
export type CorrectEntry = Command<
	'CorrectEntry',
	{ session: string; item: string; index: number; at: string; measure: Measure }
>;

/** What any entry is made of: an identity and a measure. */
export type AfterEntry = { item: string; index: number; measure: Measure };

/**
 * A whole session in one shot, backdated: your run, or a lift you did
 * without the phone out. Start, entries and finish append together; the
 * session is closed before anyone sees it, so it never competes with a
 * session in progress.
 */
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

/** Switch a block of the week on or off. */
export type ToggleBlock = Command<'ToggleBlock', { block: BlockId; on: boolean; at: string }>;

/** The whole snapshot, every time: what you're after, and what you've got. */
export type SetPreferences = Command<'SetPreferences', { at: string; intents: Intent[]; equipment: Equipment[] }>;

export type LedgerCommand =
	| StartSession
	| LogEntry
	| CorrectEntry
	| LogAfter
	| FinishSession
	| RemoveSession
	| SelectProgramme
	| ToggleBlock
	| SetPreferences;
