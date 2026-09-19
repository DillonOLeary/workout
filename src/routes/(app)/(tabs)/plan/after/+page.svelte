<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Picks from '$lib/components/Picks.svelte';
	import { MAX_INTENTS } from '$lib/domain/preferences';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
</script>

<div class="col">
	<div class="head">
		<a class="back" href="/plan" aria-label="Back to The Plan">←</a>
		<h1>What I'm after</h1>
	</div>
	<p class="lede">Tilts the order Today deals — pick up to {MAX_INTENTS}. Nothing here changes a set, a rep or an exercise.</p>
	<Card>
		<Picks which="intents" {plan} events={data.events} preferences={data.preferences} message={form?.message} />
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
</style>
