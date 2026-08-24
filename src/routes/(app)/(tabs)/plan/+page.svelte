<script lang="ts">
	import Card from '$lib/components/Card.svelte';
	import Chip from '$lib/components/Chip.svelte';
	import { dayTitle } from '$lib/domain/projections';
	import type { Exercise } from '$lib/domain/types';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let dayKeys = $derived(Object.keys(plan.days));

	// Which day's exercises are expanded — pure client state, no server involved
	let day = $state('');
	let shownDay = $derived(plan.days[day] ? day : dayKeys[0]);

	/** "3 × 6–12" · "3 × 10–20s" · "2 × 5–15 · L/R" · "3 × 8–12 · per side" */
	const dose = (ex: Exercise) =>
		`${ex.sets} × ${ex.lo}–${ex.hi}${ex.mode === 'seconds' ? 's' : ''}` +
		(ex.side === 'sets' ? ' · L/R' : ex.side === 'reps' ? ' · per side' : '');
</script>

<div class="col">
	<!-- The plan IS the page: its name is the title. Technique notes live on
	     the gym floor's ⋯ sheet, where the movement is actually happening;
	     the increment column is gone because the rule below states it once. -->
	<div class="titleblock">
		<h1>{plan.name}</h1>
		<div class="activemeta">
			{plan.schedule}{plan.runs !== false ? ` · ${plan.runTarget ?? 150} min/wk` : ''}
		</div>
	</div>

	<Card pad={false}>
		<div class="dayhead">
			<div class="chips">
				{#each dayKeys as d (d)}
					<Chip selected={shownDay === d} onclick={() => (day = d)}>{dayTitle(plan, d)}</Chip>
				{/each}
			</div>
			{#if plan.dayInfo?.[shownDay]?.desc}
				<div class="daydesc">{plan.dayInfo[shownDay].desc}</div>
			{/if}
		</div>
		{#each plan.days[shownDay] as ex, i (ex.name)}
			<div class="exrow" class:first={i === 0}>
				<div class="exmain">
					<div class="exname">{ex.name}</div>
					<div class="exequip">{ex.equip}{ex.each ? ' · weight is per hand' : ''}</div>
				</div>
				<span class="exdose">{dose(ex)}</span>
			</div>
		{/each}
		<!-- The rule belongs INSIDE the plan, under the exercises it governs. -->
		<div class="rulebox">
			<div class="caps mb8">How it progresses</div>
			<div class="rule">
				Each set climbs on its own. Top of the range on a set → <span class="hl">that set takes the next size up</span> next time; the others keep climbing where they are.
			</div>
			<div class="ruledown">
				Miss the bottom of the range on the same set twice in a row → it backs off one size.
				Two weeks away → everything comes back one size lighter and builds back. Holds stop
				at the top of the range — past that, make them harder, not longer. Every number is
				a size the rack actually has.
			</div>
		</div>
		<!-- rare acts, text-sized, on the card's bottom border row -->
		<div class="bottomrow">
			<a class="textlink" href="/plan/change">Change plan</a>
			<form method="POST" action="/logout">
				<button type="submit" class="textlink">Sign out</button>
			</form>
		</div>
	</Card>

	<!-- the case for the plans, one tap from the plans themselves -->
	<a class="disclosure" href="/plan/why">
		<span class="tri">▸</span> Why this works
	</a>
</div>

<style>
	.col { display: flex; flex-direction: column; gap: 20px; }
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: var(--text-display);
		line-height: var(--leading-tight);
	}
	.titleblock { display: flex; flex-direction: column; gap: 4px; }
	.activemeta { font-family: var(--font-mono); font-size: 12.5px; color: var(--ink-3); }
	.caps {
		font-size: 12px;
		font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.mb8 { margin-bottom: 8px; }
	.rule {
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: 24px;
		line-height: var(--leading-snug);
	}
	.hl { background: var(--volt); padding: 0 6px; }

	.dayhead { padding: 16px 24px 4px; }
	.chips { display: flex; gap: 10px; flex-wrap: wrap; }
	.daydesc { font-size: var(--text-sm); color: var(--ink-3); padding: 12px 2px 4px; }
	.exrow {
		min-width: 0;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 14px 24px;
		border-top: 1px solid var(--border-soft);
	}
	.exrow.first { border-top: none; margin-top: 8px; }
	.exmain { min-width: 0; }
	.exname { font-weight: var(--weight-bold); font-size: 17px; }
	.exequip { font-size: 13px; color: var(--ink-3); }
	.exdose { font-family: var(--font-mono); font-size: 13px; color: var(--ink-2); white-space: nowrap; flex: none; }
	/* the rule, as the closing section of the plan card it governs */
	.rulebox { padding: 18px 24px 20px; border-top: var(--border-w) solid var(--ink); background: var(--paper-2); }
	.ruledown { font-size: 14px; color: var(--ink-2); margin-top: 10px; }
	.bottomrow {
		display: flex; justify-content: space-between; align-items: center; gap: 12px;
		padding: 4px 16px; border-top: 1px solid var(--border-soft);
		background: var(--paper-2); border-radius: 0 0 var(--radius-lg) var(--radius-lg);
	}
	.textlink {
		display: inline-flex; align-items: center; min-height: 44px; padding: 0 8px;
		background: none; border: none; cursor: pointer;
		font-family: var(--font-body); font-size: 12px; font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-3);
		text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--border-soft);
	}
	.textlink:hover { color: var(--ink); background: var(--volt-tint); border-radius: var(--radius-sm); }

	.disclosure {
		display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 4px;
		font-size: 12px; font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps);
		text-transform: uppercase; color: var(--ink-3); text-decoration: none; border-radius: var(--radius-sm);
	}
	.disclosure:hover { color: var(--ink); background: var(--volt-tint); }
	.tri { font-size: 12px; }
</style>
