import type { Event } from '@event-driven-io/emmett';
import type { Measure } from './measure';

/**
 * The five facts this app can record — the vocabulary. Note the tense: every
 * name is past tense because an event is something that already happened —
 * it can be appended, never edited. (Corrections are new events, not UPDATEs.)
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
 *     `plan` and `day` live on SessionStarted alone; an entry and the finish
 *     name their session, and the session says the rest.
 *
 * Each event carries its own `at` timestamp in `data` so projections never
 * depend on store-specific metadata.
 */

/**
 * What a session IS: one of the plan's lift days, or the run. A closed
 * union, so "is this a run?" has one answer everywhere — no sentinel day
 * key, no "any duration entry counts".
 */
export type Workout = { kind: 'lift'; day: string } | { kind: 'run' };
export const RUN: Workout = { kind: 'run' };
export const lift = (day: string): Workout => ({ kind: 'lift', day });
/** Just the workout, from anything that carries one (an event's data, a command's). */
export const workoutOf = (w: Workout): Workout => (w.kind === 'run' ? RUN : { kind: 'lift', day: w.day });
/** A workout from a form: kind=run, or kind=lift with a day. */
export function parseWorkout(kind: unknown, day: unknown): Workout | null {
	if (kind === 'run') return RUN;
	if (kind === 'lift' && typeof day === 'string' && day) return { kind: 'lift', day };
	return null;
}

export type SessionStarted = Event<
	'SessionStarted',
	{
		session: string;
		plan: string;
		at: string;
		/** 'live' = the floor walked it; 'after' = written in one shot, backdated */
		mode: 'live' | 'after';
	} & Workout
>;

export type EntryLogged = Event<
	'EntryLogged',
	{
		session: string;
		/** what the plan calls it: an exercise name, 'Run', 'Warm-up', 'Cooldown' */
		item: string;
		/** set number, or the step's ordinal within its item — with `item`, the entry's identity */
		index: number;
		at: string;
		measure: Measure;
	}
>;

export type SessionFinished = Event<'SessionFinished', { session: string; at: string }>;

/**
 * The event-sourced "delete": nothing leaves the stream — removal is itself
 * a fact, appended like any other. Projections exclude removed items; the
 * raw history keeps them forever.
 */
export type SessionRemoved = Event<'SessionRemoved', { session: string; at: string }>;

export type PlanSelected = Event<'PlanSelected', { plan: string; at: string }>;

export type LedgerEvent =
	| SessionStarted
	| EntryLogged
	| SessionFinished
	| SessionRemoved
	| PlanSelected;

/**
 * A row as the store hands it back: any name, any shape. The upcaster's
 * input — nothing else in the domain should have to touch one.
 */
export type StoredEvent = { type: string; data: unknown };

/** The item a run's duration entry is logged under. */
export const RUN_ITEM = 'Run';
/** Prep items — steps that are tracked, but never a ledger line. */
export const WARMUP_ITEM = 'Warm-up';
export const COOLDOWN_ITEM = 'Cooldown';

/** An entry's identity within its session: the plan's name for it, and which one. */
export const entryKey = (item: string, index: number) => `${item}#${index}`;
