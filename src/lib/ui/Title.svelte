<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Archivo 900. One per surface: `lg` is the surface's, `md` a card's or a row's, `sm` a sheet's. */
	let { size = 'lg', caps = false, children }: { size?: 'lg' | 'md' | 'sm'; caps?: boolean; children: Snippet } = $props();
</script>

<span class="title {size}" class:caps>{@render children()}</span>

<style>
	.title {
		display: block;
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
