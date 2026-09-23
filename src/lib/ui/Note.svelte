<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Mono, slate. The system explaining itself. Give it `onclick` and it is underlined — a tappable note. `size` md is the card's, sm the row's. */
	let {
		size = 'md',
		tone = 'slate',
		onclick,
		children
	}: { size?: 'md' | 'sm'; tone?: 'slate' | 'stone' | 'ink'; onclick?: () => void; children: Snippet } = $props();
</script>

{#if onclick}
	<button type="button" class="note {size} {tone} tap" {onclick}>{@render children()}</button>
{:else}
	<span class="note {size} {tone}">{@render children()}</span>
{/if}

<style>
	.note {
		display: block;
		font-family: var(--font-mono);
		line-height: 1.5;
		color: var(--slate);
		text-wrap: pretty;
	}
	.note.md { font-size: 13px; }
	.note.sm { font-size: 12px; }
	.note.stone { color: var(--stone); }
	.note.ink { color: var(--ink); }
	.note.tap {
		background: none; border: 0; padding: 0; margin: 0; text-align: left; cursor: pointer; touch-action: manipulation;
		font-weight: 700; min-height: 32px;
		text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--paper-3);
	}
	.note.tap:hover { color: var(--ink); text-decoration-color: var(--ink); }
</style>
