import type { Event } from '@event-driven-io/emmett';

/**
 * The five facts this app can record. Note the tense: every name is past
 * tense because an event is something that already happened — it can be
 * appended, never edited. (Corrections are new events, not UPDATEs.)
 *
 * Each event carries its own `at` timestamp in `data` so projections never
 * depend on store-specific metadata.
 */
export type SessionStarted = Event<
	'SessionStarted',
	{ session: string; plan: string; day: string; at: string }
>;

export type SetLogged = Event<
	'SetLogged',
	{
		session: string;
		plan: string;
		day: string;
		exercise: string;
		weight: number;
		/** the count — reps, or seconds held when unit is 's' */
		reps: number;
		set: number;
		at: string;
		/**
		 * Self-describing unit; absent means reps. Schema evolution rule:
		 * never repurpose an old field's meaning — ADD a field with a default
		 * that matches what old events meant, so history replays unchanged.
		 */
		unit?: 'reps' | 's';
		/** timed holds: the bell you aimed for (reps holds the seconds achieved) */
		target?: number;
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
 *
 * (This event was born as `SessionStruck`. The rename to match the UI's
 * ubiquitous language is handled by upcastLedgerEvent below — old events
 * keep their stored name forever and are translated at read time.)
 */
export type SessionRemoved = Event<'SessionRemoved', { session: string; at: string }>;

export type RunLogged = Event<'RunLogged', { minutes: number; at: string }>;

/** Runs carry no id — their `at` timestamp is their natural identity. */
export type RunRemoved = Event<'RunRemoved', { run: string; at: string }>;

export type PlanSelected = Event<'PlanSelected', { plan: string; at: string }>;

export type LedgerEvent =
	| SessionStarted
	| SetLogged
	| SessionFinished
	| SessionRemoved
	| RunLogged
	| RunRemoved
	| PlanSelected;

/**
 * The upcaster: translates retired event names into current ones as events
 * are read. The stream itself is never rewritten — `SessionStruck` rows stay
 * `SessionStruck` in Postgres forever; every reader (decider fold and
 * projections alike) sees only the current vocabulary. Add a line here each
 * time the ubiquitous language moves on.
 */
export function upcastLedgerEvent(e: { type: string; data: unknown }): LedgerEvent {
	if (e.type === 'SessionStruck')
		return { type: 'SessionRemoved', data: e.data } as SessionRemoved;
	return e as LedgerEvent;
}
