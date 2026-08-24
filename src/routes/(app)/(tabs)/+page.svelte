<script lang="ts">
	import { enhance } from '$app/forms';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Stepper from '$lib/components/Stepper.svelte';
	import TrendRow from '$lib/components/TrendRow.svelte';
	import WeekStrip from '$lib/components/WeekStrip.svelte';
	import WeeklyProgress from '$lib/components/WeeklyProgress.svelte';
	import {
		REENTRY_DAYS,
		REENTRY_WARN_DAYS,
		dayAges,
		dayTitle,
		nextDay,
		nextLoad,
		trendFor,
		weekRunMinutes,
		weekStrip
	} from '$lib/domain/projections';
	import type { SetLogged } from '$lib/domain/events';
	import type { Exercise } from '$lib/domain/types';
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

	// Scoped to the day that is DUE: a level-up on the other day isn't actionable
	// from here, and the gym floor announces it when you get there.
	let dueList = $derived(plan.days[due] ?? []);
	let dueSets = $derived(dueList.reduce((n, e) => n + e.sets, 0));
	let dueLoads = $derived(dueList.map((ex) => ({ ex, load: nextLoad(data.events, ex, session?.id) })));
	let ups = $derived(dueLoads.filter((c) => c.load.up).map((c) => c.ex.name));
	let downs = $derived(dueLoads.filter((c) => c.load.down).map((c) => c.ex.name));
	const summarise = (names: string[]) =>
		names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
	let shape = $derived(
		`${dueList.length} exercises · ${dueSets} sets` +
			(ups.length ? ` · ↑ ${summarise(ups)}` : '') +
			(downs.length ? ` · ↓ ${summarise(downs)}` : '')
	);

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

	let floorPlan = $derived(session ? (data.plans.find((p) => p.id === session.plan) ?? plan) : plan);
	let sessionSets = $derived(
		session
			? data.events.filter(
					(e): e is SetLogged => e.type === 'SetLogged' && e.data.session === session.id
				).length
			: 0
	);
	let sessionTotal = $derived(
		session ? (floorPlan.days[session.day] ?? []).reduce((n, e) => n + e.sets, 0) : 0
	);

	let minutes = $derived(weekRunMinutes(data.events));
	let runTarget = $derived(plan.runTarget ?? 150);
	let runMin = $state(30);
	let runOpen = $state(false);

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

	<Card>
		<div class="caps mb10">This week</div>
		<WeekStrip {cells} />
	</Card>

	{#if session}
		<Card interactive>
			<div class="caps">In progress</div>
			<div class="title">{dayTitle(floorPlan, session.day)}</div>
			<div class="mono-sub">{sessionSets} of {sessionTotal} sets</div>
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
			<div class="title">{dayTitle(plan, due)}</div>
			<div class="mono-sub">{shape}</div>

			<form method="POST" action="?/start" use:enhance>
				<input type="hidden" name="day" value={due} />
				<input type="hidden" name="plan" value={plan.id} />
				<button type="submit" class="startbtn">Start workout</button>
			</form>
			<!-- two peers, neither competing with Start: the other day, and the
			     five-second action you take a couple of times a week -->
			<div class="secs">
				{#each dayKeys.filter((d) => d !== due) as d (d)}
					<form method="POST" action="?/start" use:enhance class="grow">
						<input type="hidden" name="day" value={d} />
						<input type="hidden" name="plan" value={plan.id} />
						<Button variant="secondary" type="submit" style="width: 100%">or {dayTitle(plan, d)}</Button>
					</form>
				{/each}
				{#if plan.runs !== false}
					<Button variant="secondary" type="button" style="flex: 1" aria-expanded={runOpen} onclick={() => (runOpen = !runOpen)}>
						{runOpen ? 'Cancel' : 'Log a run'}
					</Button>
				{/if}
			</div>
			{#if runOpen && plan.runs !== false}
				<form method="POST" action="?/logRun" use:enhance class="row gap12 wrap runform">
					<Stepper bind:value={runMin} step={5} min={5} max={240} unit="min" label="minutes" />
					<input type="hidden" name="minutes" value={runMin} />
					<Button variant="accent" size="lg" type="submit" style="flex: 1; min-width: 96px">Log {runMin} min</Button>
				</form>
			{/if}
		</Card>
	{/if}

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

	{#if plan.runs !== false}
		<WeeklyProgress {minutes} target={runTarget} />
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
		margin: 4px 0 2px;
	}
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
	.runform { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-soft); }

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
