import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from '$lib/domain/steps';

// the two SvelteKit runtime imports, stood in for: the action result is plain JSON here, and a resync is a call we count
vi.mock('$app/forms', () => ({ deserialize: (text: string) => JSON.parse(text) }));
const invalidateAll = vi.fn(async () => {});
vi.mock('$app/navigation', () => ({ invalidateAll: () => invalidateAll() }));

const { EntryQueue, unsentFor } = await import('./entry-queue.svelte');

type Result = { type: 'success' } | { type: 'redirect'; location: string } | { type: 'failure'; data: { message: string } } | 'network';
const set = { item: 'Goblet Squat', index: 1 };
const measure = { of: 'load', load: 35, reps: 10 } as const;
const posted: string[] = [];

/** the server, scripted: one result per POST, in order; 'network' throws like a dead link */
function server(...results: Result[]) {
	const queue = [...results];
	vi.stubGlobal('fetch', async (action: string, init: RequestInit) => {
		posted.push(`${action} ${(init.body as FormData).get('item')}#${(init.body as FormData).get('index')}`);
		const next = queue.shift() ?? { type: 'success' };
		if (next === 'network') throw new TypeError('Failed to fetch');
		return { text: async () => JSON.stringify(next) };
	});
}

beforeEach(() => {
	posted.length = 0;
	invalidateAll.mockClear();
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('EntryQueue — the floor’s optimistic writes', () => {
	it('shows a row at once, posts it, and confirms it', async () => {
		server({ type: 'success' });
		const q = new EntryQueue('s1');
		q.push('log', set, measure);
		expect(q.overlay([]).map((e: Entry) => e.item)).toEqual(['Goblet Squat']);
		expect(q.syncing).toBe(true);
		await q.drain();
		expect(q.items.map((p) => p.status)).toEqual(['confirmed']);
		expect(posted).toEqual(['?/logEntry Goblet Squat#1']);
	});

	it('posts in tap order, one at a time; a correction replaces the measure in the overlay', async () => {
		server();
		const q = new EntryQueue('s1');
		q.push('log', set, measure);
		q.push('log', { item: 'Goblet Squat', index: 2 }, measure);
		q.push('correct', set, { of: 'load', load: 40, reps: 10 });
		const shown = q.overlay([]);
		expect(shown.map((e: Entry) => [e.index, (e.measure as { load: number }).load])).toEqual([[1, 40], [2, 35]]);
		await q.drain();
		expect(posted).toEqual(['?/logEntry Goblet Squat#1', '?/logEntry Goblet Squat#2', '?/correctEntry Goblet Squat#1']);
	});

	it('marks a refused entry failed with the decider’s sentence, drops it from the overlay, and retries on request', async () => {
		server({ type: 'failure', data: { message: 'Reps are out of range.' } }, { type: 'success' });
		const q = new EntryQueue('s1');
		q.push('log', set, measure);
		await q.drain();
		expect(q.anyFailed).toBe(true);
		expect(q.error).toBe('Reps are out of range.');
		expect(q.overlay([])).toEqual([]);
		q.retry(set);
		await q.drain();
		expect(q.items.map((p) => p.status)).toEqual(['confirmed']);
		expect(q.error).toBeNull();
	});

	it('reads a redirect as a sign-out — nothing was written, so the row fails instead of showing a tick', async () => {
		server({ type: 'redirect', location: '/login' });
		const q = new EntryQueue('s1');
		q.push('log', set, measure);
		await q.drain();
		expect(q.items[0].status).toBe('failed');
		expect(q.error).toMatch(/Signed out/);
	});

	it('a dead link is not a failure: the entry waits, still counts, and sends itself on a backoff', async () => {
		vi.useFakeTimers();
		server('network', 'network', { type: 'success' });
		const q = new EntryQueue('s1');
		q.push('log', set, measure);
		// one retry a second later, then it waits — no error, still in the overlay
		await vi.advanceTimersByTimeAsync(1000);
		await q.drain();
		expect(posted).toHaveLength(2);
		expect(q.items[0].status).toBe('waiting');
		expect([q.offline, q.unsent, q.anyFailed, q.error]).toEqual([true, 1, false, null]);
		expect(q.overlay([]).map((e: Entry) => e.item)).toEqual(['Goblet Squat']);
		// the backoff's first step is two seconds
		await vi.advanceTimersByTimeAsync(2000);
		await q.drain();
		expect(q.items[0].status).toBe('confirmed');
		expect(q.offline).toBe(false);
	});

	it('wakes at once when the connection comes back, and keeps the tap order', async () => {
		vi.useFakeTimers();
		server('network', 'network', 'network', 'network');
		const q = new EntryQueue('s1');
		q.push('log', set, measure);
		await vi.advanceTimersByTimeAsync(1000);
		await q.drain();
		// a new tap tries again at once — the link is still dead, so the first entry waits again and the second queues behind it
		q.push('log', { item: 'Goblet Squat', index: 2 }, measure);
		await vi.advanceTimersByTimeAsync(1000);
		await q.drain();
		expect(q.items.map((p) => p.status)).toEqual(['waiting', 'queued']);
		expect(q.unsent).toBe(2);
		posted.length = 0;
		q.wake();
		await q.drain();
		expect(posted).toEqual(['?/logEntry Goblet Squat#1', '?/logEntry Goblet Squat#2']);
		expect(q.items.map((p) => p.status)).toEqual(['confirmed', 'confirmed']);
		q.dispose();
	});

	it('a wake with nothing to send leaves the queue ready for the next tap', async () => {
		server({ type: 'success' });
		const q = new EntryQueue('s1');
		q.wake();
		await q.drain();
		q.push('log', set, measure);
		await q.drain();
		expect(q.items.map((p) => p.status)).toEqual(['confirmed']);
	});

	it('recovers from a link that comes back on the second try', async () => {
		vi.useFakeTimers();
		server('network', { type: 'success' });
		const q = new EntryQueue('s1');
		q.push('log', set, measure);
		await vi.advanceTimersByTimeAsync(1000);
		await q.drain();
		expect(q.items[0].status).toBe('confirmed');
	});

	it('sends the moment of the tap, so a set that waited keeps its time', async () => {
		const sent: string[] = [];
		vi.stubGlobal('fetch', async (_: string, init: RequestInit) => {
			sent.push(String((init.body as FormData).get('at')));
			return { text: async () => JSON.stringify({ type: 'success' }) };
		});
		const q = new EntryQueue('s1');
		q.push('log', set, measure);
		await q.drain();
		expect(sent).toEqual([q.items[0].data.at]);
	});

	it('keeps unsent entries on the phone: a reload finds them and sends them; a saved one is forgotten; another session’s are dropped', async () => {
		const mem = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
			key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; }
		});
		mem.set('ledger:queue:old', '[]');
		vi.useFakeTimers();
		server('network', 'network');
		const q = new EntryQueue('s1');
		expect(mem.has('ledger:queue:old')).toBe(false);
		q.push('log', set, measure);
		await vi.advanceTimersByTimeAsync(1000);
		await q.drain();
		q.dispose();
		expect(unsentFor('s1')).toBe(1);
		// the tab is gone; the floor opens again with the link back
		posted.length = 0;
		server({ type: 'success' });
		const again = new EntryQueue('s1');
		expect(again.items.map((p) => p.status)).toEqual(['queued']);
		await again.drain();
		expect(posted).toEqual(['?/logEntry Goblet Squat#1']);
		expect(again.items[0].status).toBe('confirmed');
		expect(unsentFor('s1')).toBe(0);
	});

	it('empties itself and resyncs when the session was finished elsewhere', async () => {
		server({ type: 'failure', data: { message: 'No session in progress — start one from Today.' } });
		const q = new EntryQueue('s1');
		q.push('log', set, measure);
		await q.drain();
		expect(q.items).toEqual([]);
		expect(invalidateAll).toHaveBeenCalledTimes(1);
	});
});
