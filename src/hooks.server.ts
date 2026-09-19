import type { Handle } from '@sveltejs/kit';
import { setRuntimeConnectionString } from '$lib/server/db';
import { setAuthCookie, verifyAuthCookie } from '$lib/server/auth';

// On Cloudflare the HYPERDRIVE binding (the edge pooler) replaces env.DB; the dev adapter emulates it, and with no platform the setter is a no-op.
export const handle: Handle = ({ event, resolve }) => {
	setRuntimeConnectionString(event.platform?.env?.HYPERDRIVE?.connectionString);

	const { url } = event;

	// Retired URLs, all in one place — permanent redirects.
	if (url.hostname === 'workout.dillonoleary.com') {
		return new Response(null, {
			status: 301,
			headers: { location: `https://ledger.dillonoleary.com${url.pathname}${url.search}` }
		});
	}
	if (url.pathname.startsWith('/u/')) {
		return new Response(null, { status: 301, headers: { location: '/login' } });
	}
	if (url.pathname === '/why') {
		return new Response(null, { status: 301, headers: { location: '/plan/why' } });
	}
	if (url.pathname === '/log') {
		return new Response(null, { status: 301, headers: { location: `/floor${url.search}` } });
	}
	if (url.pathname === '/plan/change') {
		return new Response(null, { status: 301, headers: { location: '/plan/programme' } });
	}

	// Verified and re-issued on every request, so the 400-day cookie clock restarts each visit.
	const uid = verifyAuthCookie(event.cookies);
	event.locals.uid = uid ?? undefined;
	if (uid) setAuthCookie(event.cookies, uid);

	return resolve(event);
};
