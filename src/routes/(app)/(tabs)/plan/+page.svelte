<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Chip from '$lib/components/Chip.svelte';
	import { dayTitle, rangeLabel, setsLabel, stepLabel } from '$lib/domain/projections';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let dayKeys = $derived(Object.keys(plan.days));

	// Which day's exercises are expanded — pure client state, no server involved
	let day = $state('');
	let shownDay = $derived(plan.days[day] ? day : dayKeys[0]);

	// everything except the one already shown in full above
	let others = $derived(data.plans.filter((p) => p.id !== plan.id));

	let json = $state('');

	// Switching plans is history (a PlanSelected event) — make it deliberate.
	let confirming = $state<string | null>(null);
</script>

<div class="col">
	<h1>The Plan</h1>

	{#if form?.message}
		<p class="err">{form.message}</p>
	{/if}

	<Card pad={false}>
		<div class="planhead-row">
			<div class="activename">{plan.name}</div>
			<!-- one line, not two stacked pills that each wrap on a phone -->
			<div class="activemeta">
				{plan.schedule}{plan.runs !== false ? ` · ${plan.runTarget ?? 150} min/wk` : ''}
			</div>
		</div>
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
				<div>
					<div class="exname">{ex.name}</div>
					<div class="exequip">{ex.equip}{ex.each ? ' · weight is per hand' : ''}</div>
					{#if ex.note}<div class="exnote">{ex.note}</div>{/if}
				</div>
				<span class="exnums">
					<span>{setsLabel(ex)}</span>
					<span>{rangeLabel(ex)}</span>
					<span class="exinc">{stepLabel(ex)}</span>
				</span>
			</div>
		{/each}
		<!-- The rule belongs INSIDE the plan, under the exercises it governs.
		     As a sibling card it read as an unrelated fact about the app. -->
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
	</Card>

	<!-- the case for the plans, one tap from the plans themselves -->
	<a class="whycard" href="/why">
		<span class="caps">Why this works</span>
		<span class="whytext">
			30–60 min of strength work a week is linked to a <b>10–17% lower risk of all-cause
			mortality</b>, independent of cardio. You don’t need to train to failure, machines
			aren’t cheating, and soreness isn’t the scoreboard.
		</span>
		<span class="whygo">Read the cited case, and the fundamentals →</span>
	</a>

	<!-- Alternatives to the plan above, not siblings of it: folded away, because
	     switching is a once-in-a-while act and three full cards drowned the page. -->
	{#if others.length}
		<details class="disclosure">
			<summary>Other plans ({others.length})</summary>
			<div class="plans">
				{#each others as p (p.id)}
					<form method="POST" action="?/select" use:enhance>
						<input type="hidden" name="plan" value={p.id} />
						<div class="plancard">
							<button
								type="button"
								class="planbody"
								onclick={() => (confirming = confirming === p.id ? null : p.id)}
							>
								<span class="planhead"><span class="planname">{p.name}</span></span>
								{#if p.description}<span class="plandesc">{p.description}</span>{/if}
								<span class="plansched">{p.schedule}</span>
							</button>
							{#if confirming === p.id}
								<div class="confirmrow">
									<span class="confirmtext">Switch to this plan? It goes in the ledger.</span>
									<div class="confirmbtns">
										<Button variant="accent" type="submit">Switch</Button>
										<Button variant="ghost" type="button" onclick={() => (confirming = null)}>Cancel</Button>
									</div>
								</div>
							{/if}
						</div>
					</form>
				{/each}
			</div>
		</details>
	{/if}

	<details class="advanced">
		<summary>Advanced — plans table</summary>
		<Card>
		<div class="caps mb8">Plans table</div>
		<p class="tabletext">
			Plans are reference data — one JSON row each in the <code>ledger_plans</code> table, not
			events in the ledger. Paste a row here to INSERT it (and switch to it).
		</p>
		<form method="POST" action="?/addPlan" use:enhance>
			<textarea
				name="json"
				rows="4"
				bind:value={json}
				placeholder={'{"id": "upper-lower-v1", "name": "Upper / Lower", "schedule": "…", "days": {"U": […], "L": […]}}'}
			></textarea>
			{#if form?.planError}
				<p class="err">Invalid row: {form.planError}</p>
			{/if}
			<Button variant="secondary" type="submit" style="margin-top: 10px" disabled={!json.trim()}>
				Insert plan
			</Button>
		</form>
		</Card>
	</details>
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

	.plans { display: flex; flex-direction: column; gap: 12px; }
	.plancard {
		width: 100%;
		background: var(--white);
		border: var(--border-w) solid var(--border-soft);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-card);
	}
	.planbody {
		width: 100%;
		text-align: left;
		display: flex;
		flex-direction: column;
		gap: 4px;
		cursor: pointer;
		background: transparent;
		border: none;
		padding: 16px 20px;
		font: inherit;
		color: var(--ink);
		border-radius: var(--radius-lg);
	}
	.planbody:disabled { cursor: default; }
	.planbody:not(:disabled):hover { background: var(--volt-tint); }
	.confirmrow {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 12px;
		padding: 12px 20px 16px;
		border-top: 1px solid var(--border-soft);
	}
	.confirmtext { font-size: var(--text-sm); color: var(--ink-2); font-weight: var(--weight-bold); }
	.confirmbtns { display: flex; gap: 8px; }
	.planhead { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
	.planname { font-family: var(--font-display); font-weight: var(--weight-black); font-size: 20px; }
	.plandesc { font-size: var(--text-sm); color: var(--ink-2); line-height: 1.45; }
	.plansched { font-family: var(--font-mono); font-size: 12px; color: var(--ink-3); margin-top: 2px; }

	.dayhead { padding: 16px 24px 4px; }
	.chips { display: flex; gap: 10px; flex-wrap: wrap; }
	.daydesc { font-size: var(--text-sm); color: var(--ink-3); padding: 12px 2px 4px; }
	.exrow {
		min-width: 0;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 18px 24px;
		border-top: 1px solid var(--border-soft);
	}
	.exrow.first { border-top: none; margin-top: 8px; }
	.exname { font-weight: var(--weight-bold); font-size: 17px; }
	.exequip { font-size: 13px; color: var(--ink-3); }
	.exnote { font-size: 13px; color: var(--ink-2); margin-top: 2px; }
	.planhead-row { padding: 18px 24px 0; }
	.activemeta { font-family: var(--font-mono); font-size: 12.5px; color: var(--ink-3); margin-top: 4px; }
	.activename { font-family: var(--font-display); font-weight: var(--weight-black); font-size: var(--text-title); }
	/* the rule, as the closing section of the plan card it governs */
	.rulebox { padding: 18px 24px 20px; border-top: var(--border-w) solid var(--ink); background: var(--paper-2); border-radius: 0 0 var(--radius-lg) var(--radius-lg); }
	.ruledown { font-size: 14px; color: var(--ink-2); margin-top: 10px; }

	/* the whole card is the link — nothing in it does anything else */
	.whycard {
		display: flex; flex-direction: column; gap: 8px;
		background: var(--surface-card); border: var(--border-w) solid var(--border-soft);
		border-radius: var(--radius-lg); box-shadow: var(--shadow-card);
		padding: 20px; text-decoration: none; color: inherit;
	}
	.whycard:hover { border-color: var(--ink); box-shadow: var(--shadow-raised); }
	.whytext { font-size: 15px; line-height: var(--leading-body); color: var(--ink); }
	.whygo { font-weight: var(--weight-bold); font-size: 14px; color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
	.exnums {
		font-family: var(--font-mono); font-size: 12px; color: var(--ink-3);
		display: flex; flex-direction: column; align-items: flex-end; gap: 1px; text-align: right;
		/* the numbers claim their width; the name wraps before they do */
		white-space: nowrap; flex: none;
	}
	.exinc { color: var(--ink-3); opacity: 0.8; }


	/* both fold-aways share one look — see .advanced summary below */
	.disclosure[open] > .plans { margin-top: 12px; }

	.tabletext { margin: 0 0 12px; font-size: 15px; color: var(--ink-2); line-height: var(--leading-body); }
	code { font-family: var(--font-mono); font-size: 13px; }
	textarea {
		width: 100%;
		font-family: var(--font-mono);
		font-size: 13px;
		padding: 12px;
		border: var(--border-w) solid var(--border-soft);
		border-radius: var(--radius-md);
		background: var(--paper);
		color: var(--ink);
		resize: vertical;
	}
	.err { margin: 6px 0 0; color: var(--danger); font-size: var(--text-sm); font-weight: var(--weight-bold); }

	/* <details> gives us the disclosure for free — no JS state needed */
	.advanced summary,
	.disclosure summary {
		list-style: none;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		cursor: pointer;
		font-size: 12px;
		font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--ink-3);
		border-radius: var(--radius-sm);
		padding: 0 4px;
	}
	.advanced summary::-webkit-details-marker,
	.disclosure summary::-webkit-details-marker { display: none; }
	.advanced summary::before,
	.disclosure summary::before { content: '▸'; }
	.advanced[open] summary::before,
	.disclosure[open] summary::before { content: '▾'; }
	.advanced summary:hover,
	.disclosure summary:hover { color: var(--ink); background: var(--volt-tint); }
	.advanced[open] summary { margin-bottom: 12px; }
</style>
