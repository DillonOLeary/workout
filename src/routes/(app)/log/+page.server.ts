import { fail, redirect } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import { requireUid } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

/** No open session, no gym floor: the guard is a projection, not a flag. */
export const load: PageServerLoad = async ({ parent }) => {
	const { activeSession } = await parent();
	if (!activeSession) redirect(303, '/');
};

export const actions: Actions = {
	logSet: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const form = await request.formData();
		const err = await tryCommand(uid, {
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
				unit: form.get('unit') === 's' ? ('s' as const) : undefined,
				target: form.get('target') ? Number(form.get('target')) : undefined
			}
		});
		if (err) return fail(400, { message: err });
	},

	finish: async ({ locals }) => {
		const err = await tryCommand(requireUid(locals), {
			type: 'FinishSession',
			data: { at: new Date().toISOString() }
		});
		if (err) return fail(400, { message: err });
		redirect(303, '/');
	}
};
