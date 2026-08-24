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
		ring = null,
		onclick
	}: {
		variant: 'commit' | 'advance';
		label: string;
		disabled?: boolean;
		/** 1 → 0: a draining ring beside the label — "this will happen by itself, soon" */
		ring?: number | null;
		onclick: () => void;
	} = $props();

	const C = 2 * Math.PI * 9;
</script>

<button type="button" class="primary {variant}" {disabled} {onclick}>
	<span>{label}</span>
	{#if ring !== null}
		<svg class="ring" viewBox="0 0 24 24" aria-hidden="true">
			<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-opacity="0.3" stroke-width="3" />
			<circle
				cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"
				stroke-dasharray={C} stroke-dashoffset={C * (1 - Math.max(0, Math.min(1, ring)))}
				transform="rotate(-90 12 12)"
			/>
		</svg>
	{/if}
</button>

<style>
	.primary {
		display: flex; align-items: center; justify-content: center; gap: 14px;
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
	.ring { width: 28px; height: 28px; flex: none; }
	@media (max-height: 640px) { .primary { min-height: 80px; font-size: 24px; } }
	@media (max-height: 560px) { .primary { min-height: 72px; font-size: 22px; } }
	@media (prefers-reduced-motion: reduce) { .primary { transition: none; } }
</style>
