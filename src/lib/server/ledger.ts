import { DeciderCommandHandler, EmmettError } from '@event-driven-io/emmett';
import { withEventStore } from './eventStore';
import { decide, evolve, initialState } from '$lib/domain/decider';
import type { LedgerCommand } from '$lib/domain/commands';
import type { LedgerEvent } from '$lib/domain/events';
import { upcastAll } from '$lib/domain/upcast';

// retry.onVersionConflict: a concurrent append makes Emmett re-read the stream and re-run decide, up to 3 times — safe because decide is idempotent.
const handle = DeciderCommandHandler({
	decide,
	evolve,
	initialState,
	retry: { onVersionConflict: true }
});

/** One stream per user — the whole training history is one ledger. */
export const streamName = (uid: string) => `ledger-${uid}`;

/** Runs one command through the decider against the user's stream. */
export const executeCommand = (uid: string, command: LedgerCommand) =>
	withEventStore((store) => handle(store, streamName(uid), command));

/** The whole history as plain `{type, data}`, upcast to the current vocabulary at the read boundary. */
export const readLedgerEvents = (uid: string): Promise<LedgerEvent[]> =>
	withEventStore(async (store) => {
		const { events } = await store.readStream<LedgerEvent>(streamName(uid));
		return upcastAll(events.map((e) => ({ type: e.type, data: e.data })));
	});

/** Runs a command; a domain rejection (an EmmettError) comes back as a message for the form, anything else throws. */
export const tryCommand = async (uid: string, command: LedgerCommand): Promise<string | null> => {
	try {
		await executeCommand(uid, command);
		return null;
	} catch (e) {
		if (e instanceof EmmettError) return e.message;
		throw e;
	}
};
