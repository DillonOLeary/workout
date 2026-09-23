import type { Event } from '@event-driven-io/emmett';
import type { Measure } from './measure';
import type { Goal, PracticeId, Discipline } from './plan';

/** What a session is: the routine it ran — the whole address. */
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
		/** stamped when the session starts, never looked up from the plan later */
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

/** A set you fixed: the same identity as the entry it corrects, and the measure it should have carried. */
export type EntryCorrected = Event<
	'EntryCorrected',
	{ session: string; item: string; index: number; at: string; measure: Measure }
>;

export type SessionFinished = Event<'SessionFinished', { session: string; at: string }>;

/** Removal is itself a fact: nothing leaves the stream; projections exclude the session. */
export type SessionRemoved = Event<'SessionRemoved', { session: string; at: string }>;

/** You switched the lifting to another programme. The blocks stay as they were. */
export type ProgrammeSelected = Event<'ProgrammeSelected', { programme: string; at: string }>;

/** You switched a practice of the week on or off — a fact with a date, so the Ledger can say when the week changed. Stored under its first name, and the field is still `block`. */
export type BlockToggled = Event<'BlockToggled', { block: PracticeId; on: boolean; at: string }>;

/** You set a practice's goal: sessions a week, and the run's minutes — over the programme's own cadence. */
export type GoalSet = Event<'GoalSet', { practice: PracticeId; at: string } & Goal>;

/** You set the rest between sets — a programme constant until the Plan made it a person's setting (2026-09-22). */
export type RestSet = Event<'RestSet', { seconds: number; at: string }>;

export type LedgerEvent =
	| SessionStarted
	| EntryLogged
	| EntryCorrected
	| SessionFinished
	| SessionRemoved
	| ProgrammeSelected
	| BlockToggled
	| GoalSet
	| RestSet;

/** A row as the store hands it back: any name, any shape — the upcaster's input. */
export type StoredEvent = { type: string; data: unknown };

/** Prep items — steps that are tracked, but never a ledger line. */
export const WARMUP_ITEM = 'Warm-up';
export const COOLDOWN_ITEM = 'Cooldown';

/** An entry's identity within its session: the plan's name for it, and which one. */
export const entryKey = (item: string, index: number) => `${item}#${index}`;
