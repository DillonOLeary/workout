import { createHmac } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { describe, expect, it, vi } from 'vitest';
import { setAuthCookie, setCeremony, takeCeremony, verifyAuthCookie } from './auth';

vi.mock('$env/dynamic/private', () => ({ env: { LEDGER_PEPPER: 'test-pepper' } }));

function jar() {
	const raw = new Map<string, string>();
	const cookies = {
		get: (n: string) => raw.get(n),
		getAll: () => [...raw].map(([name, value]) => ({ name, value })),
		set: (n: string, v: string) => void raw.set(n, v),
		delete: (n: string) => void raw.delete(n),
		serialize: () => ''
	} as unknown as Cookies;
	return { raw, cookies };
}

describe('the stay-signed-in cookie', () => {
	it('signs exactly as it always has, so every phone signed in before passkeys stays signed in', () => {
		const { raw, cookies } = jar();
		setAuthCookie(cookies, 'u-2b3f2a0c75');
		const mac = createHmac('sha256', 'test-pepper').update('cookie:u-2b3f2a0c75').digest('hex').slice(0, 32);
		expect(raw.get('ledger_uid')).toBe(`u-2b3f2a0c75.${mac}`);
		expect(verifyAuthCookie(cookies)).toBe('u-2b3f2a0c75');
	});
	it('refuses a cookie whose id was changed', () => {
		const { raw, cookies } = jar();
		setAuthCookie(cookies, 'u-aaaaaaaaaa');
		raw.set('ledger_uid', raw.get('ledger_uid')!.replace('u-aaaaaaaaaa', 'u-bbbbbbbbbb'));
		expect(verifyAuthCookie(cookies)).toBeNull();
	});
});

describe('a passkey ceremony between its two halves', () => {
	const now = 1_790_000_000_000;
	it('comes back once: the challenge and the ledger a new passkey joins', () => {
		const { cookies } = jar();
		setCeremony(cookies, { kind: 'signup', challenge: 'abc', uid: 'u-0123456789' }, now);
		expect(takeCeremony(cookies, 'signup', now + 1000)).toEqual({ kind: 'signup', challenge: 'abc', uid: 'u-0123456789' });
		expect(takeCeremony(cookies, 'signup', now + 1000)).toBeNull();
	});
	it('is not another kind of ceremony', () => {
		const { cookies } = jar();
		setCeremony(cookies, { kind: 'signin', challenge: 'abc' }, now);
		expect(takeCeremony(cookies, 'add', now)).toBeNull();
	});
	it('lapses after five minutes', () => {
		const { cookies } = jar();
		setCeremony(cookies, { kind: 'signin', challenge: 'abc' }, now);
		expect(takeCeremony(cookies, 'signin', now + 5 * 60_000)).toBeNull();
	});
	it('cannot be rewritten to send a new passkey to another ledger', () => {
		const { raw, cookies } = jar();
		setCeremony(cookies, { kind: 'add', challenge: 'abc', uid: 'u-aaaaaaaaaa' }, now);
		const [body, mac] = raw.get('ledger_passkey')!.split('.');
		const forged = JSON.parse(Buffer.from(body, 'base64url').toString());
		raw.set('ledger_passkey', `${Buffer.from(JSON.stringify({ ...forged, uid: 'u-bbbbbbbbbb' })).toString('base64url')}.${mac}`);
		expect(takeCeremony(cookies, 'add', now)).toBeNull();
	});
});
