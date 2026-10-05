import { isNetworkError, NO_CONNECTION } from '$lib/net';

/** The three passkey ceremonies: open a ledger, start one, or add a passkey to the signed-in one. */
export type PasskeyKind = 'signin' | 'signup' | 'add';
/** How a ceremony ended: done; or a sentence for the screen, null when the person closed the prompt themselves. */
export type PasskeyOutcome = { ok: true } | { ok: false; message: string | null };

class Refused extends Error {}

async function post(body: object): Promise<Record<string, unknown>> {
	const res = await fetch('/passkey', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		// the phone holds a passkey this site no longer knows: ask it to forget, so the prompt stops offering it
		if (typeof data.unknown === 'string') void signal({ signalName: 'unknownCredential', rpID: location.hostname, credentialID: data.unknown });
		throw new Refused(typeof data.message === 'string' ? data.message : `Something went wrong (${res.status}). Try again.`);
	}
	return data;
}

async function signal(opts: Parameters<typeof import('@simplewebauthn/browser').sendSignal>[0]) {
	try {
		await (await import('@simplewebauthn/browser')).sendSignal(opts);
	} catch {
		// a browser without the Signal API keeps the stale entry; signing in with it just says so
	}
}

/** Runs a ceremony end to end — the server's challenge, the phone's prompt, the server's check. `key` steers a new passkey to a security key. */
export async function passkey(kind: PasskeyKind, key = false): Promise<PasskeyOutcome> {
	const wa = await import('@simplewebauthn/browser');
	if (!wa.browserSupportsWebAuthn()) return { ok: false, message: 'This browser can’t use passkeys.' };
	try {
		const optionsJSON = await post({ kind, step: 'options', key });
		const response = kind === 'signin' ? await wa.startAuthentication({ optionsJSON: optionsJSON as never }) : await wa.startRegistration({ optionsJSON: optionsJSON as never });
		await post({ kind, step: 'verify', response });
		return { ok: true };
	} catch (e) {
		const err = e as Error & { code?: string; cause?: { name?: string } };
		if (err instanceof Refused) return { ok: false, message: err.message };
		// closed, timed out or cancelled: every platform reports it the same way, and it needs no sentence
		if (err.name === 'NotAllowedError' || err.cause?.name === 'NotAllowedError' || err.code === 'ERROR_CEREMONY_ABORTED') return { ok: false, message: null };
		if (err.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') return { ok: false, message: 'That one is already on this ledger.' };
		if (isNetworkError(err.message)) return { ok: false, message: `${NO_CONNECTION} — try again when you’re back online.` };
		return { ok: false, message: err.message || 'The passkey prompt failed. Try again.' };
	}
}

/** After a removal: tells the phone which passkeys still open this ledger, so it can drop the one that no longer does. */
export function passkeysLeft(uid: string, ids: string[]): Promise<void> {
	const userID = btoa(uid).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	return signal({ signalName: 'allAcceptedCredentials', rpID: location.hostname, userID, allAcceptedCredentialIDs: ids });
}
