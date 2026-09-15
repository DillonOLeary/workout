import { redirect } from '@sveltejs/kit';
import { listProgrammes } from '$lib/server/plans';
import { readLedgerEvents } from '$lib/server/ledger';
import { activeProgramme, blocksOn, preferences, projectSessions } from '$lib/domain/projections';
import { currentState, latestSessionOf } from '$lib/domain/decider';
import { composePlan } from '$lib/domain/plan';
import { BLOCKS } from '$lib/domain/plans';
import type { LayoutServerLoad } from './$types';

/**
 * One load for every signed-in page: the programmes table plus the user's
 * full event stream. Identity comes from the auth cookie (hooks.server.ts),
 * never from the URL. Pages don't get "state" — they get the events and fold
 * whatever view they need with the pure functions in $lib/domain.
 *
 * The week is composed HERE, once: every programme folded with the blocks
 * this person has on, so every page reads one Plan and never knows the
 * difference. `plans` holds every programme composed (history under another
 * programme still resolves its titles); `activePlanId` is the one lifted on.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const uid = locals.uid;
	if (!uid) redirect(303, '/login');

	const [programmes, events] = await Promise.all([listProgrammes(), readLedgerEvents(uid)]);
	const on = blocksOn(events);
	const plans = programmes.map((p) => composePlan(p, BLOCKS, on));
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
		activePlanId: activeProgramme(events) ?? plans[0]?.id ?? null,
		blocksOn: on,
		preferences: preferences(events),
		activeSession: state.activeSession
			? (projectSessions(events).find((s) => s.id === state.activeSession) ?? null)
			: null,
		latestSession: latestSessionOf(state)
	};
};
