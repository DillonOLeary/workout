import { RUN, RUN_ITEM, type LedgerEvent, type StoredEvent, type Workout } from './events';
import type { Measure } from './measure';

/**
 * The read boundary. The stream is never rewritten: a row appended in July's
 * vocabulary stays in July's vocabulary in Postgres forever. What changes is
 * the translation applied as rows are READ — every reader (the decider's fold
 * and every projection alike) sees only the current vocabulary.
 *
 * Three habits keep this the only place shape inference lives:
 *   - when a shape changes, the event's NAME changes with it (SetLogged →
 *     EntryLogged, SessionStruck → SessionRemoved), so a case here is keyed
 *     by name, never by sniffing fields — with one dated exception below
 *   - a new field is filled here with its default, so the current type can
 *     make it required (SessionStarted.mode)
 *   - an unknown name throws: a row nobody can read is a bug, not a no-op
 *
 * It is one-to-MANY: a stored RunLogged reads back as a whole backdated
 * session (started · one duration entry · finished), which is exactly what
 * logging a run after the fact writes today.
 */

/* ---------- retired shapes, kept only so the cases below can read them ---- */

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
/**
 * SessionStarted as first written: no `mode` (every live session until
 * 2026-08-25), and a run said `day: 'run'` instead of carrying a kind.
 */
type SessionStartedV1 = {
	type: 'SessionStarted';
	data: { session: string; plan: string; at: string; day?: string; kind?: 'lift' | 'run'; mode?: 'live' | 'after' };
};
/** EntryLogged and SessionFinished as first written: carrying plan/day nobody read. */
type EntryLoggedV1 = {
	type: 'EntryLogged';
	data: { session: string; item: string; index: number; at: string; measure: Measure };
};
type SessionFinishedV1 = { type: 'SessionFinished'; data: { session: string; at: string } };

/** A retired run's session id: its `at` timestamp was always its identity. */
export const runSessionId = (at: string) => `run-${at}`;

/**
 * Before the `reps` measure existed, a bodyweight set was written as a load
 * of 0. Checked against the whole stream on 2026-08-25: every zero-load rep
 * entry ever written belongs to a bodyweight exercise, and no weighted lift
 * was ever logged at 0 — so the inference is safe, and dated.
 */
const repsOrLoad = (weight: number, reps: number): Measure =>
	weight === 0 ? { of: 'reps', reps } : { of: 'load', load: weight, reps };

export function upcast(e: StoredEvent): LedgerEvent[] {
	switch (e.type) {
		case 'SessionStarted': {
			const d = (e as SessionStartedV1).data;
			// the first shape spelled a run as day: 'run' — the one sentinel, retired here
			const workout: Workout = d.kind === 'run' || d.day === 'run' ? RUN : { kind: 'lift', day: d.day ?? '' };
			return [{ type: 'SessionStarted', data: { session: d.session, plan: d.plan, at: d.at, mode: d.mode ?? 'live', ...workout } }];
		}
		case 'EntryLogged': {
			// rebuilt, not passed through: the first EntryLogged rows carried
			// plan/day, and four days of them wrote bodyweight sets as load 0
			const d = (e as EntryLoggedV1).data;
			const m = d.measure;
			const measure = m.of === 'load' && m.load === 0 ? repsOrLoad(0, m.reps) : m;
			return [{ type: 'EntryLogged', data: { session: d.session, item: d.item, index: d.index, at: d.at, measure } }];
		}
		case 'SessionFinished': {
			const d = (e as SessionFinishedV1).data;
			return [{ type: 'SessionFinished', data: { session: d.session, at: d.at } }];
		}
		case 'SessionRemoved':
		case 'PlanSelected':
			return [e as LedgerEvent];
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
					: repsOrLoad(d.weight, d.reps);
			return [{ type: 'EntryLogged', data: { session: d.session, item: d.exercise, index: d.set, at: d.at, measure } }];
		}
		case 'RunLogged': {
			const { minutes, at } = (e as RunLoggedV1).data;
			const session = runSessionId(at);
			const startAt = new Date(Date.parse(at) - minutes * 60000).toISOString();
			return [
				{ type: 'SessionStarted', data: { session, plan: '', at: startAt, mode: 'after', ...RUN } },
				{ type: 'EntryLogged', data: { session, item: RUN_ITEM, index: 1, at, measure: { of: 'duration', minutes } } },
				{ type: 'SessionFinished', data: { session, at } }
			];
		}
		case 'RunRemoved': {
			const { run, at } = (e as RunRemovedV1).data;
			return [{ type: 'SessionRemoved', data: { session: runSessionId(run), at } }];
		}
		default:
			throw new Error(`Unknown event type "${e.type}" — add a case to upcast.ts.`);
	}
}

/** Every event in current vocabulary — the read boundary calls this once. */
export const upcastAll = (events: StoredEvent[]): LedgerEvent[] => events.flatMap(upcast);
