<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Picks from '$lib/components/Picks.svelte';
	import { BLOCKS } from '$lib/domain/plans';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let lift = $derived(plan.cycles.find((c) => c.id === 'lift') ?? plan.cycles[0]);
	let floor = $derived(BLOCKS.find((b) => b.cycle.standsInFor === lift.id));
	let floorOn = $derived(!!floor && data.blocksOn.includes(floor.id));
</script>

<div class="col">
	<div class="head">
		<a class="back" href="/plan" aria-label="Back to The Plan">←</a>
		<h1>What I've got</h1>
	</div>
	<p class="lede">
		A routine that needs what you haven't got is ruled out, not hidden.
		{#if floorOn}No gym → the {floor?.cycle.title} block deals in the lift's place.{:else}No gym → nothing stands in for the lift until <a href="/plan/blocks">{floor?.cycle.title ?? 'No gym'} is switched on</a>.{/if}
	</p>
	<Card>
		<Picks which="equipment" {plan} events={data.events} preferences={data.preferences} message={form?.message} />
	</Card>
</div>

<style>
	.col { display: flex; flex-direction: column; gap: 16px; }
	.head { display: flex; align-items: center; gap: 14px; }
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: 34px;
		line-height: var(--leading-tight);
	}
	.back {
		width: 48px; height: 48px; flex: none;
		display: inline-flex; align-items: center; justify-content: center;
		background: var(--white); border: var(--border-w) solid var(--ink); border-radius: var(--radius-md);
		box-shadow: var(--shadow-raised); text-decoration: none;
		font-family: var(--font-display); font-weight: var(--weight-black); font-size: 22px; color: var(--ink);
	}
	.back:hover { background: var(--volt-tint); }
	.back:active { transform: translateY(2px); box-shadow: var(--shadow-pressed); }
	.lede { margin: 0; font-family: var(--font-mono); font-size: 13px; color: var(--ink-3); line-height: 1.45; }
	.lede a { color: var(--ink); text-decoration-color: var(--volt-deep); }
</style>
