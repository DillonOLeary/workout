<script lang="ts">
	let { value = $bindable(''), name = 'phone' }: { value?: string; name?: string } = $props();
</script>

<label class="phone">
	<span class="lbl">Phone number</span>
	<input
		{name}
		type="tel"
		inputmode="tel"
		autocomplete="tel"
		placeholder="(555) 015-5309"
		bind:value
	/>
</label>

<style>
	.phone { display: flex; flex-direction: column; gap: 8px; }
	.lbl {
		font-size: 12px;
		font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--ink-3);
	}
	input {
		min-height: var(--hit-min);
		padding: 0 16px;
		font-family: var(--font-mono);
		font-size: var(--text-data);
		color: var(--ink);
		background: var(--white);
		border: var(--border-w) solid var(--ink);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-card);
	}
	input::placeholder { color: var(--ink-3); opacity: 0.7; }
</style>
