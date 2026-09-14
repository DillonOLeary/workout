import { DeciderCommandHandler, EmmettError } from '@event-driven-io/emmett';
import { withEventStore } from './eventStore';
import { decide, evolve, initialState } from '$lib/domain/decider';
import type { LedgerCommand } from '$lib/domain/commands';
import type { LedgerEvent, StoredEvent } from '$lib/domain/events';
import { upcastAll, type DisciplineLookup } from '$lib/domain/upcast';

/**
 * DeciderCommandHandler is the whole event-sourcing write loop in one call:
 *   1. read every event in the stream
 *   2. fold them with evolve() into current state
 *   3. run decide(command, state) — your business rules
 *   4. append the returned events, expecting the stream version it read
 *      (optimistic concurrency: a concurrent write makes the append fail
 *      instead of silently clobbering)
 */
// retry.onVersionConflict: a concurrent append (second device) makes Emmett
// re-read the stream and re-run decide up to 3 times. Safe because decide is
// idempotent — a duplicate LogEntry folds to zero events on the re-decide.
const handle = DeciderCommandHandler({
	decide,
	evolve,
	initialState,
	retry: { onVersionConflict: true }
});

/** One stream per user — the whole training history is one ledger. */
export const streamName = (uid: string) => `ledger-${uid}`;

export const executeCommand = (uid: string, command: LedgerCommand) =>
	withEventStore((store) => handle(store, streamName(uid), command));

/**
 * The stream as stored, stripped to plain `{type, data}` so it serializes
 * cleanly (store metadata like bigint stream positions stays server-side).
 * Retired names and shapes included: this is the raw history.
 */
export const readStoredEvents = (uid: string): Promise<StoredEvent[]> =>
	withEventStore(async (store) => {
		const { events } = await store.readStream<LedgerEvent>(streamName(uid));
		return events.map((e) => ({ type: e.type, data: e.data }));
	});

/**
 * Read the full history for projections — upcast at the read boundary, so
 * projections and the UI only ever see the current event vocabulary,
 * whatever names the stream stores (one stored RunLogged comes back as the
 * three events of a run session). The lookup resolves the discipline of a
 * session written before sessions carried their own, from the live plans.
 */
export const readLedgerEvents = async (uid: string, lookup?: DisciplineLookup): Promise<LedgerEvent[]> =>
	upcastAll(await readStoredEvents(uid), lookup);

/**
 * Run a command, translating domain rejections (IllegalStateError,
 * ValidationError — both EmmettErrors) into a message the form can show.
 * Infrastructure failures still throw and become a 500, as they should.
 */
export const tryCommand = async (uid: string, command: LedgerCommand): Promise<string | null> => {
	try {
		await executeCommand(uid, command);
		return null;
	} catch (e) {
		if (e instanceof EmmettError) return e.message;
		throw e;
	}
};
