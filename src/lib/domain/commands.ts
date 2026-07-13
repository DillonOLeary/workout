import type { Command } from '@event-driven-io/emmett';

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

export type LogSet = Command<
	'LogSet',
	{
		session: string;
		plan: string;
		day: string;
		exercise: string;
		weight: number;
		reps: number;
		set: number;
		at: string;
		unit?: 'reps' | 's';
	}
>;

export type FinishSession = Command<'FinishSession', { at: string }>;

export type StrikeSession = Command<'StrikeSession', { session: string; at: string }>;

export type LogRun = Command<'LogRun', { minutes: number; at: string }>;

export type SelectPlan = Command<'SelectPlan', { plan: string; at: string }>;

export type LedgerCommand =
	| StartSession
	| LogSet
	| FinishSession
	| StrikeSession
	| LogRun
	| SelectPlan;
