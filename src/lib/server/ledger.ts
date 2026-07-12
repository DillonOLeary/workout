import { DeciderCommandHandler, EmmettError } from '@event-driven-io/emmett';
import { eventStore } from './eventStore';
import { decide, evolve, initialState } from '$lib/domain/decider';
import type { LedgerCommand } from '$lib/domain/commands';
import type { LedgerEvent } from '$lib/domain/events';

/**
 * DeciderCommandHandler is the whole event-sourcing write loop in one call:
 *   1. read every event in the stream
 *   2. fold them with evolve() into current state
 *   3. run decide(command, state) — your business rules
 *   4. append the returned events, expecting the stream version it read
 *      (optimistic concurrency: a concurrent write makes the append fail
 *      instead of silently clobbering)
 */
const handle = DeciderCommandHandler({ decide, evolve, initialState });

/** One stream per user — the whole training history is one ledger. */
export const streamName = (uid: string) => `ledger-${uid}`;

export const executeCommand = (uid: string, command: LedgerCommand) =>
	handle(eventStore, streamName(uid), command);

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

/**
 * Read the full history for projections, stripped to plain `{type, data}` so
 * it serializes cleanly to the client (store metadata like bigint stream
 * positions stays server-side).
 */
export const readLedgerEvents = async (uid: string): Promise<LedgerEvent[]> => {
	const { events } = await eventStore.readStream<LedgerEvent>(streamName(uid));
	return events.map((e) => ({ type: e.type, data: e.data }) as LedgerEvent);
};
