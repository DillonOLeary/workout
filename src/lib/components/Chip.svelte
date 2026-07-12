<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		selected = false,
		onclick,
		children
	}: { selected?: boolean; onclick?: () => void; children: Snippet } = $props();
</script>

<button type="button" class="chip" aria-pressed={selected} {onclick}>
	{@render children()}
</button>

<style>
	.chip {
		min-height: 44px;
		padding: 0 18px;
		border-radius: var(--radius-pill);
		border: var(--border-w) solid var(--border-soft);
		background: var(--white);
		font-family: var(--font-body);
		font-weight: var(--weight-bold);
		font-size: 15px;
		color: var(--ink-2);
		cursor: pointer;
		touch-action: manipulation;
		transition: background var(--dur-med) var(--ease-snap);
	}
	.chip:hover { background: var(--volt-tint); color: var(--ink); }
	.chip[aria-pressed='true'] { border-color: var(--ink); background: var(--volt); color: var(--ink); }
</style>
