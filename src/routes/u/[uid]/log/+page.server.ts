import { fail, redirect } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import type { Actions, PageServerLoad } from './$types';

/** No open session, no gym floor: the guard is a projection, not a flag. */
export const load: PageServerLoad = async ({ parent, params }) => {
	const { activeSession } = await parent();
	if (!activeSession) redirect(303, `/u/${params.uid}`);
};

export const actions: Actions = {
	logSet: async ({ request, params }) => {
		const form = await request.formData();
		const err = await tryCommand(params.uid, {
			type: 'LogSet',
			data: {
				session: String(form.get('session') ?? ''),
				plan: String(form.get('plan') ?? ''),
				day: String(form.get('day') ?? ''),
				exercise: String(form.get('exercise') ?? ''),
				weight: Number(form.get('weight')),
				reps: Number(form.get('reps')),
				set: Number(form.get('set')),
				at: new Date().toISOString(),
				unit: form.get('unit') === 's' ? ('s' as const) : undefined
			}
		});
		if (err) return fail(400, { message: err });
	},

	finish: async ({ params }) => {
		const err = await tryCommand(params.uid, {
			type: 'FinishSession',
			data: { at: new Date().toISOString() }
		});
		if (err) return fail(400, { message: err });
		redirect(303, `/u/${params.uid}`);
	}
};
