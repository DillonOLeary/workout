<script lang="ts">
	import type { Snippet } from 'svelte';

	let { tone = 'levelup', children }: { tone?: 'levelup' | 'backoff'; children: Snippet } = $props();
</script>

<div class="banner {tone}">{@render children()}</div>

<style>
	.banner {
		border: var(--border-w) solid var(--ink);
		border-radius: var(--radius-lg);
		padding: 16px 20px;
		font-weight: var(--weight-bold);
		font-size: 16px;
		line-height: var(--leading-snug);
		box-shadow: var(--shadow-raised);
	}
	.banner.levelup { background: var(--volt); color: var(--ink); }
	/* a back-off is neither a win nor an alarm — quieter than volt on purpose */
	.banner.backoff { background: var(--white); color: var(--ink); }
</style>
