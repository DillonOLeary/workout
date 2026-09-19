import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/** a contact sheet for the figures — a dev page, never deployed */
export const load = () => {
	if (!dev) error(404, 'Not found');
};
