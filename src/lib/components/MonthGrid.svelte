<script lang="ts">
	import DayCells from './DayCells.svelte';
	import type { MonthGrid } from '$lib/domain/projections';

	let { grid }: { grid: MonthGrid } = $props();
</script>

<div class="cal">
	<div class="wds" aria-hidden="true">
		{#each grid.weekdays as w, i (i)}<span class="wd">{w}</span>{/each}
	</div>
	{#each grid.weeks as week, wi (wi)}
		<DayCells cells={week} label="Week {wi + 1} of {grid.weeks.length}" />
	{/each}
</div>

<style>
	/* 332px = seven 44px boxes and six 4px gutters */
	.cal { display: flex; flex-direction: column; gap: 4px; max-width: 332px; }
	.wds { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
	.wd {
		font-family: var(--font-mono); font-size: 10px; font-weight: 700;
		letter-spacing: var(--tracking-caps); color: var(--ink-3); text-align: center;
	}
	@media (max-width: 420px) {
		.cal { gap: 3px; }
		.wds { gap: 3px; }
	}
</style>
