import { IllegalStateError, ValidationError } from '@event-driven-io/emmett';
import type { LedgerCommand } from './commands';
import { entryKey, workoutOf, type LedgerEvent, type StoredEvent } from './events';
import { normaliseMeasure, validateMeasure, type Measure } from './measure';
import { BLOCK_IDS, allBlocksOn, isBlockId, isDiscipline, type BlockId } from './plan';
import { MAX_INTENTS, isEquipment, isIntent, samePreferences, type Preferences } from './preferences';
import { upcast } from './upcast';

/** What the rules need and nothing a screen does — rebuilt from events on every command, never stored. */
export type LedgerState = {
	/** the one live slot: the session the floor is walking, if any */
	activeSession: string | null;
	activeProgramme: string | null;
	/** which blocks of the week are on — everything, until a switch says otherwise */
	blocks: Record<BlockId, boolean>;
	/** every session ever started, in start order; the last one not removed is the latest */
	started: string[];
	/** already removed — removing twice is a no-op */
	removedSessions: Record<string, true>;
	/** every entry that landed, by session then identity, and what it measured */
	logged: Record<string, Record<string, Measure['of']>>;
	/** the last snapshot said — so saying it again records nothing */
	preferences: Preferences | null;
};

/** Where every stream begins. */
export const initialState = (): LedgerState => ({
	activeSession: null,
	activeProgramme: null,
	blocks: allBlocksOn(),
	started: [],
	removedSessions: {},
	logged: {},
	preferences: null
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
			if (state.activeSession) return { ...state, started, logged };
			return { ...state, started, logged, activeSession: data.session };
		}
		case 'EntryLogged': {
			const forSession = state.logged[data.session];
			if (!forSession) return state;
			return {
				...state,
				logged: { ...state.logged, [data.session]: { ...forSession, [entryKey(data.item, data.index)]: data.measure.of } }
			};
		}
		case 'EntryCorrected':
			return state;
		case 'SessionFinished':
			return state.activeSession === data.session ? { ...state, activeSession: null } : state;
		case 'SessionRemoved':
			return {
				...state,
				removedSessions: { ...state.removedSessions, [data.session]: true },
				activeSession: state.activeSession === data.session ? null : state.activeSession
			};
		case 'ProgrammeSelected':
			return { ...state, activeProgramme: data.programme };
		case 'BlockToggled':
			return { ...state, blocks: { ...state.blocks, [data.block]: data.on } };
		case 'PreferencesSet':
			return { ...state, preferences: { intents: data.intents, equipment: data.equipment } };
	}
}

/** One stored row folded as the facts it reads as today — the upcaster runs here, before any rule sees the event. */
export const evolve = (state: LedgerState, event: StoredEvent): LedgerState =>
	upcast(event).reduce(evolveOne, state);

const isInt = (n: unknown): n is number => Number.isInteger(n);

/** Which new facts a request produces, or throws — every "no" lives here; zero events is a valid answer. */
export const decide = (command: LedgerCommand, state: LedgerState): LedgerEvent[] => {
	switch (command.type) {
		case 'StartSession': {
			if (state.activeSession)
				throw new IllegalStateError('A session is already in progress — finish it first.');
			const { session, plan, at, discipline } = command.data;
			if (!isDiscipline(discipline)) throw new ValidationError('A session says what it is: lift, yoga, bodyweight, mobility or run.');
			return [{ type: 'SessionStarted', data: { session, plan, at, mode: 'live', discipline, ...workoutOf(command.data) } }];
		}

		case 'LogEntry': {
			const { session, item, index, measure } = command.data;
			if (!state.activeSession || state.activeSession !== session)
				throw new IllegalStateError('No session in progress — start one from Today.');
			if (!item || !isInt(index) || index < 1) throw new ValidationError('Entry has no identity.');
			validateMeasure(measure);
			if (state.logged[session]?.[entryKey(item, index)]) return [];
			return [{ type: 'EntryLogged', data: { ...command.data, measure: normaliseMeasure(measure) } }];
		}

		case 'CorrectEntry': {
			const { session, item, index, measure } = command.data;
			// latest session only; an older session is fixed by removing and re-logging it
			if (session !== state.activeSession && session !== latestSessionOf(state))
				throw new IllegalStateError('Only the latest session can be changed.');
			if (!item || !isInt(index) || index < 1) throw new ValidationError('Entry has no identity.');
			const was = state.logged[session]?.[entryKey(item, index)];
			if (!was) throw new IllegalStateError('Nothing logged there to correct.');
			if (was !== measure.of) throw new IllegalStateError('A correction keeps what the set measured.');
			validateMeasure(measure);
			return [{ type: 'EntryCorrected', data: { ...command.data, measure: normaliseMeasure(measure) } }];
		}

		case 'LogAfter': {
			const { session, plan, discipline, startAt, at, entries } = command.data;
			if (!entries.length) throw new ValidationError('Nothing to log.');
			if (!isDiscipline(discipline)) throw new ValidationError('A session says what it is: lift, yoga, bodyweight, mobility or run.');
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
				{ type: 'SessionStarted', data: { session, plan, at: startAt, mode: 'after', discipline, ...workoutOf(command.data) } },
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
			// allowed on any session
			const { session, at } = command.data;
			if (!state.started.includes(session)) throw new IllegalStateError('No such session in this ledger.');
			if (state.removedSessions[session]) return []; // already removed — idempotent
			return [{ type: 'SessionRemoved', data: { session, at } }];
		}

		case 'SelectProgramme': {
			if (state.activeProgramme === command.data.programme) return [];
			return [{ type: 'ProgrammeSelected', data: { programme: command.data.programme, at: command.data.at } }];
		}

		case 'ToggleBlock': {
			const { block, on, at } = command.data;
			if (!isBlockId(block)) throw new ValidationError(`No such block — the week has ${BLOCK_IDS.join(', ')}.`);
			if (state.blocks[block] === on) return [];
			return [{ type: 'BlockToggled', data: { block, on, at } }];
		}

		case 'SetPreferences': {
			const { at, intents, equipment } = command.data;
			if (!Array.isArray(intents) || !intents.length || intents.length > MAX_INTENTS)
				throw new ValidationError(`Pick one to ${MAX_INTENTS} things you're after.`);
			if (!intents.every(isIntent) || new Set(intents).size !== intents.length)
				throw new ValidationError('That is not something the app can act on.');
			if (!Array.isArray(equipment) || !equipment.every(isEquipment) || new Set(equipment).size !== equipment.length)
				throw new ValidationError('That is not something the app knows about.');
			const next: Preferences = { intents: [...intents], equipment: [...equipment] };
			if (state.preferences && samePreferences(state.preferences, next)) return [];
			return [{ type: 'PreferencesSet', data: { at, ...next } }];
		}
	}
};

/** Rebuild decision state from history — the UI asks this "is a session open?" */
export const currentState = (events: StoredEvent[]): LedgerState =>
	events.reduce(evolve, initialState());
