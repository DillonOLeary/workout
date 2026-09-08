import type { Exercise } from '$lib/domain/plan';

/**
 * A countdown on the floor: a hold (the bell writes that exercise's full
 * target) or a timed drill (the bell writes "it happened"). Start it, and
 * the stage counts down; let it ring, or drop early and log what was
 * actually done. One at a time, and any navigation cancels it.
 *
 * Only the clock lives here. What the bell WRITES is the page's business —
 * it hands in `onBell`, and the exercise rides along on a hold so the
 * callback has what it needs without reaching back into the page.
 */
export type Countdown = { target: number } & ({ kind: 'hold'; ex: Exercise } | { kind: 'timed' });
export type Running = Countdown & { end: number };

export class CountdownClock {
	running = $state<Running | null>(null);
	/** whole seconds left, for the stage; null when nothing is running */
	remaining = $state<number | null>(null);
	readonly #onBell: (done: Countdown) => void;

	/** Construct during component init: the ticking effect belongs to the component. */
	constructor(onBell: (done: Countdown) => void) {
		this.#onBell = onBell;
		$effect(() => {
			const r = this.running;
			if (!r) return;
			const t = setInterval(() => {
				const left = Math.ceil((r.end - Date.now()) / 1000);
				if (left <= 0) {
					this.running = null;
					this.remaining = null;
					this.#onBell(r);
				} else {
					this.remaining = left;
				}
			}, 200);
			return () => clearInterval(t);
		});
	}

	get active(): boolean {
		return this.running !== null;
	}

	start(next: Countdown): void {
		this.remaining = next.target;
		this.running = { ...next, end: Date.now() + next.target * 1000 };
	}

	/** Stop before the bell: what was running, and the seconds actually done (never 0). */
	dropEarly(): { done: Countdown; held: number } | null {
		const r = this.running;
		if (!r) return null;
		const held = Math.max(1, r.target - Math.ceil((r.end - Date.now()) / 1000));
		this.cancel();
		return { done: r, held };
	}

	cancel(): void {
		this.running = null;
		this.remaining = null;
	}
}
