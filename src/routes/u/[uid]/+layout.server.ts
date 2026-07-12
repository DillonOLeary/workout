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
export const load: LayoutServerLoad = async ({ params }) => {
	const [plans, events] = await Promise.all([listPlans(), readLedgerEvents(params.uid)]);
	return {
		uid: params.uid,
		plans,
		events,
		activePlanId: activePlanId(events) ?? plans[0]?.id ?? null,
		activeSession: currentState(events).activeSession
	};
};
