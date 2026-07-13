import { fail, redirect } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import { requireUid } from '$lib/server/auth';
import type { Actions } from './$types';

/**
 * Every mutation in the app is a command → the decider → appended events.
 * Note what's generated HERE at the edge: ids and timestamps. The decider
 * stays deterministic; the impure bits are inputs.
 */
export const actions: Actions = {
	start: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const form = await request.formData();
		const day = String(form.get('day') ?? '');
		const plan = String(form.get('plan') ?? '');
		if (!day || !plan) return fail(400, { message: 'Missing day or plan.' });

		const err = await tryCommand(uid, {
			type: 'StartSession',
			data: { sessionId: crypto.randomUUID(), plan, day, at: new Date().toISOString() }
		});
		if (err) return fail(400, { message: err });

		redirect(303, '/log');
	},

	finish: async ({ locals }) => {
		const err = await tryCommand(requireUid(locals), {
			type: 'FinishSession',
			data: { at: new Date().toISOString() }
		});
		if (err) return fail(400, { message: err });
	},

	logRun: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const form = await request.formData();
		const err = await tryCommand(uid, {
			type: 'LogRun',
			data: { minutes: Number(form.get('minutes')), at: new Date().toISOString() }
		});
		if (err) return fail(400, { message: err });
	}
};
