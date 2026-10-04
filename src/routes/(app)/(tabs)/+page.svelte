<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { Caption, Card, Cell, Note, Primary, Row, Sheet, Stepper, Switch, Title } from '$lib/ui';
	import type { AfterEntry } from '$lib/domain/commands';
	import { clockLabel, dayMarks, dealCaption, disciplineLabel, itemDose, loadShort, setsLine, weekLine } from '$lib/domain/labels';
	import { measureFor } from '$lib/domain/measure';
	import { classKeys, cycleDisciplines, disciplineOf, routineKeys, routineTitle, type Exercise } from '$lib/domain/plan';
	import { historyFor, projectSessions, sessionEntries, sessionSummaryOf, weekStrip, type DayCell } from '$lib/domain/projections';
	import { queue, weekProgress, weekTally } from '$lib/domain/week';
	import { bumpCount, bumpLoad, suggest } from '$lib/domain/progression';
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

	// the deal: one candidate per cycle, the first on the card, the rest one "Something else" away
	let deck = $derived(queue(data.events, plan, now));
	let i = $state(0);
	let card = $derived(deck[Math.min(i, Math.max(0, deck.length - 1))]);
	let deckOpen = $state(false);
	const cycleTitle = (id: string) => plan.cycles.find((c) => c.id === id)?.title ?? id;
	// owed, once per cycle: the card's caption and every "Something else" line read the same numbers
	let progress = $derived(new Map(plan.cycles.map((c) => [c.id, weekProgress(data.events, plan, c, now)])));
	const progressOf = (id: string) => progress.get(id) ?? { done: 0, target: 0 };
	const captionOf = (c: typeof card) => {
		const { done, target } = progressOf(c.cycle);
		return dealCaption(c, cycleTitle(c.cycle), done, target);
	};
	const subOf = (c: typeof card) => (c.standsInFor ? `${disciplineLabel(c.discipline)} · counts as the lift` : `${cycleTitle(c.cycle)} · ${weekLine(progressOf(c.cycle).done, progressOf(c.cycle).target)}`);
	const weightFor = (ex: Exercise) => {
		const s = suggest(historyFor(data.events, ex.name), ex, now);
		return s.kind === 'load' ? s.weight : 0;
	};
	let items = $derived(card ? routineExercises(plan, card.workout).map((ex) => ({ name: ex.name, dose: itemDose(ex, weightFor(ex)) })) : []);
	let others = $derived(deck.map((c, k) => ({ c, k })).filter((x) => x.k !== i));

	// the session in progress, as Today says it
	let floorPlan = $derived(session ? (data.plans.find((p) => p.id === session.plan) ?? plan) : plan);
	let liveEntries = $derived(session ? sessionEntries(data.events, session.id) : []);
	let liveSteps = $derived(session ? sessionSteps(floorPlan, session.workout, loggedOutside(floorPlan, session.workout, liveEntries)) : []);
	let liveProgress = $derived(sessionProgress(liveSteps, liveEntries));
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

	// Log a session I already did: what, when, how long — and for a lift or the floor every set, from the plan, changed here
	let after = $state(false);
	let what = $state<string | null>(null);
	let whenIdx = $state(0);
	let keys = $derived(routineKeys(plan));
	let classes = $derived(classKeys(plan));
	let routine = $derived(what ?? card?.workout.routine ?? keys[0]);
	let afterTitle = $derived(routineTitle(plan, routine) ?? routine);
	let afterEx = $derived(plan.routines[routine] ?? []);
	let isClass = $derived(classes.includes(routine));
	let isRun = $derived(afterEx.some((e) => e.kind === 'run'));
	// a lift or the floor is sets you change; yoga and the stretch go in as the plan wrote them; a run and a class are their length
	let editable = $derived(['lift', 'bodyweight'].includes(disciplineOf(plan, routine) ?? ''));
	const days = Array.from({ length: 7 }, (_, d) => {
		const n = new Date(now);
		return { d, label: d === 0 ? 'Today' : d === 1 ? 'Yesterday' : new Date(n.getFullYear(), n.getMonth(), n.getDate() - d).toLocaleDateString('en-US', { weekday: 'long' }) };
	});

	type AfterSet = { load: number; count: number; target: number };
	let afterSets = $state<Record<string, { did: boolean; sets: AfterSet[] }>>({});
	let openEx = $state<string | null>(null);
	let startMin = $state(0);
	let startSet = $state(false);
	let len = $state(0);
	let afterError = $state('');
	const CLASS_MINUTES = 60;
	function planned(ex: Exercise): AfterSet[] {
		const s = suggest(historyFor(data.events, ex.name), ex, now);
		return Array.from({ length: ex.sets }, (_, k) => {
			const set = s.sets[Math.min(k, s.sets.length - 1)];
			const count = 'reps' in set ? set.reps : set.count;
			return { load: s.kind === 'load' ? s.sets[Math.min(k, s.sets.length - 1)].weight : 0, count, target: count };
		});
	}
	function choose(r: string) {
		what = r;
		openEx = null;
		afterSets = Object.fromEntries((plan.routines[r] ?? []).map((ex) => [ex.name, { did: true, sets: planned(ex) }]));
		const run = (plan.routines[r] ?? []).find((e) => e.kind === 'run');
		len = classes.includes(r) ? CLASS_MINUTES : run ? run.hi : Math.max(5, Math.round(estimateMinutes(sessionSteps(plan, { routine: r })) / 5) * 5);
		// until you set it, it began about its length ago, on the quarter hour
		if (!startSet) {
			const n = new Date();
			startMin = Math.max(0, Math.floor((n.getHours() * 60 + n.getMinutes() - len) / 15) * 15);
		}
	}
	function openAfter() {
		startSet = false;
		whenIdx = 0;
		afterError = '';
		choose(routine);
		after = true;
	}
	const bumpAfterCount = (ex: Exercise, x: AfterSet, dir: 1 | -1) =>
		(x.count = ex.kind === 'hold' ? Math.max(1, Math.min(600, x.count + dir * (ex.progress.of === 'time' ? ex.progress.inc : 5))) : bumpCount(ex, x.count, dir));
	function addSet(ex: Exercise) {
		const a = afterSets[ex.name];
		a.sets.push({ ...(a.sets.at(-1) ?? planned(ex)[0]) });
		a.did = true;
	}
	const measuresOf = (ex: Exercise, sets: AfterSet[]) => sets.map((x) => measureFor(ex, { load: x.load, count: x.count, target: x.target }));

	let entries = $derived.by((): AfterEntry[] => {
		if (isClass) return [{ item: afterTitle, index: 1, measure: { of: 'duration', minutes: len } }];
		const out: AfterEntry[] = [];
		for (const ex of afterEx) {
			if (ex.kind === 'run') {
				out.push({ item: ex.name, index: 1, measure: { of: 'duration', minutes: len } });
				continue;
			}
			const a = afterSets[ex.name];
			// a backdated hold carries the plan's seconds as its target, so the rule reads a hold that reached them as earned
			if (a?.did) measuresOf(ex, a.sets).forEach((measure, k) => out.push({ item: ex.name, index: k + 1, measure }));
		}
		return out;
	});
	let startAt = $derived.by(() => {
		const n = new Date(now);
		return new Date(n.getFullYear(), n.getMonth(), n.getDate() - whenIdx, 0, startMin);
	});
	let endAt = $derived(new Date(startAt.getTime() + len * 60000));
	let afterSetCount = $derived(entries.filter((e) => e.measure.of !== 'duration').length);
	let didCount = $derived(afterEx.filter((ex) => afterSets[ex.name]?.did && afterSets[ex.name].sets.length).length);
	// a class counts toward the cycle of its discipline — Yoga, whichever of its routines it isn't
	let countsToward = $derived.by(() => {
		const d = disciplineOf(plan, routine);
		const c = plan.cycles.find((x) => !x.standsInFor && !!d && cycleDisciplines(plan, x).includes(d));
		return c ? ` Counts toward ${c.title} · ${weekLine(progressOf(c.id).done, progressOf(c.id).target)}.` : '';
	});
	let afterSummary = $derived.by(() => {
		const day = whenIdx === 0 ? 'today' : whenIdx === 1 ? 'yesterday' : days[whenIdx].label;
		if (editable) return `${afterTitle} · ${afterSetCount} ${afterSetCount === 1 ? 'set' : 'sets'} · ~${len} min · ${day}. Fix any set from the Ledger afterwards.`;
		return `${afterTitle} · ${len} min · ${day} at ${clockLabel(startMin)}.`;
	});
	const asWritten = (d: string | undefined) => (isRun ? 'The length is the run.' : `Written with the plan’s ${d === 'yoga' ? 'poses' : 'holds'} — the length is what changes.`);

	const today = `${new Date(now).toLocaleDateString('en-US', { weekday: 'short' })} ${new Date(now).getDate()}`;
