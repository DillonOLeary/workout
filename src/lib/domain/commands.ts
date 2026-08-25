import type { Command } from '@event-driven-io/emmett';
import type { Measure } from './events';

/**
 * Commands are requests in the imperative ("StartSession") — they can be
 * rejected. Events are facts in the past tense ("SessionStarted") — they
 * cannot. The decider (decider.ts) is the judge between the two.
 *
 * Anything non-deterministic (ids, timestamps) is generated at the edge —
 * in the form actions — and passed IN, so the decider stays a pure function.
 */
export type StartSession = Command<
	'StartSession',
	{ sessionId: string; plan: string; day: string; at: string }
>;

/** One entry, live, into the session in progress. */
export type LogEntry = Command<
	'LogEntry',
	{
		session: string;
		plan: string;
		day: string;
		item: string;
		index: number;
		at: string;
		measure: Measure;
	}
>;

/** What an after-the-fact session contains: the same identity + measure as a live entry. */
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
		sessionId: string;
		plan: string;
		day: string;
		/** when it began */
		startAt: string;
		/** when it ended — the entries' timestamp */
		at: string;
		entries: AfterEntry[];
	}
>;

export type FinishSession = Command<'FinishSession', { at: string }>;

export type RemoveSession = Command<'RemoveSession', { session: string; at: string }>;

export type SelectPlan = Command<'SelectPlan', { plan: string; at: string }>;

export type LedgerCommand =
	| StartSession
	| LogEntry
	| LogAfter
	| FinishSession
	| RemoveSession
	| SelectPlan;
