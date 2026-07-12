<script lang="ts">
	import Badge from '$lib/components/Badge.svelte';
	import Card from '$lib/components/Card.svelte';
	import {
		dayTitle,
		earnedIncrease,
		projectPlanSwitches,
		projectRuns,
		projectSessions
	} from '$lib/domain/projections';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// The Ledger tab is the event stream made human-readable: three
	// projections, merged and sorted newest-first.
	let sessions = $derived(projectSessions(data.events));
	let runs = $derived(projectRuns(data.events));
	let switches = $derived(projectPlanSwitches(data.events));

	let entries = $derived(
		[
			...sessions.map((s) => ({ at: s.at, kind: 'session' as const, s })),
			...runs.map((r) => ({ at: r.at, kind: 'run' as const, r })),
			...switches.map((w) => ({ at: w.at, kind: 'switch' as const, w }))
		].sort((a, b) => b.at.localeCompare(a.at))
	);

	const exByName = (name: string) =>
		data.plans.flatMap((p) => Object.values(p.days).flat()).find((e) => e.name === name);
	const planName = (id: string) => data.plans.find((x) => x.id === id)?.name ?? id;
	const planById = (id: string) => data.plans.find((x) => x.id === id);
</script>

<div class="col">
	<div class="head">
		<h1>Ledger</h1>
		<a class="export" href={`/u/${data.uid}/export`} download="training-ledger-events.json">
			Export JSON
		</a>
	</div>

	{#if entries.length === 0}
		<Card><div class="empty">Nothing logged yet. Start Workout A.</div></Card>
	{/if}

	{#each entries as en (en.kind + en.at + (en.kind === 'session' ? en.s.id : ''))}
		{#if en.kind === 'switch'}
			<Card>
				<div class="line">
					<span class="date">{en.w.dateLabel}</span>
					<span class="switchtext">Switched plan → <b>{planName(en.w.plan)}</b></span>
				</div>
			</Card>
		{:else if en.kind === 'run'}
			<Card>
				<div class="line">
					<span class="date">{en.r.dateLabel}</span>
					<span class="runlbl">Run</span>
					<span class="runmin">{en.r.minutes} min</span>
				</div>
			</Card>
		{:else}
			<Card pad={false}>
				<div class="sesshead">
					<span class="date">{en.s.dateLabel}</span>
					<span class="sessbadges">
						{#if !en.s.finished}<Badge tone="warning">In progress</Badge>{/if}
						<Badge tone="neutral">{dayTitle(planById(en.s.plan), en.s.day)}</Badge>
					</span>
				</div>
				{#each en.s.rows as row (row.exercise)}
					{@const ex = exByName(row.exercise)}
					{@const lvl = ex ? earnedIncrease({ weight: row.weight, reps: row.reps }, ex) : false}
					<div class="sessrow">
						<span class="exname">
							{row.exercise}
							{#if lvl}<span class="uppill">↑</span>{/if}
						</span>
						<span class="w">{row.weight} lb</span>
						<span class="reps">{row.reps.join(' · ')}</span>
					</div>
				{/each}
			</Card>
		{/if}
	{/each}
</div>

<style>
	.col { display: flex; flex-direction: column; gap: 20px; }
	.head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: var(--text-display);
		line-height: var(--leading-tight);
	}
	.export {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: var(--hit-min);
		padding: 0 22px;
		font-weight: var(--weight-bold);
		color: var(--ink);
		background: var(--white);
		border: var(--border-w) solid var(--ink);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-raised);
		text-decoration: none;
	}
	.export:hover { background: var(--volt-tint); }
	.export:active { transform: translateY(2px); box-shadow: var(--shadow-pressed); }

	.empty { font-size: 16px; color: var(--ink-2); }
	.line { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
	.date { font-family: var(--font-mono); font-weight: var(--weight-bold); font-size: 15px; }
	.switchtext { font-size: 15px; color: var(--ink-2); }
	.runlbl { font-weight: var(--weight-bold); }
	.runmin { font-family: var(--font-mono); font-weight: var(--weight-bold); font-size: 16px; }

	.sesshead {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px 24px;
		background: var(--surface-sunken);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
	}
	.sessbadges { display: flex; gap: 8px; align-items: center; }
	.sessrow {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 16px;
		align-items: center;
		padding: 14px 24px;
		border-top: 1px solid var(--border-soft);
	}
	.exname { font-weight: var(--weight-bold); font-size: 16px; }
	.uppill {
		margin-left: 8px;
		background: var(--volt);
		border: 1px solid var(--ink);
		border-radius: var(--radius-pill);
		padding: 1px 8px;
		font-size: 12px;
		font-weight: var(--weight-bold);
	}
	.w { font-family: var(--font-mono); font-weight: var(--weight-bold); font-size: 16px; }
	.reps { font-family: var(--font-mono); font-size: 15px; color: var(--ink-2); }
</style>
