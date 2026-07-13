import { DeciderCommandHandler, EmmettError } from '@event-driven-io/emmett';
import { withEventStore } from './eventStore';
import { decide, evolve, initialState } from '$lib/domain/decider';
import type { LedgerCommand } from '$lib/domain/commands';
import { upcastLedgerEvent, type LedgerEvent } from '$lib/domain/events';

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
// idempotent — a duplicate LogSet folds to zero events on the re-decide.
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
 * Read the full history for projections, stripped to plain `{type, data}` so
 * it serializes cleanly to the client (store metadata like bigint stream
 * positions stays server-side).
 */
export const readLedgerEvents = (uid: string): Promise<LedgerEvent[]> =>
	withEventStore(async (store) => {
		const { events } = await store.readStream<LedgerEvent>(streamName(uid));
		// upcast at the read boundary: projections and the UI only ever see
		// the current event vocabulary, whatever names the stream stores
		return events.map((e) => upcastLedgerEvent({ type: e.type, data: e.data }));
	});

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
