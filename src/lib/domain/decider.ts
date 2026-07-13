import { IllegalStateError, ValidationError } from '@event-driven-io/emmett';
import type { LedgerCommand } from './commands';
import type { LedgerEvent } from './events';

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
	setsLogged: number;
	/** per-exercise counts — lets LogSet treat duplicate set numbers as no-ops */
	setsByExercise: Record<string, number>;
};

export type LedgerState = {
	activeSession: ActiveSession | null;
	activePlanId: string | null;
	/** every session id ever started — StrikeSession must refuse unknown ids */
	sessions: Record<string, true>;
	/** already struck — striking twice is a no-op, not an error */
	struck: Record<string, true>;
};

export const initialState = (): LedgerState => ({
	activeSession: null,
	activePlanId: null,
	sessions: {},
	struck: {}
});

export const evolve = (state: LedgerState, { type, data }: LedgerEvent): LedgerState => {
	switch (type) {
		case 'SessionStarted':
			return {
				...state,
				sessions: { ...state.sessions, [data.session]: true },
				activeSession: {
					id: data.session,
					plan: data.plan,
					day: data.day,
					setsLogged: 0,
					setsByExercise: {}
				}
			};
		case 'SetLogged':
			if (state.activeSession?.id !== data.session) return state;
			return {
				...state,
				activeSession: {
					...state.activeSession,
					setsLogged: state.activeSession.setsLogged + 1,
					setsByExercise: {
						...state.activeSession.setsByExercise,
						[data.exercise]: (state.activeSession.setsByExercise[data.exercise] ?? 0) + 1
					}
				}
			};
		case 'SessionFinished':
			return state.activeSession?.id === data.session ? { ...state, activeSession: null } : state;
		case 'SessionStruck':
			return {
				...state,
				struck: { ...state.struck, [data.session]: true },
				// striking an in-progress session also abandons it
				activeSession: state.activeSession?.id === data.session ? null : state.activeSession
			};
		case 'PlanSelected':
			return { ...state, activePlanId: data.plan };
		case 'RunLogged':
			return state;
	}
};

export const decide = (command: LedgerCommand, state: LedgerState): LedgerEvent[] => {
	switch (command.type) {
		case 'StartSession': {
			if (state.activeSession)
				throw new IllegalStateError('A session is already in progress — finish it first.');
			const { sessionId, plan, day, at } = command.data;
			return [{ type: 'SessionStarted', data: { session: sessionId, plan, day, at } }];
		}

		case 'LogSet': {
			const { session, exercise, weight, reps, set, unit } = command.data;
			if (!state.activeSession || state.activeSession.id !== session)
				throw new IllegalStateError('No session in progress — start one from Today.');
			if (!Number.isFinite(weight) || weight < 0 || weight > 2000)
				throw new ValidationError('Weight is out of range.');
			if (unit === 's') {
				if (!Number.isInteger(reps) || reps < 1 || reps > 600)
					throw new ValidationError('Hold time is out of range.');
			} else if (!Number.isInteger(reps) || reps < 1 || reps > 100) {
				throw new ValidationError('Reps are out of range.');
			}
			// Duplicate set number = this set already landed (a retried request
			// or a double-press). Recording nothing makes retries idempotent.
			if (set <= (state.activeSession.setsByExercise[exercise] ?? 0)) return [];
			return [{ type: 'SetLogged', data: command.data }];
		}

		case 'FinishSession': {
			const s = state.activeSession;
			if (!s) throw new IllegalStateError('No session in progress.');
			// The command carries almost nothing; the event is enriched from state.
			return [
				{ type: 'SessionFinished', data: { session: s.id, plan: s.plan, day: s.day, at: command.data.at } }
			];
		}

		case 'StrikeSession': {
			const { session, at } = command.data;
			if (!state.sessions[session])
				throw new IllegalStateError('No such session in this ledger.');
			if (state.struck[session]) return []; // already struck — idempotent
			return [{ type: 'SessionStruck', data: { session, at } }];
		}

		case 'LogRun': {
			const { minutes, at } = command.data;
			if (!Number.isFinite(minutes) || minutes < 1 || minutes > 600)
				throw new ValidationError('Run minutes must be between 1 and 600.');
			return [{ type: 'RunLogged', data: { minutes: Math.round(minutes), at } }];
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
