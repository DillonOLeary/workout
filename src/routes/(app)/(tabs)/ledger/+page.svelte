<script lang="ts">
	import { enhance } from '$app/forms';
	import Badge from '$lib/components/Badge.svelte';
	import Card from '$lib/components/Card.svelte';
	import MonthGrid from '$lib/components/MonthGrid.svelte';
	import PaceTiles from '$lib/components/PaceTiles.svelte';
	import TrendRow from '$lib/components/TrendRow.svelte';
	import { RUN_ITEM } from '$lib/domain/events';
	import { setsLine } from '$lib/domain/labels';
	import { countOf, loadOf, type Measure } from '$lib/domain/measure';
	import { hasRuns, liftDays, runTarget, type Exercise } from '$lib/domain/plan';
	import { anySetEarned, bumpCount, bumpLoad } from '$lib/domain/progression';
	import {
		dayTitle,
		monthGrid,
		projectPlanSwitches,
		projectSessions,
		trendFor,
		weeklyPace,
		type SessionRow,
		type SessionView
	} from '$lib/domain/projections';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	// one clock reading per visit: every fold below takes it as an input
	const now = Date.now();

	/**
	 * Tab 2 is everything that already happened, at three distances: the last
	 * month as a calendar, what it averages to a week, how each exercise is
	 * moving, and then the days themselves. The page needs no heading saying
	 * how it's going — the whole page is how it's going.
	 *
	 * The days are the event stream made human-readable: two columns — the
	 * exercise, and what happened. Freedom inside the latest session,
	 * immutability before it: on the latest card a row opens inline and
	 * Save writes a correction; older cards are read-only, because the rule
	 * has already read them. Removing is the rare correction that works on
	 * any session, so it hides behind one toggle instead of sitting on
	 * every card.
	 */
	let editMode = $state(false);

	/* ---------- the long view: a month of days, a running average, the trends ---- */
	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let grid = $derived(monthGrid(data.events, now, data.plans));
	let pace = $derived(weeklyPace(data.events, now, data.plans));

	// every exercise on the lift days, in plan order, once (calves are on both days)
	let planExercises = $derived.by(() => {
		const seen = new Set<string>();
		const out: Exercise[] = [];
		for (const d of liftDays(plan)) for (const ex of plan.days[d]) if (!seen.has(ex.name)) { seen.add(ex.name); out.push(ex); }
		return out;
	});
	// the session in progress is excluded: the rule never grades the set it is suggesting
	let trends = $derived(planExercises.map((ex) => ({ ex, trend: trendFor(data.events, ex, data.activeSession?.id, now) })));
	// the trend row that is open — `openRow` below belongs to the day editor
	let openTrend = $state<string | null>(null);

	// two-tap arm before removing — the red waits for stated intent, and
	// stays until you tap anywhere else (no silent timeout)
	let removing = $state<string | null>(null);
	function onWindowClick(e: MouseEvent) {
		if (removing && !(e.target as HTMLElement | null)?.closest('.remove')) removing = null;
	}

	// one list: a run is a session with one entry, so every row is a session
	let entries = $derived(projectSessions(data.events));
	let switches = $derived(projectPlanSwitches(data.events));

	const PAGE = 20;
	let shown = $state(PAGE);
	let visible = $derived(entries.slice(0, shown));

	const exByName = (name: string): Exercise | undefined =>
		data.plans.flatMap((p) => Object.values(p.days).flat()).find((e) => e.name === name);
	const planName = (id: string) => data.plans.find((x) => x.id === id)?.name ?? id;
	const planById = (id: string) => data.plans.find((x) => x.id === id);

	/* ---------- inline edit, the latest session only ----------
	   A row opens as the Log-it-after line, one per set: − 40 lb + × − 8 +.
	   Save posts one correction per changed set; the decider is what refuses
	   anything older — this screen only hides the gesture there. */
	type EditSet = { item: string; index: number; ex?: Exercise; of: Measure['of']; weight: number; count: number; target?: number };
	let editingRow = $state<string | null>(null);
	let edit = $state<EditSet[]>([]);
	let original = $state<Measure[]>([]);

	function openRow(s: SessionView, row: SessionRow) {
		const key = `${s.id}:${row.item}`;
		if (editingRow === key) return (editingRow = null);
		const ex = exByName(row.item);
		original = row.sets;
		// the set number the entry was logged as — a skipped set 1 must not shift the rest
		edit = row.sets.map((m, i) => ({
			item: row.item, index: row.indices[i], ex, of: m.of, weight: loadOf(m), count: countOf(m),
			...(m.of === 'hold' && m.target !== undefined ? { target: m.target } : {})
		}));
		editingRow = key;
	}
	function openRun(s: SessionView) {
		const key = `${s.id}:${RUN_ITEM}`;
		if (editingRow === key) return (editingRow = null);
		original = [{ of: 'duration', minutes: s.minutes }];
		edit = [{ item: RUN_ITEM, index: 1, of: 'duration', weight: 0, count: s.minutes }];
		editingRow = key;
	}
	// the same ± as the floor where the exercise is known; a plain step where it isn't
	const bumpWeight = (e: EditSet, dir: 1 | -1) => {
		e.weight = e.ex?.kind === 'load' ? bumpLoad(e.ex, e.weight, dir) : Math.max(0, e.weight + dir * 5);
	};
	const bumpReps = (e: EditSet, dir: 1 | -1) => {
		if (e.of === 'duration') e.count = Math.max(1, Math.min(600, e.count + dir * 5));
		else if (e.of === 'hold') e.count = Math.max(1, Math.min(600, e.count + dir * (e.ex?.kind === 'hold' ? e.ex.inc || 5 : 5)));
		else if (e.ex && e.ex.kind !== 'hold') e.count = bumpCount(e.ex, e.count, dir);
		else e.count = Math.max(1, Math.min(100, e.count + dir));
	};
	/** the measure a line writes — rebuilt by variant, so a stray field never rides along */
	const measureOf = (e: EditSet): Measure => {
		switch (e.of) {
			case 'load': return { of: 'load', load: e.weight, reps: e.count };
			case 'reps': return { of: 'reps', reps: e.count };
			case 'hold': return { of: 'hold', seconds: e.count, ...(e.target !== undefined ? { target: e.target } : {}) };
			case 'duration': return { of: 'duration', minutes: e.count };
			case 'step': return { of: 'step' };
		}
	};
	let corrections = $derived(
		edit
			.map((e, i) => ({ item: e.item, index: e.index, measure: measureOf(e), was: original[i] }))
			.filter((c) => JSON.stringify(c.measure) !== JSON.stringify(c.was))
			.map(({ item, index, measure }) => ({ item, index, measure }))
	);
	const unitOf = (e: EditSet) => (e.of === 'hold' ? 's' : e.of === 'duration' ? ' min' : e.of === 'reps' ? ' reps' : '');
