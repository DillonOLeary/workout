<script lang="ts">
	/**
	 * The only number editor: −  value  +, 44px targets, never a keyboard. `onstep` gets +1 or −1; the parent owns the number.
	 * `size` md is the plan's 40px box · sm the row's 36px · bare is the floor's tile (no box, big digits) · pair the ledger's two square keys.
	 */
	let {
		value,
		unit = '',
		size = 'md',
		disabled = false,
		label,
		onstep
	}: { value: string | number; unit?: string; size?: 'md' | 'sm' | 'bare' | 'pair'; disabled?: boolean; label?: string; onstep: (dir: 1 | -1) => void } = $props();
</script>

<span class="stepper {size}" class:disabled>
	<button type="button" {disabled} onclick={() => onstep(-1)} aria-label="Less{label ? ` ${label}` : ''}">−</button>
	{#if size !== 'pair'}<b>{value}{unit}</b>{/if}
	<button type="button" {disabled} onclick={() => onstep(1)} aria-label="More{label ? ` ${label}` : ''}">+</button>
</span>

<style>
	.stepper { display: inline-flex; align-items: center; background: var(--white); border: 1.5px solid var(--ink); border-radius: 12px; overflow: hidden; flex: none; }
	.stepper.disabled { opacity: 0.4; }
	button {
		width: 44px; height: 40px; border: 0; background: none; padding: 0; margin: 0;
		font-family: var(--font-mono); font-size: 18px; font-weight: 700; color: var(--ink);
		cursor: pointer; touch-action: manipulation;
	}
	button:disabled { cursor: default; }
	button:hover:not(:disabled) { background: var(--volt-light); }
	b { font-family: var(--font-mono); font-size: 18px; min-width: 32px; text-align: center; color: var(--ink); font-variant-numeric: tabular-nums; }
	.sm button { width: 40px; height: 36px; font-size: 16px; }
	.sm b { font-size: 14px; min-width: 40px; }
	.bare { background: none; border: 0; border-radius: 0; gap: 4px; }
	.bare button { color: var(--slate); font-size: 20px; }
	.bare b { font-size: 22px; min-width: 40px; }
	.pair { background: none; border: 0; border-radius: 0; gap: 8px; overflow: visible; }
	.pair button { width: 36px; height: 34px; border: 1.5px solid var(--ink); border-radius: 9px; background: var(--white); font-size: 16px; }
</style>
