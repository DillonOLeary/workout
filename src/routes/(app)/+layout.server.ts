import { redirect } from '@sveltejs/kit';
import { listPlans } from '$lib/server/plans';
import { readLedgerEvents } from '$lib/server/ledger';
import { activePlanId } from '$lib/domain/projections';
import { currentState } from '$lib/domain/decider';
import type { LayoutServerLoad } from './$types';

/**
 * One load for every signed-in page: the plans table plus the user's full
 * event stream. Identity comes from the auth cookie (hooks.server.ts), never
 * from the URL. Pages don't get "state" — they get the events and fold
 * whatever view they need with the pure functions in $lib/domain.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const uid = locals.uid;
	if (!uid) redirect(303, '/login');

	const [plans, events] = await Promise.all([listPlans(), readLedgerEvents(uid)]);
	return {
		uid,
		plans,
		events,
		activePlanId: activePlanId(events) ?? plans[0]?.id ?? null,
		activeSession: currentState(events).activeSession
	};
};
