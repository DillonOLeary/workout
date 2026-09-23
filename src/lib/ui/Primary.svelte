<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	/**
	 * Volt slab, ≥64px, one per screen. `ink` only for Finish — the irreversible write.
	 * `size` lg is the floor's 76px; md the card's 64px. A `type="submit"` inside a form posts it.
	 */
	let {
		tone = 'volt',
		size = 'md',
		children,
		...rest
	}: HTMLButtonAttributes & { tone?: 'volt' | 'ink'; size?: 'md' | 'lg'; children: Snippet } = $props();
</script>

<button class="primary {tone} {size}" {...rest}>{@render children()}</button>

<style>
	.primary {
		display: flex; align-items: center; justify-content: center; gap: 10px;
		width: 100%;
		border: var(--border-w) solid var(--ink);
		font-family: var(--font-display); font-weight: var(--weight-black);
		letter-spacing: 0.02em; text-transform: uppercase;
		cursor: pointer; touch-action: manipulation;
		transition: transform var(--dur-fast) var(--ease-snap), box-shadow var(--dur-fast) var(--ease-snap), background var(--dur-med) var(--ease-snap);
	}
	.primary.md { min-height: 64px; border-radius: 14px; font-size: clamp(17px, 5.6vw, 22px); }
	.primary.lg { min-height: 76px; border-radius: var(--radius-lg); font-size: clamp(19px, 6.2vw, 24px); }
	.primary.volt { background: var(--volt); color: var(--ink); box-shadow: 0 5px 0 var(--ink); }
	.primary.lg.volt { box-shadow: 0 6px 0 var(--ink); }
	.primary.volt:hover:not(:disabled) { background: var(--volt-deep); }
	.primary.ink { background: var(--ink); color: var(--volt); box-shadow: 0 5px 0 var(--slate); }
	.primary.lg.ink { box-shadow: 0 6px 0 var(--slate); }
	.primary:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 2px 0 var(--ink); }
	.primary.lg:active:not(:disabled) { transform: translateY(4px); }
	.primary:disabled { opacity: 0.5; cursor: default; }
	.primary :global(small) {
		font-family: var(--font-mono); font-size: 13px; font-weight: 700; text-transform: none; letter-spacing: 0; color: var(--slate);
	}
	.primary.ink :global(small) { color: var(--volt-light); }
	@media (max-height: 640px) { .primary.lg { min-height: 68px; font-size: 22px; } }
	@media (prefers-reduced-motion: reduce) { .primary { transition: none; } }
</style>
