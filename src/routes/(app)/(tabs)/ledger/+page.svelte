<script lang="ts">
	import { enhance } from '$app/forms';
	import Badge from '$lib/components/Badge.svelte';
	import Card from '$lib/components/Card.svelte';
	import { setsLine } from '$lib/domain/labels';
	import { anySetEarned } from '$lib/domain/progression';
	import { dayTitle, projectPlanSwitches, projectSessions } from '$lib/domain/projections';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/**
	 * The Ledger tab is the event stream made human-readable: two columns —
	 * the exercise, and what happened. Removing an entry is a rare correction,
	 * so the Remove buttons hide behind one "Edit entries" toggle instead of
	 * sitting on every card.
	 */
	let editMode = $state(false);

	// two-tap arm before removing — the red waits for stated intent
	let removing = $state<string | null>(null);
	let removeTimer: ReturnType<typeof setTimeout> | undefined;
	function armRemove(id: string) {
		removing = id;
		clearTimeout(removeTimer);
		removeTimer = setTimeout(() => (removing = null), 3000);
	}

	// one list: a run is a session with one entry, so every row is a session
	let entries = $derived(projectSessions(data.events));
	let switches = $derived(projectPlanSwitches(data.events));

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
		<a class="back" href="/" aria-label="Back to Today">←</a>
		<h1>By day</h1>
		<button type="button" class="edit" aria-pressed={editMode} onclick={() => (editMode = !editMode)}>
			{editMode ? 'Done' : 'Edit entries'}
		</button>
	</div>

	{#if form?.message}
		<p class="err">{form.message}</p>
	{/if}

	{#if entries.length === 0}
		<Card><div class="empty">Nothing logged yet. Start Workout A.</div></Card>
	{/if}

	{#each visible as s (s.id)}
		{#if s.isRun && s.rows.length === 0}
			<!-- a run: one row in the week, one row here, the same Remove -->
			<Card>
				<div class="line">
					<span class="date">{s.dateLabel}</span>
					<span class="runlbl">{dayTitle(planById(s.plan), s.day)}</span>
					{#if !s.finished}<Badge tone="warning">In progress</Badge>{/if}
					<span class="runmin">{s.minutes ? `${s.minutes} min` : '—'}</span>
					{#if editMode}
						<form method="POST" action="?/remove" use:enhance>
							<input type="hidden" name="session" value={s.id} />
							{#if removing === s.id}
								<button type="submit" class="remove armed">Remove?</button>
							{:else}
								<button type="button" class="remove" onclick={() => armRemove(s.id)}>Remove</button>
							{/if}
						</form>
					{/if}
				</div>
			</Card>
		{:else}
			<Card pad={false}>
				<div class="sesshead">
					<span class="date">{s.dateLabel}</span>
					<span class="sessbadges">
						{#if !s.finished}<Badge tone="warning">In progress</Badge>{/if}
						<Badge tone="neutral">{dayTitle(planById(s.plan), s.day)}</Badge>
						{#if s.mode === 'after'}<Badge tone="neutral">Logged after</Badge>{/if}
						{#if editMode}
							<form method="POST" action="?/remove" use:enhance>
								<input type="hidden" name="session" value={s.id} />
								{#if removing === s.id}
									<button type="submit" class="remove armed">Remove?</button>
								{:else}
									<button type="button" class="remove" onclick={() => armRemove(s.id)}>
										Remove
									</button>
								{/if}
							</form>
						{/if}
					</span>
				</div>
				{#each s.rows as row (row.item)}
					{@const ex = exByName(row.item)}
					{@const lvl = ex ? anySetEarned(row.sets, ex) : false}
					<div class="sessrow">
						<span class="exname">
							{row.item}
							{#if lvl}<span class="uppill">↑</span>{/if}
						</span>
						<span class="val">{setsLine(row.sets, ex)}</span>
					</div>
				{/each}
				{#if s.minutes}
					<div class="sessrow">
						<span class="exname">Run</span>
						<span class="val">{s.minutes} min</span>
					</div>
				{/if}
				<!-- prep is present, not itemised: it never leads the row -->
				{#if s.prep}
					<div class="prepline">+ {s.prep} prep {s.prep === 1 ? 'step' : 'steps'} — warm-up, cooldown</div>
				{/if}
			</Card>
		{/if}
	{/each}

	{#if entries.length > shown}
		<button type="button" class="more" onclick={() => (shown += PAGE)}>
			Show more — {entries.length - shown} older
		</button>
	{/if}

	<div class="foot">
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
</div>

<style>
	.col { display: flex; flex-direction: column; gap: 20px; }
	.head { display: flex; align-items: center; gap: 14px; }
	.head h1 { flex: 1; }
	/* a child page of Today — the chronological view for "what did I do
	   Tuesday", and the stable home for corrections */
	.back {
		width: 48px; height: 48px; flex: none;
		display: inline-flex; align-items: center; justify-content: center;
		background: var(--white); border: var(--border-w) solid var(--ink); border-radius: var(--radius-md);
		box-shadow: var(--shadow-raised); text-decoration: none;
		font-family: var(--font-display); font-weight: var(--weight-black); font-size: 22px; color: var(--ink);
	}
	.back:hover { background: var(--volt-tint); }
	.back:active { transform: translateY(2px); box-shadow: var(--shadow-pressed); }
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: var(--text-display);
		line-height: var(--leading-tight);
	}
	/* corrections are rare: one quiet toggle, not a button on every card */
	.edit {
		min-height: 44px;
		padding: 0 14px;
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
	.edit:hover { color: var(--ink); border-color: var(--ink); }
	.edit[aria-pressed='true'] { color: var(--ink); border-color: var(--ink); background: var(--volt-tint); }

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
	/* never break a date mid-word — "Sun, Aug 2" over three lines is what let
	   the badges keep their full width and push Remove off the card */
	.date { font-family: var(--font-mono); font-weight: var(--weight-bold); font-size: 15px; white-space: nowrap; }
	.runlbl { font-weight: var(--weight-bold); flex: 1; }
	.runmin { font-family: var(--font-mono); font-weight: var(--weight-bold); font-size: 16px; white-space: nowrap; }
	.prepline {
		padding: 8px 24px 12px; border-top: 1px solid var(--border-soft);
		font-family: var(--font-mono); font-size: 12px; color: var(--ink-3);
	}

	.sesshead {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
		padding: 16px 24px;
		background: var(--surface-sunken);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
	}
	.sessbadges { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; min-width: 0; }
	@media (max-width: 700px) {
		.sesshead { flex-direction: column; align-items: flex-start; gap: 10px; padding: 12px 16px; }
		.sessbadges { width: 100%; }
	}
	/* two columns: the exercise, and what happened */
	.sessrow {
		display: grid;
		grid-template-columns: 1fr auto;
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
	.val { font-family: var(--font-mono); font-size: 15px; color: var(--ink-2); text-align: right; }

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

	.foot { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }

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
