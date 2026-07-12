import { redirect } from '@sveltejs/kit';
import { uidFromPhone } from '$lib/server/uid';
import type { Actions } from './$types';

/**
 * A form action: the <form> on this route POSTs here, the server decides,
 * the browser follows the redirect. Works with JavaScript disabled; with it,
 * use:enhance turns the round-trip into a fetch.
 */
export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const uid = uidFromPhone(String(form.get('phone') ?? ''));
		// Flash cookie: the next load of /u/<uid> shows the bookmark banner
		// once, then deletes it. Scoped to this user's path so it can't leak
		// across ledgers.
		cookies.set('ledger_welcome', '1', {
			path: `/u/${uid}`,
			maxAge: 300,
			httpOnly: true,
			sameSite: 'lax'
		});
		redirect(303, `/u/${uid}`);
	}
};
