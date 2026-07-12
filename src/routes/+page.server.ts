import { redirect } from '@sveltejs/kit';
import { uidFromPhone } from '$lib/server/uid';
import type { Actions } from './$types';

/**
 * A form action: the <form> on this route POSTs here, the server decides,
 * the browser follows the redirect. Works with JavaScript disabled; with it,
 * use:enhance turns the round-trip into a fetch.
 */
export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		const uid = uidFromPhone(String(form.get('phone') ?? ''));
		redirect(303, `/u/${uid}`);
	}
};
