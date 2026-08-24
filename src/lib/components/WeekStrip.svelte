<script lang="ts">
	import type { WeekCell } from '$lib/domain/projections';

	/** Seven cells: volt = lifted, ink = ran, dashed outline = today. */
	let { cells }: { cells: WeekCell[] } = $props();

	const describe = (c: WeekCell) =>
		[c.lifted ? 'lifted' : '', c.ran ? 'ran' : '', c.today ? 'today' : ''].filter(Boolean).join(', ') || 'nothing';
</script>

<div class="strip" role="list" aria-label="This week">
	{#each cells as c (c.key)}
		<div
			class="cell"
			role="listitem"
			class:lifted={c.lifted}
			class:ran={c.ran}
			class:today={c.today}
			class:future={c.future}
			aria-label="{c.label}: {describe(c)}"
		>
			<span class="d">{c.label}</span>
			<span class="box">{#if c.lifted && c.ran}<span class="runbar"></span>{/if}</span>
		</div>
	{/each}
</div>
<div class="legend" aria-hidden="true">
	<span class="sw lift"></span>lifted <span class="sw run"></span>ran
</div>

<style>
	.strip { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
	.cell { display: flex; flex-direction: column; align-items: center; gap: 4px; }
	.d {
		font-family: var(--font-mono); font-size: 11px; font-weight: 700;
		letter-spacing: var(--tracking-caps); color: var(--ink-3);
	}
	.box {
		position: relative; width: 100%; max-width: 40px; aspect-ratio: 1;
		border-radius: var(--radius-sm); overflow: hidden;
		background: var(--surface-sunken); border: 1px solid var(--border-soft);
	}
	.cell.lifted .box { background: var(--volt); border-color: var(--ink); }
	.cell.ran:not(.lifted) .box { background: var(--ink); border-color: var(--ink); }
	.runbar { position: absolute; left: 0; right: 0; bottom: 0; height: 30%; background: var(--ink); }
	.cell.today .box { outline: 2px dashed var(--ink); outline-offset: 2px; }
	.cell.today .d { color: var(--ink); }
	.cell.future .box { opacity: 0.55; }
	.legend {
		margin-top: 8px; display: flex; align-items: center; gap: 6px;
		font-family: var(--font-mono); font-size: 11px; color: var(--ink-3);
	}
	.sw { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
	.sw.lift { background: var(--volt); border: 1px solid var(--ink); }
	.sw.run { background: var(--ink); margin-left: 6px; }
</style>
