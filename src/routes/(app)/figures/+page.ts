import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/** the figure lab: every figure of rig v2, live, with its tempo, its route and its skeleton — a dev page, never deployed */
export const load = () => {
	if (!dev) error(404, 'Not found');
};
