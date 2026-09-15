import { fail } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import { requireUid } from '$lib/server/auth';
import { isBlockId } from '$lib/domain/plan';
import { parsePreferences } from '$lib/domain/preferences';
import type { Actions } from './$types';

/**
 * The Plan's two acts, both on the page: a block switched on or off (one
 * BlockToggled — a fact with a date, so the Ledger can say when the week
 * changed), and what you're after (one PreferencesSet, a full snapshot).
 * The edge parses the shape; the decider judges the meaning — a block the
 * week hasn't got, a fourth intent, a switch to where it already is.
 */
export const actions: Actions = {
	toggle: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const form = await request.formData();
		const block = form.get('block');
		const on = form.get('on') === 'true';
		if (!isBlockId(block)) return fail(400, { message: 'No such block.' });
		const err = await tryCommand(uid, { type: 'ToggleBlock', data: { block, on, at: new Date().toISOString() } });
		if (err) return fail(400, { message: err });
	},

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
	}
};
