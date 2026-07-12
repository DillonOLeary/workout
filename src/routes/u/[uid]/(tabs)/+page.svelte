<script lang="ts">
	import { enhance } from '$app/forms';
	import Badge from '$lib/components/Badge.svelte';
	import Banner from '$lib/components/Banner.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Stepper from '$lib/components/Stepper.svelte';
	import WeeklyProgress from '$lib/components/WeeklyProgress.svelte';
	import {
		dayTitle,
		earnedIncrease,
		lastEntryFor,
		nextDay,
		suggestedWeight,
		weekRunMinutes
	} from '$lib/domain/projections';
	import type { SetLogged } from '$lib/domain/events';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Everything below is $derived from the event list — change the events,
	// and every number on this screen recomputes.
	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let session = $derived(data.activeSession);
	let due = $derived(nextDay(data.events, plan));
	let dayKeys = $derived(Object.keys(plan.days));

	let earned = $derived(
		dayKeys.flatMap((d) =>
			plan.days[d]
				.filter((ex) => earnedIncrease(lastEntryFor(data.events, ex.name, session?.id), ex))
				.map((ex) => ({ ...ex, day: d }))
		)
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

	{#if earned.length}
		<Banner tone="levelup">
			↑ Level up — {earned.map((ex) => `add ${ex.inc} lb to ${ex.name}`).join(', ')}.
		</Banner>
	{/if}

	{#if session}
		<Card interactive>
			<div class="caps">In progress</div>
			<div class="title">{dayTitle(floorPlan, session.day)}</div>
			<div class="mono-sub">{sessionSets} of {sessionTotal} sets</div>
			<div class="row gap12 wrap">
				<a class="resume" href={`/u/${data.uid}/log`}>Resume</a>
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
			<div class="exlist">
				{#each plan.days[due] as ex (ex.name)}
					{@const w = suggestedWeight(data.events, ex)}
					{@const up = earnedIncrease(lastEntryFor(data.events, ex.name), ex)}
					<div class="exrow">
						<span class="exname">{ex.name}</span>
						<span class="exnums">
							{#if up}<span class="uppill">↑</span>{/if}
							{w} lb · {ex.sets}×{ex.lo}–{ex.hi}
						</span>
					</div>
				{/each}
			</div>
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
						<Button variant="ghost" type="submit">Start {dayTitle(plan, d)} instead</Button>
					</form>
				{/each}
			</div>
		</Card>
	{/if}

	<WeeklyProgress {minutes} />

	<Card>
		<div class="caps mb12">Log a run</div>
		<form method="POST" action="?/logRun" use:enhance class="row gap16 wrap">
			<Stepper bind:value={runMin} step={5} min={5} max={240} unit="min" label="minutes" />
			<input type="hidden" name="minutes" value={runMin} />
			<Button variant="secondary" size="lg" type="submit" style="flex: 1; min-width: 140px">
				Log run
			</Button>
		</form>
	</Card>
</div>

<style>
	.col { display: flex; flex-direction: column; gap: 20px; }
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
	.mb12 { margin-bottom: 12px; }
	.title {
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: var(--text-title);
		margin: 6px 0 4px;
	}
	.mono-sub { font-family: var(--font-mono); font-size: 15px; color: var(--ink-2); margin-bottom: 16px; }
	.desc { font-size: var(--text-sm); color: var(--ink-3); margin-bottom: 12px; }
	.row { display: flex; align-items: center; }
	.gap12 { gap: 12px; }
	.gap16 { gap: 16px; }
	.wrap { flex-wrap: wrap; }
	.grow { flex: 1; }
	.exlist { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
	.exrow { display: flex; justify-content: space-between; gap: 12px; font-size: 16px; }
	.exname { font-weight: var(--weight-bold); }
	.exnums { font-family: var(--font-mono); white-space: nowrap; }
	.uppill { background: var(--volt); padding: 0 5px; border-radius: 4px; margin-right: 6px; }
	.alts { margin-top: 10px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 4px; }
	.err { margin: 0; color: var(--danger); font-weight: var(--weight-bold); }

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
</style>
