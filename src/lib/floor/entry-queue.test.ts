import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from '$lib/domain/steps';

// the two SvelteKit runtime imports, stood in for: the action result is plain JSON here, and a resync is a call we count
vi.mock('$app/forms', () => ({ deserialize: (text: string) => JSON.parse(text) }));
const invalidateAll = vi.fn(async () => {});
vi.mock('$app/navigation', () => ({ invalidateAll: () => invalidateAll() }));

const { EntryQueue } = await import('./entry-queue.svelte');

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

	it('retries a dead link twice, then fails the row', async () => {
		vi.useFakeTimers();
		server('network', 'network', 'network');
		const q = new EntryQueue('s1');
		q.push('log', set, measure);
		// each failed attempt waits 1 s, then 2 s, on the faked clock
		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(2000);
		await q.drain();
		expect(posted).toHaveLength(3);
		expect(q.items[0].status).toBe('failed');
		expect(q.error).toBe('Could not save — check connection.');
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

	it('empties itself and resyncs when the session was finished elsewhere', async () => {
		server({ type: 'failure', data: { message: 'No session in progress — start one from Today.' } });
		const q = new EntryQueue('s1');
		q.push('log', set, measure);
		await q.drain();
		expect(q.items).toEqual([]);
		expect(invalidateAll).toHaveBeenCalledTimes(1);
	});
});
