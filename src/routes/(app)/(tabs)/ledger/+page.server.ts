import { fail } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import { requireUid } from '$lib/server/auth';
import { parseMeasure } from '$lib/domain/measure';
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
	},

	/**
	 * Inline edits on the latest session: one CorrectEntry per set that
	 * changed, in order, stopping at the first the decider refuses. The
	 * decider — not this action — is what keeps older sessions immutable.
	 */
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
