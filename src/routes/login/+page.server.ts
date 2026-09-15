import { redirect } from '@sveltejs/kit';
import { uidFromPhone } from '$lib/server/uid';
import { setAuthCookie } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

/** Already signed in? The login page has nothing for you. */
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.uid) redirect(303, '/');
};

export const actions: Actions = {
	/** the phone number is the key: set the signed stay-signed-in cookie, then home */
	default: async ({ request, cookies }) => {
		const form = await request.formData();
		const uid = uidFromPhone(String(form.get('phone') ?? ''));
		setAuthCookie(cookies, uid);
		redirect(303, '/');
	}
};
