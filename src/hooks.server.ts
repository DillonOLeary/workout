import type { Handle } from '@sveltejs/kit';
import { setRuntimeConnectionString } from '$lib/server/db';

/**
 * Runs around every request. On Cloudflare, `event.platform.env` carries the
 * Worker bindings — including Hyperdrive, whose connectionString points at
 * the edge pooler instead of Neon directly. In dev/Node there's no platform,
 * the setter is a no-op, and env.DB is used.
 */
export const handle: Handle = ({ event, resolve }) => {
	setRuntimeConnectionString(event.platform?.env?.HYPERDRIVE?.connectionString);

	// The app moved to ledger.dillonoleary.com; old links keep working —
	// permanent redirect, path and query preserved (bookmarked /u/… included).
	const { url } = event;
	if (url.hostname === 'workout.dillonoleary.com') {
		return new Response(null, {
			status: 301,
			headers: { location: `https://ledger.dillonoleary.com${url.pathname}${url.search}` }
		});
	}

	return resolve(event);
};
