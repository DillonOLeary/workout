import { fail, redirect } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import { requireUid } from '$lib/server/auth';
import type { Actions } from './$types';

/**
 * The one real choice: which programme the week lifts on. It goes into the
 * ledger as a ProgrammeSelected event (that IS history); the programmes
 * themselves are reference data, added at the table, never here.
 */
export const actions: Actions = {
	select: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const form = await request.formData();
		const programme = String(form.get('programme') ?? '');
		if (!programme) return fail(400, { message: 'Missing programme id.' });
		const err = await tryCommand(uid, { type: 'SelectProgramme', data: { programme, at: new Date().toISOString() } });
		if (err) return fail(400, { message: err });
		redirect(303, '/plan');
	}
};
