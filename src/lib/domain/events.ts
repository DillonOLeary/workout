import type { Event } from '@event-driven-io/emmett';

/**
 * The five facts this app can record. Note the tense: every name is past
 * tense because an event is something that already happened — it can be
 * appended, never edited. (Corrections are new events, not UPDATEs.)
 *
 * A workout is a SESSION: an ordered list of ENTRIES, each carrying one
 * MEASURE. A lift is a session of sets; a run is a session with one
 * duration entry; a warm-up step is an entry too. Guided or logged after
 * the fact is only WHEN the events are written — the shapes are the same.
 *
 * Each event carries its own `at` timestamp in `data` so projections never
 * depend on store-specific metadata.
 */

/**
 * What an entry measured — a closed set, so the decider can validate each
 * variant exhaustively instead of branching on optional fields.
 *   load     — a weighted set: the load and the reps (load 0 = bodyweight reps)
 *   hold     — a timed hold: seconds held, the bell aimed for, any load carried
 *   duration — minutes (a run)
 *   step     — it happened (a warm-up line, a cooldown stretch, a walk)
 */
export type Measure =
	| { of: 'load'; load: number; reps: number }
	| { of: 'hold'; seconds: number; target?: number; load?: number }
	| { of: 'duration'; minutes: number }
	| { of: 'step' };

export type SessionStarted = Event<
	'SessionStarted',
	{
		session: string;
		plan: string;
		day: string;
		at: string;
		/**
		 * absent = 'live': the floor is walking this session now. 'after' =
		 * written in one shot, backdated — it was never open, so it never
		 * touches "the session in progress".
		 */
		mode?: 'live' | 'after';
	}
>;

export type EntryLogged = Event<
	'EntryLogged',
	{
		session: string;
		plan: string;
		day: string;
		/** what the plan calls it: an exercise name, 'Run', 'Warm-up', 'Cooldown' */
		item: string;
		/** set number, or the step's ordinal within its item — with `item`, the entry's identity */
		index: number;
		at: string;
		measure: Measure;
	}
>;

export type SessionFinished = Event<
	'SessionFinished',
	{ session: string; plan: string; day: string; at: string }
>;

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

/** The day key every run session uses — a plan's days never use it. */
export const RUN_DAY = 'run';
/** The item a run's duration entry is logged under. */
export const RUN_ITEM = 'Run';
/** Prep items — steps that are tracked, but never a ledger line. */
export const WARMUP_ITEM = 'Warm-up';
export const COOLDOWN_ITEM = 'Cooldown';

/** An entry's identity within its session: the plan's name for it, and which one. */
export const entryKey = (item: string, index: number) => `${item}#${index}`;

/* ---------- retired shapes, kept only so the upcaster can read them ----- */

type SetLoggedV1 = {
	type: 'SetLogged';
	data: {
		session: string; plan: string; day: string; exercise: string;
		weight: number; reps: number; set: number; at: string;
		unit?: 'reps' | 's'; target?: number;
	};
};
type RunLoggedV1 = { type: 'RunLogged'; data: { minutes: number; at: string } };
type RunRemovedV1 = { type: 'RunRemoved'; data: { run: string; at: string } };
type SessionStruckV1 = { type: 'SessionStruck'; data: { session: string; at: string } };
export type RetiredEvent = SetLoggedV1 | RunLoggedV1 | RunRemovedV1 | SessionStruckV1;

/** A retired run's session id: its `at` timestamp was always its identity. */
export const runSessionId = (at: string) => `run-${at}`;

/**
 * The upcaster: translates retired event shapes into current ones as events
 * are read. The stream itself is never rewritten — `SetLogged` rows stay
 * `SetLogged` in Postgres forever; every reader (decider fold and
 * projections alike) sees only the current vocabulary.
 *
 * It is one-to-MANY: a `RunLogged` reads back as a whole backdated session
 * (started, one duration entry, finished), which is exactly what logging a
 * run after the fact writes today. Add a case here each time the ubiquitous
 * language moves on.
 */
export function upcastLedgerEvents(e: { type: string; data: unknown }): LedgerEvent[] {
	switch (e.type) {
		case 'SessionStruck':
			return [{ type: 'SessionRemoved', data: (e as SessionStruckV1).data }];
		case 'SetLogged': {
			const d = (e as SetLoggedV1).data;
			const measure: Measure =
				d.unit === 's'
					? {
							of: 'hold',
							seconds: d.reps,
							...(d.target !== undefined ? { target: d.target } : {}),
							...(d.weight > 0 ? { load: d.weight } : {})
						}
					: { of: 'load', load: d.weight, reps: d.reps };
			return [
				{
					type: 'EntryLogged',
					data: { session: d.session, plan: d.plan, day: d.day, item: d.exercise, index: d.set, at: d.at, measure }
				}
			];
		}
		case 'RunLogged': {
			const { minutes, at } = (e as RunLoggedV1).data;
			const session = runSessionId(at);
			const startAt = new Date(Date.parse(at) - minutes * 60000).toISOString();
			return [
				{ type: 'SessionStarted', data: { session, plan: '', day: RUN_DAY, at: startAt, mode: 'after' } },
				{
					type: 'EntryLogged',
					data: { session, plan: '', day: RUN_DAY, item: RUN_ITEM, index: 1, at, measure: { of: 'duration', minutes } }
				},
				{ type: 'SessionFinished', data: { session, plan: '', day: RUN_DAY, at } }
			];
		}
		case 'RunRemoved': {
			const { run, at } = (e as RunRemovedV1).data;
			return [{ type: 'SessionRemoved', data: { session: runSessionId(run), at } }];
		}
		default:
			return [e as LedgerEvent];
	}
}

/** Every event in current vocabulary — the read boundary calls this once. */
export const upcastAll = (events: { type: string; data: unknown }[]): LedgerEvent[] =>
	events.flatMap(upcastLedgerEvents);
