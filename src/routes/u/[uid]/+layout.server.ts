import { listPlans } from '$lib/server/plans';
import { readLedgerEvents } from '$lib/server/ledger';
import { activePlanId } from '$lib/domain/projections';
import { currentState } from '$lib/domain/decider';
import type { LayoutServerLoad } from './$types';

/**
 * One load for every /u/[uid] page: the plans table plus the user's full
 * event stream. Pages don't get "state" — they get the events and fold
 * whatever view they need with the pure functions in $lib/domain.
 */
export const load: LayoutServerLoad = async ({ params, cookies }) => {
	// Read-and-delete: the welcome banner shows exactly once after login.
	const showWelcome = cookies.get('ledger_welcome') === '1';
	if (showWelcome) cookies.delete('ledger_welcome', { path: `/u/${params.uid}` });

	const [plans, events] = await Promise.all([listPlans(), readLedgerEvents(params.uid)]);
	return {
		uid: params.uid,
		plans,
		events,
		activePlanId: activePlanId(events) ?? plans[0]?.id ?? null,
		activeSession: currentState(events).activeSession,
		showWelcome
	};
};
