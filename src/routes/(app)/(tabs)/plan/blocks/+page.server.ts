import { fail } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import { requireUid } from '$lib/server/auth';
import { isBlockId } from '$lib/domain/plan';
import type { Actions } from './$types';

export const actions: Actions = {
	/** a block switched on or off: one BlockToggled, a fact with a date */
	toggle: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const form = await request.formData();
		const block = form.get('block');
		const on = form.get('on') === 'true';
		if (!isBlockId(block)) return fail(400, { message: 'No such block.' });
		const err = await tryCommand(uid, { type: 'ToggleBlock', data: { block, on, at: new Date().toISOString() } });
		if (err) return fail(400, { message: err });
	}
};
