import { deserialize } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import type { Measure } from '$lib/domain/measure';
import type { Entry } from '$lib/domain/steps';

export type QueueOp = 'log' | 'correct';
export type QueuedEntry = {
	key: string;
	op: QueueOp;
	/** queued → inflight → confirmed; waiting = the server couldn't be reached, and it sends itself later; failed = the server said no */
	status: 'queued' | 'inflight' | 'waiting' | 'confirmed' | 'failed';
	data: Entry;
};
type Identity = { item: string; index: number };
type Posted = { ok: true } | { ok: false; offline: boolean; message: string };
const same = (a: Identity, b: Identity) => a.item === b.item && a.index === b.index;

const PREFIX = 'ledger:queue:';
const store = (): Storage | null => {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
};
/** sets this phone holds for a session that never reached the server — how Today knows to send you back to the floor */
export function unsentFor(session: string): number {
	try {
		const raw = store()?.getItem(PREFIX + session);
		return raw ? (JSON.parse(raw) as QueuedEntry[]).filter((p) => p.status !== 'failed').length : 0;
	} catch {
		return 0;
	}
}
/** what a reload finds: this session's unsent entries, ready to go again; any other session's are gone for good */
function restore(session: string): QueuedEntry[] {
	const s = store();
	if (!s) return [];
	try {
		for (let i = s.length - 1; i >= 0; i--) {
			const k = s.key(i);
			if (k?.startsWith(PREFIX) && k !== PREFIX + session) s.removeItem(k);
		}
		const raw = s.getItem(PREFIX + session);
		return raw ? (JSON.parse(raw) as QueuedEntry[]).map((p) => ({ ...p, status: p.status === 'failed' ? 'failed' : 'queued' })) : [];
	} catch {
		return [];
	}
}

/**
 * Optimistic: the row shows at once, the entry is kept on the phone, and the POST follows, in order — safe to repeat, because
 * the decider no-ops a repeated identity. A dead link is not a failure: the entry waits and sends itself when the link is back.
 */
export class EntryQueue {
	items = $state<QueuedEntry[]>([]);
	/** the last rejection's sentence, for the screen; cleared by the next push */
	error = $state<string | null>(null);
	/** a POST has been out for a while — the connection is slow, not gone */
	slow = $state(false);
	/** the last try couldn't reach the server; only a send that lands clears it, so a retry in flight doesn't flicker the strip */
	down = $state(false);
	readonly #session: string;
	#pumping: Promise<void> | null = null;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#tries = 0;

	constructor(session: string) {
		this.#session = session;
		this.items = restore(session);
		if (this.unsent) void this.#pump();
	}

	get anyFailed(): boolean {
		return this.items.some((p) => p.status === 'failed');
	}
	/** entries not yet on the server and still going there */
	get unsent(): number {
		return this.items.filter((p) => p.status === 'queued' || p.status === 'inflight' || p.status === 'waiting').length;
	}
	get syncing(): boolean {
		return this.unsent > 0;
	}
	/** the link is down and something is still waiting on it */
	get offline(): boolean {
		return this.down && this.unsent > 0;
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

	/** the most recent thing queued for an identity — how a row knows it is saving, waiting, or failed */
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
		this.#save();
		void this.#pump();
	}

	retry(id: Identity): void {
		const p = this.items.find((x) => x.status === 'failed' && same(x.data, id));
		if (!p) return;
		p.status = 'queued';
		this.error = null;
		this.#save();
		void this.#pump();
	}

	retryAll(): void {
		for (const p of this.items) if (p.status === 'failed') p.status = 'queued';
		this.error = null;
		this.#save();
		void this.#pump();
	}

	/** the connection is back (the browser's online event): send now, not at the next backoff */
	wake(): void {
		clearTimeout(this.#timer);
		this.#timer = undefined;
		this.#tries = 0;
		void this.#pump();
	}

	/** the floor is leaving: no more timers */
	dispose(): void {
		clearTimeout(this.#timer);
	}

	/** resolves once nothing is in flight — what finish and exit wait on; `unsent` says whether anything is still waiting */
	drain(): Promise<void> {
		return this.#pumping ?? Promise.resolve();
	}

	#save(): void {
		try {
			const s = store(), keep = $state.snapshot(this.items).filter((p) => p.status !== 'confirmed');
			if (keep.length) s?.setItem(PREFIX + this.#session, JSON.stringify(keep));
			else s?.removeItem(PREFIX + this.#session);
		} catch {
			// a full or blocked store: the queue still lives in memory for this page
		}
	}

	#pump(): Promise<void> {
		if (this.#pumping) return this.#pumping;
		const run = async () => {
			// yield first: #pumping is set before the loop runs, so the loop's last line can clear it — even when there is nothing to send
			await null;
			for (;;) {
				const next = this.items.find((p) => p.status === 'queued' || p.status === 'waiting');
				if (!next) break;
				next.status = 'inflight';
				const res = await this.#post(next);
				if (res.ok) {
					next.status = 'confirmed';
					this.#tries = 0;
					this.down = false;
				} else if (res.offline) {
					next.status = 'waiting';
					this.down = true;
					this.#later();
					break;
				} else await this.#failed(next, res.message);
				this.#save();
			}
			this.#pumping = null;
			this.#save();
		};
		return (this.#pumping = run());
	}

	/** try again on a backoff — 2, 4, 8, 16, then every 30 s — unless the online event comes first */
	#later(): void {
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => {
			this.#timer = undefined;
			void this.#pump();
		}, Math.min(30_000, 2000 * 2 ** this.#tries++));
	}

	async #post(p: QueuedEntry): Promise<Posted> {
		if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, offline: true, message: 'Offline.' };
		const body = new FormData();
		body.set('session', p.data.session);
		body.set('item', p.data.item);
		body.set('index', String(p.data.index));
		body.set('at', p.data.at);
		body.set('measure', JSON.stringify(p.data.measure));
		const action = p.op === 'log' ? '?/logEntry' : '?/correctEntry';
		const slow = setTimeout(() => (this.slow = true), 5000);
		try {
			for (let attempt = 0; ; attempt++) {
				try {
					// keepalive: the POST outlives a tab closed mid-save; the timeout: a dead link gives up in seconds, not the OS's minutes
					const res = await fetch(action, { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' }, keepalive: true, signal: AbortSignal.timeout(10_000) });
					const result = deserialize(await res.text());
					if (result.type === 'success') return { ok: true };
					// the only redirect these actions send is requireUid's bounce to /login: the cookie is gone and nothing was written
					if (result.type === 'redirect') return { ok: false, offline: false, message: 'Signed out — sign in again, then Retry.' };
					if (result.type === 'failure')
						return { ok: false, offline: false, message: String((result.data as { message?: string })?.message ?? 'Rejected.') };
					throw new Error('action error');
				} catch {
					if (attempt >= 1) return { ok: false, offline: true, message: 'No connection.' };
					await new Promise((r) => setTimeout(r, 1000));
				}
			}
		} finally {
			clearTimeout(slow);
			this.slow = false;
		}
	}

	async #failed(p: QueuedEntry, message: string): Promise<void> {
		if (message.includes('No session in progress')) {
			// finished on another device — resync; the floor's load guard redirects
			this.items = [];
			this.#save();
			await invalidateAll();
			return;
		}
		p.status = 'failed';
		this.error = message;
	}
}
