<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		minutes,
		target = 150,
		children
	}: { minutes: number; target?: number; children?: Snippet } = $props();

	let pct = $derived(Math.min(100, (minutes / target) * 100));
	let onTarget = $derived(minutes >= target);
</script>

<div class="wp">
	<div class="head">
		<span class="lbl">Running — this week</span>
		<span class="num">{minutes}<span class="unit"> min</span></span>
	</div>
	<div class="track" role="meter" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(minutes, target)} aria-label="Weekly run minutes">
		<div class="fill" class:full={onTarget} style="width: {pct}%"></div>
	</div>
	<div class="status">
		{#if onTarget}
			<span class="up">↑</span> On target — {minutes} of {target} min
		{:else}
			{target - minutes} min to go this week
		{/if}
	</div>
	{#if children}
		<div class="extra">{@render children()}</div>
	{/if}
</div>

<style>
	.wp {
		background: var(--surface-card);
		border: var(--border-w) solid var(--border-soft);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-card);
		padding: 24px;
	}
	.head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
	.lbl {
		font-size: 12px;
		font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.num { font-family: var(--font-mono); font-weight: 800; font-size: var(--text-data); }
	.unit { font-size: 14px; color: var(--ink-3); font-weight: var(--weight-bold); }
	.track {
		margin-top: 12px;
		height: 16px;
		background: var(--surface-sunken);
		border: 1px solid var(--border-soft);
		border-radius: var(--radius-pill);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: var(--volt);
		border-right: 2px solid var(--ink);
		transition: width var(--dur-slow) var(--ease-out);
	}
	.fill.full { border-right: none; }
	.status { margin-top: 10px; font-family: var(--font-mono); font-size: 13px; color: var(--ink-2); }
	.up { background: var(--volt); padding: 0 5px; border-radius: 4px; font-weight: var(--weight-bold); }
	.extra { margin-top: 16px; }
</style>
