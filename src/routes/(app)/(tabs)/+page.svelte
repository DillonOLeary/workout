<script lang="ts">
	import { enhance } from '$app/forms';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import MonthGrid from '$lib/components/MonthGrid.svelte';
	import PaceTiles from '$lib/components/PaceTiles.svelte';
	import TrendRow from '$lib/components/TrendRow.svelte';
	import { dayTitle, monthGrid, nextWorkout, sessionEntries, trendFor, weekRunMinutes, weeklyPace } from '$lib/domain/projections';
	import { RUN, lift } from '$lib/domain/events';
	import { stretchDose } from '$lib/domain/labels';
	import { estimateMinutes, loggedOutside, positionLabel, sessionProgress, sessionSteps } from '$lib/domain/steps';
	import { hasRuns, liftDays, runTarget, stretchDays, type Exercise } from '$lib/domain/plan';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	// one clock reading per visit: every fold below takes it as an input
	const now = Date.now();

	/**
	 * Tab 1 is your state now and your state over time, in one scroll: what to
	 * do next, the last month of days, what that averages to a week, and how
	 * each exercise is going. Hands-off by
	 * default, control on demand: Today answers "what should I do?" with one
	 * button. The card is the three decisions there are — the workout, the
	 * stretch, the run — then the odd case (you already did one) as one
	 * link, then the rare case (the other day) as the quietest line on the
	 * card. Two verbs, one place each. A single stretch on its own is not
	 * a fourth decision: the floor's ⋯ sheet adds one to any session.
	 * Nothing chronological lives here — "By day" is one tap away at the
	 * foot.
	 */
	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let session = $derived(data.activeSession);
	let pick = $derived(nextWorkout(data.events, plan, now));
	let lifts = $derived(liftDays(plan));
	let others = $derived(lifts.filter((d) => d !== pick.day));
	// the stretch routine: the first stretch day, as a row under the button
	let stretchDay = $derived<string | undefined>(stretchDays(plan)[0]);
	let stretchSteps = $derived(stretchDay ? sessionSteps(plan, lift(stretchDay)) : []);
	let stretchLine = $derived(
		stretchDay
			? stretchDose(estimateMinutes(stretchSteps), plan.days[stretchDay].length, stretchSteps.filter((s) => s.kind === 'set').length)
			: ''
	);

	// a month of days, and what it averages to a week: one week of boxes could
	// only say "this week was quiet" — the question is whether that IS the week
	let grid = $derived(monthGrid(data.events, now, data.plans));
	let pace = $derived(weeklyPace(data.events, now, data.plans));

	// every exercise on the lift days, in plan order, once (calves are on both days)
	let planExercises = $derived.by(() => {
		const seen = new Set<string>();
		const out: Exercise[] = [];
		for (const d of lifts) for (const ex of plan.days[d]) if (!seen.has(ex.name)) { seen.add(ex.name); out.push(ex); }
		return out;
	});
	let trends = $derived(planExercises.map((ex) => ({ ex, trend: trendFor(data.events, ex, session?.id, now) })));
	let openRow = $state<string | null>(null);

	// the session is a list of steps: Today says how far in, and how long is left
	let floorPlan = $derived(session ? (data.plans.find((p) => p.id === session.plan) ?? plan) : plan);
	let liveEntries = $derived(session ? sessionEntries(data.events, session.id) : []);
	let liveSteps = $derived(
		session ? sessionSteps(floorPlan, session.workout, loggedOutside(floorPlan, session.workout, liveEntries)) : []
	);
	let liveProgress = $derived(sessionProgress(liveSteps, liveEntries));
	let liveLine = $derived.by(() => {
		if (!session) return '';
		const left = estimateMinutes(liveSteps, liveProgress.current);
		const sets = session.workout.kind === 'run' ? '' : ` · ${liveProgress.sets} ${liveProgress.sets === 1 ? 'set' : 'sets'} logged`;
		return `${positionLabel(liveProgress.current, liveSteps)}${sets} · ~${left} min left`;
	});
	let dueMinutes = $derived(estimateMinutes(sessionSteps(plan, lift(pick.day))));

	let minutes = $derived(weekRunMinutes(data.events, now));
	let target = $derived(runTarget(plan));

	const today = new Date().toLocaleDateString('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric'
	});
</script>

