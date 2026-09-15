import { fail, redirect } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import { listProgrammes } from '$lib/server/plans';
import { requireUid } from '$lib/server/auth';
import { parseWorkout } from '$lib/domain/events';
import { disciplineOf } from '$lib/domain/plan';
import { wholePlan } from '$lib/domain/plans';
import type { Actions } from './$types';

export const actions: Actions = {
	/** start a live session: the id, the timestamp and the discipline are stamped here at the edge, then the floor */
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

	/** close the open session from Today */
	finish: async ({ locals }) => {
		const err = await tryCommand(requireUid(locals), {
			type: 'FinishSession',
			data: { at: new Date().toISOString() }
		});
		if (err) return fail(400, { message: err });
	}
};
