<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * White, 2px ink, hard shadow. Holds exactly one Primary.
	 * `tone` now = volt-light fill (in progress) · quiet = soft border, no shadow (an older card) · signal = red border.
	 * `pad` false when rows fill it edge to edge.
	 */
	let {
		tone = 'ink',
		pad = true,
		children
	}: { tone?: 'ink' | 'now' | 'quiet' | 'signal'; pad?: boolean; children: Snippet } = $props();
</script>

<div class="card {tone}" class:pad>{@render children()}</div>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		background: var(--white);
		border: var(--border-w) solid var(--ink);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-raised);
	}
	.card.pad { padding: 16px; }
	.card.now { background: var(--volt-light); }
	.card.quiet { border-color: var(--paper-3); box-shadow: none; }
	.card.signal { border-color: var(--signal); box-shadow: none; }
</style>
