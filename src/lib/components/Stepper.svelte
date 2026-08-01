<script lang="ts">
	let {
		value = $bindable(0),
		step = 5,
		min = 0,
		max = 999,
		unit = '',
		label = ''
	}: {
		value?: number;
		step?: number;
		min?: number;
		max?: number;
		unit?: string;
		label?: string;
	} = $props();
</script>

<div class="stepper" role="group" aria-label={label}>
	<button type="button" class="step" onclick={() => (value = Math.max(min, value - step))} aria-label="Decrease {label}">−</button>
	<div class="readout" aria-live="polite">
		<span class="v">{value}</span>
		{#if unit}<span class="u">{unit}</span>{/if}
	</div>
	<button type="button" class="step" onclick={() => (value = Math.min(max, value + step))} aria-label="Increase {label}">+</button>
</div>

<style>
	.stepper { display: inline-flex; align-items: stretch; gap: 8px; }
	.step {
		width: var(--hit-min);
		min-height: var(--hit-min);
		background: var(--white);
		border: var(--border-w) solid var(--ink);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-raised);
		font-family: var(--font-mono);
		font-weight: var(--weight-bold);
		font-size: 26px;
		color: var(--ink);
		cursor: pointer;
		touch-action: manipulation;
	}
	.step:active { transform: translateY(2px); box-shadow: var(--shadow-pressed); }
	.readout {
		min-width: 96px;
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 5px;
		background: var(--white);
		border: var(--border-w) solid var(--ink);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-card);
		padding: 0 14px;
	}
	.v { font-family: var(--font-mono); font-weight: 800; font-size: var(--text-data); align-self: center; }
	.u { font-family: var(--font-mono); font-size: 13px; color: var(--ink-3); align-self: center; }
	@media (max-height: 700px) {
		.step { min-height: 48px; }
	}
</style>
