<script lang="ts">
	import { enhance } from '$app/forms';
	import Card from '$lib/components/Card.svelte';
	import TrendRow from '$lib/components/TrendRow.svelte';
	import { goalHint, weekHead, weekMeta } from '$lib/domain/labels';
	import { GOAL_MINUTES, GOAL_SESSIONS, progresses, routineTitle, type Cycle, type Discipline, type Exercise, type PracticeId } from '$lib/domain/plan';
	import { BLOCKS, FLOOR } from '$lib/domain/plans';
	import { trendFor, weekProgress } from '$lib/domain/projections';
	import { estimateMinutes, sessionSteps } from '$lib/domain/steps';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const now = Date.now();

	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let programme = $derived(data.programmes.find((p) => p.id === plan.id) ?? data.programmes[0]);

	type Practice = {
		id: PracticeId;
		title: string;
		discipline: Discipline;
		/** the cycle as the week has it — the goal applied, on or off */
		cycle: Cycle;
		/** what the programme or the block wrote, before any goal */
		programmeTarget: number;
		on: boolean;
		done: number;
		minutes: number;
		sub: string;
		/** the run's minutes, as the week has them */
		runMinutes?: number;
	};
	let practices = $derived.by((): Practice[] => {
		const raw: { id: PracticeId; title: string; cycle: Cycle; discipline: Discipline }[] = [
			{ id: 'lift', title: programme.name, cycle: programme.cycles.find((c) => c.id === 'lift') ?? programme.cycles[0], discipline: 'lift' },
			...BLOCKS.map((b) => ({ id: b.id, title: b.cycle.title, cycle: b.cycle, discipline: b.routineInfo[b.cycle.routines[0]].discipline }))
		];
		return raw.map((r) => {
			const goal = data.goals[r.id];
			const cycle = plan.cycles.find((c) => c.id === r.cycle.id) ?? (goal ? { ...r.cycle, target: goal.sessions } : r.cycle);
			const minutes = Math.round(cycle.routines.reduce((n, k) => n + estimateMinutes(sessionSteps(plan, { routine: k })), 0) / cycle.routines.length);
			const runEx = r.id === 'run' ? plan.routines[cycle.routines[0]].find((e) => e.kind === 'run') : undefined;
			return {
				...r,
				cycle,
				programmeTarget: r.cycle.target,
				on: data.practicesOn.includes(r.id),
				done: weekProgress(data.events, plan, cycle, now).done,
				minutes,
				sub: cycle.routines.map((k) => routineTitle(plan, k)).join(' · '),
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
	function dial(sessions: number, minutes?: number) {
		draft = { sessions, ...(minutes !== undefined ? { minutes } : {}) };
		clearTimeout(timer);
		timer = setTimeout(() => goalForm?.requestSubmit(), 700);
	}
	const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

	// what the rule is doing to each lift, one line each: the programme's exercises always, a floor movement once it has history
	let liftRoutines = $derived(programme.cycles.flatMap((c) => c.routines));
	let trends = $derived.by(() => {
		const seen = new Set<string>();
		const exs: { ex: Exercise; own: boolean }[] = [];
		for (const [key, list] of Object.entries(plan.routines)) {
			const own = liftRoutines.includes(key);
			if (!own && !FLOOR.cycle.routines.includes(key)) continue;
			for (const ex of list)
				if (progresses(ex) && !seen.has(ex.name)) {
					seen.add(ex.name);
					exs.push({ ex, own });
				}
		}
		return exs
			.map(({ ex, own }) => ({ ex, own, trend: trendFor(data.events, ex, data.activeSession?.id, now) }))
			.filter((t) => t.own || t.trend.sessions > 0);
	});
	let openTrend = $state<string | null>(null);
</script>

<div class="col">
	<div class="titleblock">
		<h1>The Week</h1>
		<div class="activemeta">{weekHead(weekSessions, weekMinutes)}. Each practice sets its own cadence; switch one off and Today stops dealing it.</div>
	</div>

	{#if form?.message}<p class="err">{form.message}</p>{/if}

	<Card pad={false}>
		<div class="sechead">
			<span class="caps">Your practices</span>
			<span class="meta">tap one to set a goal</span>
		</div>
		{#each practices as p (p.id)}
			{@const expanded = open === p.id}
			<div class="prow" class:off={!p.on}>
				<button type="button" class="phit" onclick={() => toggleOpen(p)} aria-expanded={expanded}>
					<span class="sw ink-{p.discipline}"></span>
					<span class="ptitle"><span class="pname">{p.title}</span><span class="pmeta">{p.on ? weekMeta(p.cycle.target, p.done) : 'off'}</span></span>
					<span class="psub">{p.sub} · ~{p.minutes} min</span>
					<span class="chev" class:lit={expanded}>{expanded ? 'Close ×' : p.id === 'lift' ? 'Goal · progress ›' : 'Goal ›'}</span>
				</button>
				<form method="POST" action="?/toggle" use:enhance class="togform">
					<input type="hidden" name="practice" value={p.id} />
					<input type="hidden" name="on" value={String(!p.on)} />
					<button type="submit" class="tog" role="switch" aria-checked={p.on} aria-label="{p.title} {p.on ? 'on' : 'off'}">
						<span class="knob"></span>
					</button>
				</form>
			</div>
			{#if expanded}
				<div class="goal">
					<form method="POST" action="?/goal" use:enhance bind:this={goalForm} class="tiles" class:two={p.id === 'run'}>
						<input type="hidden" name="practice" value={p.id} />
						<input type="hidden" name="sessions" value={draft.sessions} />
						{#if draft.minutes !== undefined}<input type="hidden" name="minutes" value={draft.minutes} />{/if}
						<div class="tile">
							<span class="tilecaps">Sessions a week</span>
							<span class="dial">
								<button type="button" class="pm" aria-label="Fewer sessions" onclick={() => dial(clamp(draft.sessions - 1, GOAL_SESSIONS.min, GOAL_SESSIONS.max), draft.minutes)}>−</button>
								<span class="num">{draft.sessions}</span>
								<button type="button" class="pm" aria-label="More sessions" onclick={() => dial(clamp(draft.sessions + 1, GOAL_SESSIONS.min, GOAL_SESSIONS.max), draft.minutes)}>+</button>
							</span>
						</div>
						{#if draft.minutes !== undefined}
							<div class="tile">
								<span class="tilecaps">Minutes · {GOAL_MINUTES.step}</span>
								<span class="dial">
									<button type="button" class="pm" aria-label="Fewer minutes" onclick={() => dial(draft.sessions, clamp(draft.minutes! - GOAL_MINUTES.step, GOAL_MINUTES.min, GOAL_MINUTES.max))}>−</button>
									<span class="num">{draft.minutes}</span>
									<button type="button" class="pm" aria-label="More minutes" onclick={() => dial(draft.sessions, clamp(draft.minutes! + GOAL_MINUTES.step, GOAL_MINUTES.min, GOAL_MINUTES.max))}>+</button>
								</span>
							</div>
						{/if}
					</form>
					<div class="meta">{goalHint(p.programmeTarget, draft.sessions)}</div>
					{#if p.id === 'lift'}
						<div class="sechead tight">
							<span class="caps">Am I getting stronger</span>
							<a class="textlink" href="/week/programme">Change programme →</a>
						</div>
						<div class="trends">
							{#each trends as t (t.ex.name)}
								<TrendRow ex={t.ex} trend={t.trend} open={openTrend === t.ex.name} ontoggle={() => (openTrend = openTrend === t.ex.name ? null : t.ex.name)} />
							{/each}
						</div>
						<div class="floornote">{FLOOR.cycle.routines.length} floor sessions stand in for a lift whenever you pick one from Something else — no gym needed, but no rule against it either.</div>
					{/if}
				</div>
			{/if}
		{/each}
		<div class="foot">a switch or a goal is an event · the ledger shows when the week changed</div>
	</Card>

	<div class="rare">
		<a class="disclosure" href="/week/why">Why this works →</a>
		<span class="rarelinks">
			<a class="textlink" href="/export" download="training-ledger-events.json">Export</a>
			<form method="POST" action="/logout"><button type="submit" class="textlink">Sign out</button></form>
		</span>
	</div>
</div>

<style>
	.col { display: flex; flex-direction: column; gap: 16px; }
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: var(--text-display);
		line-height: var(--leading-tight);
	}
	.titleblock { display: flex; flex-direction: column; gap: 6px; }
	.activemeta { font-family: var(--font-mono); font-size: 13px; color: var(--ink-3); line-height: 1.45; }
	.err { margin: 0; color: var(--danger); font-weight: var(--weight-bold); font-size: var(--text-sm); }
	.caps {
		font-size: 12px; font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps);
		text-transform: uppercase; color: var(--ink-3);
	}
	.meta { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); }
	.sechead { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding: 14px 16px 6px; }
	.sechead.tight { padding: 4px 0 0; }
	.sechead.tight .textlink { min-height: 32px; padding: 0; font-size: 12px; }

	/* one row per practice: the switch on the right, the rest is one big hit that opens the goal */
	.prow {
		position: relative; display: grid; grid-template-columns: 1fr auto; column-gap: 10px; align-items: center;
		padding: 0 16px 0 0; border-top: 1px solid var(--border-soft);
	}
	.prow.off { opacity: 0.7; }
	.phit {
		display: grid; grid-template-columns: auto 1fr; grid-template-areas: 'sw title' '. sub' '. chev';
		column-gap: 10px; row-gap: 2px; align-items: center; width: 100%; padding: 12px 0 8px 16px;
		background: transparent; border: none; text-align: left; font: inherit; color: var(--ink); cursor: pointer; touch-action: manipulation;
	}
	.sw { grid-area: sw; align-self: start; width: 12px; height: 12px; border-radius: 3px; border: 1px solid var(--ink); display: inline-block; margin-top: 5px; }
	.ptitle { grid-area: title; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; min-width: 0; }
	.pname { font-size: 16px; font-weight: var(--weight-bold); }
	.pmeta { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); white-space: nowrap; }
	.psub { grid-area: sub; font-size: 13px; color: var(--ink-2); line-height: 1.45; }
	.chev {
		grid-area: chev; display: inline-flex; align-items: center; min-height: 32px;
		font-size: 12px; font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-3); white-space: nowrap;
	}
	.chev.lit { color: var(--ink); }
	.togform { align-self: center; }
	.tog {
		position: relative; width: 48px; height: 28px; padding: 0;
		background: var(--white); border: var(--border-w) solid var(--ink); border-radius: var(--radius-pill);
		cursor: pointer; touch-action: manipulation;
		transition: background var(--dur-med) var(--ease-snap);
	}
	.tog[aria-checked='true'] { background: var(--volt); }
	.knob {
		position: absolute; top: 2px; left: 2px; width: 20px; height: 20px;
		background: var(--ink); border-radius: 50%;
		transition: left var(--dur-med) var(--ease-snap);
	}
	.tog[aria-checked='true'] .knob { left: 22px; }

	/* the goal: two quiet tiles, the same dial the floor uses */
	.goal { display: flex; flex-direction: column; gap: 12px; padding: 4px 16px 16px 38px; }
	.tiles { display: grid; grid-template-columns: 1fr; gap: 10px; }
	.tiles.two { grid-template-columns: 1fr 1fr; }
	.tile {
		min-height: 68px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
		background: var(--white); border: 1px solid var(--border-soft); border-radius: 14px;
	}
	.tilecaps { font-size: 9.5px; font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-3); }
	.dial { display: flex; align-items: center; gap: 4px; }
	.pm {
		width: 44px; min-height: 44px; background: transparent; border: none;
		font-family: var(--font-mono); font-size: 21px; font-weight: 700; color: var(--ink-2); cursor: pointer; touch-action: manipulation;
	}
	.num { font-family: var(--font-mono); font-size: 21px; font-weight: 800; min-width: 40px; text-align: center; }
	.trends { background: var(--white); border: 1px solid var(--border-soft); border-radius: var(--radius-md); overflow: hidden; }
	.floornote { font-size: 13px; color: var(--ink-2); line-height: 1.45; }
	.foot {
		padding: 8px 16px; background: var(--paper-2); border-top: 1px solid var(--border-soft);
		border-radius: 0 0 var(--radius-lg) var(--radius-lg);
		font-family: var(--font-mono); font-size: 11px; color: var(--ink-3);
	}

	.rare { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
	.rarelinks { display: flex; align-items: center; gap: 4px; }
	.disclosure, .textlink {
		display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 4px;
		background: none; border: none; cursor: pointer;
		font-family: var(--font-body); font-size: 13px; font-weight: var(--weight-bold); color: var(--ink-2);
		text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--border-soft); border-radius: var(--radius-sm);
	}
	.disclosure:hover, .textlink:hover { color: var(--ink); background: none; }
	.rarelinks .textlink { font-size: 12px; letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-3); }
</style>
