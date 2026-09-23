<script lang="ts">
	/** Volt track = on. Off dims the whole row (the row does that; this is only the switch). `type="submit"` inside a form posts the flip. */
	let { on, label, type = 'button', onclick }: { on: boolean; label: string; type?: 'button' | 'submit'; onclick?: () => void } = $props();
</script>

<button {type} class="switch" class:on role="switch" aria-checked={on} aria-label="{label} {on ? 'on' : 'off'}" {onclick}>
	<span class="knob"></span>
</button>

<style>
	.switch {
		position: relative; flex: none; width: 46px; height: 28px; padding: 0;
		background: var(--white); border: var(--border-w) solid var(--ink); border-radius: var(--radius-pill);
		cursor: pointer; touch-action: manipulation;
		transition: background var(--dur-med) var(--ease-snap);
	}
	.switch.on { background: var(--volt); }
	.knob {
		position: absolute; top: 2px; left: 2px; width: 20px; height: 20px;
		background: var(--ink); border-radius: 50%;
		transition: left var(--dur-med) var(--ease-snap);
	}
	.switch.on .knob { left: 22px; }
	@media (prefers-reduced-motion: reduce) { .switch, .knob { transition: none; } }
</style>
