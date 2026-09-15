<script lang="ts">
	import { enhance } from '$app/forms';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import ExerciseGlyph from '$lib/components/ExerciseGlyph.svelte';
	import { glyphFor } from '$lib/design/glyphs';
	import { disciplineLabel } from '$lib/domain/labels';
	import { cooldownFor, routineTitle, warmupFor } from '$lib/domain/plan';
	import { queue, sessionEntries } from '$lib/domain/projections';
	import { estimateMinutes, loggedOutside, positionLabel, routineExercises, sessionProgress, sessionSteps } from '$lib/domain/steps';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const now = Date.now();

	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let session = $derived(data.activeSession);
	let deck = $derived(queue(data.events, plan, data.preferences, now));
	let i = $state(0);
	let card = $derived(deck[Math.min(i, Math.max(0, deck.length - 1))]);
	let caps = $derived(
		!card ? '' : `${card.out ? 'Ruled out' : i === 0 ? (card.due ? 'Due today' : 'Up next') : 'Instead'} · ${disciplineLabel(card.discipline)}`
	);
	function next() {
		i = (i + 1) % deck.length;
	}

	let exercises = $derived(card ? routineExercises(plan, card.workout).filter((e) => e.kind !== 'run') : []);
	let drills = $derived(
		card
			? [...warmupFor(plan, card.workout.routine), ...cooldownFor(plan, card.workout.routine)].flatMap((it) => (typeof it === 'string' ? [] : [it.name]))
			: []
	);
	let peek = $derived(
		[...exercises.map((e) => e.name), ...drills].filter((n, i, all) => glyphFor(n) && all.indexOf(n) === i).slice(0, 4)
	);
	let rest = $derived(exercises.map((e) => e.name).filter((n) => !peek.includes(n)));
	let oneline = $derived(card ? (plan.routineInfo[card.workout.routine].desc ?? `${exercises.length} exercises`) : '');
	let more = $derived(rest.length ? `+ ${rest.length} more · ${rest.join(', ')}` : exercises.length ? '' : oneline);
	// the slack region is flex: 1 with a zero basis — its height IS the space the page has left over, measured rather than assumed
	let slack = $state(0);
	let mode = $derived(!card || card.out ? 'none' : slack >= 150 && peek.length ? 'strip' : slack >= 60 ? 'line' : 'none');

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
			<div class="title">{routineTitle(floorPlan, session.workout.routine) ?? disciplineLabel(session.discipline)}</div>
			<div class="mono-sub">{liveLine}</div>
			<div class="row gap12 wrap">
				<a class="resume" href="/floor">Resume</a>
				<form method="POST" action="?/finish" use:enhance class="grow">
					<Button variant="secondary" size="lg" type="submit" style="width: 100%">Finish now</Button>
				</form>
			</div>
		</Card>
	{:else if card}
		<Card interactive>
			<div class="caps">{caps}</div>
			<div class="title" class:out={card.out}>{card.title}</div>
			<div class="mono-sub">{card.why}</div>

			<form method="POST" action="?/start" use:enhance>
				<input type="hidden" name="routine" value={card.workout.routine} />
				<input type="hidden" name="plan" value={plan.id} />
				<button type="submit" class="startbtn" class:quiet={card.out}>Start <span class="startmin">~{card.minutes} min</span></button>
			</form>

			<div class="links">
				<span class="dots" aria-label="{i + 1} of {deck.length}">
					{#each deck as c, k (c.cycle)}<span class="dot" class:on={k === i}></span>{/each}
				</span>
				<a class="textlink" href="/log/after">Log it after →</a>
				{#if deck.length > 1}
					<button type="button" class="elsebtn" onclick={next}>Something else ▸</button>
				{/if}
			</div>
		</Card>

		<div class="slack" bind:clientHeight={slack}>
			{#if mode === 'strip'}
				<div class="strip">
					<div class="caps">What's in it</div>
					<div class="peek">
						{#each peek as name (name)}
							<div class="peekone">
								<ExerciseGlyph {name} size={72} play={false} />
								<span class="peekname">{name}</span>
							</div>
						{/each}
					</div>
					{#if more}<div class="more">{more}</div>{/if}
				</div>
			{:else if mode === 'line'}
				<div class="oneline">{oneline}</div>
			{/if}
		</div>
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
	.title.out { text-decoration: line-through; text-decoration-thickness: 3px; color: var(--ink-3); }
	.mono-sub { font-family: var(--font-mono); font-size: 14px; line-height: 1.45; color: var(--ink-2); margin: 4px 0 14px; }
	.row { display: flex; align-items: center; }
	.gap12 { gap: 12px; }
	.wrap { flex-wrap: wrap; }
	.grow { flex: 1; }
	.err { margin: 0; color: var(--danger); font-weight: var(--weight-bold); }

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
	.startbtn.quiet { background: var(--white); box-shadow: var(--shadow-raised); }
	.startbtn.quiet:hover { background: var(--volt-tint); }

	.links { display: flex; align-items: center; gap: 12px; margin-top: 10px; flex-wrap: wrap; }
	.dots { display: inline-flex; gap: 5px; align-items: center; margin-right: auto; }
	.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--white); border: 1px solid var(--ink); }
	.dot.on { background: var(--ink); }
	.textlink {
		display: inline-flex; align-items: center; min-height: 44px; padding: 0 4px;
		background: none; border: none; cursor: pointer;
		font-family: var(--font-body); font-size: 13px; font-weight: var(--weight-bold); color: var(--ink-2);
		text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--border-soft);
	}
	.textlink:hover { color: var(--ink); background: none; }
	.elsebtn {
		display: inline-flex; align-items: center; justify-content: center; flex: none; margin-left: auto;
		min-height: 40px; padding: 0 14px;
		background: var(--white); color: var(--ink);
		border: 1px solid var(--ink); border-radius: var(--radius-pill);
		font-family: var(--font-body); font-weight: var(--weight-bold); font-size: 13px;
		cursor: pointer; touch-action: manipulation;
		transition: background var(--dur-med) var(--ease-snap);
	}
	.elsebtn:hover { background: var(--volt-tint); }

	.slack { flex: 1 1 0; min-height: 0; overflow: hidden; display: flex; flex-direction: column; justify-content: flex-end; }
	.strip { display: flex; flex-direction: column; gap: 8px; padding: 0 4px 4px; }
	.peek { display: flex; justify-content: space-between; gap: 8px; }
	.peekone { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0; flex: 1 1 0; }
	.peekone :global(canvas) { width: 72px; height: 72px; max-width: 100%; }
	.peekname { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
	.more, .oneline { font-family: var(--font-mono); font-size: 12px; color: var(--ink-3); padding: 0 4px 4px; }

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
		.peekone :global(canvas) { width: 56px; height: 56px; }
	}
</style>
