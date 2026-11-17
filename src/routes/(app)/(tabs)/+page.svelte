<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { unsentFor } from '$lib/floor/entry-queue.svelte';
	import LogAfter from '$lib/today/LogAfter.svelte';
	import { Caption, Card, Cell, Note, Primary, Row, Title } from '$lib/ui';
	import { dayMarks, groupLabel, dealCaption, disciplineLabel, levelName, weekLine } from '$lib/domain/labels';
	import { CLASS_MINUTES, classKeys, cycleDisciplines, disciplineOf, levelsOf, routineKeys, routineTitle, type Discipline } from '$lib/domain/plan';
	import { projectSessions, sessionEntries, sessionSummaryOf, weekStrip, type DayCell } from '$lib/domain/projections';
	import { dealByGroup, queue, roundsFor, weekProgress, weekTally } from '$lib/domain/week';
	import { estimateMinutes, loggedOutside, positionLabel, routineExercises, sessionProgress, sessionSteps, stepName } from '$lib/domain/steps';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const now = Date.now();

	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let session = $derived(data.activeSession);
	let strip = $derived(weekStrip(data.events, now));
	let tally = $derived(weekTally(data.events, plan, now));
	// an empty cell shows its weekday's initial — the first letter of "Sun, Aug 23"
	const cellLabel = (c: DayCell) => c.label[0];

	// the deal by practice: one card for the routine picked — the deal's first until you pick — and every practice under it, to start or to log
	let deck = $derived(queue(data.events, plan, now));
	let rows = $derived(dealByGroup(deck, plan));
	let classes = $derived(classKeys(plan));
	let picked = $state<string | null>(null);
	let sel = $derived(picked ?? deck[0]?.workout.routine ?? null);
	const cycleTitle = (id: string) => plan.cycles.find((c) => c.id === id)?.title ?? id;
	// owed, once per cycle: the card's caption and every row read the same numbers
	let progress = $derived(new Map(plan.cycles.map((c) => [c.id, weekProgress(data.events, plan, c, now)])));
	const progressOf = (id: string) => progress.get(id) ?? { done: 0, target: 0 };
	/** the cycle a discipline's sessions count toward — its pool's root — or none while its practice is off */
	const weekOf = (d: Discipline | undefined) => {
		const own = plan.cycles.find((x) => !!d && cycleDisciplines(plan, x).includes(d));
		return own?.standsInFor ? plan.cycles.find((x) => x.id === own.standsInFor) : own;
	};
	const weekText = (d: Discipline | undefined) => {
		const w = weekOf(d);
		if (!w) return 'switched off';
		const { done, target } = progressOf(w.id);
		return target > 0 && done >= target ? `${weekLine(done, target)} ✓` : weekLine(done, target);
	};
	// what the card says for any routine you could pick: every one is laid out in the card at once and only the picked one shows,
	// so the card is as tall as its tallest at this width — nothing cut, nothing moving
	const roundsOf = (k: string) => deck.find((c) => c.workout.routine === k)?.workout.rounds ?? roundsFor(data.events, plan, k);
	const workoutOf = (k: string) => {
		const rounds = roundsOf(k);
		return { routine: k, ...(rounds !== undefined ? { rounds } : {}) };
	};
	const captionFor = (k: string) => {
		const c = deck.find((x) => x.workout.routine === k);
		if (c) return dealCaption(c, cycleTitle(c.week), progressOf(c.cycle).done, progressOf(c.cycle).target);
		const d = disciplineOf(plan, k);
		const w = weekOf(d);
		return `${w ? w.title : d ? groupLabel(d) : ''} · ${weekText(d)}`;
	};
	// the card says how big, not what is in it: the floor walks the list
	const metaFor = (k: string) => {
		if (classes.includes(k)) return `Class · ~${CLASS_MINUTES} min`;
		const w = workoutOf(k);
		const n = routineExercises(plan, w).length;
		const levels = levelsOf(plan, k);
		const mins = deck.find((c) => c.workout.routine === k)?.minutes ?? estimateMinutes(sessionSteps(plan, w));
		return [levels && w.rounds ? levelName(levels, w.rounds) : null, `~${mins} min`, `${n} ${n === 1 ? 'exercise' : 'exercises'}`].filter(Boolean).join(' · ');
	};
	// why the deal offers it, else what the routine is
	const whyFor = (k: string) => deck.find((c) => c.workout.routine === k)?.why ?? plan.routineInfo[k]?.desc ?? '';
	let pickable = $derived(rows.flatMap((r) => r.keys));
	let selRounds = $derived(sel ? roundsOf(sel) : undefined);
	let selWorkout = $derived(sel ? workoutOf(sel) : null);
	let selIsClass = $derived(!!sel && classes.includes(sel));
	// a group shows its head; the rest of its routines one tap away
	let opened = $state<string[]>([]);
	let showOff = $state(false);
	const toggleGroup = (d: string) => (opened = opened.includes(d) ? opened.filter((x) => x !== d) : [...opened, d]);
	// the tabs scroll their own pane, not the window: bring the page's head into view and the card is under it
	let headEl = $state<HTMLElement>();
	function pick(r: string) {
		picked = r;
		headEl?.scrollIntoView({ block: 'start', behavior: 'smooth' });
	}

	// the session in progress, as Today says it
	let floorPlan = $derived(session ? (data.plans.find((p) => p.id === session.plan) ?? plan) : plan);
	let liveEntries = $derived(session ? sessionEntries(data.events, session.id) : []);
	let liveSteps = $derived(session ? sessionSteps(floorPlan, session.workout, loggedOutside(floorPlan, session.workout, liveEntries)) : []);
	let liveProgress = $derived(sessionProgress(liveSteps, liveEntries));
	// entries the floor kept on this phone when the connection dropped: the floor sends them, so finishing waits for it
	let unsent = $state(0);
	onMount(() => {
		if (session) unsent = unsentFor(session.id);
	});
	let nextLine = $derived(`next: ${liveSteps[liveProgress.current] ? stepName(liveSteps[liveProgress.current]) : 'finish'}`);

	// the moment you need Undo is the moment after Finish: the latest session while it is still today's (a backdated one whatever its day), until the next one starts
	let justLogged = $derived.by(() => {
		if (session || !data.latestSession) return null;
		const s = projectSessions(data.events).find((x) => x.id === data.latestSession);
		if (!s) return null;
		const when = new Date(s.finishedAt ?? s.at), d = new Date(now);
		const sameDay = when.getFullYear() === d.getFullYear() && when.getMonth() === d.getMonth() && when.getDate() === d.getDate();
		if (s.mode !== 'after' && !sameDay) return null;
		const title = routineTitle(data.plans.find((p) => p.id === s.plan) ?? plan, s.workout.routine) ?? disciplineLabel(s.discipline);
		return { id: s.id, title, summary: sessionSummaryOf(s) };
	});

	// the two removes arm on the first tap and post on the second; four seconds and they stand down
	let armed = $state<string | null>(null);
	let removeForm = $state<HTMLFormElement>();
	let finishForm = $state<HTMLFormElement>();
	let armTimer: ReturnType<typeof setTimeout> | undefined;
	function removeTap(id: string) {
		if (armed === id) {
			armed = null;
			removeForm?.requestSubmit();
			return;
		}
		armed = id;
		clearTimeout(armTimer);
		armTimer = setTimeout(() => (armed = null), 4000);
	}

	function finishTap() {
		if (armed === 'finish') {
			armed = null;
			finishForm?.requestSubmit();
			return;
		}
		armed = 'finish';
		clearTimeout(armTimer);
		armTimer = setTimeout(() => (armed = null), 4000);
	}

	// Log it: the sheet that writes a session already done, opened on the pick; a class says which week it pays
	let logSheet = $state<ReturnType<typeof LogAfter>>();
	const openAfter = () => logSheet?.start();
	let counts = $derived.by(() => {
		const c = sel ? weekOf(disciplineOf(plan, sel)) : undefined;
		return c ? ` Counts toward ${c.title} · ${weekLine(progressOf(c.id).done, progressOf(c.id).target)}.` : '';
	});

	const today = `${new Date(now).toLocaleDateString('en-US', { weekday: 'short' })} ${new Date(now).getDate()}`;
