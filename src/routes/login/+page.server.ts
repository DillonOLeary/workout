import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Already signed in? The login page has nothing for you. Signing in is a passkey ceremony against /passkey. */
export const load: PageServerLoad = async ({ locals }) => {
	if (locals.uid) redirect(303, '/');
};
