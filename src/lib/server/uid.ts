import { createHmac } from 'node:crypto';
import { env } from '$env/dynamic/private';

/** The phone number HMAC'd with the pepper into a short id: the same phone always lands on the same ledger, and the id can't be reversed. */
export function uidFromPhone(phone: string): string {
	const digits = phone.replace(/\D/g, '');
	if (!digits) return 'demo';
	const pepper = env.LEDGER_PEPPER;
	if (!pepper) throw new Error('Missing LEDGER_PEPPER env var — set it in .env.local');
	return 'u-' + createHmac('sha256', pepper).update(digits).digest('hex').slice(0, 10);
}
