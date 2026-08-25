import { redirect } from '@sveltejs/kit';
import { listPlans } from '$lib/server/plans';
import { readLedgerEvents } from '$lib/server/ledger';
import { activePlanId, projectSessions } from '$lib/domain/projections';
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
	// WHETHER a session is open is the decider's answer (the same evolve that
	// guards writes); WHAT it is comes from the read model. Two layers, one
	// question each, and they cannot disagree — both fold the same events.
	const live = currentState(events).activeSession;
	return {
		uid,
		plans,
		events,
		activePlanId: activePlanId(events) ?? plans[0]?.id ?? null,
		activeSession: live ? (projectSessions(events).find((s) => s.id === live.id) ?? null) : null
	};
};
