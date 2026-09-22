import { fail } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import { requireUid } from '$lib/server/auth';
import { parseMeasure } from '$lib/domain/measure';
import type { Actions } from './$types';

export const actions: Actions = {
	/** the event-sourced delete: appends SessionRemoved; the decider refuses unknown ids and no-ops repeats */
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
	},

	/** one CorrectEntry per changed set, in order, stopping at the first the decider refuses */
	correct: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const form = await request.formData();
		const session = String(form.get('session') ?? '');
		if (!session) return fail(400, { message: 'Missing session id.' });
		let list: unknown;
		try {
			list = JSON.parse(String(form.get('corrections') ?? '[]'));
		} catch {
			return fail(400, { message: 'Malformed corrections.' });
		}
		if (!Array.isArray(list) || !list.length) return fail(400, { message: 'Nothing changed.' });
		for (const c of list as { item?: unknown; index?: unknown; measure?: unknown }[]) {
			const measure = parseMeasure(c?.measure);
			if (!measure || typeof c.item !== 'string' || typeof c.index !== 'number')
				return fail(400, { message: 'Malformed correction.' });
			const err = await tryCommand(uid, {
				type: 'CorrectEntry',
				data: { session, item: c.item, index: c.index, at: new Date().toISOString(), measure }
			});
			if (err) return fail(400, { message: err });
		}
	}
};
