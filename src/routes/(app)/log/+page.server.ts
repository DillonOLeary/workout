import { fail, redirect } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import { requireUid } from '$lib/server/auth';
import { parseMeasure } from '$lib/domain/measure';
import type { Actions, PageServerLoad } from './$types';

/** No open session, no gym floor: the guard is a projection, not a flag. */
export const load: PageServerLoad = async ({ parent }) => {
	const { activeSession } = await parent();
	if (!activeSession) redirect(303, '/');
};

export const actions: Actions = {
	/** one entry, live: a set, a hold, a warm-up step, the run's minutes */
	logEntry: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const form = await request.formData();
		// the measure travels as JSON; parseMeasure rebuilds it from the fields
		// its variant owns, and the decider then judges the numbers
		const measure = parseMeasure(form.get('measure'));
		if (!measure) return fail(400, { message: 'Malformed entry.' });
		const err = await tryCommand(uid, {
			type: 'LogEntry',
			data: {
				session: String(form.get('session') ?? ''),
				item: String(form.get('item') ?? ''),
				index: Number(form.get('index')),
				at: new Date().toISOString(),
				measure
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
