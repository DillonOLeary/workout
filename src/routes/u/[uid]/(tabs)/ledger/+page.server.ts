import { fail } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import type { Actions } from './$types';

export const actions: Actions = {
	/**
	 * The event-sourced "delete": appends SessionRemoved rather than deleting
	 * anything. The decider refuses unknown ids and no-ops repeats.
	 */
	remove: async ({ request, params }) => {
		const form = await request.formData();
		const session = String(form.get('session') ?? '');
		if (!session) return fail(400, { message: 'Missing session id.' });
		const err = await tryCommand(params.uid, {
			type: 'RemoveSession',
			data: { session, at: new Date().toISOString() }
		});
		if (err) return fail(400, { message: err });
	},

	removeRun: async ({ request, params }) => {
		const form = await request.formData();
		const run = String(form.get('run') ?? '');
		if (!run) return fail(400, { message: 'Missing run id.' });
		const err = await tryCommand(params.uid, {
			type: 'RemoveRun',
			data: { run, at: new Date().toISOString() }
		});
		if (err) return fail(400, { message: err });
	}
};
