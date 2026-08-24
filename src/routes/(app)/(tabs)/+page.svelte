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
	 * Today answers one question — what do I do right now — and has to answer
	 * it without scrolling, because it is the screen you check on the way out
	 * the door. The card carries the day title, one mono line for the shape of
	 * the session and what the rule changed, and a big Start. Everything else
	 * (the exercise list, warm-up, technique) lives where it is used: The Plan
	 * tab and the gym floor's ⋯ sheet.
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
	// per-set progression: ↑ when any set of an exercise goes up, ↓ when
	// anything comes down (a re-entry after time away, or an adjustment)
	let ups = $derived(dueLoads.filter((c) => c.load.up).map((c) => c.ex.name));
	let downs = $derived(dueLoads.filter((c) => c.load.down).map((c) => c.ex.name));
	// one name plus a count, never the full list — spelling out four exercises
	// wraps to a second line and costs more height than the news is worth
	const summarise = (names: string[]) =>
		names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
	let shape = $derived(
		`${dueList.length} exercises · ${dueSets} sets` +
			(ups.length ? ` · ↑ ${summarise(ups)}` : '') +
			(downs.length ? ` · ↓ ${summarise(downs)}` : '')
	);

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
			<div class="mono-sub">{shape}</div>

			<form method="POST" action="?/start" use:enhance>
				<input type="hidden" name="day" value={due} />
				<input type="hidden" name="plan" value={plan.id} />
				<button type="submit" class="startbtn">Start workout</button>
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

	/* Phones: Today must not scroll. Nothing is removed here, only tightened. */
	@media (max-width: 900px) {
		.col { gap: 12px; }
		h1 { font-size: 30px; }
		.title { font-size: 22px; margin: 2px 0; }
		.alts { margin-top: 4px; }
		.altlink { min-height: 36px; }
		.mono-sub { margin-bottom: 12px; }
	}

	@media (max-height: 700px) {
		.col { gap: 8px; }
		h1 { font-size: 24px; }
		.title { font-size: 19px; }
		.altlink { min-height: 32px; }
	}

	@media (max-height: 620px) {
		.col { gap: 6px; }
		.altlink { min-height: 28px; }
		.mono-sub { margin-bottom: 8px; font-size: 14px; }
	}

	@media (max-height: 560px) {
		/* 44px is the touch floor, not a suggestion */
		.resume { min-height: 44px; font-size: 15px; }
		.startbtn { min-height: 64px; font-size: 19px; }
		h1 { font-size: 22px; }
		.caps { font-size: 11px; }
		.title { font-size: 17px; }
		.alts { margin-top: 0; }
	}
</style>
