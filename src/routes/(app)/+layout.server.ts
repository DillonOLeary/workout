import { redirect } from '@sveltejs/kit';
import { listPlans } from '$lib/server/plans';
import { readStoredEvents } from '$lib/server/ledger';
import { activePlanId, preferences, projectSessions } from '$lib/domain/projections';
import { currentState, latestSessionOf } from '$lib/domain/decider';
import { disciplineOf } from '$lib/domain/plan';
import { upcastAll } from '$lib/domain/upcast';
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

	const [plans, stored] = await Promise.all([listPlans(), readStoredEvents(uid)]);
	// the read boundary: every row in today's vocabulary, once. A session
	// written before it carried its discipline asks the plan it ran under.
	const events = upcastAll(stored, (plan, routine) =>
		disciplineOf(
			plans.find((p) => p.id === plan),
			routine
		)
	);
	// WHETHER a session is open — and WHICH one is the latest, the only one a
	// set can still be corrected in — is the decider's answer (the same evolve
	// that guards writes); WHAT a session is comes from the read model. Two
	// layers, one question each, and they cannot disagree: both fold the same
	// events. A screen hides what the decider would refuse; it never re-derives
	// the rule.
	const state = currentState(events);
	return {
		uid,
		plans,
		events,
		activePlanId: activePlanId(events) ?? plans[0]?.id ?? null,
		preferences: preferences(events),
		activeSession: state.activeSession
			? (projectSessions(events).find((s) => s.id === state.activeSession) ?? null)
			: null,
		latestSession: latestSessionOf(state)
	};
};
