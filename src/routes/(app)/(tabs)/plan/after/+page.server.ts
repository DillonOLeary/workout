import { fail, redirect } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import { requireUid } from '$lib/server/auth';
import type { Actions } from './$types';

/** The two menus, as one snapshot. The decider says whether the picks are from the menu, one to three of them. */
export const actions: Actions = {
	save: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const form = await request.formData();
		let intents: unknown, equipment: unknown;
		try {
			intents = JSON.parse(String(form.get('intents') ?? '[]'));
			equipment = JSON.parse(String(form.get('equipment') ?? '[]'));
		} catch {
			return fail(400, { message: 'Malformed picks.' });
		}
		if (!Array.isArray(intents) || !Array.isArray(equipment)) return fail(400, { message: 'Malformed picks.' });
		const err = await tryCommand(uid, {
			type: 'SetPreferences',
			data: { at: new Date().toISOString(), intents: intents as never, equipment: equipment as never }
		});
		if (err) return fail(400, { message: err });
		redirect(303, '/');
	}
};
