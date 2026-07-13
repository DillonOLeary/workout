import { createHmac } from 'node:crypto';
import { env } from '$env/dynamic/private';

/**
 * Identity, no passwords: the phone number is HMAC'd with a secret pepper
 * into a short id — the same phone always lands on the same ledger, on any
 * device, and the id can't be reversed into the phone number. The id never
 * appears in a URL; staying signed in is the auth cookie's job (auth.ts).
 */
export function uidFromPhone(phone: string): string {
	const digits = phone.replace(/\D/g, '');
	if (!digits) return 'demo';
	const pepper = env.LEDGER_PEPPER;
	if (!pepper) throw new Error('Missing LEDGER_PEPPER env var — set it in .env.local');
	return 'u-' + createHmac('sha256', pepper).update(digits).digest('hex').slice(0, 10);
}
