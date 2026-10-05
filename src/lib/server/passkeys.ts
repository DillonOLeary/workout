import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
	type AuthenticationResponseJSON,
	type PublicKeyCredentialCreationOptionsJSON,
	type PublicKeyCredentialRequestOptionsJSON,
	type RegistrationResponseJSON
} from '@simplewebauthn/server';
import { withSql, type Sql } from './db';

/** A passkey as the Sign-in sheet lists it. */
export type Passkey = { id: string; label: string; createdAt: string; usedAt: string | null };

type Row = { id: string; uid: string; public_key: Uint8Array; counter: string; transports: string[]; label: string; created_at: Date; used_at: Date | null };

// The one table beside the event store, made on first use in dev and prod alike, so a deploy needs no step. Two first requests
// racing on a fresh database can collide in the catalog (23505) or on the name (42P07); either way the table is there.
const SCHEMA = `
create table if not exists ledger_passkeys (
	id text primary key,
	uid text not null,
	public_key bytea not null,
	counter bigint not null default 0,
	transports text[] not null default '{}',
	label text not null,
	created_at timestamptz not null default now(),
	used_at timestamptz
);
create index if not exists ledger_passkeys_uid_idx on ledger_passkeys (uid);`;
let ready = false;
async function ensure(sql: Sql) {
	if (ready) return;
	try {
		await sql(SCHEMA);
	} catch (e) {
		if (!['23505', '42P07'].includes((e as { code?: string }).code ?? '')) throw e;
	}
	ready = true;
}
const run = <T>(fn: (sql: Sql) => Promise<T>) => withSql(async (sql) => (await ensure(sql), fn(sql)));

/** The relying party is the host the page was served from: ledger.dillonoleary.com in prod, localhost in dev. */
const rp = (url: URL) => ({ rpID: url.hostname, origin: url.origin });
const userID = (uid: string) => new TextEncoder().encode(uid);
const RP_NAME = 'LEDGER';

/** Every passkey on a ledger, oldest first. */
export const listPasskeys = (uid: string): Promise<Passkey[]> =>
	run(async (sql) =>
		(await sql<Row>('select id, label, created_at, used_at from ledger_passkeys where uid = $1 order by created_at', [uid])).map((r) => ({
			id: r.id,
			label: r.label,
			createdAt: r.created_at.toISOString(),
			usedAt: r.used_at?.toISOString() ?? null
		}))
	);

/** The browser's prompt to make a passkey for a ledger — discoverable, so signing in needs no name; one it already has is refused. */
export async function beginRegistration(url: URL, uid: string, securityKey: boolean): Promise<PublicKeyCredentialCreationOptionsJSON> {
	const have = await run((sql) => sql<Row>('select id, transports from ledger_passkeys where uid = $1', [uid]));
	return generateRegistrationOptions({
		rpName: RP_NAME,
		rpID: rp(url).rpID,
		userID: userID(uid),
		userName: RP_NAME,
		userDisplayName: RP_NAME,
		attestationType: 'none',
		excludeCredentials: have.map((r) => ({ id: r.id, transports: r.transports })),
		authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
		...(securityKey ? { preferredAuthenticatorType: 'securityKey' as const } : {})
	});
}

/** Checks the new passkey against its challenge and keeps it on the ledger; the sentence that says why not, or null. */
export async function finishRegistration(url: URL, uid: string, response: RegistrationResponseJSON, challenge: string, userAgent: string): Promise<string | null> {
	const { rpID, origin } = rp(url);
	let v;
	try {
		v = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID });
	} catch {
		return 'That passkey could not be checked — try again.';
	}
	if (!v.verified) return 'That passkey could not be checked — try again.';
	const { credential, aaguid } = v.registrationInfo;
	const transports = credential.transports ?? response.response.transports ?? [];
	const added = await run((sql) =>
		sql(
			'insert into ledger_passkeys (id, uid, public_key, counter, transports, label) values ($1, $2, $3, $4, $5, $6) on conflict (id) do nothing returning id',
			[credential.id, uid, Buffer.from(credential.publicKey), credential.counter, transports, passkeyLabel(aaguid, response.authenticatorAttachment, transports, userAgent)]
		)
	);
	return added.length ? null : 'That passkey is already on a ledger.';
}

/** The browser's prompt to sign in: any passkey this site made, picked from the phone's own list. */
export const beginAuthentication = (url: URL): Promise<PublicKeyCredentialRequestOptionsJSON> =>
	generateAuthenticationOptions({ rpID: rp(url).rpID, userVerification: 'required' });

/** Whose ledger a signed challenge opens; or why not, with `unknown` when the passkey is on no ledger, so the phone can forget it. */
export async function finishAuthentication(url: URL, response: AuthenticationResponseJSON, challenge: string): Promise<{ uid: string } | { message: string; unknown?: string }> {
	const { rpID, origin } = rp(url);
	return run(async (sql) => {
		const [row] = await sql<Row>('select * from ledger_passkeys where id = $1', [response.id]);
		if (!row) return { message: 'That passkey isn’t on a ledger any more.', unknown: response.id };
		let v;
		try {
			v = await verifyAuthenticationResponse({
				response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID,
				credential: { id: row.id, publicKey: new Uint8Array(row.public_key), counter: Number(row.counter), transports: row.transports }
			});
		} catch {
			return { message: 'That passkey could not be checked — try again.' };
		}
		if (!v.verified) return { message: 'That passkey could not be checked — try again.' };
		await sql('update ledger_passkeys set counter = $2, used_at = now() where id = $1', [row.id, v.authenticationInfo.newCounter]);
		return { uid: row.uid };
	});
}

/** Takes a passkey off a ledger, never the last one — it is the only way back in. The sentence that says why not, or null. */
export async function removePasskey(uid: string, id: string): Promise<string | null> {
	const gone = await run((sql) =>
		sql('delete from ledger_passkeys where id = $1 and uid = $2 and (select count(*) from ledger_passkeys where uid = $2) > 1 returning id', [id, uid])
	);
	return gone.length ? null : 'Keep one passkey — add another before removing this one.';
}

// The two keepers these phones use, by AAGUID; any other passkey is named for how it connects or where it was made.
const KEEPERS: Record<string, string> = {
	'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'iCloud Keychain',
	'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'Google Password Manager'
};

/** What to call a new passkey: its keeper, a security key, a phone reached by QR code, or the device it was made on. */
export function passkeyLabel(aaguid: string, attachment: string | undefined, transports: string[], userAgent: string): string {
	if (KEEPERS[aaguid]) return KEEPERS[aaguid];
	if (attachment === 'cross-platform') return transports.includes('hybrid') ? 'Phone, by QR code' : 'Security key';
	const device = [['iPhone', /iPhone/], ['iPad', /iPad/], ['Android', /Android/], ['Mac', /Macintosh/], ['Windows', /Windows/], ['Chromebook', /CrOS/], ['Linux', /Linux/]] as const;
	return device.find(([, re]) => re.test(userAgent))?.[0] ?? 'Passkey';
}
