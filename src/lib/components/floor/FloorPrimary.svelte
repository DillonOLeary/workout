<script lang="ts">
	/**
	 * The one big button. Colour law: volt fill = commit this set (Log set,
	 * Start hold, Done early, Save set); ink fill with volt text = move on
	 * (Next: Chest Press, Finish workout). Never two volt fills on screen at
	 * once. It never acts by itself: a section ends, the label says what's
	 * next, and it waits for the tap.
	 */
	let {
		variant,
		label,
		disabled = false,
		onclick
	}: {
		variant: 'commit' | 'advance';
		label: string;
		disabled?: boolean;
		onclick: () => void;
	} = $props();
</script>

<button type="button" class="primary {variant}" {disabled} {onclick}>
	<span>{label}</span>
</button>

<style>
	.primary {
		display: flex; align-items: center; justify-content: center; gap: 14px;
		width: 100%; min-height: 96px;
		border: var(--border-w) solid var(--ink); border-radius: var(--radius-lg);
		font-family: var(--font-display); font-weight: var(--weight-black);
		font-size: 28px; letter-spacing: 0.02em; text-transform: uppercase;
		cursor: pointer; touch-action: manipulation;
		/* press = physical: the button drops onto its shadow, and eases there */
		transition:
			transform var(--dur-fast) var(--ease-snap),
			box-shadow var(--dur-fast) var(--ease-snap),
			background var(--dur-med) var(--ease-snap),
			color var(--dur-med) var(--ease-snap);
	}
	.primary.commit  { background: var(--volt); color: var(--ink);  box-shadow: 0 6px 0 var(--ink); }
	.primary.advance { background: var(--ink);  color: var(--volt); box-shadow: 0 6px 0 var(--ink-2); }
	.primary:active:not(:disabled) { transform: translateY(4px); box-shadow: var(--shadow-pressed); }
	.primary:disabled { opacity: 0.6; cursor: default; }
	@media (max-height: 640px) { .primary { min-height: 80px; font-size: 24px; } }
	@media (max-height: 560px) { .primary { min-height: 72px; font-size: 22px; } }
	@media (prefers-reduced-motion: reduce) { .primary { transition: none; } }
</style>
