<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & {
		variant?: 'primary' | 'secondary' | 'accent' | 'ghost';
		size?: 'md' | 'lg';
		children: Snippet;
	};

	let { variant = 'secondary', size = 'md', children, ...rest }: Props = $props();
</script>

<button class="btn {variant} {size}" {...rest}>{@render children()}</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		font-family: var(--font-body);
		font-weight: var(--weight-bold);
		font-size: var(--text-md);
		color: var(--ink);
		background: var(--white);
		border: var(--border-w) solid var(--ink);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-raised);
		min-height: var(--hit-min);
		padding: 0 22px;
		cursor: pointer;
		touch-action: manipulation;
		transition:
			transform var(--dur-fast) var(--ease-snap),
			box-shadow var(--dur-fast) var(--ease-snap),
			background var(--dur-med) var(--ease-snap);
	}
	.btn:hover { background: var(--volt-tint); }
	.btn:active { transform: translateY(2px); box-shadow: var(--shadow-pressed); }

	.btn.primary { background: var(--ink); color: var(--paper); }
	.btn.primary:hover { background: var(--ink-2); }

	.btn.accent { background: var(--volt); }
	.btn.accent:hover { background: var(--volt-deep); }

	.btn.ghost {
		background: transparent;
		border-color: transparent;
		box-shadow: none;
		color: var(--ink-2);
		text-decoration: underline;
		text-decoration-thickness: 2px;
		text-underline-offset: 3px;
		text-decoration-color: var(--volt-deep);
	}
	.btn.ghost:hover { background: var(--volt-tint); color: var(--ink); }
	.btn.ghost:active { transform: none; box-shadow: none; }

	.btn.lg { min-height: var(--hit-lg); font-size: var(--text-lg); padding: 0 28px; }
	/* phones trade the generous 72px target for a page that fits; 56px is still
	   comfortably past the 44px touch floor */
	@media (max-width: 900px) {
		.btn.lg { min-height: 56px; padding: 0 20px; }
	}
	@media (max-height: 700px) {
		.btn.lg { min-height: 48px; font-size: var(--text-md); }
	}

	.btn:disabled { opacity: 0.4; cursor: default; }
	.btn:disabled:active { transform: none; box-shadow: var(--shadow-raised); }
</style>
