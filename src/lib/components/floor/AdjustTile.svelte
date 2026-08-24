<script lang="ts">
	/**
	 * One adjuster: label, − value +. The value is a real number input so every
	 * number is reachable by keypad; ± semantics live with the caller (a racked
	 * lift walks the rack, a machine steps its inc, reps step 1) — the tile
	 * prints its own step in the label so the gesture is never a mystery.
	 * Quiet on purpose: 1px soft border, no shadow — commit is the only loud
	 * thing on the floor.
	 */
	let {
		label,
		value = $bindable(0),
		decimals = false,
		onStep,
		disabled = false,
		min = 1,
		max = 2000
	}: {
		label: string;
		value?: number;
		decimals?: boolean;
		onStep: (dir: 1 | -1) => void;
		disabled?: boolean;
		min?: number;
		max?: number;
	} = $props();

	const fmt = $derived(Number.isInteger(value) ? String(value) : value.toFixed(1));

	// clamp, then write the clean value back — a rejected keystroke never
	// leaves the field showing a value we didn't store
	function commit(el: HTMLInputElement) {
		const n = Number(el.value);
		if (Number.isFinite(n)) {
			const rounded = decimals ? Math.round(n * 2) / 2 : Math.round(n);
			value = Math.max(min, Math.min(max, rounded));
		}
		el.value = Number.isInteger(value) ? String(value) : value.toFixed(1);
	}
</script>

<div class="tile" class:disabled>
	<span class="lbl">{label}</span>
	<div class="ctl">
		<button type="button" {disabled} onclick={() => onStep(-1)} aria-label="Decrease {label}">−</button>
		<input
			type="number"
			{disabled}
			inputmode={decimals ? 'decimal' : 'numeric'}
			step={decimals ? 0.5 : 1}
			{min}
			{max}
			value={fmt}
			onchange={(e) => commit(e.currentTarget)}
			aria-label="{label} — type an exact number"
		/>
		<button type="button" {disabled} onclick={() => onStep(1)} aria-label="Increase {label}">+</button>
	</div>
</div>

<style>
	.tile {
		min-width: 0; min-height: 68px; background: var(--surface-card);
		border: 1px solid var(--border-soft); border-radius: 14px;
		display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
	}
	.tile.disabled { background: var(--surface-page); border-style: dashed; opacity: 0.5; }
	.lbl {
		font-size: 9.5px; font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps);
		text-transform: uppercase; color: var(--ink-3); white-space: nowrap;
		max-width: 100%; overflow: hidden; text-overflow: ellipsis; padding: 0 8px;
	}
	/* the tile must shrink with its grid column — buttons are fixed, the
	   input gives; without min-width: 0 the column overflows the screen */
	.ctl { display: flex; align-items: center; justify-content: center; gap: 4px; width: 100%; padding: 0 2px; }
	.ctl button {
		flex: none; width: 44px; min-height: 44px; background: transparent; border: none;
		font-family: var(--font-mono); font-size: 21px; font-weight: 700; color: var(--ink-2);
		cursor: pointer; touch-action: manipulation; border-radius: var(--radius-sm);
	}
	.ctl button:disabled { cursor: default; opacity: 0.5; }
	.ctl input {
		flex: 1 1 auto; min-width: 0; max-width: 96px;
		text-align: center; background: transparent; border: none; padding: 0;
		font-family: var(--font-mono); font-size: 21px; font-weight: 800; color: var(--ink);
		appearance: textfield; -moz-appearance: textfield;
	}
	.ctl input::-webkit-outer-spin-button,
	.ctl input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
	@media (max-height: 640px) { .tile { min-height: 60px; } }
	@media (max-height: 560px) { .tile { min-height: 56px; } }
</style>
