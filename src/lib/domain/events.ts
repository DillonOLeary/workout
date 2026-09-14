import type { Event } from '@event-driven-io/emmett';
import type { Measure } from './measure';
import type { Discipline } from './plan';
import type { Equipment, Intent } from './preferences';

/**
 * The seven facts this app can record — the vocabulary. Note the tense: every
 * name is past tense because an event is something that already happened —
 * it can be appended, never edited. (A correction is itself a new event —
 * EntryCorrected — not an UPDATE of the one it corrects.)
 *
 * A workout is a SESSION: an ordered list of ENTRIES, each carrying one
 * MEASURE (measure.ts). A lift is a session of sets; a run is a session with
 * one duration entry; a warm-up step is an entry too. Guided or logged after
 * the fact is only WHEN the events are written — the shapes are the same.
 *
 * Two rules keep this file honest:
 *   - it describes the CURRENT shape only. Whatever older shapes the stream
 *     still holds are translated on the way in (upcast.ts), so no field here
 *     is optional merely because old rows lack it.
 *   - an event carries what a reader needs and nothing a reader never uses.
 *     `plan`, the routine and the discipline live on SessionStarted alone; an
 *     entry and the finish name their session, and the session says the rest.
 *
 * Each event carries its own `at` timestamp in `data` so projections never
 * depend on store-specific metadata.
 */

/**
 * What a session IS: the routine it ran. That is the whole address — the run
 * is a routine like any other, so there is no second arm and no sentinel.
 */
export type Workout = { routine: string };
/** Just the workout, from anything that carries one (an event's data, a command's). */
export const workoutOf = (w: Workout): Workout => ({ routine: w.routine });
/** A workout from a form: the routine key, or nothing. */
export function parseWorkout(routine: unknown): Workout | null {
	return typeof routine === 'string' && routine ? { routine } : null;
}

export type SessionStarted = Event<
	'SessionStarted',
	{
		session: string;
		plan: string;
		at: string;
		/** 'live' = the floor walked it; 'after' = written in one shot, backdated */
		mode: 'live' | 'after';
		/**
		 * What this was, forever. Stamped when the session starts, never looked
		 * up later from the plan: plan rows are upserted with no history, so a
		 * routine retired in March must not quietly rewrite what January was.
		 */
		discipline: Discipline;
	} & Workout
>;

export type EntryLogged = Event<
	'EntryLogged',
	{
		session: string;
		/** what the plan calls it: an exercise name, 'Warm-up', 'Cooldown' */
		item: string;
		/** set number, or the step's ordinal within its item — with `item`, the entry's identity */
		index: number;
		at: string;
		measure: Measure;
	}
>;

/**
 * A set you fixed: the same identity as the entry it corrects, and the
 * measure it should have carried. The original stays in the stream; every
 * reader takes the last word. The decider allows this on the latest session
 * only — older sets have already been read by the rule.
 */
export type EntryCorrected = Event<
	'EntryCorrected',
	{ session: string; item: string; index: number; at: string; measure: Measure }
>;

export type SessionFinished = Event<'SessionFinished', { session: string; at: string }>;

/**
 * The event-sourced "delete": nothing leaves the stream — removal is itself
 * a fact, appended like any other. Projections exclude removed items; the
 * raw history keeps them forever.
 */
export type SessionRemoved = Event<'SessionRemoved', { session: string; at: string }>;

export type PlanSelected = Event<'PlanSelected', { plan: string; at: string }>;

/**
 * What you told the app about yourself — an event, not a settings row,
 * because "you said you wanted to run better six weeks ago and have run
 * twice" is only sayable if the statement has a date. A full snapshot each
 * time; the last one wins. Two fields, because each has one exact effect on
 * the queue: intents weight a cycle up, equipment rules one out. It never
 * writes an exercise.
 */
export type PreferencesSet = Event<
	'PreferencesSet',
	{ at: string; intents: Intent[]; equipment: Equipment[] }
>;

export type LedgerEvent =
	| SessionStarted
	| EntryLogged
	| EntryCorrected
	| SessionFinished
	| SessionRemoved
	| PlanSelected
	| PreferencesSet;

/**
 * A row as the store hands it back: any name, any shape. The upcaster's
 * input — nothing else in the domain should have to touch one.
 */
export type StoredEvent = { type: string; data: unknown };

/** The item a retired RunLogged's minutes read back under (upcast.ts); a live run logs under its exercise name. */
export const RUN_ITEM = 'Run';
/** Prep items — steps that are tracked, but never a ledger line. */
export const WARMUP_ITEM = 'Warm-up';
export const COOLDOWN_ITEM = 'Cooldown';

/** An entry's identity within its session: the plan's name for it, and which one. */
export const entryKey = (item: string, index: number) => `${item}#${index}`;
