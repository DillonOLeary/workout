<script module lang="ts">
	/**
	 * The step table IS the progress rail — the current section, one line per
	 * step: sets, the rests between them, warm-up lines, the run's clock.
	 * "Where am I" is answered by the rows, and the optimistic queue draws
	 * itself into them. Presentation only: every row is computed by the page;
	 * nothing here touches domain state.
	 */
	export type RowState = 'done' | 'saving' | 'failed' | 'current' | 'upcoming' | 'running';
	export type Row = {
		/** the step key — Retry hands it back */
		key: string;
		/** 'SET 1' · 'HOLD 2 · L' · 'REST' · 'STEP 3' · 'WALK' · 'RUN' */
		label: string;
		value: string;
		/** 'now' · 'saving…' · 'of 60s left' · '✓' */
		note?: string;
		state: RowState;
		/** the countdown / the clock: 40px, the only number on screen that matters */
		big?: boolean;
		/** a sentence, not a number: prep lines read at text size even when current */
		prose?: boolean;
	};
</script>

<script lang="ts">
	let { rows, onRetry }: { rows: Row[]; onRetry?: (key: string) => void } = $props();
</script>

<div class="table">
	{#each rows as r (r.key)}
		<div class="row {r.state}">
			<span class="lbl">{r.label}</span>
			<span class="val" class:big={r.big} class:prose={r.prose} aria-live={r.big ? 'polite' : undefined}>{r.value}</span>
			{#if r.state === 'failed'}
				<button type="button" class="retry" onclick={() => onRetry?.(r.key)}>Retry</button>
			{:else if r.note}
				<span class="note">{r.note}</span>
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
	.val { font-family: var(--font-mono); font-weight: 800; font-size: 19px; line-height: 1.15; }
	.val.big { font-size: 40px; line-height: 1; }
	.note { font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--ink-3); white-space: nowrap; }

	.row.upcoming .val { font-weight: 400; font-size: 18px; color: var(--ink-3); }
	.row.done .val { color: var(--ink-3); }
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
	/* prep lines are sentences, not numbers — they wrap, at a reading size */
	.row .val:not(.big) { overflow-wrap: anywhere; }
	.val.prose, .row.current .val.prose { font-size: 16px; font-weight: 700; line-height: 1.3; }
	.row.upcoming .val.prose { font-weight: 400; }
	@media (max-height: 700px) { .row { min-height: 48px; } }
	@media (max-height: 560px) { .row { min-height: 44px; } .val { font-size: 17px; } .row.current .val { font-size: 19px; } }
</style>
