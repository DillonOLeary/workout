import { IllegalStateError, ValidationError } from '@event-driven-io/emmett';
import type { LedgerCommand } from './commands';
import { entryKey, workoutOf, type LedgerEvent, type StoredEvent } from './events';
import { normaliseMeasure, validateMeasure } from './measure';
import { upcast } from './upcast';

/**
 * The decider: the write-side of the app in three pure functions.
 *
 *   initialState()        — where every stream begins
 *   evolve(state, event)  — how one recorded fact changes state
 *   decide(command, state)— which new facts a request produces (or throws)
 *
 * Emmett's DeciderCommandHandler (src/lib/server/ledger.ts) glues them to the
 * event store: read stream → fold with evolve → decide → append the result
 * with optimistic concurrency. We never store this state — it is rebuilt
 * from events on every command, which is the whole point.
 *
 * State holds only what the RULES need (is a session open? which is the
 * latest? which entries has each got? which plan is active?). Everything a
 * screen needs lives in projections.ts instead — including what a session IS.
 *
 * The decider validates SHAPE, never meaning: it does not know the plan, so
 * it cannot say whether "Goblet Squat #4" is a set the day asked for. The
 * plan says what an entry means; the decider says whether it can be recorded.
 *
 * This file owns every "no". A screen never pre-checks a rule; it hides
 * what the decider would refuse, and the decider refuses it anyway.
 */
export type LedgerState = {
	/** the one live slot: the session the floor is walking, if any */
	activeSession: string | null;
	activePlanId: string | null;
	/**
	 * every session ever started (runs included), in the order it was started.
	 * RemoveSession refuses an unknown id; the last one not removed is the
	 * LATEST — the only finished session a set can still be corrected in.
	 */
	started: string[];
	/** already removed — removing twice is a no-op, not an error */
	removedSessions: Record<string, true>;
	/**
	 * every entry that landed, by session then identity. A repeat is a no-op,
	 * not a duplicate; a correction needs an original to correct.
	 */
	logged: Record<string, Record<string, true>>;
};

export const initialState = (): LedgerState => ({
	activeSession: null,
	activePlanId: null,
	started: [],
	removedSessions: {},
	logged: {}
});

/** The latest session: the most recent start that hasn't been removed. */
export function latestSessionOf(state: LedgerState): string | null {
	for (let i = state.started.length - 1; i >= 0; i--) {
		const id = state.started[i];
		if (!state.removedSessions[id]) return id;
	}
	return null;
}

function evolveOne(state: LedgerState, event: LedgerEvent): LedgerState {
	const { type, data } = event;
	switch (type) {
		case 'SessionStarted': {
			const started = [...state.started, data.session];
			const logged = { ...state.logged, [data.session]: state.logged[data.session] ?? {} };
			// A start opens the floor only when nothing is open. That is the
			// whole rule: a backdated session (LogAfter) is started, filled and
			// finished in one append, so it opens and closes inside one fold —
			// and while a live session is open it never takes the slot at all.
			if (state.activeSession) return { ...state, started, logged };
			return { ...state, started, logged, activeSession: data.session };
		}
		case 'EntryLogged': {
			const forSession = state.logged[data.session];
			if (!forSession) return state;
			return {
				...state,
				logged: { ...state.logged, [data.session]: { ...forSession, [entryKey(data.item, data.index)]: true } }
			};
		}
		case 'EntryCorrected':
			// the identity was already logged — a correction changes what a
			// reader sees, never what a rule needs
			return state;
		case 'SessionFinished':
			return state.activeSession === data.session ? { ...state, activeSession: null } : state;
		case 'SessionRemoved':
			return {
				...state,
				removedSessions: { ...state.removedSessions, [data.session]: true },
				// removing an in-progress session also abandons it
				activeSession: state.activeSession === data.session ? null : state.activeSession
			};
		case 'PlanSelected':
			return { ...state, activePlanId: data.plan };
	}
}

/**
 * The store replays RAW history — retired names included — so the upcaster
 * runs here, at the fold boundary, before any rule sees the event. One
 * stored row can read back as several facts (a RunLogged is a whole
 * session), which is why this folds a list.
 */
export const evolve = (state: LedgerState, event: StoredEvent): LedgerState =>
	upcast(event).reduce(evolveOne, state);

const isInt = (n: unknown): n is number => Number.isInteger(n);

/** A pick is a list of names, or nothing — never an empty list, never a stray field. */
function parsePick(pick: unknown): string[] | undefined {
	if (pick === undefined) return undefined;
	if (!Array.isArray(pick) || !pick.length || !pick.every((n) => typeof n === 'string' && n))
		throw new ValidationError('A pick is a list of exercise names.');
	return pick;
}

