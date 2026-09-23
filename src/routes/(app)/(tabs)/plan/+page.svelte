<script lang="ts">
	import { enhance } from '$app/forms';
	import { Caption, Card, Note, Row, Sheet, Stepper, Switch, Title } from '$lib/ui';
	import { goalHint, weekHead, weekLine } from '$lib/domain/labels';
	import { GOAL_MINUTES, GOAL_SESSIONS, REST_SECONDS, restFor, routineTitle, type Cycle, type Plan, type PracticeId } from '$lib/domain/plan';
	import { BLOCKS } from '$lib/domain/plans';
	import { weekProgress } from '$lib/domain/projections';
	import { estimateMinutes, sessionSteps } from '$lib/domain/steps';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const now = Date.now();

	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let programme = $derived(data.programmes.find((p) => p.id === plan.id) ?? data.programmes[0]);

	type Practice = { id: PracticeId; name: string; sub: string; cycle: Cycle; programmeTarget: number; on: boolean; done: number; minutes: number; runMinutes?: number };
	let practices = $derived.by((): Practice[] => {
		const raw: { id: PracticeId; name: string; cycle: Cycle }[] = [
			{ id: 'lift', name: 'Lift', cycle: programme.cycles.find((c) => c.id === 'lift') ?? programme.cycles[0] },
			...BLOCKS.map((b) => ({ id: b.id, name: b.cycle.title, cycle: b.cycle }))
		];
		return raw.map((r) => {
			const goal = data.goals[r.id];
			const cycle = plan.cycles.find((c) => c.id === r.cycle.id) ?? (goal ? { ...r.cycle, target: goal.sessions } : r.cycle);
			const minutes = Math.round(cycle.routines.reduce((n, k) => n + estimateMinutes(sessionSteps(plan, { routine: k })), 0) / cycle.routines.length);
			const runEx = r.id === 'run' ? plan.routines[cycle.routines[0]].find((e) => e.kind === 'run') : undefined;
			const titles = cycle.routines.map((k) => routineTitle(plan, k)).join(' · ');
			return {
				...r, cycle, programmeTarget: r.cycle.target, on: data.practicesOn.includes(r.id), done: weekProgress(data.events, plan, cycle, now).done, minutes,
				sub: r.id === 'lift' ? `${programme.name} · ${titles}` : `${titles} · ~${minutes} min`,
				...(runEx ? { runMinutes: runEx.hi } : {})
			};
		});
	});
	let weekSessions = $derived(plan.cycles.reduce((n, c) => n + c.target, 0));
	let weekMinutes = $derived(practices.filter((p) => p.on).reduce((n, p) => n + p.cycle.target * p.minutes, 0));

	// one practice open at a time; its goal is a draft the dial edits, posted once the tapping stops
	let open = $state<PracticeId | null>(null);
	let draft = $state<{ sessions: number; minutes?: number }>({ sessions: 0 });
	let goalForm = $state<HTMLFormElement>();
	let timer: ReturnType<typeof setTimeout> | undefined;
	function toggleOpen(p: Practice) {
		clearTimeout(timer);
		if (open === p.id) return (open = null);
		draft = { sessions: p.cycle.target, ...(p.runMinutes !== undefined ? { minutes: p.runMinutes } : {}) };
		open = p.id;
	}
	const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
	function dial(sessions: number, minutes?: number) {
		draft = { sessions, ...(minutes !== undefined ? { minutes } : {}) };
		clearTimeout(timer);
		timer = setTimeout(() => goalForm?.requestSubmit(), 700);
	}

	// the rest between sets: the programme's until you set it; posted the same way
	let liftEx = $derived(programme.routines[programme.cycles[0].routines[0]][0]);
	let restNow = $derived(restFor(plan, liftEx));
	let restDraft = $state<number | null>(null);
	let restForm = $state<HTMLFormElement>();
	let restTimer: ReturnType<typeof setTimeout> | undefined;
	let restShown = $derived(restDraft ?? restNow);
	function dialRest(dir: 1 | -1) {
		restDraft = clamp(restShown + dir * REST_SECONDS.step, REST_SECONDS.min, REST_SECONDS.max);
		clearTimeout(restTimer);
		restTimer = setTimeout(() => restForm?.requestSubmit(), 700);
	}

	let whyOpen = $state(false);
	let sheet = $state(false);
	let signout = $state<HTMLFormElement>();
	const liftLine = (p: Plan) => {
		const lift = p.cycles.find((c) => c.id === 'lift') ?? p.cycles[0];
		return `${lift.target} a week · ${lift.routines.map((r) => p.routineInfo[r].title).join(' / ')}${p.rest ? ` · ${p.rest} s rest` : ''}`;
	};
</script>

<Caption>The plan</Caption>
<Title>{weekHead(weekSessions, weekMinutes)}</Title>
<Note>Four practices. Each row: how often, and on or off. Today deals from what's on.</Note>

