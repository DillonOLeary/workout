<script lang="ts">
	/**
	 * The one big button. Colour law: volt fill = commit this set (Log set,
	 * Start hold, Done early); ink fill with volt text = move on (Next
	 * exercise, Finish workout). Never two volt fills on screen at once.
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

<button type="button" class="primary {variant}" {disabled} {onclick}>{label}</button>

<style>
	.primary {
		width: 100%; min-height: 96px;
		border: var(--border-w) solid var(--ink); border-radius: var(--radius-lg);
		font-family: var(--font-display); font-weight: var(--weight-black);
		font-size: 28px; letter-spacing: 0.02em; text-transform: uppercase;
		cursor: pointer; touch-action: manipulation;
	}
	.primary.commit  { background: var(--volt); color: var(--ink);  box-shadow: 0 6px 0 var(--ink); }
	.primary.advance { background: var(--ink);  color: var(--volt); box-shadow: 0 6px 0 var(--ink-2); }
	.primary:active:not(:disabled) { transform: translateY(4px); box-shadow: var(--shadow-pressed); }
	.primary:disabled { opacity: 0.6; cursor: default; }
	@media (max-height: 640px) { .primary { min-height: 80px; font-size: 24px; } }
	@media (max-height: 560px) { .primary { min-height: 72px; font-size: 22px; } }
	@media (prefers-reduced-motion: reduce) { .primary { transition: none; } }
</style>