export const decide = (command: LedgerCommand, state: LedgerState): LedgerEvent[] => {
	switch (command.type) {
		case 'StartSession': {
			if (state.activeSession)
				throw new IllegalStateError('A session is already in progress — finish it first.');
			const { session, plan, at } = command.data;
			const pick = parsePick(command.data.pick);
			return [
				{
					type: 'SessionStarted',
					data: { session, plan, at, mode: 'live', ...(pick ? { pick } : {}), ...workoutOf(command.data) }
				}
			];
		}

		case 'LogEntry': {
			const { session, item, index, measure } = command.data;
			if (!state.activeSession || state.activeSession !== session)
				throw new IllegalStateError('No session in progress — start one from Today.');
			if (!item || !isInt(index) || index < 1) throw new ValidationError('Entry has no identity.');
			validateMeasure(measure);
			// Same identity = this entry already landed (a retried request or a
			// double-press). Recording nothing makes retries idempotent.
			if (state.logged[session]?.[entryKey(item, index)]) return [];
			return [{ type: 'EntryLogged', data: { ...command.data, measure: normaliseMeasure(measure) } }];
		}

		case 'CorrectEntry': {
			const { session, item, index, measure } = command.data;
			// The two rules that protect history: only the session you are in,
			// or the last one you finished, can change — the rule has already
			// read everything older, and rewriting it would silently change
			// what the next suggestion was based on.
			if (session !== state.activeSession && session !== latestSessionOf(state))
				throw new IllegalStateError('Only the latest session can be changed.');
			if (!item || !isInt(index) || index < 1) throw new ValidationError('Entry has no identity.');
			if (!state.logged[session]?.[entryKey(item, index)])
				throw new IllegalStateError('Nothing logged there to correct.');
			validateMeasure(measure);
			return [{ type: 'EntryCorrected', data: { ...command.data, measure: normaliseMeasure(measure) } }];
		}

		case 'LogAfter': {
			const { session, plan, startAt, at, entries } = command.data;
			if (!entries.length) throw new ValidationError('Nothing to log.');
			if (state.started.includes(session)) throw new IllegalStateError('That session is already in the ledger.');
			if (Date.parse(startAt) > Date.parse(at)) throw new ValidationError('A session cannot end before it starts.');
			const seen = new Set<string>();
			for (const en of entries) {
				if (!en.item || !isInt(en.index) || en.index < 1) throw new ValidationError('Entry has no identity.');
				const key = entryKey(en.item, en.index);
				if (seen.has(key)) throw new ValidationError(`"${en.item}" ${en.index} is listed twice.`);
				seen.add(key);
				validateMeasure(en.measure);
			}
			return [
				{ type: 'SessionStarted', data: { session, plan, at: startAt, mode: 'after', ...workoutOf(command.data) } },
				...entries.map(
					(en): LedgerEvent => ({
						type: 'EntryLogged',
						data: { session, item: en.item, index: en.index, at, measure: normaliseMeasure(en.measure) }
					})
				),
				{ type: 'SessionFinished', data: { session, at } }
			];
		}

		case 'FinishSession': {
			const s = state.activeSession;
			if (!s) throw new IllegalStateError('No session in progress.');
			return [{ type: 'SessionFinished', data: { session: s, at: command.data.at } }];
		}

		case 'RemoveSession': {
			// Removal is allowed on ANY session, not just the latest: it is a
			// rare, deliberate act, and nothing is lost — SessionRemoved is a
			// fact about a fact, and the events it hides stay in the stream.
			// (Corrections are latest-only; removing and re-logging is how an
			// older session gets fixed.)
			const { session, at } = command.data;
			if (!state.started.includes(session)) throw new IllegalStateError('No such session in this ledger.');
			if (state.removedSessions[session]) return []; // already removed — idempotent
			return [{ type: 'SessionRemoved', data: { session, at } }];
		}

		case 'SelectPlan': {
			// Selecting the already-active plan records nothing: deciders may
			// return zero events, which makes retries naturally idempotent.
			if (state.activePlanId === command.data.plan) return [];
			return [{ type: 'PlanSelected', data: { plan: command.data.plan, at: command.data.at } }];
		}
	}
};

/** Rebuild decision state from history — the UI asks this "is a session open?" */
export const currentState = (events: StoredEvent[]): LedgerState =>
	events.reduce(evolve, initialState());
