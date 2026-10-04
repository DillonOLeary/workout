import { describe, expect, it } from 'vitest';
import { stampedAt } from './stamp';

const NOW = Date.parse('2026-10-04T18:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

describe('stampedAt — the moment a set was done, not the moment it arrived', () => {
	it('keeps the phone’s tap time when it is plausible', () => {
		expect(stampedAt(iso(NOW - 4 * 60_000), NOW)).toBe(iso(NOW - 4 * 60_000));
		expect(stampedAt(iso(NOW + 60_000), NOW)).toBe(iso(NOW + 60_000));
	});
	it('falls back to now for nothing, nonsense, the far past or the future', () => {
		for (const raw of [null, '', 'yesterday', iso(NOW - 13 * 3_600_000), iso(NOW + 5 * 60_000)]) expect(stampedAt(raw, NOW)).toBe(iso(NOW));
	});
});
