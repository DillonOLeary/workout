import { fail, type RequestEvent } from '@sveltejs/kit';
import { parsePreferences } from '$lib/domain/preferences';
import { requireUid } from './auth';
import { tryCommand } from './ledger';

/** what you're after and what you've got: one PreferencesSet, a full snapshot — the two pages that edit half each post the whole */
export async function savePreferences({ request, locals }: RequestEvent) {
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
