<script lang="ts">
	import type { Snippet } from 'svelte';

	/** `open` = where you are now (a session still open); `neutral` = a plain fact */
	let { tone = 'neutral', children }: { tone?: 'neutral' | 'open'; children: Snippet } = $props();
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
	.badge.open { background: var(--paper-2); border-color: var(--ink); color: var(--ink); }
</style>
