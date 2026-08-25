import { fail } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import { requireUid } from '$lib/server/auth';
import type { Actions } from './$types';

export const actions: Actions = {
	/**
	 * The event-sourced "delete": appends SessionRemoved rather than deleting
	 * anything. The decider refuses unknown ids and no-ops repeats. Runs are
	 * sessions too, so this is the only removal there is.
	 */
	remove: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const form = await request.formData();
		const session = String(form.get('session') ?? '');
		if (!session) return fail(400, { message: 'Missing session id.' });
		const err = await tryCommand(uid, {
			type: 'RemoveSession',
			data: { session, at: new Date().toISOString() }
		});
		if (err) return fail(400, { message: err });
	}
};
