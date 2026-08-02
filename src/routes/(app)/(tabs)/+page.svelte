<script lang="ts">
	import { enhance } from '$app/forms';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Stepper from '$lib/components/Stepper.svelte';
	import WeeklyProgress from '$lib/components/WeeklyProgress.svelte';
	import { dayTitle, nextDay, nextLoad, weekRunMinutes } from '$lib/domain/projections';
	import type { SetLogged } from '$lib/domain/events';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/**
	 * Today answers one question — what do I do right now — and has to answer it
	 * without scrolling, because it is the screen you check on the way out the
	 * door. Everything here is either the next action or the score. The full
	 * exercise list used to live here; it is one tap away on The Plan, and the
	 * gym floor shows each lift as you reach it, so it was costing a screenful
	 * to say something twice.
	 */
	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let session = $derived(data.activeSession);
	let due = $derived(nextDay(data.events, plan));
	let dayKeys = $derived(Object.keys(plan.days));

	// Scoped to the day that is DUE: a level-up on the other day isn't actionable
	// from here, and the gym floor announces it when you get there.
	let dueList = $derived(plan.days[due] ?? []);
	let dueSets = $derived(dueList.reduce((n, e) => n + e.sets, 0));
	let dueLoads = $derived(dueList.map((ex) => ({ ex, load: nextLoad(data.events, ex, session?.id) })));
	let ups = $derived(dueLoads.filter((c) => c.load.reason === 'increase').map((c) => c.ex.name));
	let downs = $derived(dueLoads.filter((c) => c.load.reason === 'deload').map((c) => c.ex.name));
	// one name plus a count, never the full list — spelling out four exercises
	// wraps to a second line and costs more height than the news is worth
	const summarise = (names: string[]) =>
		names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;

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

	const today = new Date().toLocaleDateString('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric'
	});
</script>

