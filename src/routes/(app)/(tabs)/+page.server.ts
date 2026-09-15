import { fail, redirect } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import { listProgrammes } from '$lib/server/plans';
import { requireUid } from '$lib/server/auth';
import { parseWorkout } from '$lib/domain/events';
import { disciplineOf } from '$lib/domain/plan';
import { wholePlan } from '$lib/domain/plans';
import type { Actions } from './$types';

/**
 * Every mutation in the app is a command → the decider → appended events.
 * Note what's generated HERE at the edge: ids, timestamps — and the
 * discipline, read off the plan the routine belongs to, so the session
 * carries its own copy forever. The decider stays deterministic; the impure
 * bits are inputs.
 *
 * Logging something after the fact lives on /log/after — one sheet for a
 * run or a whole routine, same session shape, backdated.
 */
export const actions: Actions = {
	start: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const form = await request.formData();
		const workout = parseWorkout(form.get('routine'));
		const plan = String(form.get('plan') ?? '');
		if (!workout || !plan) return fail(400, { message: 'Missing routine or plan.' });
		const discipline = disciplineOf((await listProgrammes()).map(wholePlan).find((p) => p.id === plan), workout.routine);
		if (!discipline) return fail(400, { message: 'That routine is not on this plan.' });

		const err = await tryCommand(uid, {
			type: 'StartSession',
			data: { session: crypto.randomUUID(), plan, at: new Date().toISOString(), discipline, ...workout }
		});
		if (err) return fail(400, { message: err });

		redirect(303, '/floor');
	},

	finish: async ({ locals }) => {
		const err = await tryCommand(requireUid(locals), {
			type: 'FinishSession',
			data: { at: new Date().toISOString() }
		});
		if (err) return fail(400, { message: err });
	}
};
