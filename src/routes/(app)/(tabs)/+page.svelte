<script lang="ts">
	import { enhance } from '$app/forms';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import TrendRow from '$lib/components/TrendRow.svelte';
	import WeekStrip from '$lib/components/WeekStrip.svelte';
	import WeeklyProgress from '$lib/components/WeeklyProgress.svelte';
	import {
		REENTRY_DAYS,
		REENTRY_WARN_DAYS,
		dayAges,
		dayTitle,
		nextDay,
		trendFor,
		weekRunMinutes,
		weekStrip
	} from '$lib/domain/projections';
	import { RUN_DAY, type EntryLogged } from '$lib/domain/events';
	import { estimateMinutes, sessionProgress, sessionSteps, stepOf } from '$lib/domain/steps';
	import { hasRuns, runTarget, type Exercise } from '$lib/domain/plan';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/**
	 * Tab 1 is your state now and your state over time, in one scroll: this
	 * week, what to do next, anything the rule is about to do, and how each
	 * exercise is going. Nothing chronological lives here — "By day" is one
	 * tap away at the foot for the rare "what did I do Tuesday".
	 */
	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let session = $derived(data.activeSession);
	let due = $derived(nextDay(data.events, plan));
	let dayKeys = $derived(Object.keys(plan.days));

	let cells = $derived(weekStrip(data.events));

	// the re-entry nudge: information, never alarm — only while there is runway
	let nudges = $derived(
		dayAges(data.events, plan).filter(
			(a) => a.daysSince !== null && a.daysSince >= REENTRY_WARN_DAYS && a.daysSince <= REENTRY_DAYS
		)
	);
	const runway = (days: number) => Math.max(1, Math.ceil(REENTRY_DAYS - days));

	// every exercise on the plan, in plan order, once (calves are on both days)
	let planExercises = $derived.by(() => {
		const seen = new Set<string>();
		const out: Exercise[] = [];
		for (const d of dayKeys) for (const ex of plan.days[d]) if (!seen.has(ex.name)) { seen.add(ex.name); out.push(ex); }
		return out;
	});
	let trends = $derived(planExercises.map((ex) => ({ ex, trend: trendFor(data.events, ex, session?.id) })));
	let openRow = $state<string | null>(null);

	// the session is a list of steps: Today says how long it is, and how far in
	let floorPlan = $derived(session ? (data.plans.find((p) => p.id === session.plan) ?? plan) : plan);
	let liveSteps = $derived(session ? sessionSteps(floorPlan, session.day) : []);
	let liveEntries = $derived(
		session
			? data.events
					.filter((e): e is EntryLogged => e.type === 'EntryLogged' && e.data.session === session.id)
					.map((e) => e.data)
			: []
	);
	let liveProgress = $derived(sessionProgress(liveSteps, liveEntries));
	let liveLine = $derived.by(() => {
		if (!session) return '';
		const left = estimateMinutes(liveSteps, liveProgress.current);
		if (session.day === RUN_DAY) return `${stepOf(liveProgress.current, liveSteps)} · ~${left} min left`;
		const warm = liveSteps.filter((s) => s.section === 'Warm-up');
		const warmDone = warm.length > 0 && warm.every((s) => liveProgress.done.has(s.key));
		return `${stepOf(liveProgress.current, liveSteps)}${warmDone ? ' · warm-up done' : ''} · ${liveProgress.sets} ${liveProgress.sets === 1 ? 'set' : 'sets'} logged · ~${left} min left`;
	});
	let dueSteps = $derived(sessionSteps(plan, due));
	let dueLine = $derived.by(() => {
		const prep = dueSteps.some((s) => s.kind === 'prep');
		return `${dueSteps.length} steps · about ${estimateMinutes(dueSteps)} min${prep ? ' · warm-up and cooldown included' : ''}`;
	});

	let minutes = $derived(weekRunMinutes(data.events));
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
			<div class="title">{dayTitle(floorPlan, session.day)}</div>
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
			<!-- label + title on the left; the way through to the detail on the
			     right, centred on the block so its hit height stretches nothing -->
			<div class="headrow">
				<div>
					<div class="caps">Next up</div>
					<div class="title">{dayTitle(plan, due)}</div>
				</div>
				<a class="planlink" href="/plan?day={due}">See the plan →</a>
			</div>
			<!-- the session's honest length, from its steps -->
			<div class="mono-sub">{dueLine}</div>

			<form method="POST" action="?/start" use:enhance>
				<input type="hidden" name="day" value={due} />
				<input type="hidden" name="plan" value={plan.id} />
				<button type="submit" class="startbtn">Start workout</button>
			</form>
			<!-- peers, none competing with Start: the other lift day, and the
			     guided run — walk, run, walk, on the same floor -->
			<div class="secs">
				{#each dayKeys.filter((d) => d !== due) as d (d)}
					<form method="POST" action="?/start" use:enhance class="grow">
						<input type="hidden" name="day" value={d} />
						<input type="hidden" name="plan" value={plan.id} />
						<Button variant="secondary" type="submit" style="width: 100%">or {dayTitle(plan, d)}</Button>
					</form>
				{/each}
				{#if hasRuns(plan)}
					<form method="POST" action="?/start" use:enhance class="grow">
						<input type="hidden" name="day" value={RUN_DAY} />
						<input type="hidden" name="plan" value={plan.id} />
						<Button variant="secondary" type="submit" style="width: 100%">or {dayTitle(plan, RUN_DAY)}</Button>
					</form>
				{/if}
			</div>
			<!-- did it without the phone: the same session, written after -->
			<a class="afterlink" href="/log/after">Already did one? Log it after →</a>
		</Card>
	{/if}

	<!-- the week, right under the action: the strip, and the run meter under it -->
	<Card>
		<div class="caps mb10">This week</div>
		<WeekStrip {cells} />
		{#if hasRuns(plan)}
			<WeeklyProgress {minutes} target={target} label="Running" bare />
		{/if}
	</Card>

	{#if nudges.length}
		<div class="nudge">
			<span class="caps">Heads up</span>
			{#each nudges as n (n.day)}
				<p>
					<b>{dayTitle(plan, n.day)}</b> — {Math.floor(n.daysSince ?? 0)} days ago. Re-entry haircut in
					{runway(n.daysSince ?? 0)} {runway(n.daysSince ?? 0) === 1 ? 'day' : 'days'}: past two weeks, every
					set comes back one size lighter.
				</p>
			{/each}
		</div>
	{/if}

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
			<a class="quiet" href="/export" download="training-ledger-events.json">Export JSON</a>
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
	.title {
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: var(--text-title);
		margin: 4px 0 0;
	}
	.headrow {
		display: flex; justify-content: space-between; align-items: center; gap: 12px;
		margin-bottom: 14px;
	}
	.headrow > div { min-width: 0; }
	.planlink {
		flex: none; display: inline-flex; align-items: center; min-height: 44px; padding: 0 4px;
		font-size: 14px; font-weight: var(--weight-bold); color: var(--ink-2); white-space: nowrap;
		text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--border-soft);
	}
	.planlink:hover { color: var(--ink); background: none; }
	.mono-sub { font-family: var(--font-mono); font-size: 15px; color: var(--ink-2); margin-bottom: 16px; }
	.row { display: flex; align-items: center; }
	.gap12 { gap: 12px; }
	.wrap { flex-wrap: wrap; }
	.grow { flex: 1; }
	.err { margin: 0; color: var(--danger); font-weight: var(--weight-bold); }

	/* the one thing this screen exists for — 76px of it */
	.startbtn {
		width: 100%;
		min-height: 76px;
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
	}
	.startbtn:hover { background: var(--volt-deep); }
	.startbtn:active { transform: translateY(3px); box-shadow: var(--shadow-pressed); }
	.secs { display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
	.afterlink {
		display: inline-flex; align-items: center; min-height: 44px; margin-top: 4px; padding: 0 4px;
		font-size: 13px; font-weight: var(--weight-bold); color: var(--ink-3);
		text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--border-soft);
	}
	.afterlink:hover { color: var(--ink); background: none; }

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

	/* information, never alarm: paper-2, one soft border, prose */
	.nudge {
		display: flex; flex-direction: column; gap: 6px;
		padding: 14px 16px; background: var(--surface-sunken);
		border: 1px solid var(--border-soft); border-radius: var(--radius-lg);
	}
	.nudge p { margin: 0; font-size: 14px; line-height: 1.5; color: var(--ink-2); }
	.nudge b { color: var(--ink); }

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
