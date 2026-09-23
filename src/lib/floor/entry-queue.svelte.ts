import { deserialize } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import type { Measure } from '$lib/domain/measure';
import type { Entry } from '$lib/domain/steps';

export type QueueOp = 'log' | 'correct';
export type QueuedEntry = {
	key: string;
	op: QueueOp;
	status: 'queued' | 'inflight' | 'confirmed' | 'failed';
	data: Entry;
};
type Identity = { item: string; index: number };
const same = (a: Identity, b: Identity) => a.item === b.item && a.index === b.index;

/** optimistic: the row shows at once and the POST follows, in order — safe to retry, because the decider no-ops a repeated identity */
export class EntryQueue {
	items = $state<QueuedEntry[]>([]);
	/** the last rejection's sentence, for the screen; cleared by the next push */
	error = $state<string | null>(null);
	readonly #session: string;
	#pumping: Promise<void> | null = null;

	constructor(session: string) {
		this.#session = session;
	}

	get anyFailed(): boolean {
		return this.items.some((p) => p.status === 'failed');
	}
	get syncing(): boolean {
		return this.items.some((p) => p.status === 'queued' || p.status === 'inflight');
	}

	/** the entries that count: the server's with the queue laid over — a log adds a row, a correction replaces its measure, a failed one does neither */
	overlay(server: Entry[]): Entry[] {
		const out = server.map((e) => ({ ...e }));
		for (const p of this.items) {
			if (p.status === 'failed') continue;
			const i = out.findIndex((e) => same(e, p.data));
			if (p.op === 'log') {
				if (i < 0) out.push(p.data);
			} else if (i >= 0) out[i] = { ...out[i], measure: p.data.measure };
		}
		return out;
	}

	/** the most recent thing queued for an identity — how a row knows it is saving, or failed */
	latestFor(id: Identity): QueuedEntry | undefined {
		for (let i = this.items.length - 1; i >= 0; i--) if (same(this.items[i].data, id)) return this.items[i];
		return undefined;
	}

	push(op: QueueOp, id: Identity, measure: Measure): void {
		this.error = null;
		this.items.push({
			key: crypto.randomUUID(),
			op,
			status: 'queued',
			data: { session: this.#session, item: id.item, index: id.index, at: new Date().toISOString(), measure }
		});
		void this.#pump();
	}

	retry(id: Identity): void {
		const p = this.items.find((x) => x.status === 'failed' && same(x.data, id));
		if (!p) return;
		p.status = 'queued';
		this.error = null;
		void this.#pump();
	}

	retryAll(): void {
		for (const p of this.items) if (p.status === 'failed') p.status = 'queued';
		this.error = null;
		void this.#pump();
	}

	/** resolves once nothing is queued or in flight — finish and exit wait on this */
	drain(): Promise<void> {
		return this.#pumping ?? Promise.resolve();
	}

	#pump(): Promise<void> {
		this.#pumping ??= (async () => {
			for (;;) {
				const next = this.items.find((p) => p.status === 'queued');
				if (!next) break;
				next.status = 'inflight';
				const res = await this.#post(next);
				if (res.ok) next.status = 'confirmed';
				else await this.#failed(next, res.message);
			}
			this.#pumping = null;
		})();
		return this.#pumping;
	}

	async #post(p: QueuedEntry): Promise<{ ok: true } | { ok: false; message: string }> {
		const body = new FormData();
		body.set('session', p.data.session);
		body.set('item', p.data.item);
		body.set('index', String(p.data.index));
		body.set('measure', JSON.stringify(p.data.measure));
		const action = p.op === 'log' ? '?/logEntry' : '?/correctEntry';
		for (let attempt = 0; ; attempt++) {
			try {
				const res = await fetch(action, { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
				const result = deserialize(await res.text());
				if (result.type === 'success' || result.type === 'redirect') return { ok: true };
				if (result.type === 'failure')
					return { ok: false, message: String((result.data as { message?: string })?.message ?? 'Rejected.') };
				throw new Error('action error');
			} catch {
				if (attempt >= 2) return { ok: false, message: 'Could not save — check connection.' };
				await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
			}
		}
	}

	async #failed(p: QueuedEntry, message: string): Promise<void> {
		if (message.includes('No session in progress')) {
			// finished on another device — resync; the floor's load guard redirects
			this.items = [];
			await invalidateAll();
			return;
		}
		p.status = 'failed';
		this.error = message;
	}
}
