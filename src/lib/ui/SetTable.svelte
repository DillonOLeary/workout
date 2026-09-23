<script module lang="ts">
	/** todo grey · now volt-light · done ink + fix · fixing = steppers in the row · saving · failed (Retry) */
	export type SetRowState = 'todo' | 'now' | 'done' | 'fixing' | 'saving' | 'failed';
	export type SetRow = {
		key: string;
		/** 'Set 1' · 'Hold 2 · L' · 'Step 3' */
		label: string;
		/** '45 lb × 8' · '45s' · a warm-up sentence */
		text: string;
		state: SetRowState;
		/** 'now' · '✓' · '✓ fixed' · 'rest 62s' */
		right?: string;
		/** a done set you can fix in place */
		fixable?: boolean;
		/** a sentence, not a number */
		prose?: boolean;
		/** 0..1 — the rest still to run before this set, an ink line along the row's foot */
		bar?: number;
	};
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Three kinds of row — todo, now, done — in one white table with an ink border. Only the floor has one. `fixing` is the row's inline editor. */
	let {
		rows,
		onfix,
		onretry,
		fixing
	}: { rows: SetRow[]; onfix?: (key: string) => void; onretry?: (key: string) => void; fixing?: Snippet<[SetRow]> } = $props();
</script>

<div class="table" role="list">
	{#each rows as r (r.key)}
		<div class="row {r.state}" role="listitem">
			{#if r.bar !== undefined}<span class="bar" style="width: {Math.max(0, Math.min(1, r.bar)) * 100}%"></span>{/if}
			<span class="lbl">{r.label}</span>
			<span class="text" class:prose={r.prose}>{r.text}</span>
			<span class="right">
				{#if r.state === 'fixing' && fixing}{@render fixing(r)}
				{:else if r.state === 'failed'}<button type="button" class="pill signal" onclick={() => onretry?.(r.key)}>Retry</button>
				{:else}
					{#if r.right}<span class="note">{r.right}</span>{/if}
					{#if r.fixable && onfix}<button type="button" class="pill" onclick={() => onfix(r.key)} aria-label="Fix {r.label}">fix</button>{/if}
				{/if}
			</span>
		</div>
	{/each}
</div>

<style>
	.table { background: var(--white); border: var(--border-w) solid var(--ink); border-radius: var(--radius-lg); overflow: hidden auto; overscroll-behavior: contain; }
	.row {
		position: relative; display: grid; grid-template-columns: 56px 1fr auto; gap: 10px; align-items: center;
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
	.pill {
		min-height: 32px; padding: 0 10px; border: 1.5px solid var(--ink); border-radius: var(--radius-pill); background: var(--white);
		font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--ink); cursor: pointer; touch-action: manipulation;
	}
	.pill:hover { background: var(--volt-light); }
	.pill.signal { border-color: var(--signal); color: var(--signal); text-transform: uppercase; letter-spacing: var(--tracking-caps); }
	.bar { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--ink); transition: width 200ms linear; }
	@media (max-height: 640px) { .row { min-height: 46px; } .text { font-size: 16px; } }
</style>
