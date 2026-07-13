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
	}
>;

export type SessionFinished = Event<
	'SessionFinished',
	{ session: string; plan: string; day: string; at: string }
>;

export type RunLogged = Event<'RunLogged', { minutes: number; at: string }>;

export type PlanSelected = Event<'PlanSelected', { plan: string; at: string }>;

export type LedgerEvent = SessionStarted | SetLogged | SessionFinished | RunLogged | PlanSelected;
