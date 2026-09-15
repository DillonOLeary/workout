import type { LedgerEvent, StoredEvent } from './events';
import type { Measure } from './measure';
import { BLOCK_IDS, type BlockId, type Discipline } from './plan';

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
 *     make it required (SessionStarted.mode, SessionStarted.discipline)
 *   - an unknown name throws: a row nobody can read is a bug, not a no-op
 *
 * It is one-to-MANY: a stored RunLogged reads back as a whole backdated
 * session (started · one duration entry · finished), which is exactly what
 * logging a run after the fact writes today.
 *
 * Every case below is backed by rows. Counted in the store on 2026-09-14
 * (tools/stream/forensics.sql, query 6):
 *   SetLogged 288 (56 timed, 71 at weight 0) · RunLogged 22 · RunRemoved 2 ·
 *   SessionStruck 7 · SessionStarted 121, none carrying `discipline` — 66
 *   without `mode`, 26 spelling the run as day: 'run' or kind: 'run', the
 *   rest keyed by `day` under the three shipped plans in the table below ·
 *   EntryLogged carrying plan/day 77, at load 0 4 · PlanSelected 40.
 * Delete a case only when its count is zero — and count again first.
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
 * 2026-08-25); a run said `day: 'run'`, then `kind: 'run'`, before the run
 * became a routine; the workout was a `day` until it was a `routine`; and no
 * row before 2026-09-14 says what discipline it was.
 */
type SessionStartedV1 = {
	type: 'SessionStarted';
	data: {
		session: string; plan: string; at: string;
		day?: string; kind?: 'lift' | 'run'; routine?: string; mode?: 'live' | 'after'; discipline?: Discipline;
	};
};
/** EntryLogged and SessionFinished as first written: carrying plan/day nobody read. */
type EntryLoggedV1 = {
	type: 'EntryLogged';
	data: { session: string; item: string; index: number; at: string; measure: Measure };
};
type SessionFinishedV1 = { type: 'SessionFinished'; data: { session: string; at: string } };
/** A plan was the unit a person chose, until the week became a programme plus blocks (2026-09-14). */
type PlanSelectedV1 = { type: 'PlanSelected'; data: { plan: string; at: string } };

/** A retired run's session id: its `at` timestamp was always its identity. */
export const runSessionId = (at: string) => `run-${at}`;
/** The item a retired RunLogged's minutes read back under. A live run logs under its exercise's name. */
const RETIRED_RUN_ITEM = 'Run';

/**
 * What a session written before 2026-09-14 WAS. Those rows carry a `day`
 * key and no discipline, and every one of the 121 was written under a
 * shipped plan — this is what each plan said its keys were on the day the
 * row was written. A table, deliberately, not a lookup into the live plans:
 * plan rows are upserted with no history, and a routine renamed or retired
 * later (Hold Steady, 2026-09-14) must never rewrite what a session was.
 * An unknown pair reads as a lift, which no row needs today.
 */
const DISCIPLINE_BEFORE_2026_09_14: Record<string, Record<string, Discipline>> = {
	'ab-fullbody-v1': { A: 'lift', B: 'lift', S: 'mobility', run: 'run' },
	'her-12-v1': { '1': 'lift', '2': 'lift', run: 'run' },
	'yoga-2day-v1': { '1': 'yoga', '2': 'yoga' }
};

/**
 * What choosing a plan MEANT, now that the week is one lift programme plus
 * the blocks that are on: the programme it was, and its blocks switched on
 * (and the ones it lacked, off). Hold Steady had no lifting of its own —
 * choosing it was its blocks only; the programme stays whatever it was. An
 * unknown id (no row needs this) reads as a programme with no blocks said.
 */
const WEEK_OF_PLAN: Record<string, { programme?: string; on: Partial<Record<BlockId, boolean>> }> = {
	'ab-fullbody-v1': { programme: 'ab-fullbody-v1', on: { yoga: true, mob: true, run: true } },
	'her-12-v1': { programme: 'her-12-v1', on: { yoga: false, mob: false, run: true } },
	'yoga-2day-v1': { on: { yoga: true, mob: false, run: false } }
};

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
			// the first shapes spelled a run as day: 'run', then as kind: 'run' —
			// both retired here: the run is the routine called 'run'
			const isRun = d.kind === 'run' || d.day === 'run';
			const routine = isRun ? 'run' : (d.routine ?? d.day ?? '');
			const discipline: Discipline =
				d.discipline ?? (isRun ? 'run' : (DISCIPLINE_BEFORE_2026_09_14[d.plan]?.[routine] ?? 'lift'));
			return [{ type: 'SessionStarted', data: { session: d.session, plan: d.plan, at: d.at, mode: d.mode ?? 'live', discipline, routine } }];
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
		case 'EntryCorrected':
		case 'SessionRemoved':
		case 'ProgrammeSelected':
		case 'BlockToggled':
		case 'PreferencesSet':
			return [e as LedgerEvent];
		case 'PlanSelected': {
			// one-to-many: a plan chosen is a programme chosen and its blocks switched
			const { plan, at } = (e as PlanSelectedV1).data;
			const week = WEEK_OF_PLAN[plan] ?? { programme: plan, on: {} };
			const out: LedgerEvent[] = [];
			if (week.programme) out.push({ type: 'ProgrammeSelected', data: { programme: week.programme, at } });
			for (const block of BLOCK_IDS) {
				const on = week.on[block];
				if (on !== undefined) out.push({ type: 'BlockToggled', data: { block, on, at } });
			}
			return out;
		}
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
				{ type: 'SessionStarted', data: { session, plan: '', at: startAt, mode: 'after', discipline: 'run', routine: 'run' } },
				{ type: 'EntryLogged', data: { session, item: RETIRED_RUN_ITEM, index: 1, at, measure: { of: 'duration', minutes } } },
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
