import { fail } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import type { Actions } from './$types';

export const actions: Actions = {
	/**
	 * The event-sourced "delete": appends SessionStruck rather than removing
	 * anything. The decider refuses unknown ids and no-ops repeat strikes.
	 */
	strike: async ({ request, params }) => {
		const form = await request.formData();
		const session = String(form.get('session') ?? '');
		if (!session) return fail(400, { message: 'Missing session id.' });
		const err = await tryCommand(params.uid, {
			type: 'StrikeSession',
			data: { session, at: new Date().toISOString() }
		});
		if (err) return fail(400, { message: err });
	}
};
