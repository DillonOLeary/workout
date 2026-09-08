<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * One vocabulary: volt = earned (the level-up); paper-2 with an ink
	 * outline = where you are now (a session still open); paper-2 alone = a
	 * plain fact. No amber anywhere — nothing in the app is a warning.
	 */
	let {
		tone = 'neutral',
		children
	}: { tone?: 'neutral' | 'levelup' | 'open'; children: Snippet } = $props();
</script>

<span class="badge {tone}">{@render children()}</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		padding: 5px 12px;
		border-radius: var(--radius-pill);
		border: 1px solid var(--border-soft);
		background: var(--surface-sunken);
		color: var(--ink-2);
		white-space: nowrap;
	}
	.badge.levelup { background: var(--volt); border-color: var(--ink); color: var(--ink); }
	.badge.open { background: var(--paper-2); border-color: var(--ink); color: var(--ink); }
</style>
