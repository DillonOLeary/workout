import { fail, redirect } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import { requireUid } from '$lib/server/auth';
import { parsePreferences } from '$lib/domain/preferences';
import type { Actions } from './$types';

/** The two menus, as one snapshot: the edge parses the shape, the decider judges the picks (one to three, each once). */
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
		const prefs = parsePreferences(intents, equipment);
		if (!prefs) return fail(400, { message: 'Malformed picks.' });
		const err = await tryCommand(uid, { type: 'SetPreferences', data: { at: new Date().toISOString(), ...prefs } });
		if (err) return fail(400, { message: err });
		redirect(303, '/');
	}
};