</script>

<svelte:window onclick={onWindowClick} />

<div class="col">
	<div class="head">
		<h1>Ledger</h1>
		<button type="button" class="edit" aria-pressed={editMode} onclick={() => (editMode = !editMode)}>
			{editMode ? 'Done' : 'Edit entries'}
		</button>
	</div>

	{#if form?.message}
		<p class="err">{form.message}</p>
	{/if}

	<!-- the month, then what it comes to per week, against the plan's own run goal -->
	<Card>
		<div class="strip-head">
			<span class="caps">Last month</span>
			<span class="span">{grid.span}</span>
		</div>
		<MonthGrid {grid} />
		<PaceTiles {pace} runs={hasRuns(plan)} runTarget={hasRuns(plan) ? runTarget(plan) : null} />
	</Card>

	{#if trends.length}
		<Card pad={false}>
			{#each trends as t (t.ex.name)}
				<TrendRow
					ex={t.ex}
					trend={t.trend}
					open={openTrend === t.ex.name}
					ontoggle={() => (openTrend = openTrend === t.ex.name ? null : t.ex.name)}
				/>
			{/each}
		</Card>
	{/if}

	<div class="caps daycaps">By day</div>

	{#if entries.length === 0}
		<Card><div class="empty">Nothing logged yet. Start from Today.</div></Card>
	{/if}

	{#snippet removeBtn(id: string)}
		<form method="POST" action="?/remove" use:enhance>
			<input type="hidden" name="session" value={id} />
			{#if removing === id}
				<button type="submit" class="remove armed">Remove?</button>
			{:else}
				<button type="button" class="remove" onclick={() => (removing = id)}>Remove</button>
			{/if}
		</form>
	{/snippet}

	{#snippet editor(s: SessionView)}
		<form
			method="POST"
			action="?/correct"
			class="editor"
			use:enhance={() =>
				async ({ update, result }) => {
					await update();
					if (result.type === 'success') editingRow = null;
				}}
		>
			<input type="hidden" name="session" value={s.id} />
			<input type="hidden" name="corrections" value={JSON.stringify(corrections)} />
			{#each edit as e, i (e.index)}
				<div class="eline">
					<span class="elbl">{e.of === 'duration' ? 'RUN' : e.of === 'hold' ? `HOLD ${e.index}` : `SET ${e.index}`}</span>
					<span class="ectls">
						{#if e.of === 'load'}
							<span class="ctl">
								<button type="button" class="pm" aria-label="Less weight" onclick={() => bumpWeight(edit[i], -1)}>−</button>
								<span class="num">{e.weight}<span class="unit"> {e.ex?.kind === 'load' && e.ex.each ? '/hand' : 'lb'}</span></span>
								<button type="button" class="pm" aria-label="More weight" onclick={() => bumpWeight(edit[i], 1)}>+</button>
							</span>
							<span class="times">×</span>
						{/if}
						<span class="ctl">
							<button type="button" class="pm" aria-label="Fewer" onclick={() => bumpReps(edit[i], -1)}>−</button>
							<span class="num">{e.count}<span class="unit">{unitOf(e)}</span></span>
							<button type="button" class="pm" aria-label="More" onclick={() => bumpReps(edit[i], 1)}>+</button>
						</span>
					</span>
				</div>
			{/each}
			<div class="ebtns">
				<button type="submit" class="esave" disabled={!corrections.length}>Save</button>
				<button type="button" class="ecancel" onclick={() => (editingRow = null)}>Cancel</button>
			</div>
		</form>
	{/snippet}

	{#each visible as s (s.id)}
		{@const latest = s.id === data.latestSession}
		{#if s.workout.kind === 'run' && s.rows.length === 0}
			<!-- a run: one row in the week, one row here, the same Remove -->
			<Card>
				{#if latest}
					<button type="button" class="line tap" onclick={() => openRun(s)} aria-expanded={editingRow === `${s.id}:${RUN_ITEM}`}>
						<span class="date">{s.dateLabel}</span>
						<span class="runlbl">{dayTitle(planById(s.plan), s.workout)}</span>
						{#if !s.finished}<Badge tone="open">In progress</Badge>{/if}
						<span class="runmin">{s.minutes ? `${s.minutes} min` : '—'}</span>
					</button>
				{:else}
					<div class="line">
						<span class="date">{s.dateLabel}</span>
						<span class="runlbl">{dayTitle(planById(s.plan), s.workout)}</span>
						{#if !s.finished}<Badge tone="open">In progress</Badge>{/if}
						<span class="runmin">{s.minutes ? `${s.minutes} min` : '—'}</span>
					</div>
				{/if}
				{#if editMode}<div class="removerow">{@render removeBtn(s.id)}</div>{/if}
				{#if editingRow === `${s.id}:${RUN_ITEM}`}{@render editor(s)}{/if}
			</Card>
		{:else}
			<Card pad={false}>
				<div class="sesshead">
					<span class="date">{s.dateLabel}</span>
					<span class="sessbadges">
						{#if !s.finished}<Badge tone="open">In progress</Badge>{/if}
						<Badge tone="neutral">{dayTitle(planById(s.plan), s.workout)}</Badge>
						{#if s.mode === 'after'}<Badge tone="neutral">Logged after</Badge>{/if}
						{#if editMode}{@render removeBtn(s.id)}{/if}
					</span>
				</div>
				{#each s.rows as row (row.item)}
					{@const ex = exByName(row.item)}
					{@const lvl = ex ? anySetEarned(row.sets, ex) : false}
					{@const key = `${s.id}:${row.item}`}
					{#if latest}
						<!-- the latest session: every row is one tap from its numbers -->
						<button type="button" class="sessrow tap" class:opened={editingRow === key} onclick={() => openRow(s, row)} aria-expanded={editingRow === key}>
							<span class="exname">
								{row.item}
								{#if lvl}<span class="uppill">↑</span>{/if}
							</span>
							<span class="val">{setsLine(row.sets, ex)}</span>
						</button>
						{#if editingRow === key}{@render editor(s)}{/if}
					{:else}
						<div class="sessrow">
							<span class="exname">
								{row.item}
								{#if lvl}<span class="uppill">↑</span>{/if}
							</span>
							<span class="val">{setsLine(row.sets, ex)}</span>
						</div>
					{/if}
				{/each}
				{#if s.minutes}
					{#if latest}
						<button type="button" class="sessrow tap" class:opened={editingRow === `${s.id}:${RUN_ITEM}`} onclick={() => openRun(s)}>
							<span class="exname">Run</span>
							<span class="val">{s.minutes} min</span>
						</button>
						{#if editingRow === `${s.id}:${RUN_ITEM}`}{@render editor(s)}{/if}
					{:else}
						<div class="sessrow">
							<span class="exname">Run</span>
							<span class="val">{s.minutes} min</span>
						</div>
					{/if}
				{/if}
				<!-- prep is present, not itemised: it never leads the row -->
				{#if s.prep}
					<div class="prepline">+ {s.prep} prep {s.prep === 1 ? 'step' : 'steps'} — warm-up, cooldown</div>
				{/if}
			</Card>
		{/if}
	{/each}

	{#if entries.length > 1}
		<p class="histnote">Older sets are history — remove the session and log it again if it's wrong.</p>
	{/if}

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
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: var(--text-display);
		line-height: var(--leading-tight);
	}
	/* removals are rare: one quiet toggle, not a button on every card */
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
		transition: background var(--dur-med) var(--ease-snap);
	}
	.edit:hover { color: var(--ink); border-color: var(--ink); }
	.edit[aria-pressed='true'] { color: var(--ink); border-color: var(--ink); background: var(--volt-tint); }

	.caps {
		font-size: 12px; font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps);
		text-transform: uppercase; color: var(--ink-3);
	}
	/* the calendar's caption, and the window it covers */
	.strip-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
	.span { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); }
	/* the one label the page keeps: it names the list below, not the page */
	.daycaps { margin-bottom: -8px; }

	.empty { font-size: 16px; color: var(--ink-2); }
	.err { margin: 0; color: var(--danger); font-weight: var(--weight-bold); font-size: var(--text-sm); }
	.histnote { margin: 0; font-family: var(--font-mono); font-size: 12px; color: var(--ink-3); }

	/* the event-sourced delete: the word is plain, the red waits for intent */
	.remove {
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
		transition: background var(--dur-med) var(--ease-snap), color var(--dur-med) var(--ease-snap);
	}
	.remove:hover { color: var(--danger); border-color: var(--danger); }
	.remove.armed { color: var(--paper); background: var(--danger); border-color: var(--danger); }
	.removerow { display: flex; justify-content: flex-end; margin-top: 10px; }
	.line { display: flex; justify-content: space-between; align-items: center; gap: 12px; width: 100%; }
	/* never break a date mid-word — "Sun, Aug 2" over three lines is what let
	   the badges keep their full width and push Remove off the card */
	.date { font-family: var(--font-mono); font-weight: var(--weight-bold); font-size: 15px; white-space: nowrap; }
	.runlbl { font-weight: var(--weight-bold); flex: 1; text-align: left; }
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
		width: 100%;
		min-height: 44px;
		padding: 14px 24px;
		border-top: 1px solid var(--border-soft);
	}
	/* a tappable row: the same two columns, and paper-2 while it is open */
	.tap {
		background: transparent; border-left: none; border-right: none; border-bottom: none;
		font: inherit; color: inherit; text-align: left; cursor: pointer; touch-action: manipulation;
		transition: background var(--dur-med) var(--ease-snap);
	}
	.line.tap { border: none; padding: 0; }
	.tap:hover { background: var(--volt-tint); }
	.tap.opened { background: var(--surface-sunken); }
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

	/* the inline editor: the Log-it-after line, one per set, then Save / Cancel */
	.editor {
		display: flex; flex-direction: column; gap: 6px;
		padding: 8px 24px 14px; background: var(--surface-sunken); border-top: 1px solid var(--border-soft);
	}
	.eline { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
	.elbl { font-family: var(--font-mono); font-size: 12px; font-weight: 700; letter-spacing: 0.06em; color: var(--ink-3); }
	.ectls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
	.ctl { display: inline-flex; align-items: center; gap: 2px; }
	.pm {
		width: 44px; min-height: 44px;
		background: transparent; border: none; border-radius: var(--radius-sm);
		font-family: var(--font-mono); font-size: 20px; font-weight: 700; color: var(--ink-2); cursor: pointer;
		touch-action: manipulation;
	}
	.pm:hover { background: var(--volt-tint); }
	.num { font-family: var(--font-mono); font-weight: 800; font-size: 18px; min-width: 44px; text-align: center; }
	.unit { font-size: 12px; font-weight: 700; color: var(--ink-3); }
	.times { font-family: var(--font-mono); color: var(--ink-3); }
	.ebtns { display: flex; gap: 8px; margin-top: 6px; }
	.esave {
		flex: 1; min-height: 48px;
		background: var(--volt); color: var(--ink);
		border: var(--border-w) solid var(--ink); border-radius: var(--radius-md); box-shadow: var(--shadow-raised);
		font-family: var(--font-body); font-weight: var(--weight-bold); font-size: 15px;
		cursor: pointer; touch-action: manipulation;
	}
	.esave:disabled { opacity: 0.4; cursor: default; }
	.ecancel {
		min-height: 48px; padding: 0 16px;
		background: var(--white); color: var(--ink-2);
		border: 1px solid var(--border-soft); border-radius: var(--radius-md);
		font-family: var(--font-body); font-weight: var(--weight-bold); font-size: 15px;
		cursor: pointer;
	}

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
