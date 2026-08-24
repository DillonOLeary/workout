<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import type { PageProps } from './$types';

	/**
	 * The admin surface: the other shipped plans, and the raw plans table.
	 * Off the tab on purpose — switching is a once-in-a-while act.
	 */
	let { data, form }: PageProps = $props();

	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let others = $derived(data.plans.filter((p) => p.id !== plan.id));

	let json = $state('');
	// Switching plans is history (a PlanSelected event) — make it deliberate.
	let confirming = $state<string | null>(null);
</script>

<div class="col">
	<div class="head">
		<a class="back" href="/plan" aria-label="Back to The Plan">←</a>
		<h1>Change plan</h1>
	</div>
	<p class="current">Current: <b>{plan.name}</b></p>

	{#if form?.message}
		<p class="err">{form.message}</p>
	{/if}

	{#if others.length}
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
							<span class="planname">{p.name}</span>
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
	{/if}

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
</div>

<style>
	.col { display: flex; flex-direction: column; gap: 16px; }
	.head { display: flex; align-items: center; gap: 14px; }
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: var(--text-display);
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
	.current { margin: 0; font-family: var(--font-mono); font-size: 13px; color: var(--ink-3); }
	.current b { color: var(--ink); }
	.caps {
		font-size: 12px;
		font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.mb8 { margin-bottom: 8px; }

	.plans { display: flex; flex-direction: column; gap: 12px; }
	.plancard {
		width: 100%;
		background: var(--white);
		border: var(--border-w) solid var(--border-soft);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-card);
	}
	.planbody {
		width: 100%; text-align: left; display: flex; flex-direction: column; gap: 4px;
		cursor: pointer; background: transparent; border: none; padding: 16px 20px;
		font: inherit; color: var(--ink); border-radius: var(--radius-lg);
	}
	.planbody:hover { background: var(--volt-tint); }
	.confirmrow {
		display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;
		gap: 12px; padding: 12px 20px 16px; border-top: 1px solid var(--border-soft);
	}
	.confirmtext { font-size: var(--text-sm); color: var(--ink-2); font-weight: var(--weight-bold); }
	.confirmbtns { display: flex; gap: 8px; }
	.planname { font-family: var(--font-display); font-weight: var(--weight-black); font-size: 20px; }
	.plandesc { font-size: var(--text-sm); color: var(--ink-2); line-height: 1.45; }
	.plansched { font-family: var(--font-mono); font-size: 12px; color: var(--ink-3); margin-top: 2px; }

	.tabletext { margin: 0 0 12px; font-size: 15px; color: var(--ink-2); line-height: var(--leading-body); }
	code { font-family: var(--font-mono); font-size: 13px; }
	textarea {
		width: 100%; font-family: var(--font-mono); font-size: 13px; padding: 12px;
		border: var(--border-w) solid var(--border-soft); border-radius: var(--radius-md);
		background: var(--paper); color: var(--ink); resize: vertical;
	}
	.err { margin: 6px 0 0; color: var(--danger); font-size: var(--text-sm); font-weight: var(--weight-bold); }
</style>
