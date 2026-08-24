import type { Handle } from '@sveltejs/kit';
import { setRuntimeConnectionString } from '$lib/server/db';
import { setAuthCookie, verifyAuthCookie } from '$lib/server/auth';

/**
 * Runs around every request. On Cloudflare, `event.platform.env` carries the
 * Worker bindings — including Hyperdrive, whose connectionString points at
 * the edge pooler instead of Neon directly. In dev the adapter emulates the
 * binding and vite.config.ts points it at DB, so this branch runs there too;
 * with no platform at all the setter is a no-op and env.DB is used.
 */
export const handle: Handle = ({ event, resolve }) => {
	setRuntimeConnectionString(event.platform?.env?.HYPERDRIVE?.connectionString);

	const { url } = event;

	// The app moved to ledger.dillonoleary.com; old links keep working —
	// permanent redirect, path and query preserved.
	if (url.hostname === 'workout.dillonoleary.com') {
		return new Response(null, {
			status: 301,
			headers: { location: `https://ledger.dillonoleary.com${url.pathname}${url.search}` }
		});
	}

	// Retired capability URLs: /u/<uid> once WAS the login, so shared links
	// used to grant access. They now grant a login page.
	if (url.pathname.startsWith('/u/')) {
		return new Response(null, { status: 301, headers: { location: '/login' } });
	}

	// Who's here? Verified on every request; re-issued on every request so
	// the 400-day cookie clock restarts each visit — you just stay signed in.
	const uid = verifyAuthCookie(event.cookies);
	event.locals.uid = uid ?? undefined;
	if (uid) setAuthCookie(event.cookies, uid);

	return resolve(event);
};
