<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Mono, caps, stone. Names the surface or the card. Never an action. `tone` slate = on a volt-light ground. */
	let { tone = 'stone', children }: { tone?: 'stone' | 'slate'; children: Snippet } = $props();
</script>

<span class="caption {tone}">{@render children()}</span>

<style>
	.caption {
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--stone);
		line-height: 1.4;
	}
	.caption.slate { color: var(--slate); }
</style>