</script>

<div class="head">
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
	<Row label={armed === 'finish' ? 'Finish here?' : 'Finish here'} right="{liveProgress.sets} {liveProgress.sets === 1 ? 'set' : 'sets'} logged ›" onclick={finishTap} />
	<Row label={armed === session.id ? 'Bin it?' : 'Bin this session'} right="nothing is kept ›" tone="signal" onclick={() => removeTap(session.id)} />
{:else}
	{#if justLogged}
		<Row label="Logged · {justLogged.title}" sub={justLogged.summary} right={armed === justLogged.id ? 'Undo? ›' : 'Undo ›'} onclick={() => removeTap(justLogged.id)} />
	{/if}
	{#if card}
		<Card>
			<Caption>{captionOf(card)}</Caption>
			<Title>{card.title}</Title>
			<Note>{card.why}</Note>
			<div class="items">
				{#each items as it (it.name)}<div class="item"><span class="iname">{it.name}</span><span class="idose">{it.dose}</span></div>{/each}
			</div>
			<form method="POST" action="?/start" use:enhance>
				<input type="hidden" name="routine" value={card.workout.routine} />
				<input type="hidden" name="plan" value={plan.id} />
				<Primary type="submit">Start <small>~{card.minutes} min</small></Primary>
			</form>
		</Card>
		<div class="rows">
			{#if others.length}
				<Row label="Something else" right={deckOpen ? 'fewer ▴' : `${others.length} more ▾`} onclick={() => (deckOpen = !deckOpen)} expanded={deckOpen} />
				{#if deckOpen}
					{#each others as { c, k } (c.cycle)}
						<Row label={c.title} sub={subOf(c)} right="~{c.minutes} min ›" tone="now" onclick={() => { i = k; deckOpen = false; }} />
					{/each}
				{/if}
			{/if}
			<Row label="Log a session I already did" right="›" onclick={openAfter} />
		</div>
	{:else}
		<Card>
			<Caption>Nothing on</Caption>
			<Title>The week is empty</Title>
			<Note>Switch a practice on in Plan and Today deals it.</Note>
		</Card>
	{/if}
{/if}

<form method="POST" action="?/remove" use:enhance bind:this={removeForm} hidden>
	<input type="hidden" name="session" value={session?.id ?? justLogged?.id ?? ''} />
</form>

<Sheet open={after} title="Log a session I already did" onclose={() => (after = false)}>
	<Caption>What</Caption>
	<div class="chips">
		{#each keys as k (k)}
			<button type="button" class="chip" class:on={routine === k} aria-pressed={routine === k} onclick={() => choose(k)}>{routineTitle(plan, k)}</button>
		{/each}
		{#each classes as k (k)}
			<button type="button" class="chip" class:on={routine === k} aria-pressed={routine === k} onclick={() => choose(k)}>{routineTitle(plan, k)} · studio</button>
		{/each}
	</div>
	<Caption>When</Caption>
	<div class="chips">
		{#each days as d (d.d)}
			<button type="button" class="chip" class:on={whenIdx === d.d} aria-pressed={whenIdx === d.d} onclick={() => (whenIdx = d.d)}>{d.label}</button>
		{/each}
	</div>
	<div class="rows">
		<Row label="Started" sub="done by {clockLabel(startMin + len)}">
			<Stepper value={clockLabel(startMin)} label="start" onstep={(d) => { startSet = true; startMin = (startMin + d * 15 + 1440) % 1440; }} />
		</Row>
		<Row label={isClass ? 'Class length' : 'Length'} sub={isClass ? 'the class' : isRun ? 'the run' : editable ? 'roughly' : 'how long'}>
			<Stepper value="{len} min" label="length" onstep={(d) => (len = Math.min(600, Math.max(5, len + d * (isClass ? 15 : 5))))} />
		</Row>
	</div>

	{#if isClass}
		<div class="say"><Note tone="ink">{plan.routineInfo[routine]?.desc ?? afterTitle}.{countsToward} No poses to tick.</Note></div>
	{:else if editable}
		<div class="setshead"><Caption>Sets · from the plan, change any</Caption><span class="count">{didCount} of {afterEx.length} done</span></div>
		<div class="exs">
			{#each afterEx as ex (ex.name)}
				{@const a = afterSets[ex.name]}
				{@const open = openEx === ex.name}
				{#if a}
					<div class="ex" class:skip={!a.did}>
						<div class="exhead" class:open>
							<button type="button" class="exname" aria-expanded={open} onclick={() => (openEx = open ? null : ex.name)}>
								<span class="exlbl">{ex.name} <span class="caret">{open ? '▴' : '▾'}</span></span>
								<span class="exsum">{!a.did ? 'skipped' : a.sets.length ? setsLine(measuresOf(ex, a.sets), ex) : 'no sets'}</span>
							</button>
							<Switch on={a.did} label="Did {ex.name}" onclick={() => (a.did = !a.did)} />
						</div>
						{#if open}
							<div class="exsets">
								{#each a.sets as x, k (k)}
									<div class="aset">
										<span class="slbl">Set {k + 1}</span>
										<span class="sctl">
											<Stepper size="xs" value={ex.kind === 'hold' ? `${x.count}s` : `× ${x.count}`} label={ex.kind === 'hold' ? 'seconds' : 'reps'} onstep={(d) => bumpAfterCount(ex, x, d)} />
											{#if ex.kind === 'load'}<Stepper size="xs" value={loadShort(x.load, ex)} label="load" onstep={(d) => (x.load = bumpLoad(ex, x.load, d))} />{/if}
										</span>
										<button type="button" class="rm" aria-label="Remove set {k + 1}" onclick={() => a.sets.splice(k, 1)}>×</button>
									</div>
								{/each}
								<div><button type="button" class="addset" onclick={() => addSet(ex)}>+ set</button></div>
							</div>
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	{:else}
		<Note size="sm">{asWritten(disciplineOf(plan, routine))}</Note>
	{/if}

	{#snippet foot()}
		<Note size="sm">{afterSummary}</Note>
		{#if afterError}<Note size="sm"><span class="err">{afterError}</span></Note>{/if}
		<form method="POST" action="?/logAfter" use:enhance={() => async ({ result, update }) => { afterError = result.type === 'failure' ? String(result.data?.message ?? 'That didn’t save.') : ''; await update(); }}>
			<input type="hidden" name="plan" value={plan.id} />
			<input type="hidden" name="routine" value={routine} />
			<input type="hidden" name="startAt" value={startAt.toISOString()} />
			<input type="hidden" name="at" value={endAt.toISOString()} />
			<input type="hidden" name="entries" value={JSON.stringify(entries)} />
			<Primary type="submit" disabled={!entries.length}>Log it</Primary>
		</form>
	{/snippet}
</Sheet>

<style>
	.head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
	.strip { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
	.err { color: var(--signal); font-weight: 700; }
	.gap { height: 4px; }
	.items { display: flex; flex-direction: column; margin-top: 6px; margin-bottom: 10px; }
	.item { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; border-top: 1px solid var(--paper-2); padding: 7px 0; font-size: 14px; }
	.iname { font-weight: 700; }
	.idose { font-family: var(--font-mono); font-size: 12px; color: var(--stone); white-space: nowrap; }
	.rows { display: flex; flex-direction: column; }
	.chips { display: flex; flex-wrap: wrap; gap: 8px; }
	.chip {
		min-height: 44px; padding: 0 16px; border-radius: var(--radius-pill); border: var(--border-w) solid var(--paper-3); background: var(--white);
		font-family: var(--font-body); font-weight: 700; font-size: 14px; color: var(--slate); cursor: pointer; touch-action: manipulation;
	}
	.chip:hover { background: var(--volt-light); }
	.chip.on { border-color: var(--ink); background: var(--volt); color: var(--ink); }
	.say { background: var(--volt-light); border-radius: 12px; padding: 10px 12px; }
	.setshead { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
	.count { font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--slate); white-space: nowrap; }
	.exs { flex: none; display: flex; flex-direction: column; background: var(--white); border: var(--border-w) solid var(--ink); border-radius: var(--radius-lg); overflow: hidden; }
	.ex + .ex { border-top: 1px solid var(--paper-2); }
	.ex.skip { opacity: 0.45; }
	.exhead { display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 0 12px 0 14px; background: var(--white); }
	.exhead.open { background: var(--volt-light); }
	.exname {
		flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 6px 0;
		background: none; border: 0; text-align: left; line-height: 1.25; cursor: pointer; touch-action: manipulation;
	}
	.exlbl { font-family: var(--font-body); font-size: 15px; font-weight: 700; color: var(--ink); }
	.caret { font-family: var(--font-mono); font-size: 12px; color: var(--stone); }
	.exsum { font-family: var(--font-mono); font-size: 11px; color: var(--slate); overflow-wrap: anywhere; }
	.exsets { display: flex; flex-direction: column; gap: 2px; padding: 4px 12px 12px 14px; background: var(--volt-light); }
	.aset { display: grid; grid-template-columns: 44px 1fr auto; align-items: center; gap: 8px; min-height: 48px; border-bottom: 1px solid var(--paper-3); }
	.slbl { font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--slate); }
	.sctl { display: flex; flex-wrap: wrap; gap: 6px; }
	.rm { width: 32px; height: 32px; border: 0; border-radius: 8px; background: none; font-size: 18px; color: var(--stone); cursor: pointer; touch-action: manipulation; }
	.rm:hover { background: var(--white); color: var(--signal); }
	.addset {
		min-height: 36px; margin-top: 8px; padding: 0 12px; border: 1.5px solid var(--ink); border-radius: var(--radius-pill); background: var(--white);
		font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--ink); cursor: pointer; touch-action: manipulation;
	}
	.addset:hover { background: var(--volt-light); }
</style>
