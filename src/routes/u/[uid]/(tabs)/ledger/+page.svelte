<script lang="ts">
	import { enhance } from '$app/forms';
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

	let { data, form }: PageProps = $props();

	// two-tap arm before removing — same pattern as Finish on the gym floor
	let removing = $state<string | null>(null);
	let removeTimer: ReturnType<typeof setTimeout> | undefined;
	function armRemove(id: string) {
		removing = id;
		clearTimeout(removeTimer);
		removeTimer = setTimeout(() => (removing = null), 3000);
	}

	// The Ledger tab is the event stream made human-readable. Sessions and
	// runs are the story; plan switches are footnotes (see below).
	let sessions = $derived(projectSessions(data.events));
	let runs = $derived(projectRuns(data.events));
	let switches = $derived(projectPlanSwitches(data.events));

	let entries = $derived(
		[
			...sessions.map((s) => ({ at: s.at, kind: 'session' as const, s })),
			...runs.map((r) => ({ at: r.at, kind: 'run' as const, r }))
		].sort((a, b) => b.at.localeCompare(a.at))
	);

	const PAGE = 20;
	let shown = $state(PAGE);
	let visible = $derived(entries.slice(0, shown));

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

	{#if form?.message}
		<p class="err">{form.message}</p>
	{/if}

	{#if entries.length === 0}
		<Card><div class="empty">Nothing logged yet. Start Workout A.</div></Card>
	{/if}

	{#each visible as en (en.kind + en.at + (en.kind === 'session' ? en.s.id : ''))}
		{#if en.kind === 'run'}
			<Card>
				<div class="line">
					<span class="date">{en.r.dateLabel}</span>
					<span class="runlbl">Run</span>
					<span class="runmin">{en.r.minutes} min</span>
					<form method="POST" action="?/removeRun" use:enhance>
						<input type="hidden" name="run" value={en.r.at} />
						{#if removing === en.r.at}
							<button type="submit" class="remove armed">Remove?</button>
						{:else}
							<button type="button" class="remove" onclick={() => armRemove(en.r.at)}>
								Remove
							</button>
						{/if}
					</form>
				</div>
			</Card>
		{:else}
			<Card pad={false}>
				<div class="sesshead">
					<span class="date">{en.s.dateLabel}</span>
					<span class="sessbadges">
						{#if !en.s.finished}<Badge tone="warning">In progress</Badge>{/if}
						<Badge tone="neutral">{dayTitle(planById(en.s.plan), en.s.day)}</Badge>
						<form method="POST" action="?/remove" use:enhance>
							<input type="hidden" name="session" value={en.s.id} />
							{#if removing === en.s.id}
								<button type="submit" class="remove armed">Remove?</button>
							{:else}
								<button type="button" class="remove" onclick={() => armRemove(en.s.id)}>
									Remove
								</button>
							{/if}
						</form>
					</span>
				</div>
				{#each en.s.rows as row (row.exercise)}
					{@const ex = exByName(row.exercise)}
					{@const lvl = ex ? earnedIncrease({ weight: row.weight, reps: row.reps }, ex) : false}
					{@const hold = ex?.mode === 'seconds'}
					<div class="sessrow">
						<span class="exname">
							{row.exercise}
							{#if lvl}<span class="uppill">↑</span>{/if}
						</span>
						<span class="w">{ex?.bodyweight ? 'BW' : `${row.weight} lb`}</span>
						<span class="reps">{row.reps.map((r) => (hold ? `${r}s` : r)).join(' · ')}</span>
					</div>
				{/each}
			</Card>
		{/if}
	{/each}

	{#if entries.length > shown}
		<button type="button" class="more" onclick={() => (shown += PAGE)}>
			Show more — {entries.length - shown} older
		</button>
	{/if}

	{#if switches.length}
		<details class="switches">
			<summary>{switches.length} plan {switches.length === 1 ? 'change' : 'changes'}</summary>
			{#each switches as w (w.at)}
				<div class="switchline">
					<span class="date">{w.dateLabel}</span>
					<span class="switchtext">Switched plan → <b>{planName(w.plan)}</b></span>
				</div>
			{/each}
		</details>
	{/if}
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
	.err { margin: 0; color: var(--danger); font-weight: var(--weight-bold); font-size: var(--text-sm); }

	/* the event-sourced delete: the word is plain, the red waits for intent */
	.remove {
		min-height: 32px;
		padding: 0 12px;
		background: transparent;
		border: 1px solid var(--border-soft);
		border-radius: var(--radius-pill);
		font-family: var(--font-body);
		font-size: 12px;
		font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--ink-3);
		cursor: pointer;
	}
	.remove:hover { color: var(--danger); border-color: var(--danger); }
	.remove.armed { color: var(--paper); background: var(--danger); border-color: var(--danger); }
	.line { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
	.date { font-family: var(--font-mono); font-weight: var(--weight-bold); font-size: 15px; }
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

	.more {
		min-height: var(--hit-min);
		padding: 0 22px;
		font-family: var(--font-body);
		font-weight: var(--weight-bold);
		font-size: var(--text-md);
		color: var(--ink);
		background: var(--white);
		border: var(--border-w) solid var(--ink);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-raised);
		cursor: pointer;
	}
	.more:hover { background: var(--volt-tint); }
	.more:active { transform: translateY(2px); box-shadow: var(--shadow-pressed); }

	/* Plan switches: recorded honestly, displayed quietly */
	.switches summary {
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
	.switches summary::-webkit-details-marker { display: none; }
	.switches summary::before { content: '▸'; }
	.switches[open] summary::before { content: '▾'; }
	.switches summary:hover { color: var(--ink); background: var(--volt-tint); }
	.switchline {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 10px 4px;
		border-top: 1px solid var(--border-soft);
	}
	.switchtext { font-size: 15px; color: var(--ink-2); }
</style>
