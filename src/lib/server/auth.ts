import { createHmac, timingSafeEqual } from 'node:crypto';
import { redirect, type Cookies } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Browsers cap a cookie's lifetime at 400 days, hence the sliding renewal in hooks.server.ts.
const COOKIE = 'ledger_uid';
const MAX_AGE = 400 * 86400;

function pepper(): string {
	const p = env.LEDGER_PEPPER;
	if (!p) throw new Error('Missing LEDGER_PEPPER env var');
	return p;
}

const sign = (uid: string) =>
	createHmac('sha256', pepper()).update(`cookie:${uid}`).digest('hex').slice(0, 32);

/** Sets the signed, HttpOnly stay-signed-in cookie: `uid.hmac(uid)`, unforgeable without the pepper. */
export function setAuthCookie(cookies: Cookies, uid: string) {
	cookies.set(COOKIE, `${uid}.${sign(uid)}`, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: MAX_AGE
	});
}

export function clearAuthCookie(cookies: Cookies) {
	cookies.delete(COOKIE, { path: '/' });
}

/** Returns the uid if the cookie is present and untampered, else null. */
export function verifyAuthCookie(cookies: Cookies): string | null {
	const value = cookies.get(COOKIE);
	if (!value) return null;
	const dot = value.lastIndexOf('.');
	if (dot < 1) return null;
	const uid = value.slice(0, dot);
	const given = Buffer.from(value.slice(dot + 1));
	const expected = Buffer.from(sign(uid));
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
	return uid;
}

/** For actions/endpoints: the signed-in uid, or a bounce to the login page. */
export function requireUid(locals: App.Locals): string {
	if (!locals.uid) redirect(303, '/login');
	return locals.uid;
}
