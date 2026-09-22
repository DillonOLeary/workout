<script lang="ts">
	import { enhance } from '$app/forms';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import DayCells from '$lib/components/DayCells.svelte';
	import { disciplineLabel, sessionNoun, sessionSummary, weekLine } from '$lib/domain/labels';
	import { routineTitle } from '$lib/domain/plan';
	import { projectSessions, queue, sessionEntries, weekStrip, weekTally } from '$lib/domain/projections';
	import { estimateMinutes, loggedOutside, positionLabel, routineExercises, sessionProgress, sessionSteps } from '$lib/domain/steps';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const now = Date.now();

	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let session = $derived(data.activeSession);
	let strip = $derived(weekStrip(data.events, now));
	let tally = $derived(weekTally(data.events, plan, now));

	let deck = $derived(queue(data.events, plan, now));
	let i = $state(0);
	let card = $derived(deck[Math.min(i, Math.max(0, deck.length - 1))]);
	let caps = $derived(
		!card
			? ''
			: `${i === 0 ? (card.due ? 'Due today' : 'Up next') : 'Instead'} · ${disciplineLabel(card.discipline)}${card.standsInFor ? ' · counts as the lift' : ''}`
	);
	let items = $derived(card ? routineExercises(plan, card.workout).map((e) => (e.kind === 'run' ? `${e.name} · ${e.hi} min` : e.name)) : []);
	let deckOpen = $state(false);
	let others = $derived(deck.map((c, k) => ({ c, k })).filter((x) => x.k !== i));
	function pick(k: number) {
		i = k;
		deckOpen = false;
	}

	let floorPlan = $derived(session ? (data.plans.find((p) => p.id === session.plan) ?? plan) : plan);
	let liveEntries = $derived(session ? sessionEntries(data.events, session.id) : []);
	let liveSteps = $derived(
		session ? sessionSteps(floorPlan, session.workout, loggedOutside(floorPlan, session.workout, liveEntries)) : []
	);
	let liveProgress = $derived(sessionProgress(liveSteps, liveEntries));
	let liveLine = $derived.by(() => {
		if (!session) return '';
		const left = estimateMinutes(liveSteps, liveProgress.current);
		const sets = session.discipline === 'run' ? '' : ` · ${liveProgress.sets} ${liveProgress.sets === 1 ? 'set' : 'sets'} logged`;
		return `${positionLabel(liveProgress.current, liveSteps)}${sets} · ~${left} min left`;
	});

	// the moment you need Undo is the moment after Finish: the latest session, while it is still today's (or was written after the fact), until the next one starts
	let justLogged = $derived.by(() => {
		if (session || !data.latestSession) return null;
		const s = projectSessions(data.events).find((x) => x.id === data.latestSession);
		if (!s) return null;
		const when = new Date(s.finishedAt ?? s.at), d = new Date(now);
		const sameDay = when.getFullYear() === d.getFullYear() && when.getMonth() === d.getMonth() && when.getDate() === d.getDate();
		if (s.mode !== 'after' && !sameDay) return null;
		const sets = s.rows.reduce((n, r) => n + r.sets.length, 0);
		const holds = sets > 0 && s.rows.every((r) => r.sets.every((m) => m.of === 'hold'));
		const walked = s.mode === 'live' && s.finishedAt ? Math.round((Date.parse(s.finishedAt) - Date.parse(s.at)) / 60000) : 0;
		const title = routineTitle(data.plans.find((p) => p.id === s.plan) ?? plan, s.workout.routine) ?? disciplineLabel(s.discipline);
		return { id: s.id, title, summary: sessionSummary({ sets, holds, minutes: s.minutes || (walked > 0 && walked <= 240 ? walked : 0) }) };
	});
	let undoing = $state(false);

	const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
</script>

