<script lang="ts">
	import type { DayCell, MonthGrid } from '$lib/domain/projections';

	/**
	 * The last five weeks as a calendar, one vocabulary: volt = lifted, ink =
	 * ran, white with an ink outline = stretched, dashed = today and only
	 * today — never a state.
	 *
	 * Thirty-five boxes have to fit across a phone without a scroll, so the
	 * boxes are tight (a 3px gutter, ~44px at the widest) and the day number
	 * lives INSIDE the box instead of above it — one row of glyphs per week,
	 * nothing stacked.
	 */
	let { grid }: { grid: MonthGrid } = $props();

	const describe = (c: DayCell) =>
		[c.lifted ? 'lifted' : '', c.ran ? 'ran' : '', c.stretched ? 'stretched' : '', c.today ? 'today' : '']
			.filter(Boolean)
			.join(', ') || 'nothing';
</script>

<div class="cal">
	<div class="week" aria-hidden="true">
		{#each grid.weekdays as w, i (i)}<span class="wd">{w}</span>{/each}
	</div>
	<div class="week grid" role="list" aria-label="The last {grid.weeks.length} weeks">
		{#each grid.weeks as week, wi (wi)}
			{#each week as c (c.key)}
				<div
					class="cell"
					role="listitem"
					class:lifted={c.lifted}
					class:ran={c.ran}
					class:stretched={c.stretched}
					class:today={c.today}
					class:future={c.future}
					aria-label="{c.label}: {describe(c)}"
				>
					<span class="n">{c.date}</span>
					{#if (c.lifted || c.stretched) && c.ran}<span class="runbar"></span>{/if}
				</div>
			{/each}
		{/each}
	</div>
</div>
<div class="legend" aria-hidden="true">
	<span class="sw lift"></span>lifted <span class="sw run"></span>ran <span class="sw stretch"></span>stretched
	<span class="sw today"></span>today
</div>

<style>
	/* seven 44px boxes and six 4px gutters: past that the calendar spreads out
	   into a sparse field, so it stops growing and the phone case decides the
	   shape — below 332px the boxes shrink to fit instead */
	.cal { display: flex; flex-direction: column; gap: 4px; max-width: 332px; }
	.week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
	.grid { row-gap: 4px; }
	.wd {
		font-family: var(--font-mono); font-size: 10px; font-weight: 700;
		letter-spacing: var(--tracking-caps); color: var(--ink-3); text-align: center;
	}
	.cell {
		position: relative;
		width: 100%; max-width: 44px; aspect-ratio: 1; margin: 0 auto;
		display: grid; place-items: center;
		border-radius: var(--radius-sm); overflow: hidden;
		background: var(--surface-sunken); border: 1px solid var(--border-soft);
	}
	.n { font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--ink-3); }
	.cell.stretched { background: var(--white); border-color: var(--ink); }
	.cell.lifted { background: var(--volt); border-color: var(--ink); }
	.cell.stretched .n, .cell.lifted .n { color: var(--ink); }
	.cell.ran:not(.lifted):not(.stretched) { background: var(--ink); border-color: var(--ink); }
	.cell.ran:not(.lifted):not(.stretched) .n { color: var(--white); }
	/* lifted AND ran: the box keeps its color, the run takes the bottom edge */
	.runbar { position: absolute; left: 0; right: 0; bottom: 0; height: 26%; background: var(--ink); }
	.cell.today { outline: 2px dashed var(--ink); outline-offset: 1px; }
	.cell.today .n { color: var(--ink); }
	.cell.future { opacity: 0.5; }
	.legend {
		margin-top: 8px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
		font-family: var(--font-mono); font-size: 11px; color: var(--ink-3);
	}
	.sw { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
	.sw.lift { background: var(--volt); border: 1px solid var(--ink); }
	.sw.run { background: var(--ink); margin-left: 6px; }
	.sw.stretch { background: var(--white); border: 1px solid var(--ink); margin-left: 6px; }
	.sw.today { background: transparent; border: 1px dashed var(--ink); margin-left: 6px; }

	@media (max-width: 420px) {
		.week { gap: 3px; }
		.grid { row-gap: 3px; }
		.n { font-size: 10px; }
	}
</style>
