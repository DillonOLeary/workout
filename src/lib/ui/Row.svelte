<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * 48px min, a hairline under. The right side says what happens: › opens, ▾ expands, a value is just a value.
	 * `onclick` makes it a button; `href` a link; neither, plain information. `tone` now = volt-light (an open row, the deck);
	 * signal = red text (Bin this session). `sub` is a mono line under the label.
	 */
	let {
		label,
		sub,
		right,
		tone = 'plain',
		onclick,
		href,
		expanded,
		children
	}: {
		label: string; sub?: string; right?: string; tone?: 'plain' | 'now' | 'signal';
		onclick?: () => void; href?: string; expanded?: boolean; children?: Snippet;
	} = $props();
</script>

{#snippet inner()}
	<span class="main"><span class="label">{label}</span>{#if sub}<span class="sub">{sub}</span>{/if}</span>
	{#if children}{@render children()}{:else if right}<span class="right">{right}</span>{/if}
{/snippet}

{#if href}
	<a class="row {tone}" {href}>{@render inner()}</a>
{:else if onclick}
	<button type="button" class="row {tone}" {onclick} aria-expanded={expanded}>{@render inner()}</button>
{:else}
	<div class="row {tone}">{@render inner()}</div>
{/if}

<style>
	.row {
		display: flex; justify-content: space-between; align-items: center; gap: 8px;
		width: 100%; min-height: 48px; padding: 0; margin: 0;
		background: none; border: 0; border-bottom: 1px solid var(--paper-3);
		font-family: var(--font-body); font-size: 15px; font-weight: 700; color: var(--ink); text-align: left; text-decoration: none;
		cursor: default;
	}
	button.row, a.row { cursor: pointer; touch-action: manipulation; }
	a.row:hover { background: none; }
	button.row:hover .label, a.row:hover .label { text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--volt-deep); }
	.row.now { background: var(--volt-light); padding: 0 12px; min-height: 52px; }
	.row.signal { color: var(--signal); }
	.main { display: flex; flex-direction: column; line-height: 1.25; min-width: 0; }
	.sub { font-family: var(--font-mono); font-size: 11px; font-weight: 400; color: var(--slate); }
	.right { font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--stone); white-space: nowrap; flex: none; }
	.row.now .right, .row.signal .right { color: var(--slate); }
	.row.signal .right { font-weight: 400; }
</style>
