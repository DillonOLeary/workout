<script lang="ts">
	import { paceLabel, rateLabel } from '$lib/domain/labels';
	import type { Pace } from '$lib/domain/projections';

	/**
	 * The running average, as two numbers: lifts a week and run minutes a
	 * week — each over the trailing four weeks, each with the direction it
	 * came from underneath. Run days are not a third tile: the calendar
	 * already shows them, and the minutes are the number the plan's goal is
	 * written in.
	 *
	 * The goals are NOT here: the section's sentence above states both of
	 * them once ("the plan asks 3 and 90"), so a tile saying "goal 90" again
	 * would be the same fact twice. The tiles carry what the sentence can't:
	 * the number as a number, and which way it moved. Two tiles across at
	 * every width — they are one comparison, not two cards.
	 */
	let { pace, runs = true }: { pace: Pace; runs?: boolean } = $props();

	const weeks = $derived(Math.round(pace.days / 7));
	const minutes = $derived(Math.round(pace.runMinutes.per));
	const tiles = $derived(
		[
			{ key: 'lifts', caps: 'Lifts', value: rateLabel(pace.lifts.per), sub: paceLabel(pace.lifts.per, pace.lifts.prev) },
			runs && { key: 'runmin', caps: 'Run min', value: rateLabel(minutes), sub: paceLabel(minutes, Math.round(pace.runMinutes.prev)) }
		].filter((t) => !!t)
	);
</script>

<div class="head">
	<span class="caps">Weekly average</span>
	<span class="win">last {weeks} weeks</span>
</div>
<div class="tiles">
	{#each tiles as t (t.key)}
		<div class="tile">
			<span class="caps">{t.caps}</span>
			<span class="num"><b>{t.value}</b><i>/wk</i></span>
			<span class="sub">{t.sub}</span>
		</div>
	{/each}
</div>

<style>
	.head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 0 0 8px; max-width: 332px; }
	.caps {
		font-size: 12px; font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps);
		text-transform: uppercase; color: var(--ink-3);
	}
	.win { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); }
	/* the same 332px the calendar stops at — the two blocks read as one column */
	.tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; max-width: 332px; }
	.tile {
		display: flex; flex-direction: column; gap: 2px;
		padding: 10px 12px;
		background: var(--surface-sunken); border: 1px solid var(--border-soft); border-radius: var(--radius-md);
	}
	/* the number is the point: big mono, its unit tucked in beside it */
	.num { display: flex; align-items: baseline; gap: 3px; }
	.num b { font-family: var(--font-mono); font-size: 24px; font-weight: 800; line-height: 1.1; color: var(--ink); }
	.num i { font-family: var(--font-mono); font-size: 11px; font-style: normal; color: var(--ink-2); }
	.sub { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); }

	@media (max-width: 420px) {
		.tile { padding: 8px 9px; gap: 1px; }
		.tile .caps { font-size: 10px; letter-spacing: 0.04em; }
		.num b { font-size: 20px; }
		.num i, .sub { font-size: 10px; }
	}
</style>
