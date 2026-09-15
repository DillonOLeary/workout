import { fail, redirect } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import { requireUid } from '$lib/server/auth';
import type { Actions } from './$types';

export const actions: Actions = {
	/** the one real choice: a ProgrammeSelected event — that IS history */
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
