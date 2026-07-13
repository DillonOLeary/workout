import { redirect } from '@sveltejs/kit';
import { clearAuthCookie } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

/** GET /logout is nothing to look at — signing out is a POST (CSRF-checked). */
export const load: PageServerLoad = async () => {
	redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ cookies }) => {
		clearAuthCookie(cookies);
		redirect(303, '/login');
	}
};
