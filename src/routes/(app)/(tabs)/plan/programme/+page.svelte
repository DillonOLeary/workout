<script lang="ts">
	import { enhance } from '$app/forms';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import { estimateMinutes, sessionSteps } from '$lib/domain/steps';
	import type { Plan } from '$lib/domain/plan';
	import type { PageProps } from './$types';

	/**
	 * The one real choice: which programme the week lifts on. Yoga, the
	 * stretch and the run are blocks — they stay as they are whichever way
	 * this goes. Switching is history (a ProgrammeSelected event), so it is
	 * deliberate: a tap opens the question, a second tap answers it.
	 */
	let { data, form }: PageProps = $props();

	let current = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	// the programme's own line: its lift cycle, its routines' average length, the reps its loaded lifts ask, its rest
	const liftLine = (p: Plan) => {
		const lift = p.cycles.find((c) => c.id === 'lift') ?? p.cycles[0];
		const minutes = Math.round(lift.routines.reduce((n, r) => n + estimateMinutes(sessionSteps(p, { routine: r })), 0) / lift.routines.length);
		const loaded = lift.routines.flatMap((r) => p.routines[r]).filter((ex) => ex.kind === 'load');
		const reps = loaded.length ? `${Math.min(...loaded.map((ex) => ex.lo))}–${Math.max(...loaded.map((ex) => ex.hi))} reps` : null;
		return [`${lift.target} a week`, `about ${minutes} min`, reps, p.rest ? `rest ${p.rest}s` : null].filter(Boolean).join(' · ');
	};
	let confirming = $state<string | null>(null);
</script>

<div class="col">
	<div class="head">
		<a class="back" href="/plan" aria-label="Back to The Plan">←</a>
		<h1>Lift programme</h1>
	</div>
	<p class="lede">Two full-body gym programmes. Yoga, stretch and run stay as they are — only the lifting changes.</p>

	{#if form?.message}<p class="err">{form.message}</p>{/if}

	<div class="plans">
		{#each data.plans as p (p.id)}
			{@const isCurrent = p.id === current.id}
			<form method="POST" action="?/select" use:enhance>
				<input type="hidden" name="programme" value={p.id} />
				<div class="plancard" class:current={isCurrent}>
					{#if isCurrent}
						<div class="planbody">
							<span class="nameline"><span class="planname">{p.name}</span><Badge tone="open">Current</Badge></span>
							{#if p.description}<span class="plandesc">{p.description}</span>{/if}
							<span class="planmeta">{liftLine(p)}</span>
						</div>
					{:else}
						<button type="button" class="planbody tap" onclick={() => (confirming = confirming === p.id ? null : p.id)} aria-expanded={confirming === p.id}>
							<span class="planname">{p.name}</span>
							{#if p.description}<span class="plandesc">{p.description}</span>{/if}
							<span class="planmeta">{liftLine(p)}</span>
						</button>
						{#if confirming === p.id}
							<div class="confirmrow">
								<span class="confirmtext">Switch the lifting to this? Your loads start from the programme's own numbers. It goes in the ledger.</span>
								<div class="confirmbtns">
									<Button variant="accent" type="submit" style="flex: 1; min-height: 48px">Switch</Button>
									<button type="button" class="cancel" onclick={() => (confirming = null)}>Cancel</button>
								</div>
							</div>
						{/if}
					{/if}
				</div>
			</form>
		{/each}
	</div>

	<p class="foot">Programmes are reference data. New ones are added at the table, not here.</p>
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
	.err { margin: 0; color: var(--danger); font-size: var(--text-sm); font-weight: var(--weight-bold); }

	.plans { display: flex; flex-direction: column; gap: 12px; }
	.plancard {
		width: 100%;
		background: var(--white);
		border: var(--border-w) solid var(--border-soft);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-card);
	}
	.plancard.current { border-color: var(--ink); box-shadow: var(--shadow-raised); }
	.planbody {
		width: 100%; text-align: left; display: flex; flex-direction: column; gap: 4px;
		padding: 16px 20px; font: inherit; color: var(--ink); border-radius: var(--radius-lg);
	}
	.planbody.tap { cursor: pointer; background: transparent; border: none; }
	.planbody.tap:hover { background: var(--volt-tint); }
	.nameline { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
	.planname { font-family: var(--font-display); font-weight: var(--weight-black); font-size: 20px; }
	.plandesc { font-size: 14px; color: var(--ink-2); line-height: 1.45; }
	.planmeta { font-family: var(--font-mono); font-size: 12px; color: var(--ink-3); margin-top: 2px; }
	.confirmrow {
		display: flex; flex-direction: column; gap: 12px; padding: 12px 20px 16px;
		border-top: 1px solid var(--border-soft); background: var(--paper-2); border-radius: 0 0 var(--radius-lg) var(--radius-lg);
	}
	.confirmtext { font-size: 14px; color: var(--ink-2); font-weight: var(--weight-bold); line-height: 1.45; }
	.confirmbtns { display: flex; align-items: center; gap: 12px; }
	.cancel {
		min-height: 48px; padding: 0 12px; background: none; border: none; cursor: pointer;
		font-family: var(--font-body); font-size: 15px; font-weight: var(--weight-bold); color: var(--ink-2);
		text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--border-soft);
	}
	.foot { margin: 0; font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); }
</style>
