<script module lang="ts">
	/**
	 * The set table IS the progress rail now — "where am I" is answered by the
	 * rows, and the optimistic queue draws itself into them. Presentation only:
	 * every row is computed by the page; nothing here touches domain state.
	 */
	export type RowState = 'confirmed' | 'saving' | 'failed' | 'current' | 'upcoming' | 'running';
	export type Row = {
		/** 1-based set number */
		set: number;
		weight: number;
		/** null = not logged yet ("—") */
		count: number | null;
		state: RowState;
		/** 'running' only: seconds left on the countdown */
		remaining?: number;
		/** 'running' only: the dialed target */
		target?: number;
		/** logged past the plan's set count — labelled, never "set N+1 of N" */
		extra?: boolean;
	};
</script>

<script lang="ts">
	import type { Exercise } from '$lib/domain/types';

	let {
		ex,
		rows,
		onRetry
	}: { ex: Exercise; rows: Row[]; onRetry?: (set: number) => void } = $props();

	const isHold = $derived(ex.mode === 'seconds');
	// side: 'sets' means set 1 is one side and set 2 the other — the side is
	// stated in reps mode too, not only in the hold branch (D1)
	const sideFor = (n: number) => (ex.side === 'sets' ? (n % 2 === 1 ? ' · L' : ' · R') : '');
	const label = (r: Row) =>
		`${isHold ? 'HOLD' : 'SET'} ${r.set}${r.extra ? ' · EXTRA' : sideFor(r.set)}`;
	// "50 lb × 12" · "40 /hand × 11" · "14 lb × 15s" · "8 reps" · "10s"
	function value(r: Row) {
		const count = r.count === null ? '—' : isHold ? `${r.count}s` : String(r.count);
		if (ex.bodyweight) return isHold || r.count === null ? count : `${count} reps`;
		const w = ex.each ? `${r.weight} /hand` : `${r.weight} lb`;
		return `${w} × ${count}`;
	}
</script>

<div class="table">
	{#each rows as r (r.set)}
		<div class="row {r.state}">
			<span class="lbl">{label(r)}</span>
			{#if r.state === 'running'}
				<span class="val big" aria-live="polite">{r.remaining}</span>
				<span class="note">of {r.target}s left</span>
			{:else}
				<span class="val">{value(r)}</span>
				{#if r.state === 'saving'}<span class="note">saving…</span>{/if}
				{#if r.state === 'current'}<span class="note">logging</span>{/if}
				{#if r.state === 'failed'}
					<button type="button" class="retry" onclick={() => onRetry?.(r.set)}>Retry</button>
				{/if}
			{/if}
		</div>
	{/each}
</div>

<style>
	.table {
		background: var(--surface-card);
		border: var(--border-w) solid var(--ink);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-card);
		overflow: hidden;
	}
	.row {
		display: grid;
		grid-template-columns: minmax(64px, auto) 1fr auto;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 0 16px;
		border-top: 1px solid var(--border-soft);
	}
	.row:first-child { border-top: none; }
	.lbl {
		font-family: var(--font-mono); font-size: 12px; font-weight: 700;
		letter-spacing: 0.06em; color: var(--ink-3); white-space: nowrap;
	}
	.val { font-family: var(--font-mono); font-weight: 800; font-size: 19px; }
	.val.big { font-size: 40px; line-height: 1; }
	.note { font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--ink-3); }

	.row.upcoming .val { font-weight: 400; font-size: 18px; color: var(--ink-3); }
	.row.current { background: var(--surface-sunken); }
	.row.current .val { font-size: 22px; }
	.row.current .note { color: var(--ink-2); font-size: 13px; }
	.row.saving { background: var(--volt-tint); }
	.row.running { background: var(--volt); }
	.row.running .lbl, .row.running .note { color: var(--ink); }
	.row.failed { border-left: 4px solid var(--danger); padding-left: 12px; }
	.row.failed .val { color: var(--danger); }
	.retry {
		min-height: 44px; padding: 0 14px; background: var(--white);
		border: 1px solid var(--danger); border-radius: var(--radius-pill);
		font-family: var(--font-body); font-size: 11px; font-weight: 700;
		letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--danger);
		cursor: pointer; touch-action: manipulation;
	}
	@media (max-height: 700px) { .row { min-height: 48px; } }
	@media (max-height: 560px) { .row { min-height: 44px; } .val { font-size: 17px; } .row.current .val { font-size: 19px; } }
</style>
