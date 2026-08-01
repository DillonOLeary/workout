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
		<span class="num">{minutes} / {target}<span class="unit"> min</span></span>
	</div>
	<div class="track" role="meter" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(minutes, target)} aria-label="Weekly run minutes">
		<div class="fill" class:full={onTarget} style="width: {pct}%"></div>
	</div>
	{#if onTarget}<div class="status"><span class="up">↑</span> On target</div>{/if}
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
		padding: 20px;
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
		margin-top: 10px;
		height: 14px;
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
	.status { margin-top: 8px; font-family: var(--font-mono); font-size: 13px; color: var(--ink-2); }
	.up { background: var(--volt); padding: 0 5px; border-radius: 4px; font-weight: var(--weight-bold); }
	.extra { margin-top: 14px; }
	@media (max-width: 900px) {
		.wp { padding: 14px; }
		.num { font-size: 18px; }
		.track { margin-top: 8px; height: 12px; }
		.extra { margin-top: 10px; }
	}
	@media (max-height: 700px) {
		.wp { padding: 10px 12px; }
		.track { margin-top: 6px; height: 10px; }
		.extra { margin-top: 8px; }
	}
</style>
