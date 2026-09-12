<script lang="ts">
	import { paceLabel, rateLabel } from '$lib/domain/labels';
	import type { Pace } from '$lib/domain/projections';

	/**
	 * The running average, as two numbers: lifts a week and run minutes a
	 * week — each over the trailing four weeks, each with where it came from
	 * underneath. The calendar above says what happened; this says whether it
	 * adds up to the habit you wanted, and which way it is moving. Run days
	 * are not a third tile: the calendar already shows them, and the minutes
	 * are the number the plan's goal is written in.
	 *
	 * The run's goal is the plan's own `runTarget`, so the one number with a
	 * goal is measured against it instead of against a feeling. Two tiles
	 * across at every width — they are one comparison, not two cards — which
	 * is why every word in them is short enough for a phone.
	 */
	let {
		pace,
		runTarget = null,
		runs = true
	}: { pace: Pace; runTarget?: number | null; runs?: boolean } = $props();

	const weeks = $derived(Math.round(pace.days / 7));
	const minutes = $derived(Math.round(pace.runMinutes.per));
	const tiles = $derived(
		[
			{ key: 'lifts', caps: 'Lifts', value: rateLabel(pace.lifts.per), sub: paceLabel(pace.lifts.per, pace.lifts.prev) },
			runs && {
				key: 'runmin',
				caps: 'Run min',
				value: rateLabel(minutes),
				sub: [...(runTarget ? [`goal ${runTarget}`] : []), paceLabel(minutes, Math.round(pace.runMinutes.prev))].join(' · ')
			}
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
	.head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 16px 0 8px; }
	.caps {
		font-size: 12px; font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps);
		text-transform: uppercase; color: var(--ink-3);
	}
	.win { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); }
	.tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
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
