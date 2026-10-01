import { redirect } from '@sveltejs/kit';
import { readLedgerEvents } from '$lib/server/ledger';
import { activeProgramme, goals, practicesOn, projectSessions, restSeconds } from '$lib/domain/projections';
import { currentState, latestSessionOf } from '$lib/domain/decider';
import { composePlan } from '$lib/domain/plan';
import { BLOCKS, DEFAULT_PROGRAMMES, FLOOR } from '$lib/domain/plans';
import type { LayoutServerLoad } from './$types';

/** one load for every signed-in page: the shipped programmes composed with this person's practices, goals and rest, plus the stream */
export const load: LayoutServerLoad = async ({ locals }) => {
	const uid = locals.uid;
	if (!uid) redirect(303, '/login');

	const events = await readLedgerEvents(uid);
	const on = practicesOn(events);
	const asked = goals(events);
	const rest = restSeconds(events);
	const state = currentState(events);
	return {
		uid,
		plans: DEFAULT_PROGRAMMES.map((p) => composePlan(p, BLOCKS, FLOOR, on, asked, rest)),
		rest,
		events,
		activePlanId: activeProgramme(events) ?? DEFAULT_PROGRAMMES[0]?.id ?? null,
		practicesOn: on,
		goals: asked,
		activeSession: state.activeSession
			? (projectSessions(events).find((s) => s.id === state.activeSession) ?? null)
			: null,
		latestSession: latestSessionOf(state)
	};
};
