import { readLedgerEvents } from '$lib/server/ledger';
import { requireUid } from '$lib/server/auth';
import type { RequestHandler } from './$types';

/** "Export JSON" — the ledger is just events, so the export is just events. */
export const GET: RequestHandler = async ({ locals }) => {
	const events = await readLedgerEvents(requireUid(locals));
	return new Response(JSON.stringify(events, null, 2), {
		headers: {
			'content-type': 'application/json',
			'content-disposition': 'attachment; filename="training-ledger-events.json"'
		}
	});
};
