<script lang="ts">
	import { enhance } from '$app/forms';
	import Card from '$lib/components/Card.svelte';
	import { standInMeta, weekMeta } from '$lib/domain/labels';
	import { routineTitle, type Block, type Cycle } from '$lib/domain/plan';
	import { BLOCKS } from '$lib/domain/plans';
	import { weekProgress } from '$lib/domain/projections';
	import { estimateMinutes, sessionSteps } from '$lib/domain/steps';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const now = Date.now();

	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let lift = $derived(plan.cycles.find((c) => c.id === 'lift') ?? plan.cycles[0]);
	const isOn = (b: Block) => data.blocksOn.includes(b.id);
	let onBlocks = $derived(BLOCKS.filter(isOn));
	let offBlocks = $derived(BLOCKS.filter((b) => !isOn(b)));

	const minutesOf = (r: string) => estimateMinutes(sessionSteps(plan, { routine: r }));
	const cycleMinutes = (c: Cycle) => Math.round(c.routines.reduce((n, r) => n + minutesOf(r), 0) / c.routines.length);
</script>

{#snippet blockRow(b: Block, on: boolean)}
	{@const c = b.cycle}
	{@const done = weekProgress(data.events, plan, c, now).done}
	{@const own = c.routines.filter((r) => b.routines[r])}
	{@const standIn = c.standsInFor ? plan.cycles.find((x) => x.id === c.standsInFor) : undefined}
	<div class="blockrow" class:off={!on}>
		<span class="sw ink-{b.routineInfo[own[0]].discipline}"></span>
		<div class="rowcaps">
			<span class="rowtitle">{c.title}</span>
			<span class="rowmeta">{c.target > 0 ? weekMeta(c.target, done) : standInMeta(standIn?.title ?? lift.title, standIn?.target ?? lift.target)}</span>
		</div>
		<span class="sub">
			{#each own as r, k (r)}{#if k}<span class="dotsep"> · </span>{/if}<a class="rlink" href="/plan?routine={r}">{routineTitle(plan, r)}</a>{/each}
			{#if c.routines.length > own.length}<span class="dotsep"> · +{c.routines.length - own.length}</span>{/if}
			<span class="dotsep"> · ~{cycleMinutes(c)} min</span>
		</span>
		<form method="POST" action="?/toggle" use:enhance class="togform">
			<input type="hidden" name="block" value={b.id} />
			<input type="hidden" name="on" value={String(!on)} />
			<button type="submit" class="tog" role="switch" aria-checked={on} aria-label="{b.cycle.title} {on ? 'on' : 'off'}">
				<span class="knob"></span>
			</button>
		</form>
	</div>
{/snippet}

<div class="col">
	<div class="head">
		<a class="back" href="/plan" aria-label="Back to The Plan">←</a>
		<h1>Blocks in the week</h1>
	</div>
	<p class="lede">The lift is the programme's; these are yours to switch. On, Today deals it at its cadence. Off, it leaves the week — the routines stay, the sessions don't.</p>

	{#if form?.message}<p class="err">{form.message}</p>{/if}

	<Card pad={false}>
		{#if onBlocks.length}
			<div class="divider first">
				<span class="caps">In your week</span>
			</div>
			{#each onBlocks as b (b.id)}{@render blockRow(b, true)}{/each}
		{/if}
		{#if offBlocks.length}
			<div class="divider" class:first={!onBlocks.length}>
				<span class="caps">Not in your week</span>
				<span class="meta">switch one on and Today deals it</span>
			</div>
			{#each offBlocks as b (b.id)}{@render blockRow(b, false)}{/each}
		{/if}
		<div class="foot">a switch is an event · the ledger shows when the week changed</div>
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
	.err { margin: 0; color: var(--danger); font-weight: var(--weight-bold); font-size: var(--text-sm); }
	.caps {
		font-size: 12px; font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps);
		text-transform: uppercase; color: var(--ink-3);
	}
	.meta { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); }

	.divider {
		display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap;
		padding: 10px 16px 6px; border-top: 1px solid var(--border-soft);
	}
	.divider.first { border-top: none; padding-top: 14px; }
	.blockrow {
		display: grid; grid-template-columns: auto 1fr auto; grid-template-areas: 'sw title tog' '. sub tog';
		column-gap: 10px; row-gap: 2px; align-items: center; padding: 12px 16px; border-top: 1px solid var(--border-soft);
	}
	.blockrow.off { opacity: 0.7; }
	.sw { grid-area: sw; align-self: start; width: 12px; height: 12px; border-radius: 3px; border: 1px solid var(--ink); display: inline-block; margin-top: 4px; }
	.rowcaps { grid-area: title; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; min-width: 0; }
	.rowtitle { font-size: 16px; font-weight: var(--weight-bold); }
	.rowmeta { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); }
	.sub { grid-area: sub; font-size: 13px; color: var(--ink-2); line-height: 1.45; }
	.dotsep { color: var(--ink-3); }
	.rlink { color: inherit; text-decoration: underline dotted; text-underline-offset: 3px; text-decoration-color: var(--ink-3); }
	.rlink:hover { color: var(--ink); text-decoration-color: var(--ink); }
	.togform { grid-area: tog; align-self: center; }
	.tog {
		position: relative; width: 48px; height: 28px; padding: 0;
		background: var(--white); border: var(--border-w) solid var(--ink); border-radius: var(--radius-pill);
		cursor: pointer; touch-action: manipulation;
		transition: background var(--dur-med) var(--ease-snap);
	}
	.tog[aria-checked='true'] { background: var(--volt); }
	.knob {
		position: absolute; top: 2px; left: 2px; width: 20px; height: 20px;
		background: var(--ink); border-radius: 50%;
		transition: left var(--dur-med) var(--ease-snap);
	}
	.tog[aria-checked='true'] .knob { left: 22px; }
	.foot {
		padding: 8px 16px; background: var(--paper-2); border-top: 1px solid var(--border-soft);
		border-radius: 0 0 var(--radius-lg) var(--radius-lg);
		font-family: var(--font-mono); font-size: 11px; color: var(--ink-3);
	}
</style>
