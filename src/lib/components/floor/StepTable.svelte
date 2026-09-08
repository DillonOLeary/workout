<script module lang="ts">
	/**
	 * The step table IS the progress rail — the current section, one line per
	 * step: sets, warm-up lines, the run. "Where am I" is answered by the rows,
	 * and the optimistic queue draws itself into them. Rows are one height,
	 * always: the countdown lives on the stage, never in a row, so the table
	 * never reflows under a finger. Presentation only: every row is computed
	 * by the page; nothing here touches domain state.
	 */
	export type RowState = 'done' | 'saving' | 'failed' | 'current' | 'resting' | 'editing' | 'upcoming' | 'running';
	export type Row = {
		/** the step key — Retry and a tap hand it back */
		key: string;
		/** 'SET 1' · 'HOLD 2 · L' · 'STEP 3' · 'RUN' */
		label: string;
		value: string;
		/** 'now' · 'rest 62s' · 'saving…' · '✓' */
		note?: string;
		state: RowState;
		/** 0..1 — the rest still to run before this set, drawn as an ink line along the row's foot */
		bar?: number;
		/** last time's count for this set, muted after the value */
		last?: string;
		/** a sentence, not a number: prep lines read at text size even when current */
		prose?: boolean;
		/** a done set: tap it to fix it */
		tappable?: boolean;
	};
</script>

<script lang="ts">
	let {
		rows,
		onRetry,
		onTap
	}: { rows: Row[]; onRetry?: (key: string) => void; onTap?: (key: string) => void } = $props();
</script>

{#snippet cells(r: Row)}
	{#if r.bar !== undefined}<span class="bar" style="width: {Math.max(0, Math.min(1, r.bar)) * 100}%"></span>{/if}
	<span class="lbl">{r.label}</span>
	<span class="val" class:prose={r.prose}>
		{r.value}{#if r.last}<span class="last"> · {r.last}</span>{/if}
	</span>
	{#if r.state === 'failed'}
		<button type="button" class="retry" onclick={(e) => { e.stopPropagation(); onRetry?.(r.key); }}>Retry</button>
	{:else if r.note}
		<span class="note">{r.note}</span>
	{/if}
{/snippet}

<div class="table">
	{#each rows as r (r.key)}
		{#if r.tappable && onTap}
			<button type="button" class="row tap {r.state}" onclick={() => onTap(r.key)} aria-label="{r.label} — {r.value}. Tap to fix it">
				{@render cells(r)}
			</button>
		{:else}
			<div class="row {r.state}">{@render cells(r)}</div>
		{/if}
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
		position: relative;
		display: grid;
		grid-template-columns: minmax(64px, auto) 1fr auto;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 56px;
		padding: 0 16px;
		border-top: 1px solid var(--border-soft);
		/* a state change is a colour change, and it eases — the numbers never animate */
		transition: background var(--dur-med) var(--ease-snap);
	}
	.row:first-child { border-top: none; }
	.row.tap {
		background: transparent; border-left: none; border-right: none; border-bottom: none;
		font: inherit; color: inherit; text-align: left; cursor: pointer; touch-action: manipulation;
	}
	.row.tap:hover { background: var(--volt-tint); }
	.lbl {
		font-family: var(--font-mono); font-size: 12px; font-weight: 700;
		letter-spacing: 0.06em; color: var(--ink-3); white-space: nowrap;
	}
	.val { font-family: var(--font-mono); font-weight: 800; font-size: 19px; line-height: 1.15; overflow-wrap: anywhere; }
	.last { font-weight: 400; font-size: 14px; color: var(--ink-3); }
	.note { font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--ink-3); white-space: nowrap; }

	.row.upcoming .val { font-weight: 400; font-size: 18px; color: var(--ink-3); }
	.row.done .val { color: var(--ink-3); }
	/* the tick lands after the row has settled, not with it */
	.row.done .note { animation: tick var(--dur-med) var(--ease-out) var(--dur-med) both; }
	@keyframes tick { from { opacity: 0; } to { opacity: 1; } }
	.row.current, .row.resting { background: var(--surface-sunken); }
	.row.current .val, .row.resting .val { font-size: 22px; }
	.row.current .note, .row.resting .note { color: var(--ink-2); font-size: 13px; }
	.row.saving, .row.editing { background: var(--volt-tint); }
	.row.editing .val { font-size: 22px; }
	.row.editing .note { color: var(--ink); }
	.row.running { background: var(--volt); }
	.row.running .lbl, .row.running .note { color: var(--ink); }
	.row.failed { border-left: 4px solid var(--danger); padding-left: 12px; }
	.row.failed .val { color: var(--danger); }
	/* the rest: an ink line draining along the foot of the set it runs before */
	.bar {
		position: absolute; left: 0; bottom: 0; height: 3px; background: var(--ink);
		transition: width 200ms linear;
	}
	.retry {
		min-height: 44px; padding: 0 14px; background: var(--white);
		border: 1px solid var(--danger); border-radius: var(--radius-pill);
		font-family: var(--font-body); font-size: 11px; font-weight: 700;
		letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--danger);
		cursor: pointer; touch-action: manipulation;
	}
	/* prep lines are sentences, not numbers — they wrap, at a reading size */
	.val.prose, .row.current .val.prose { font-size: 16px; font-weight: 700; line-height: 1.3; }
	.row.upcoming .val.prose { font-weight: 400; }
	@media (max-height: 700px) { .row { min-height: 48px; } }
	@media (max-height: 560px) { .row { min-height: 44px; } .val { font-size: 17px; } .row.current .val, .row.resting .val { font-size: 19px; } }
</style>
