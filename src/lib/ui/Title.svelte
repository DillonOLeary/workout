<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Archivo 900. One per surface: `lg` is the surface's, `md` a card's or a row's, `sm` a sheet's. `as="h1"` when it is the page's heading — it looks the same. */
	let { size = 'lg', caps = false, as = 'span', children }: { size?: 'lg' | 'md' | 'sm'; caps?: boolean; as?: 'span' | 'h1'; children: Snippet } = $props();
</script>

<svelte:element this={as} class="title {size}" class:caps>{@render children()}</svelte:element>

<style>
	.title {
		display: block;
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		letter-spacing: var(--tracking-tightish);
		text-wrap: balance;
		color: var(--ink);
	}
	.title.lg { font-size: 30px; line-height: 1.02; }
	.title.md { font-size: 22px; line-height: 1.1; }
	.title.sm { font-size: 18px; line-height: 1.1; }
	.title.caps { text-transform: uppercase; }
	@media (max-width: 360px) {
		.title.lg { font-size: 26px; }
	}
</style>
