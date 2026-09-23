import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/** the kit, every part in every state — a dev page, never deployed; this is where you look, not /glyphs */
export const load = () => {
	if (!dev) error(404, 'Not found');
};
