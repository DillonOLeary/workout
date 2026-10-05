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

const mac = (text: string) => createHmac('sha256', pepper()).update(text).digest('hex').slice(0, 32);
const sign = (uid: string) => mac(`cookie:${uid}`);

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

const CEREMONY = 'ledger_passkey';
const CEREMONY_MS = 5 * 60_000;

/** What a passkey ceremony carries from its options to its answer: the challenge, and for a new passkey the ledger it joins. */
export type Ceremony = { kind: 'signin' | 'signup' | 'add'; challenge: string; uid?: string };

/** Holds the ceremony for five minutes in a signed, HttpOnly cookie that only /passkey sees: the server keeps no state between the two halves. */
export function setCeremony(cookies: Cookies, c: Ceremony, now = Date.now()) {
	const body = Buffer.from(JSON.stringify({ ...c, exp: now + CEREMONY_MS })).toString('base64url');
	cookies.set(CEREMONY, `${body}.${mac(`ceremony:${body}`)}`, {
		path: '/passkey',
		httpOnly: true,
		secure: true,
		sameSite: 'strict',
		maxAge: CEREMONY_MS / 1000
	});
}

/** The ceremony an answer belongs to, if it is this kind, untampered and in time — read once: the cookie is cleared as it is read. */
export function takeCeremony(cookies: Cookies, kind: Ceremony['kind'], now = Date.now()): Ceremony | null {
	const value = cookies.get(CEREMONY);
	cookies.delete(CEREMONY, { path: '/passkey' });
	const dot = value?.lastIndexOf('.') ?? -1;
	if (!value || dot < 1) return null;
	const body = value.slice(0, dot);
	const given = Buffer.from(value.slice(dot + 1));
	const expected = Buffer.from(mac(`ceremony:${body}`));
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
	try {
		const c = JSON.parse(Buffer.from(body, 'base64url').toString()) as Ceremony & { exp: number };
		if (c.kind !== kind || !(c.exp > now)) return null;
		return { kind: c.kind, challenge: c.challenge, ...(c.uid ? { uid: c.uid } : {}) };
	} catch {
		return null;
	}
}
