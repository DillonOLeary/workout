import { fail, redirect } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import { requireUid } from '$lib/server/auth';
import type { Measure } from '$lib/domain/events';
import type { Actions, PageServerLoad } from './$types';

/** No open session, no gym floor: the guard is a projection, not a flag. */
export const load: PageServerLoad = async ({ parent }) => {
	const { activeSession } = await parent();
	if (!activeSession) redirect(303, '/');
};

/** The measure travels as JSON — the decider, not the form, decides if it is well-formed. */
function parseMeasure(raw: FormDataEntryValue | null): Measure | null {
	try {
		const m = JSON.parse(String(raw ?? '')) as Measure;
		return m && typeof m === 'object' && typeof m.of === 'string' ? m : null;
	} catch {
		return null;
	}
}

export const actions: Actions = {
	/** one entry, live: a set, a hold, a warm-up step, the run's minutes */
	logEntry: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const form = await request.formData();
		const measure = parseMeasure(form.get('measure'));
		if (!measure) return fail(400, { message: 'Malformed entry.' });
		const err = await tryCommand(uid, {
			type: 'LogEntry',
			data: {
				session: String(form.get('session') ?? ''),
				plan: String(form.get('plan') ?? ''),
				day: String(form.get('day') ?? ''),
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
