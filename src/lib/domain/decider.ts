import { IllegalStateError, ValidationError } from '@event-driven-io/emmett';
import type { LedgerCommand } from './commands';
import { entryKey, type LedgerEvent, type StoredEvent } from './events';
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
 * State holds only what the RULES need (is a session open? which entries
 * has it got? which plan is active?). Everything a screen needs lives in
 * projections.ts instead — including what the open session IS.
 *
 * The decider validates SHAPE, never meaning: it does not know the plan, so
 * it cannot say whether "Goblet Squat #4" is a set the day asked for. The
 * plan says what an entry means; the decider says whether it can be recorded.
 */
export type ActiveSession = {
	id: string;
	/** every entry already landed, by identity — a repeat is a no-op, not a duplicate */
	entries: Record<string, true>;
};

export type LedgerState = {
	activeSession: ActiveSession | null;
	activePlanId: string | null;
	/** every session id ever started (runs included) — RemoveSession must refuse unknown ids */
	sessions: Record<string, true>;
	/** already removed — removing twice is a no-op, not an error */
	removedSessions: Record<string, true>;
};

export const initialState = (): LedgerState => ({
	activeSession: null,
	activePlanId: null,
	sessions: {},
	removedSessions: {}
});

function evolveOne(state: LedgerState, event: LedgerEvent): LedgerState {
	const { type, data } = event;
	switch (type) {
		case 'SessionStarted': {
			const sessions: Record<string, true> = { ...state.sessions, [data.session]: true as const };
			// A start opens the floor only when nothing is open. That is the
			// whole rule: a backdated session (LogAfter) is started, filled and
			// finished in one append, so it opens and closes inside one fold —
			// and while a live session is open it never takes the slot at all.
			if (state.activeSession) return { ...state, sessions };
			return { ...state, sessions, activeSession: { id: data.session, entries: {} } };
		}
		case 'EntryLogged':
			if (state.activeSession?.id !== data.session) return state;
			return {
				...state,
				activeSession: {
					...state.activeSession,
					entries: { ...state.activeSession.entries, [entryKey(data.item, data.index)]: true }
				}
			};
		case 'SessionFinished':
			return state.activeSession?.id === data.session ? { ...state, activeSession: null } : state;
		case 'SessionRemoved':
			return {
				...state,
				removedSessions: { ...state.removedSessions, [data.session]: true },
				// removing an in-progress session also abandons it
				activeSession: state.activeSession?.id === data.session ? null : state.activeSession
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

export const decide = (command: LedgerCommand, state: LedgerState): LedgerEvent[] => {
	switch (command.type) {
		case 'StartSession': {
			if (state.activeSession)
				throw new IllegalStateError('A session is already in progress — finish it first.');
			const { session, plan, day, at } = command.data;
			return [{ type: 'SessionStarted', data: { session, plan, day, at, mode: 'live' } }];
		}

		case 'LogEntry': {
			const { session, item, index, measure } = command.data;
			if (!state.activeSession || state.activeSession.id !== session)
				throw new IllegalStateError('No session in progress — start one from Today.');
			if (!item || !isInt(index) || index < 1) throw new ValidationError('Entry has no identity.');
			validateMeasure(measure);
			// Same identity = this entry already landed (a retried request or a
			// double-press). Recording nothing makes retries idempotent.
			if (state.activeSession.entries[entryKey(item, index)]) return [];
			return [{ type: 'EntryLogged', data: { ...command.data, measure: normaliseMeasure(measure) } }];
		}

		case 'LogAfter': {
			const { session, plan, day, startAt, at, entries } = command.data;
			if (!entries.length) throw new ValidationError('Nothing to log.');
			if (state.sessions[session]) throw new IllegalStateError('That session is already in the ledger.');
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
				{ type: 'SessionStarted', data: { session, plan, day, at: startAt, mode: 'after' } },
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
			return [{ type: 'SessionFinished', data: { session: s.id, at: command.data.at } }];
		}

		case 'RemoveSession': {
			const { session, at } = command.data;
			if (!state.sessions[session]) throw new IllegalStateError('No such session in this ledger.');
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
