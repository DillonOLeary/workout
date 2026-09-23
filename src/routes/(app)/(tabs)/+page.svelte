<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { Caption, Card, Cell, Note, Primary, Row, Sheet, Title } from '$lib/ui';
	import type { AfterEntry } from '$lib/domain/commands';
	import { dealCaption, disciplineLabel, disciplineLetter, itemDose, sessionSummary, weekLine } from '$lib/domain/labels';
	import { measureFor } from '$lib/domain/measure';
	import { routineKeys, routineTitle, type Exercise } from '$lib/domain/plan';
	import { historyFor, projectSessions, sessionEntries, weekStrip, type DayCell } from '$lib/domain/projections';
	import { queue, weekProgress, weekTally } from '$lib/domain/week';
	import { suggest } from '$lib/domain/progression';
	import { estimateMinutes, loggedOutside, positionLabel, routineExercises, sessionProgress, sessionSteps } from '$lib/domain/steps';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const now = Date.now();

	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let session = $derived(data.activeSession);
	let strip = $derived(weekStrip(data.events, now));
	let tally = $derived(weekTally(data.events, plan, now));
	const cellLabel = (c: DayCell) => (c.did.length ? c.did.map(disciplineLetter).join('') : 'MTWTFSS'[(new Date(c.key.toString().replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3T12:00:00')).getDay() + 6) % 7]);

	// the deal: one candidate per cycle, the first on the card, the rest one "Something else" away
	let deck = $derived(queue(data.events, plan, now));
	let i = $state(0);
	let card = $derived(deck[Math.min(i, Math.max(0, deck.length - 1))]);
	let deckOpen = $state(false);
	const cycleTitle = (id: string) => plan.cycles.find((c) => c.id === id)?.title ?? id;
	const progressOf = (id: string) => {
		const c = plan.cycles.find((x) => x.id === id);
		return c ? weekProgress(data.events, plan, c, now) : { done: 0, target: 0 };
	};
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
	let nextLine = $derived.by(() => {
		const st = liveSteps[liveProgress.current];
		if (!st) return 'next: finish';
		return st.kind === 'set' ? `next: ${st.ex.name} · ${st.ex.kind === 'hold' ? 'hold' : 'set'} ${st.index}` : st.kind === 'run' ? 'next: the run' : `next: ${st.section.toLowerCase()} · step ${st.index}`;
	});

	// the moment you need Undo is the moment after Finish: the latest session, while it is still today's, until the next one starts
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

	// Log a session I already did: a sheet, written with the plan's sets
	let after = $state(false);
	let what = $state<string | null>(null);
	let whenIdx = $state(0);
	let keys = $derived(routineKeys(plan));
	let routine = $derived(what ?? card?.workout.routine ?? keys[0]);
	const days = Array.from({ length: 7 }, (_, d) => {
		const n = new Date(now);
		const at = d === 0 ? n : new Date(n.getFullYear(), n.getMonth(), n.getDate() - d, 12, 0, 0);
		return { d, at, label: d === 0 ? 'Today' : d === 1 ? 'Yesterday' : at.toLocaleDateString('en-US', { weekday: 'long' }) };
	});
	let afterEx = $derived(plan.routines[routine] ?? []);
	let entries = $derived.by((): AfterEntry[] => {
		const out: AfterEntry[] = [];
		for (const ex of afterEx) {
			const s = suggest(historyFor(data.events, ex.name), ex, now);
			for (let k = 1; k <= ex.sets; k++) {
				const set = s.sets[Math.min(k - 1, s.sets.length - 1)];
				const load = s.kind === 'load' ? s.sets[Math.min(k - 1, s.sets.length - 1)].weight : 0;
				const count = 'reps' in set ? set.reps : set.count;
				// a backdated hold rang its bell: target = seconds, so the rule reads it as earned
				out.push({ item: ex.name, index: k, measure: measureFor(ex, { load, count, target: count }) });
			}
		}
		return out;
	});
	let afterMinutes = $derived(afterEx.some((e) => e.kind === 'run') ? (afterEx.find((e) => e.kind === 'run')?.hi ?? 30) : estimateMinutes(sessionSteps(plan, { routine })));
	let endAt = $derived(days[whenIdx].at);
	let startAt = $derived(new Date(endAt.getTime() - afterMinutes * 60000));
	let afterSets = $derived(entries.filter((e) => e.measure.of !== 'duration').length);

	const today = `${new Date(now).toLocaleDateString('en-US', { weekday: 'short' })} ${new Date(now).getDate()}`;
</script>

<div class="head">
	<Caption>Today · {today}</Caption>
	<Note size="sm" onclick={() => goto('/ledger')}>{weekLine(tally.done, tally.asked)} ›</Note>
</div>
<div class="strip" role="list" aria-label="The last seven days">
	{#each strip as c (c.key)}<Cell size="strip" label={cellLabel(c)} done={c.did.length > 0} today={c.today} title={c.label} />{/each}
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
			<Row label="Log a session I already did" right="›" onclick={() => (after = true)} />
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
	<form method="POST" action="?/logAfter" use:enhance class="sheetform">
		<Caption>What</Caption>
		<div class="chips">
			{#each keys as k (k)}
				<button type="button" class="chip" class:on={routine === k} aria-pressed={routine === k} onclick={() => (what = k)}>{routineTitle(plan, k)}</button>
			{/each}
		</div>
		<Caption>When</Caption>
		<div class="chips">
			{#each days as d (d.d)}
				<button type="button" class="chip" class:on={whenIdx === d.d} aria-pressed={whenIdx === d.d} onclick={() => (whenIdx = d.d)}>{d.label}</button>
			{/each}
		</div>
		<Note size="sm">Written with the plan's sets — {afterSets ? `${afterSets} ${afterSets === 1 ? 'set' : 'sets'} · ` : ''}~{afterMinutes} min. Fix any set from the Ledger afterwards.</Note>
		<input type="hidden" name="plan" value={plan.id} />
		<input type="hidden" name="routine" value={routine} />
		<input type="hidden" name="startAt" value={startAt.toISOString()} />
		<input type="hidden" name="at" value={endAt.toISOString()} />
		<input type="hidden" name="entries" value={JSON.stringify(entries)} />
		<Primary type="submit" disabled={!entries.length}>Log it</Primary>
	</form>
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
	.sheetform { display: flex; flex-direction: column; gap: 14px; }
	.chips { display: flex; flex-wrap: wrap; gap: 8px; }
	.chip {
		min-height: 44px; padding: 0 16px; border-radius: var(--radius-pill); border: var(--border-w) solid var(--paper-3); background: var(--white);
		font-family: var(--font-body); font-weight: 700; font-size: 14px; color: var(--slate); cursor: pointer; touch-action: manipulation;
	}
	.chip:hover { background: var(--volt-light); }
	.chip.on { border-color: var(--ink); background: var(--volt); color: var(--ink); }
</style>
