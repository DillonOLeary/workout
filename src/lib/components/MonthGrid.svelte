<script lang="ts">
	import { disciplineLabel } from '$lib/domain/labels';
	import type { Discipline } from '$lib/domain/plan';
	import type { DayCell, MonthGrid } from '$lib/domain/projections';

	/**
	 * The last five weeks as a calendar, one ink per discipline (the shared
	 * `.ink-*` rules in design/disciplines.css); dashed = today and only today
	 * — never a state. A day with two sessions SPLITS — one stripe each, in
	 * the order they happened — it never invents a colour and never shows
	 * only the "important" one. No legend of its own: the Ledger's legend
	 * under it carries the numbers too.
	 *
	 * Thirty-five boxes have to fit across a phone without a scroll, so the
	 * boxes are tight (a 3px gutter, ~44px at the widest) and the day number
	 * lives INSIDE the box instead of above it — one row of glyphs per week,
	 * nothing stacked.
	 */
	let { grid }: { grid: MonthGrid } = $props();

	const describe = (c: DayCell) =>
		[...c.did.map((d) => disciplineLabel(d).toLowerCase()), c.today ? 'today' : ''].filter(Boolean).join(', ') || 'nothing';
	// the number sits on the last stripe: dark ink on a light one, paper on a
	// dark one. Every discipline says which — a new one is a type error here,
	// and its colour goes in design/disciplines.css
	const INK: Record<Discipline, 'light' | 'dark'> = { lift: 'light', yoga: 'dark', bodyweight: 'light', mobility: 'light', run: 'dark' };
	const dark = (d: Discipline | undefined) => d !== undefined && INK[d] === 'dark';
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
					class:did={c.did.length > 0}
					class:today={c.today}
					class:future={c.future}
					class:dark={dark(c.did[c.did.length - 1])}
					aria-label="{c.label}: {describe(c)}"
				>
					{#each c.did as d, k (k)}<span class="stripe ink-{d}"></span>{/each}
					<span class="n">{c.date}</span>
				</div>
			{/each}
		{/each}
	</div>
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
		display: flex;
		border-radius: var(--radius-sm); overflow: hidden;
		background: var(--surface-sunken); border: 1px solid var(--border-soft);
	}
	.cell.did { border-color: var(--ink); }
	/* one stripe per session, left to right in the order they happened; its
	   colour is the discipline's shared ink (a global rule, so no :global here) */
	.stripe { flex: 1 1 0; min-width: 0; }
	.stripe + .stripe { border-left: 1px solid var(--ink); }
	.n {
		position: absolute; inset: 0; display: grid; place-items: center;
		font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--ink-3);
	}
	.cell.did .n { color: var(--ink); }
	.cell.dark .n { color: var(--white); }
	.cell.today { outline: 2px dashed var(--ink); outline-offset: 1px; }
	.cell.today .n { color: var(--ink); }
	.cell.today.dark .n { color: var(--white); }
	.cell.future { opacity: 0.5; }

	@media (max-width: 420px) {
		.week { gap: 3px; }
		.grid { row-gap: 3px; }
		.n { font-size: 10px; }
	}
</style>