<div class="col">
	<div class="head">
		<h1>Today</h1>
		<Badge tone="neutral">{today}</Badge>
	</div>

	<a class="strip" href="/ledger">
		<DayCells cells={strip} label="The last seven days" strip />
		<span class="stripline"><span>{weekLine(tally.done, tally.asked)}</span><span class="going">How it's going ›</span></span>
	</a>

	{#if form?.message}
		<p class="err">{form.message}</p>
	{/if}

	{#if justLogged}
		<form method="POST" action="?/undo" use:enhance class="logged">
			<input type="hidden" name="session" value={justLogged.id} />
			<span class="loggedtext"><b>Logged</b> · {justLogged.title} · {justLogged.summary}</span>
			{#if undoing}
				<button type="submit" class="undo armed">Undo?</button>
			{:else}
				<button type="button" class="undo" onclick={() => (undoing = true)}>Undo</button>
			{/if}
		</form>
	{/if}

	{#if session}
		<Card interactive>
			<div class="caps">In progress</div>
			<div class="title">{routineTitle(floorPlan, session.workout.routine) ?? disciplineLabel(session.discipline)}</div>
			<div class="mono-sub">{liveLine}</div>
			<div class="row gap12 wrap">
				<a class="resume" href="/floor">Resume</a>
				<form method="POST" action="?/finish" use:enhance class="grow">
					<Button variant="secondary" size="lg" type="submit" style="width: 100%">Finish {sessionNoun(session.discipline)}</Button>
				</form>
			</div>
		</Card>
	{:else if card}
		<Card interactive>
			<div class="caps">{caps}</div>
			<div class="title">{card.title}</div>
			<div class="mono-sub">{card.why}</div>
			{#if items.length}
				<div class="items">
					{#each items as n (n)}<span class="item">{n}</span>{/each}
				</div>
			{/if}

			<form method="POST" action="?/start" use:enhance>
				<input type="hidden" name="routine" value={card.workout.routine} />
				<input type="hidden" name="plan" value={plan.id} />
				<button type="submit" class="startbtn">Start <span class="startmin">~{card.minutes} min</span></button>
			</form>

			<div class="links">
				<a class="textlink" href="/log/after">Log it after →</a>
				{#if deck.length > 1}
					<button type="button" class="elsebtn" onclick={() => (deckOpen = !deckOpen)} aria-expanded={deckOpen}>
						{deckOpen ? 'Fewer ▴' : `Something else · ${deck.length - 1} ▾`}
					</button>
				{/if}
			</div>
		</Card>
		{#if deckOpen}
			<div class="deck">
				{#each others as { c, k } (c.cycle)}
					<button type="button" class="deckrow" onclick={() => pick(k)}>
						<span class="deckmain">
							<span class="caps">Instead · {disciplineLabel(c.discipline)}{c.standsInFor ? ' · counts as the lift' : ''}</span>
							<span class="decktitle">{c.title}</span>
						</span>
						<span class="deckmin">~{c.minutes} min</span>
					</button>
				{/each}
			</div>
		{/if}
	{:else}
		<Card interactive>
			<div class="caps">Nothing on</div>
			<div class="title">The week is empty</div>
			<div class="mono-sub">Switch a practice on in <a href="/week">Week</a> and Today deals it.</div>
		</Card>
	{/if}
</div>

<style>
	.col { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 16px; }
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
		margin: 4px 0 0;
	}
	.mono-sub { font-family: var(--font-mono); font-size: 14px; line-height: 1.45; color: var(--ink-2); margin: 4px 0 14px; }
	.mono-sub a { color: var(--ink); }
	.row { display: flex; align-items: center; }
	.gap12 { gap: 12px; }
	.wrap { flex-wrap: wrap; }
	.grow { flex: 1; }
	.err { margin: 0; color: var(--danger); font-weight: var(--weight-bold); }

	/* the strip: a glance, and the door to history */
	.strip { display: flex; flex-direction: column; gap: 6px; padding: 0 2px; text-decoration: none; color: inherit; border-radius: var(--radius-sm); }
	.strip:hover { background: transparent; }
	.stripline { display: flex; justify-content: space-between; gap: 8px; font-family: var(--font-mono); font-size: 12px; color: var(--ink-3); }
	.going { font-weight: 700; color: var(--ink-2); }
	.strip:hover .going { color: var(--ink); }

	.items { display: flex; flex-wrap: wrap; gap: 6px; margin: -4px 0 14px; }
	.item {
		font-size: 12px; line-height: 1; padding: 6px 9px;
		border: 1px solid var(--border-soft); border-radius: var(--radius-pill); color: var(--ink-2); white-space: nowrap;
	}

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

	.links { display: flex; align-items: center; gap: 12px; margin-top: 10px; flex-wrap: wrap; }
	.textlink {
		display: inline-flex; align-items: center; min-height: 44px; padding: 0 4px; margin-right: auto;
		background: none; border: none; cursor: pointer;
		font-family: var(--font-body); font-size: 13px; font-weight: var(--weight-bold); color: var(--ink-2);
		text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--border-soft);
	}
	.textlink:hover { color: var(--ink); background: none; }
	.elsebtn {
		display: inline-flex; align-items: center; justify-content: center; flex: none;
		min-height: 40px; padding: 0 14px;
		background: var(--white); color: var(--ink);
		border: 1px solid var(--ink); border-radius: var(--radius-pill);
		font-family: var(--font-body); font-weight: var(--weight-bold); font-size: 13px;
		cursor: pointer; touch-action: manipulation;
		transition: background var(--dur-med) var(--ease-snap);
	}
	.elsebtn:hover { background: var(--volt-tint); }

	/* the rest of the deck: the other cards, the floor last, one tap each */
	.deck { display: flex; flex-direction: column; gap: 8px; }
	.deckrow {
		display: flex; justify-content: space-between; align-items: baseline; gap: 10px; width: 100%;
		padding: 12px 16px; text-align: left;
		background: var(--white); border: var(--border-w) solid var(--border-soft); border-radius: var(--radius-lg); box-shadow: var(--shadow-card);
		font-family: var(--font-body); color: var(--ink); cursor: pointer; touch-action: manipulation;
		transition: border-color var(--dur-med) var(--ease-snap);
	}
	.deckrow:hover { border-color: var(--ink); }
	.deckmain { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.decktitle { font-family: var(--font-display); font-weight: var(--weight-black); font-size: 17px; }
	.deckmin { font-family: var(--font-mono); font-size: 12px; color: var(--ink-3); text-align: right; flex: none; }

	.logged {
		display: flex; align-items: center; justify-content: space-between; gap: 12px;
		padding: 6px 4px 6px 12px; background: var(--white); border: 1px solid var(--border-soft); border-radius: var(--radius-md);
	}
	.loggedtext { font-family: var(--font-mono); font-size: 12px; color: var(--ink-2); line-height: 1.4; }
	.loggedtext b { color: var(--ink); }
	.undo {
		flex: none; min-height: 40px; padding: 0 14px;
		background: transparent; border: 1px solid var(--border-soft); border-radius: var(--radius-pill);
		font-family: var(--font-body); font-size: 12px; font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps);
		text-transform: uppercase; color: var(--ink-3); cursor: pointer; touch-action: manipulation;
		transition: background var(--dur-med) var(--ease-snap), color var(--dur-med) var(--ease-snap);
	}
	.undo:hover { color: var(--danger); border-color: var(--danger); }
	.undo.armed { color: var(--paper); background: var(--danger); border-color: var(--danger); }

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

	@media (max-width: 900px) {
		.col { gap: 12px; }
		h1 { font-size: 30px; }
		.title { font-size: 22px; margin: 2px 0; }
		.mono-sub { margin-bottom: 12px; }
	}
	@media (max-height: 700px) {
		.startbtn { min-height: 64px; font-size: 20px; }
	}
</style>