<div class="col">
	<div class="head">
		<h1>Today</h1>
		<!-- the run badge lived here while runs were below the fold; the meter
		     itself is on screen now, so repeating it is just height -->
		<Badge tone="neutral">{today}</Badge>
	</div>

	{#if form?.message}
		<p class="err">{form.message}</p>
	{/if}

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
			{#if plan.dayInfo?.[due]?.desc}
				<div class="desc">{plan.dayInfo[due].desc}</div>
			{/if}
			<!-- the shape of the session, and a way through to the detail -->
			<a class="scope" href="/plan">
				{dueList.length} exercises · {dueSets} sets<span class="scopego">see the plan →</span>
			</a>

			{#if ups.length || downs.length}
				<div class="changes">
					{#if ups.length}
						<span class="pill up">↑</span><span class="pilltext">{summarise(ups)}</span>
					{/if}
					{#if downs.length}
						<span class="pill down">↓</span><span class="pilltext">{summarise(downs)}</span>
					{/if}
				</div>
			{/if}

			<form method="POST" action="?/start" use:enhance>
				<input type="hidden" name="day" value={due} />
				<input type="hidden" name="plan" value={plan.id} />
				<Button variant="accent" size="lg" type="submit" style="width: 100%">
					Start {dayTitle(plan, due)}
				</Button>
			</form>
			<div class="alts">
				{#each dayKeys.filter((d) => d !== due) as d (d)}
					<form method="POST" action="?/start" use:enhance>
						<input type="hidden" name="day" value={d} />
						<input type="hidden" name="plan" value={plan.id} />
						<button type="submit" class="altlink">or start {dayTitle(plan, d)}</button>
					</form>
				{/each}
			</div>
		</Card>
	{/if}

	{#if plan.runs !== false}
		<WeeklyProgress {minutes} target={runTarget}>
			<form method="POST" action="?/logRun" use:enhance class="row gap12 wrap">
				<Stepper bind:value={runMin} step={5} min={5} max={240} unit="min" label="minutes" />
				<input type="hidden" name="minutes" value={runMin} />
				<Button variant="secondary" size="lg" type="submit" style="flex: 1; min-width: 96px">
					Log run
				</Button>
			</form>
		</WeeklyProgress>
	{/if}
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
	.title {
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: var(--text-title);
		margin: 4px 0 2px;
	}
	.mono-sub { font-family: var(--font-mono); font-size: 15px; color: var(--ink-2); margin-bottom: 16px; }
	.desc { font-size: var(--text-sm); color: var(--ink-3); }
	.row { display: flex; align-items: center; }
	.gap12 { gap: 12px; }
	.wrap { flex-wrap: wrap; }
	.grow { flex: 1; }
	.err { margin: 0; color: var(--danger); font-weight: var(--weight-bold); }

	/* the session's shape, doubling as the door to the full list */
	.scope {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		margin: 10px 0 12px;
		padding-bottom: 10px;
		border-bottom: 1px solid var(--border-soft);
		font-family: var(--font-mono);
		font-size: 14px;
		color: var(--ink-2);
		text-decoration: none;
	}
	.scopego { font-family: var(--font-body); font-weight: var(--weight-bold); font-size: 13px; color: var(--ink); white-space: nowrap; }
	.scope:hover .scopego { text-decoration: underline; }

	/* what the rule changed for this workout — a line, not two banners */
	.changes { display: flex; align-items: baseline; gap: 6px; margin-bottom: 12px; font-size: 14px; min-width: 0; }
	.pill { font-family: var(--font-mono); font-weight: 700; padding: 0 5px; border-radius: 4px; }
	.pill.up { background: var(--volt); color: var(--ink); }
	.pill.down { border: 1px solid var(--ink-3); color: var(--ink-2); }
	.pilltext { color: var(--ink-2); margin-right: 6px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.pill { flex: none; }

	/* the other day: a real submit, dressed down to a link so it can't compete
	   with the primary action directly above it */
	.alts { margin-top: 8px; display: flex; flex-direction: column; align-items: center; }
	.altlink {
		min-height: 40px;
		padding: 0 12px;
		background: none;
		border: none;
		cursor: pointer;
		font-family: var(--font-body);
		font-weight: var(--weight-bold);
		font-size: 14px;
		color: var(--ink-2);
		text-decoration: underline;
		text-underline-offset: 3px;
		text-decoration-color: var(--border-soft);
	}
	.altlink:hover { color: var(--ink); }

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

	/* Phones: Today must not scroll — it is the screen you check on the way out
	   the door, and a page-down to find the start button defeats the point.
	   Nothing is removed here, only tightened. Desktop keeps the roomy ring. */
	@media (max-width: 900px) {
		.col { gap: 12px; }
		h1 { font-size: 30px; }
		.title { font-size: 22px; margin: 2px 0; }
		.scope { margin: 8px 0 10px; padding-bottom: 8px; }
		.changes { margin-bottom: 10px; }
		.alts { margin-top: 4px; }
		.altlink { min-height: 36px; }
		.mono-sub { margin-bottom: 12px; }
	}

	/* Very short phones (SE, older Androids): the pattern summary goes, since
	   the exercise count below it already says what kind of session this is. */
	@media (max-height: 700px) {
		.col { gap: 8px; }
		h1 { font-size: 24px; }
		.title { font-size: 19px; }
		.desc { display: none; }
		.scope { margin: 6px 0 8px; padding-bottom: 6px; }
		.altlink { min-height: 32px; }
		.changes { margin-bottom: 8px; font-size: 13px; }
		.scopego { font-size: 12px; }
	}

	/* Smallest screens (SE with Safari's bars up): the session-shape line is
	   the only thing here that is information rather than action, and the
	   Plan tab reaches the same detail in one tap. */
	@media (max-height: 620px) {
		.scope { display: none; }
		.col { gap: 6px; }
		.altlink { min-height: 28px; }
		.mono-sub { margin-bottom: 8px; font-size: 14px; }
	}

	@media (max-height: 560px) {
		/* 44px is the touch floor, not a suggestion — this is as small as the
		   resume/finish pair is allowed to get */
		.resume { min-height: 44px; font-size: 15px; }
		h1 { font-size: 22px; }
		.caps { font-size: 11px; }
		.title { font-size: 17px; }
		.alts { margin-top: 0; }
	}
</style>
