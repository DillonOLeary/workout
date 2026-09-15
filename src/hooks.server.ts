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

	// Retired URLs, all in one place. /u/<uid> once WAS the login, so shared
	// links used to grant access — they now grant a login page. /why moved
	// under The Plan. The gym floor moved from /log to /floor (a phone
	// mid-session at deploy time reloads onto it, step and all); /log/after is
	// still where "log it after" lives, hence the exact match.
	if (url.pathname.startsWith('/u/')) {
		return new Response(null, { status: 301, headers: { location: '/login' } });
	}
	if (url.pathname === '/why') {
		return new Response(null, { status: 301, headers: { location: '/plan/why' } });
	}
	if (url.pathname === '/log') {
		return new Response(null, { status: 301, headers: { location: `/floor${url.search}` } });
	}
	// The Plan's two child pages folded into it and into the programme page
	// when plans stopped being the unit (2026-09-14).
	if (url.pathname === '/plan/change') {
		return new Response(null, { status: 301, headers: { location: '/plan/programme' } });
	}
	if (url.pathname === '/plan/after') {
		return new Response(null, { status: 301, headers: { location: '/plan' } });
	}

	// Who's here? Verified on every request; re-issued on every request so
	// the 400-day cookie clock restarts each visit — you just stay signed in.
	const uid = verifyAuthCookie(event.cookies);
	event.locals.uid = uid ?? undefined;
	if (uid) setAuthCookie(event.cookies, uid);

	return resolve(event);
};
