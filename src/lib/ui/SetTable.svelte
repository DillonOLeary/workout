<script module lang="ts">
	/** todo grey · now volt-light · done ink · fixing = steppers in the row · saving · failed (Retry) · skipped struck through */
	export type SetRowState = 'todo' | 'now' | 'done' | 'fixing' | 'saving' | 'failed' | 'skipped';
	/** the one pill a row may carry: fix a done set, skip from the current one, undo a skip */
	export type SetRowPill = 'fix' | 'skip' | 'undo';
	export type SetRow = {
		key: string;
		/** 'Set 1' · 'Hold 2 · L' · 'Step 3' */
		label: string;
		/** '45 lb × 8' · '45s' · a warm-up sentence */
		text: string;
		state: SetRowState;
		/** '✓' · '✓ fixed' · 'rest 62s' · 'skipped' */
		right?: string;
		pill?: SetRowPill;
		/** a sentence, not a number */
		prose?: boolean;
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Three kinds of row — todo, now, done — in one white table with an ink border, the now row kept in view. Only the floor has one. `fixing` is the row's inline editor. */
	let { rows, onpill, onretry, fixing }: { rows: SetRow[]; onpill?: (key: string, pill: SetRowPill) => void; onretry?: (key: string) => void; fixing?: Snippet<[SetRow]> } = $props();

	let table = $state<HTMLDivElement>();
	let nowKey = $derived(rows.find((r) => r.state === 'now' || r.state === 'fixing')?.key);
	$effect(() => {
		const row = nowKey !== undefined ? table?.querySelector<HTMLElement>(`[data-key="${CSS.escape(nowKey)}"]`) : null;
		if (table && row) table.scrollTop = Math.min(row.offsetTop, Math.max(table.scrollTop, row.offsetTop + row.offsetHeight - table.clientHeight));
	});
</script>

<div class="table" role="list" bind:this={table}>
	{#each rows as r (r.key)}
		<div class="row {r.state}" role="listitem" data-key={r.key}>
			<span class="lbl">{r.label}</span>
			<span class="text" class:prose={r.prose}>{r.text}</span>
			<span class="right">
				{#if r.state === 'fixing' && fixing}{@render fixing(r)}
				{:else if r.state === 'failed'}<button type="button" class="pill signal" onclick={() => onretry?.(r.key)}>Retry</button>
				{:else}
					{#if r.right}<span class="note">{r.right}</span>{/if}
					{#if r.pill && onpill}{@const pill = r.pill}<button type="button" class="pill" onclick={() => onpill(r.key, pill)} aria-label="{pill} {r.label}">{pill}</button>{/if}
				{/if}
			</span>
		</div>
	{/each}
</div>

<style>
	.table { position: relative; background: var(--white); border: var(--border-w) solid var(--ink); border-radius: var(--radius-lg); overflow: hidden auto; overscroll-behavior: contain; }
	.row {
		position: relative; display: grid; grid-template-columns: minmax(56px, auto) 1fr auto; gap: 10px; align-items: center;
		min-height: 52px; padding: 0 14px; border-top: 1px solid var(--paper-2); color: var(--stone);
	}
	.row:first-child { border-top: none; }
	.lbl { font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--stone); white-space: nowrap; }
	.text { font-family: var(--font-mono); font-size: 18px; font-weight: 400; line-height: 1.2; overflow-wrap: anywhere; }
	.text.prose { font-family: var(--font-body); font-size: 15px; }
	.right { display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--slate); justify-self: end; }
	.row.now, .row.fixing { background: var(--volt-light); color: var(--ink); }
	.row.now .text, .row.fixing .text, .row.done .text { font-weight: 800; }
	.row.done, .row.saving { color: var(--ink); }
	.row.saving .note { color: var(--stone); }
	.row.failed { color: var(--signal); border-left: 4px solid var(--signal); padding-left: 10px; }
	.row.skipped .text { text-decoration: line-through; text-decoration-thickness: 1.5px; }
	.row.skipped .note { color: var(--stone); }
	.pill {
		min-height: 32px; padding: 0 10px; border: 1.5px solid var(--ink); border-radius: var(--radius-pill); background: var(--white);
		font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--ink); cursor: pointer; touch-action: manipulation;
	}
	.pill:hover { background: var(--volt-light); }
	.pill.signal { border-color: var(--signal); color: var(--signal); text-transform: uppercase; letter-spacing: var(--tracking-caps); }
	@media (max-height: 640px) { .row { min-height: 46px; } .text { font-size: 16px; } }
</style>
