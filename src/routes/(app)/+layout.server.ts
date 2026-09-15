import { redirect } from '@sveltejs/kit';
import { listProgrammes } from '$lib/server/plans';
import { readLedgerEvents } from '$lib/server/ledger';
import { activeProgramme, blocksOn, preferences, projectSessions } from '$lib/domain/projections';
import { currentState, latestSessionOf } from '$lib/domain/decider';
import { composePlan } from '$lib/domain/plan';
import { BLOCKS } from '$lib/domain/plans';
import type { LayoutServerLoad } from './$types';

/** one load for every signed-in page: the programmes composed with this person's blocks, plus the stream */
export const load: LayoutServerLoad = async ({ locals }) => {
	const uid = locals.uid;
	if (!uid) redirect(303, '/login');

	const [programmes, events] = await Promise.all([listProgrammes(), readLedgerEvents(uid)]);
	const on = blocksOn(events);
	const plans = programmes.map((p) => composePlan(p, BLOCKS, on));
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
