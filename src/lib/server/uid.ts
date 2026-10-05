/** A new ledger's id: `u-` and ten random hex characters, the shape every id has had. Accounts from before passkeys keep theirs (an HMAC of a phone number). */
export function newUid(): string {
	return 'u-' + Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, '0')).join('');
}
