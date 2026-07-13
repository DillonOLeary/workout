<script lang="ts">
	import { enhance } from '$app/forms';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Chip from '$lib/components/Chip.svelte';
	import { dayTitle } from '$lib/domain/projections';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let dayKeys = $derived(Object.keys(plan.days));

	// Which day's exercises are expanded — pure client state, no server involved
	let day = $state('');
	let shownDay = $derived(plan.days[day] ? day : dayKeys[0]);

	let json = $state('');

	// Switching plans is history (a PlanSelected event) — make it deliberate.
	let confirming = $state<string | null>(null);
</script>

<div class="col">
	<h1>The Plan</h1>

	{#if form?.message}
		<p class="err">{form.message}</p>
	{/if}

	<Card interactive>
		<div class="caps mb8">The one rule</div>
		<div class="rule">
			Hit every set at the top of the range → <span class="hl">add the smallest increment</span> next time.
		</div>
	</Card>

	{#if data.plans.length > 1}
		<div>
			<div class="caps mb8">Your plan</div>
			<div class="plans">
				{#each data.plans as p (p.id)}
					<form method="POST" action="?/select" use:enhance>
						<input type="hidden" name="plan" value={p.id} />
						<div class="plancard" class:active={p.id === plan.id}>
							<button
								type="button"
								class="planbody"
								aria-pressed={p.id === plan.id}
								disabled={p.id === plan.id}
								onclick={() => (confirming = confirming === p.id ? null : p.id)}
							>
								<span class="planhead">
									<span class="planname">{p.name}</span>
									{#if p.id === plan.id}<Badge tone="levelup">Active</Badge>{/if}
								</span>
								{#if p.description}<span class="plandesc">{p.description}</span>{/if}
								<span class="plansched">{p.schedule}</span>
							</button>
							{#if confirming === p.id && p.id !== plan.id}
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
		</div>
	{/if}

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
				<div>
					<div class="exname">{ex.name}</div>
					<div class="exequip">{ex.equip}</div>
				</div>
				<span class="exnums">{ex.sets}×{ex.lo}–{ex.hi}{ex.mode === 'seconds' ? 's' : ''} · +{ex.inc}{ex.bodyweight && ex.mode === 'seconds' ? 's' : ''}</span>
			</div>
		{/each}
	</Card>

	<Card>
		<div class="badges">
			<Badge tone="neutral">{plan.schedule}</Badge>
			{#if plan.runs !== false}
				<Badge tone="neutral">150–300 min run/week</Badge>
			{/if}
		</div>
	</Card>

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
	.plancard.active { border-color: var(--ink); box-shadow: var(--shadow-raised); }
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
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 18px 24px;
		border-top: 1px solid var(--border-soft);
	}
	.exrow.first { border-top: none; margin-top: 8px; }
	.exname { font-weight: var(--weight-bold); font-size: 18px; }
	.exequip { font-size: 13px; color: var(--ink-3); }
	.exnums { font-family: var(--font-mono); font-size: 15px; color: var(--ink-3); white-space: nowrap; }

	.badges { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }

	.tabletext { margin: 0 0 12px; font-size: 15px; color: var(--ink-2); line-height: var(--leading-body); }
	code { font-family: var(--font-mono); font-size: 13px; }
	textarea {
		width: 100%;
		box-sizing: border-box;
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
	.advanced summary {
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
	.advanced summary::-webkit-details-marker { display: none; }
	.advanced summary::before { content: '▸'; }
	.advanced[open] summary::before { content: '▾'; }
	.advanced summary:hover { color: var(--ink); background: var(--volt-tint); }
	.advanced[open] summary { margin-bottom: 12px; }
</style>