{#if form?.message}<Note tone="ink"><span class="err">{form.message}</span></Note>{/if}

<Card pad={false}>
	{#each practices as p (p.id)}
		{@const expanded = open === p.id}
		<div class="prow" class:off={!p.on}>
			<div class="pgrid">
				<button type="button" class="pname" onclick={() => toggleOpen(p)} aria-expanded={expanded}>
					<Title size="sm">{p.name}</Title>
					<span class="psub">{p.sub}</span>
				</button>
				<button type="button" class="ptarget" onclick={() => toggleOpen(p)} aria-expanded={expanded}>{p.cycle.target} a week ›</button>
				<form method="POST" action="?/toggle" use:enhance>
					<input type="hidden" name="practice" value={p.id} />
					<input type="hidden" name="on" value={String(!p.on)} />
					<Switch on={p.on} label={p.name} type="submit" />
				</form>
			</div>
			{#if expanded}
				<div class="panel">
					<form method="POST" action="?/goal" use:enhance bind:this={goalForm} class="dial">
						<input type="hidden" name="practice" value={p.id} />
						<input type="hidden" name="sessions" value={draft.sessions} />
						{#if draft.minutes !== undefined}<input type="hidden" name="minutes" value={draft.minutes} />{/if}
						<span class="dialrow"><Caption tone="slate">Sessions a week</Caption><Stepper value={draft.sessions} label="sessions" onstep={(d) => dial(clamp(draft.sessions + d, GOAL_SESSIONS.min, GOAL_SESSIONS.max), draft.minutes)} /></span>
						{#if draft.minutes !== undefined}
							<span class="dialrow"><Caption tone="slate">Minutes</Caption><Stepper value={draft.minutes} label="minutes" onstep={(d) => dial(draft.sessions, clamp(draft.minutes! + d * GOAL_MINUTES.step, GOAL_MINUTES.min, GOAL_MINUTES.max))} /></span>
						{/if}
					</form>
					<Note size="sm">{goalHint(p.programmeTarget, draft.sessions)}{p.on ? ` ${weekLine(p.done, p.cycle.target)}.` : ''}</Note>
					{#if p.id === 'lift'}
						<div class="liftrows">
							<Row label="Programme" right="{programme.name} ›" onclick={() => (sheet = true)} />
							<Row label="Rest between sets">
								<form method="POST" action="?/rest" use:enhance bind:this={restForm}>
									<input type="hidden" name="seconds" value={restShown} />
									<Stepper value={restShown} unit="s" size="sm" label="rest" onstep={dialRest} />
								</form>
							</Row>
							<Row label="No gym? Floor 1 / 2 stand in and count" right="always" />
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/each}
</Card>

<div class="rows">
	<Row label="How loads move" right={whyOpen ? '▴' : '▾'} onclick={() => (whyOpen = !whyOpen)} expanded={whyOpen} />
	{#if whyOpen}
		<p class="why">Hit the top of the range on set 1 and that exercise goes up one rack size next time. Miss the bottom twice and it backs off one. Two weeks away, everything comes back one lighter. Nothing to set — it reads the ledger.</p>
	{/if}
	<Row label="Export the ledger" right="JSON ›" href="/export" />
	<Row label="Sign out" right="›" onclick={() => signout?.requestSubmit()} />
	<form method="POST" action="/logout" bind:this={signout} hidden></form>
</div>

<Sheet open={sheet} title="Programme" onclose={() => (sheet = false)}>
	<Note size="sm">One at a time. Switching keeps every set logged; the rule picks up where each exercise left off.</Note>
	{#each data.programmes as p (p.id)}
		{@const current = p.id === programme.id}
		<Card tone={current ? 'ink' : 'quiet'}>
			<div class="phead">
				<Title size="md">{p.name}</Title>
				{#if current}
					<span class="badge on">On</span>
				{:else}
					<form method="POST" action="?/select" use:enhance={() => async ({ update }) => { await update(); sheet = false; }}>
						<input type="hidden" name="programme" value={p.id} />
						<button type="submit" class="badge">Switch</button>
					</form>
				{/if}
			</div>
			<Note size="sm">{liftLine(p)}</Note>
			{#if p.description}<span class="desc">{p.description}</span>{/if}
		</Card>
	{/each}
</Sheet>

<style>
	.err { color: var(--signal); font-weight: 700; }
	.prow { display: flex; flex-direction: column; border-top: 1px solid var(--paper-2); padding: 0 16px; }
	.prow:first-child { border-top: none; }
	.prow.off { opacity: 0.5; }
	.pgrid { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: center; min-height: 64px; }
	.pname { display: flex; flex-direction: column; gap: 2px; min-width: 0; text-align: left; background: none; border: 0; padding: 0; cursor: pointer; touch-action: manipulation; font: inherit; color: inherit; }
	.psub { font-family: var(--font-mono); font-size: 11px; color: var(--stone); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
	.ptarget { background: none; border: 0; padding: 0; font-family: var(--font-mono); font-size: 12px; font-weight: 700; white-space: nowrap; color: var(--slate); cursor: pointer; touch-action: manipulation; }
	.panel { background: var(--volt-light); margin: 0 -16px; padding: 12px 16px 14px; display: flex; flex-direction: column; gap: 10px; }
	.dial { display: flex; flex-direction: column; gap: 10px; }
	.dialrow { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
	.liftrows { display: flex; flex-direction: column; }
	.liftrows :global(.row) { border-bottom-color: var(--volt); min-height: 44px; }
	.rows { display: flex; flex-direction: column; }
	.why { margin: 0; padding: 10px 0 4px; font-size: 15px; line-height: 1.5; color: var(--slate); text-wrap: pretty; }
	.phead { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
	.badge {
		display: inline-flex; align-items: center; min-height: 28px; padding: 0 10px; border-radius: var(--radius-pill); border: 1px solid var(--ink); background: var(--white);
		font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink); cursor: pointer;
	}
	.badge.on { background: var(--volt); cursor: default; }
	.desc { font-size: 14px; line-height: 1.45; color: var(--slate); }
</style>