<div class="col">
	<div class="head">
		<h1>Today</h1>
		<Badge tone="neutral">{today}</Badge>
	</div>

	{#if form?.message}
		<p class="err">{form.message}</p>
	{/if}

	{#if session}
		<Card interactive>
			<div class="caps">In progress</div>
			<div class="title">{dayTitle(floorPlan, session.workout)}</div>
			<div class="mono-sub">{liveLine}</div>
			<div class="row gap12 wrap">
				<a class="resume" href="/log">Resume</a>
				<form method="POST" action="?/finish" use:enhance class="grow">
					<Button variant="secondary" size="lg" type="submit" style="width: 100%">Finish now</Button>
				</form>
			</div>
		</Card>
	{:else}
		<Card interactive>
			<div class="caps">Next up</div>
			<div class="title">{dayTitle(plan, lift(pick.day))}</div>
			<!-- the why: one mono line — how long since, and what the rule is about to move -->
			<div class="mono-sub">{pick.why}</div>

			<form method="POST" action="?/start" use:enhance>
				<input type="hidden" name="kind" value="lift" />
				<input type="hidden" name="day" value={pick.day} />
				<input type="hidden" name="plan" value={plan.id} />
				<button type="submit" class="startbtn">Start <span class="startmin">~{dueMinutes} min</span></button>
			</form>

			<!-- the other two decisions: the stretch and the run. White with an
			     ink outline: quiet actions, never volt, never a second verb. -->
			{#if stretchDay || hasRuns(plan)}
				<div class="rows">
					{#if stretchDay}
						<div class="rowline">
							<span class="rowtext">
								<span class="rowname">{dayTitle(plan, lift(stretchDay))}</span>
								<span class="rowsub">{stretchLine}</span>
							</span>
							<form method="POST" action="?/start" use:enhance>
								<input type="hidden" name="kind" value="lift" />
								<input type="hidden" name="day" value={stretchDay} />
								<input type="hidden" name="plan" value={plan.id} />
								<button type="submit" class="rowbtn">Start</button>
							</form>
						</div>
					{/if}
					{#if hasRuns(plan)}
						<div class="rowline">
							<span class="rowtext">
								<span class="rowname">{dayTitle(plan, RUN)}</span>
								<span class="rowsub">{minutes} of {target} min this week</span>
							</span>
							<form method="POST" action="?/start" use:enhance>
								<input type="hidden" name="kind" value="run" />
								<input type="hidden" name="plan" value={plan.id} />
								<button type="submit" class="rowbtn">Start</button>
							</form>
						</div>
					{/if}
				</div>
			{/if}

			<!-- after the fact: one door, whatever it was — the page has a chip
			     for the run, each day and the stretch, and opens on the run -->
			<div class="links">
				<a class="textlink" href="/log/after">Did one already? Log it after →</a>
			</div>

			<!-- the rare case: the other day, one quiet line, never at the run's level -->
			{#each others as d (d)}
				<form method="POST" action="?/start" use:enhance class="links">
					<input type="hidden" name="kind" value="lift" />
					<input type="hidden" name="day" value={d} />
					<input type="hidden" name="plan" value={plan.id} />
					<button type="submit" class="textlink">{dayTitle(plan, lift(d))} instead ▸</button>
				</form>
			{/each}
		</Card>
	{/if}

	<!-- the month, right under the action: lifted · ran · stretched · today,
	     then what it comes to per week, against the plan's own run goal -->
	<Card>
		<div class="strip-head">
			<span class="caps">Last month</span>
			<span class="span">{grid.span}</span>
		</div>
		<MonthGrid {grid} />
		<PaceTiles {pace} runs={hasRuns(plan)} runTarget={hasRuns(plan) ? target : null} />
	</Card>

	<section>
		<div class="caps mb10">How it's going</div>
		<Card pad={false}>
			{#each trends as t (t.ex.name)}
				<TrendRow
					ex={t.ex}
					trend={t.trend}
					open={openRow === t.ex.name}
					ontoggle={() => (openRow = openRow === t.ex.name ? null : t.ex.name)}
				/>
			{/each}
		</Card>
		<div class="foot">
			<a class="quiet" href="/ledger">By day →</a>
		</div>
	</section>
</div>

<style>
	.col { display: flex; flex-direction: column; gap: 16px; }
	.head { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; }
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
	.mb10 { display: block; margin-bottom: 10px; }
	.strip-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
	.span { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); }
	.title {
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: var(--text-title);
		margin: 4px 0 0;
	}
	.mono-sub { font-family: var(--font-mono); font-size: 14px; line-height: 1.45; color: var(--ink-2); margin: 4px 0 14px; }
	.row { display: flex; align-items: center; }
	.gap12 { gap: 12px; }
	.wrap { flex-wrap: wrap; }
	.grow { flex: 1; }
	.err { margin: 0; color: var(--danger); font-weight: var(--weight-bold); }

	/* the one thing this screen exists for — 76px of it, the length inside it */
	.startbtn {
		width: 100%;
		min-height: 76px;
		display: inline-flex; align-items: center; justify-content: center; gap: 12px;
		background: var(--volt);
		color: var(--ink);
		border: var(--border-w) solid var(--ink);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-raised-lg);
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: 22px;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		cursor: pointer;
		touch-action: manipulation;
		transition: transform var(--dur-fast) var(--ease-snap), box-shadow var(--dur-fast) var(--ease-snap), background var(--dur-med) var(--ease-snap);
	}
	.startmin { font-family: var(--font-mono); font-size: 14px; font-weight: 700; letter-spacing: var(--tracking-caps); text-transform: none; color: var(--ink-2); }
	.startbtn:hover { background: var(--volt-deep); }
	.startbtn:active { transform: translateY(3px); box-shadow: var(--shadow-pressed); }

	/* the paper list under the button: two rows, quiet actions on the right */
	.rows {
		margin-top: 12px;
		display: flex; flex-direction: column;
		background: var(--paper); border: 1px solid var(--border-soft); border-radius: var(--radius-md);
		overflow: hidden;
	}
	.rowline {
		min-height: 56px; padding: 8px 14px 8px 16px;
		display: flex; align-items: center; justify-content: space-between; gap: 12px;
		border-top: 1px solid var(--border-soft);
	}
	.rowline:first-child { border-top: none; }
	.rowtext { display: flex; flex-direction: column; min-width: 0; }
	.rowname { font-weight: var(--weight-bold); font-size: 15px; }
	.rowsub { font-family: var(--font-mono); font-size: 12px; color: var(--ink-3); }
	/* white with an ink outline: a quiet action — never volt, and the same on every row */
	.rowbtn {
		display: inline-flex; align-items: center; justify-content: center; flex: none;
		min-height: 44px; padding: 0 16px;
		background: var(--white); color: var(--ink);
		border: var(--border-w) solid var(--ink); border-radius: var(--radius-md);
		box-shadow: var(--shadow-raised);
		font-family: var(--font-body); font-weight: var(--weight-black); font-size: 13px;
		letter-spacing: var(--tracking-caps); text-transform: uppercase;
		text-decoration: none; cursor: pointer; touch-action: manipulation;
		transition: background var(--dur-med) var(--ease-snap), transform var(--dur-fast) var(--ease-snap), box-shadow var(--dur-fast) var(--ease-snap);
	}
	.rowbtn:hover { background: var(--volt-tint); }
	.rowbtn:active { transform: translateY(2px); box-shadow: var(--shadow-pressed); }

	.links { display: flex; align-items: center; gap: 12px; margin-top: 2px; }
	.textlink {
		display: inline-flex; align-items: center; min-height: 44px; padding: 0 4px;
		background: none; border: none; cursor: pointer;
		font-family: var(--font-body); font-size: 13px; font-weight: var(--weight-bold); color: var(--ink-2);
		text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--border-soft);
	}
	.textlink:hover { color: var(--ink); background: none; }

	/* Resume is a link (no state change) dressed as the accent button */
	.resume {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: var(--hit-lg);
		padding: 0 28px;
		font-weight: var(--weight-bold);
		font-size: var(--text-lg);
		color: var(--ink);
		background: var(--volt);
		border: var(--border-w) solid var(--ink);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-raised);
		text-decoration: none;
	}
	.resume:hover { background: var(--volt-deep); }
	.resume:active { transform: translateY(2px); box-shadow: var(--shadow-pressed); }

	.foot { display: flex; justify-content: space-between; gap: 12px; margin-top: 8px; }
	.quiet {
		display: inline-flex; align-items: center; min-height: 44px; padding: 0 4px;
		font-size: 12px; font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps);
		text-transform: uppercase; color: var(--ink-3);
		text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--border-soft);
	}
	.quiet:hover { color: var(--ink); background: var(--volt-tint); border-radius: var(--radius-sm); }

	@media (max-width: 900px) {
		.col { gap: 12px; }
		h1 { font-size: 30px; }
		.title { font-size: 22px; margin: 2px 0; }
		.mono-sub { margin-bottom: 12px; }
	}
</style>
