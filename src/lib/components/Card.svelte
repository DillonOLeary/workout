<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		interactive = false,
		pad = true,
		children
	}: { interactive?: boolean; pad?: boolean; children: Snippet } = $props();
</script>

<div class="card" class:interactive class:pad>{@render children()}</div>

<style>
	.card {
		background: var(--surface-card);
		border: var(--border-w) solid var(--border-soft);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-card);
	}
	/* Cards that matter get the full ink treatment */
	.card.interactive { border-color: var(--ink); box-shadow: var(--shadow-raised); }
	.card.pad { padding: 24px; }
	@media (max-width: 900px) {
		.card.pad { padding: 16px; }
	}
	@media (max-height: 700px) {
		.card.pad { padding: 12px; }
	}
</style>
