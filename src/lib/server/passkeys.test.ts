import { describe, expect, it, vi } from 'vitest';
import { passkeyLabel } from './passkeys';
import { newUid } from './uid';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$app/environment', () => ({ dev: true }));

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 17; Communicator) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const ZERO = '00000000-0000-0000-0000-000000000000';

describe('what a new passkey is called', () => {
	it('names the keeper when it says who it is', () => {
		expect(passkeyLabel('fbfc3007-154e-4ecc-8c0b-6e020557d7bd', 'platform', ['internal', 'hybrid'], IPHONE)).toBe('iCloud Keychain');
		expect(passkeyLabel('ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4', 'platform', ['internal', 'hybrid'], ANDROID)).toBe('Google Password Manager');
	});
	it('names a key by how it connects: tapped or plugged in is a security key, a phone by QR code is a phone', () => {
		expect(passkeyLabel(ZERO, 'cross-platform', ['nfc', 'usb'], ANDROID)).toBe('Security key');
		expect(passkeyLabel(ZERO, 'cross-platform', ['hybrid', 'internal'], MAC)).toBe('Phone, by QR code');
	});
	it('otherwise names the device it was made on', () => {
		expect(passkeyLabel(ZERO, 'platform', ['internal'], IPHONE)).toBe('iPhone');
		expect(passkeyLabel(ZERO, 'platform', ['internal'], ANDROID)).toBe('Android');
		expect(passkeyLabel(ZERO, 'platform', ['internal'], MAC)).toBe('Mac');
		expect(passkeyLabel(ZERO, undefined, [], 'curl/8')).toBe('Passkey');
	});
});

describe('a new ledger id', () => {
	it('has the shape every id has had, and is new each time', () => {
		const a = newUid(), b = newUid();
		expect(a).toMatch(/^u-[0-9a-f]{10}$/);
		expect(a).not.toBe(b);
	});
});