</script>

<div class="head" bind:this={headEl}>
	<Caption>Today · {today}</Caption>
	<Note size="sm" onclick={() => goto('/ledger')}>{weekLine(tally.done, tally.asked)} ›</Note>
</div>
<div class="strip" role="list" aria-label="The last seven days">
	{#each strip as c (c.key)}<Cell size="strip" label={cellLabel(c)} marks={dayMarks(c.did)} today={c.today} title={c.label} />{/each}
</div>

{#if form?.message}<Note tone="ink"><span class="err">{form.message}</span></Note>{/if}

{#if session}
	<Card tone="now">
		<Caption tone="slate">In progress · {positionLabel(liveProgress.current, liveSteps).toLowerCase()}</Caption>
		<Title>{routineTitle(floorPlan, session.workout.routine) ?? disciplineLabel(session.discipline)}</Title>
		<Note>{nextLine}</Note>
		<div class="gap"></div>
		<Primary onclick={() => goto('/floor')}>Back to the floor</Primary>
	</Card>
	<form method="POST" action="?/finish" use:enhance bind:this={finishForm} hidden></form>
	{#if unsent}<Note size="sm">{unsent} {unsent === 1 ? 'entry is' : 'entries are'} still on this phone, not yet saved — open the floor and {unsent === 1 ? 'it sends' : 'they send'}.</Note>{/if}
	<Row label={armed === 'finish' ? 'Finish here?' : 'Finish here'} right={unsent ? 'open the floor first ›' : `${liveProgress.sets} ${liveProgress.sets === 1 ? 'set' : 'sets'} logged ›`} onclick={unsent ? () => goto('/floor') : finishTap} />
	<Row label={armed === session.id ? 'Bin it?' : 'Bin this session'} right="nothing is kept ›" tone="signal" onclick={() => removeTap(session.id)} />
{:else}
	{#if justLogged}
		<Row label="Logged · {justLogged.title}" sub={justLogged.summary} right={armed === justLogged.id ? 'Undo? ›' : 'Undo ›'} onclick={() => removeTap(justLogged.id)} />
	{/if}
	{#if sel && selWorkout}
		<Card>
			<div class="stack">
				{#each pickable as k (k)}
					<div class="layer" class:shown={k === sel} aria-hidden={k !== sel}>
						<Caption>{captionFor(k)}</Caption>
						<Title>{routineTitle(plan, k) ?? k}</Title>
						<Note>{metaFor(k)}</Note>
						<Note size="sm">{whyFor(k)}</Note>
					</div>
				{/each}
			</div>
			<div class="gap"></div>
			{#if selIsClass}
				<!-- a class happens somewhere else: the card's one job is to write it down after -->
				<Primary onclick={openAfter}>Log it <small>after class</small></Primary>
			{:else}
				<div class="acts">
					<form method="POST" action="?/start" use:enhance>
						<input type="hidden" name="routine" value={sel} />
						{#if selRounds !== undefined}<input type="hidden" name="rounds" value={selRounds} />{/if}
						<input type="hidden" name="plan" value={plan.id} />
						<Primary type="submit">Start</Primary>
					</form>
					<Primary tone="white" onclick={openAfter}>Log it</Primary>
				</div>
			{/if}
		</Card>
	{:else}
		<Card>
			<Caption>Nothing on</Caption>
			<Title>The week is empty</Title>
			<Note>Switch a practice on in Plan and Today deals it.</Note>
		</Card>
	{/if}
	<div class="week">
		<Caption>The week · tap to start or log</Caption>
		{#each rows.filter((g) => g.on) as g (g.week)}{@render practice(g)}{/each}
		{#if rows.some((g) => !g.on)}
			<Row label="Switched off in Plan" right={showOff ? 'fewer ▴' : `${rows.filter((g) => !g.on).reduce((n, g) => n + g.keys.length, 0)} more ▾`} onclick={() => (showOff = !showOff)} expanded={showOff} />
			{#if showOff}{#each rows.filter((g) => !g.on) as g (g.week)}{@render practice(g)}{/each}{/if}
		{/if}
	</div>
{/if}

<form method="POST" action="?/remove" use:enhance bind:this={removeForm} hidden>
	<input type="hidden" name="session" value={session?.id ?? justLogged?.id ?? ''} />
</form>

<!-- one practice of the week: its head routine to tap, the rest of its routines one tap further -->
{#snippet practice(g: (typeof rows)[number])}
	{@const head = g.head?.workout.routine ?? g.keys[0]}
	{@const open = opened.includes(g.week) || !g.on}
	<div class="prac" class:on={!!sel && g.keys.includes(sel)}>
		<button type="button" class="pmain" onclick={() => pick(head)}>
			<span class="pname">{g.on ? cycleTitle(g.week) : groupLabel(g.disciplines[0])}</span>
			<span class="psub">{routineTitle(plan, head)} · {weekText(g.disciplines[0])}</span>
		</button>
		{#if g.keys.length > 1 && g.on}
			<button type="button" class="pmore" aria-expanded={open} onclick={() => toggleGroup(g.week)}>{open ? 'less ▴' : `+${g.keys.length - 1} ▾`}</button>
		{/if}
	</div>
	{#if open && g.keys.length > 1}
		<div class="chips pchips">
			{#each g.keys as k (k)}
				<button type="button" class="chip" class:on={sel === k} aria-pressed={sel === k} onclick={() => pick(k)}>{routineTitle(plan, k)}</button>
			{/each}
		</div>
	{/if}
{/snippet}

<LogAfter bind:this={logSheet} events={data.events} {plan} routine={sel ?? routineKeys(plan)[0]} {counts} {now} />

<style>
	.head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
	.strip { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
	.err { color: var(--signal); font-weight: 700; }
	.gap { height: 4px; }
	.chips { display: flex; flex-wrap: wrap; gap: 8px; }
	.stack { display: grid; }
	.layer { grid-area: 1 / 1; display: flex; flex-direction: column; gap: 6px; visibility: hidden; }
	.layer.shown { visibility: visible; }
	.acts { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: start; }
	.acts > :global(.primary) { padding: 0 20px; white-space: nowrap; }
	.week { display: flex; flex-direction: column; margin-top: 6px; }
	.prac { display: flex; align-items: stretch; gap: 8px; border-bottom: 1px solid var(--paper-2); }
	.prac.on { box-shadow: inset 3px 0 0 var(--volt-deep); }
	.pmain {
		flex: 1; min-width: 0; min-height: 56px; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: 2px;
		padding: 8px 0 8px 10px; background: none; border: 0; text-align: left; cursor: pointer; touch-action: manipulation;
	}
	.pmain:hover { background: var(--volt-light); }
	.pname { font-family: var(--font-body); font-size: 16px; font-weight: 700; color: var(--ink); }
	.psub { font-family: var(--font-mono); font-size: 12px; color: var(--slate); overflow-wrap: anywhere; }
	.pmore {
		flex: none; align-self: center; min-height: 36px; padding: 0 12px; border: 1.5px solid var(--paper-3); border-radius: var(--radius-pill);
		background: var(--white); font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--slate); cursor: pointer; touch-action: manipulation;
	}
	.pchips { padding: 8px 0 12px 10px; border-bottom: 1px solid var(--paper-2); }
	.chip {
		min-height: 44px; padding: 0 16px; border-radius: var(--radius-pill); border: var(--border-w) solid var(--paper-3); background: var(--white);
		font-family: var(--font-body); font-weight: 700; font-size: 14px; color: var(--slate); cursor: pointer; touch-action: manipulation;
	}
	.chip:hover { background: var(--volt-light); }
	.chip.on { border-color: var(--ink); background: var(--volt); color: var(--ink); }
</style>
