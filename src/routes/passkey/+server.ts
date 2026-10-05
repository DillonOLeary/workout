import { error, json } from '@sveltejs/kit';
import { setAuthCookie, setCeremony, takeCeremony, type Ceremony } from '$lib/server/auth';
import { beginAuthentication, beginRegistration, finishAuthentication, finishRegistration } from '$lib/server/passkeys';
import { newUid } from '$lib/server/uid';
import type { RequestHandler } from './$types';

const KINDS: Ceremony['kind'][] = ['signin', 'signup', 'add'];

/**
 * Both halves of a passkey ceremony, as JSON: `options` hands the browser a challenge, `verify` checks what it signed.
 * signin opens the ledger the passkey is on; signup starts a new ledger with it; add puts another on the signed-in one.
 */
export const POST: RequestHandler = async ({ request, cookies, url, locals }) => {
	const body = (await request.json().catch(() => null)) as { kind?: Ceremony['kind']; step?: string; key?: boolean; response?: never } | null;
	const kind = body?.kind;
	if (!kind || !KINDS.includes(kind)) error(400, 'No such ceremony.');
	if (kind === 'add' && !locals.uid) return json({ ok: false, message: 'Signed out — sign in again, then add it.' }, { status: 401 });

	if (body.step === 'options') {
		if (kind === 'signin') {
			const options = await beginAuthentication(url);
			setCeremony(cookies, { kind, challenge: options.challenge });
			return json(options);
		}
		const uid = kind === 'add' ? locals.uid! : newUid();
		const options = await beginRegistration(url, uid, body.key === true);
		setCeremony(cookies, { kind, challenge: options.challenge, uid });
		return json(options);
	}
	if (body.step !== 'verify' || !body.response) error(400, 'No such step.');

	const c = takeCeremony(cookies, kind);
	if (!c) return json({ ok: false, message: 'That took too long — try again.' }, { status: 400 });
	if (kind === 'signin') {
		const r = await finishAuthentication(url, body.response, c.challenge);
		if ('message' in r) return json({ ok: false, ...r }, { status: 400 });
		setAuthCookie(cookies, r.uid);
		return json({ ok: true });
	}
	if (kind === 'add' && c.uid !== locals.uid) return json({ ok: false, message: 'Signed in to another ledger since — try again.' }, { status: 400 });
	const err = await finishRegistration(url, c.uid!, body.response, c.challenge, request.headers.get('user-agent') ?? '');
	if (err) return json({ ok: false, message: err }, { status: 400 });
	if (kind === 'signup') setAuthCookie(cookies, c.uid!);
	return json({ ok: true });
};
