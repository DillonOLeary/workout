import type { Command } from '@event-driven-io/emmett';
import type { Workout } from './events';
import type { Measure } from './measure';

/**
 * Commands are requests in the imperative ("StartSession") — they can be
 * rejected. Events are facts in the past tense ("SessionStarted") — they
 * cannot. The decider (decider.ts) is the judge between the two.
 *
 * Anything non-deterministic (ids, timestamps) is generated at the edge —
 * in the form actions — and passed IN, so the decider stays a pure function.
 */
export type StartSession = Command<'StartSession', { session: string; plan: string; at: string } & Workout>;

/** One entry, live, into the session in progress. */
export type LogEntry = Command<
	'LogEntry',
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
		/** when it began */
		startAt: string;
		/** when it ended — the entries' timestamp */
		at: string;
		entries: AfterEntry[];
	} & Workout
>;

export type FinishSession = Command<'FinishSession', { at: string }>;

export type RemoveSession = Command<'RemoveSession', { session: string; at: string }>;

export type SelectPlan = Command<'SelectPlan', { plan: string; at: string }>;

export type LedgerCommand = StartSession | LogEntry | LogAfter | FinishSession | RemoveSession | SelectPlan;
