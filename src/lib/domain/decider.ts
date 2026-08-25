import { IllegalStateError, ValidationError } from '@event-driven-io/emmett';
import type { LedgerCommand } from './commands';
import { entryKey, upcastLedgerEvents, type LedgerEvent, type Measure } from './events';

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
 * State holds only what the RULES need (is a session open? which plan is
 * active?). Everything the UI needs lives in projections.ts instead.
 */
export type ActiveSession = {
	id: string;
	plan: string;
	day: string;
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
			// a backdated session was never open: it is already over by the
			// time the next event in the same batch closes it
			if (data.mode === 'after') return { ...state, sessions };
			return {
				...state,
				sessions,
				activeSession: { id: data.session, plan: data.plan, day: data.day, entries: {} }
			};
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
 * The store replays RAW history — retired event names included — so the
 * upcaster runs here, at the fold boundary, before any rule sees the event.
 * One stored row can read back as several facts (a RunLogged is a whole
 * session), which is why this folds a list.
 */
export const evolve = (state: LedgerState, event: LedgerEvent): LedgerState =>
	upcastLedgerEvents(event).reduce(evolveOne, state);

const isInt = (n: unknown): n is number => Number.isInteger(n);

/** Every measure validates on its own branch — the union keeps this exhaustive. */
function validateMeasure(m: Measure): void {
	switch (m.of) {
		case 'load':
			if (!Number.isFinite(m.load) || m.load < 0 || m.load > 2000)
				throw new ValidationError('Weight is out of range.');
			if (!isInt(m.reps) || m.reps < 1 || m.reps > 100) throw new ValidationError('Reps are out of range.');
			return;
		case 'hold':
			if (!isInt(m.seconds) || m.seconds < 1 || m.seconds > 600)
				throw new ValidationError('Hold time is out of range.');
			if (m.target !== undefined && (!isInt(m.target) || m.target < 1 || m.target > 600))
				throw new ValidationError('Hold target is out of range.');
			if (m.load !== undefined && (!Number.isFinite(m.load) || m.load < 0 || m.load > 2000))
				throw new ValidationError('Weight is out of range.');
			return;
		case 'duration':
			if (!Number.isFinite(m.minutes) || m.minutes < 1 || m.minutes > 600)
				throw new ValidationError('Minutes must be between 1 and 600.');
			return;
		case 'step':
			return;
		default:
			throw new ValidationError('Unknown measure.');
	}
}

/** Minutes land whole; everything else is already discrete. */
const normalise = (m: Measure): Measure =>
	m.of === 'duration' ? { of: 'duration', minutes: Math.round(m.minutes) } : m;

export const decide = (command: LedgerCommand, state: LedgerState): LedgerEvent[] => {
	switch (command.type) {
		case 'StartSession': {
			if (state.activeSession)
				throw new IllegalStateError('A session is already in progress — finish it first.');
			const { sessionId, plan, day, at } = command.data;
			return [{ type: 'SessionStarted', data: { session: sessionId, plan, day, at } }];
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
			return [{ type: 'EntryLogged', data: { ...command.data, measure: normalise(measure) } }];
		}

		case 'LogAfter': {
			const { sessionId, plan, day, startAt, at, entries } = command.data;
			if (!entries.length) throw new ValidationError('Nothing to log.');
			if (state.sessions[sessionId]) throw new IllegalStateError('That session is already in the ledger.');
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
				{ type: 'SessionStarted', data: { session: sessionId, plan, day, at: startAt, mode: 'after' } },
				...entries.map(
					(en): LedgerEvent => ({
						type: 'EntryLogged',
						data: { session: sessionId, plan, day, item: en.item, index: en.index, at, measure: normalise(en.measure) }
					})
				),
				{ type: 'SessionFinished', data: { session: sessionId, plan, day, at } }
			];
		}

		case 'FinishSession': {
			const s = state.activeSession;
			if (!s) throw new IllegalStateError('No session in progress.');
			// The command carries almost nothing; the event is enriched from state.
			return [
				{ type: 'SessionFinished', data: { session: s.id, plan: s.plan, day: s.day, at: command.data.at } }
			];
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

/** Rebuild decision state from history — used by the UI to ask "is a session open?" */
export const currentState = (events: LedgerEvent[]): LedgerState =>
	events.reduce(evolve, initialState());
