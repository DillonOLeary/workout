<script lang="ts">
	/**
	 * Log a session already done: when, how long — and for a lift or the floor every set, from the plan, changed here. The routine is
	 * Today's pick; `start()` opens the sheet on it, fresh. `counts` says which week a class pays ("Counts toward Yoga · 1 of 2 this week.").
	 */
	import { enhance } from '$app/forms';
	import { Caption, Note, Primary, Row, Sheet, Stepper, Switch } from '$lib/ui';
	import type { AfterEntry } from '$lib/domain/commands';
	import type { LedgerEvent } from '$lib/domain/events';
	import { clockLabel, levelLine, loadShort, setsLine } from '$lib/domain/labels';
	import { measureFor } from '$lib/domain/measure';
	import { CLASS_MINUTES, classKeys, disciplineOf, levelsOf, routineTitle, type Exercise, type Plan } from '$lib/domain/plan';
	import { historyFor } from '$lib/domain/projections';
	import { bumpCount, bumpLoad, suggest } from '$lib/domain/progression';
	import { estimateMinutes, routineExercises, sessionSteps } from '$lib/domain/steps';
	import { roundsFor } from '$lib/domain/week';

	let { events, plan, routine, counts, now }: { events: LedgerEvent[]; plan: Plan; routine: string; counts: string; now: number } = $props();

	let after = $state(false);
	let classes = $derived(classKeys(plan));
	let whenIdx = $state(0);
	let afterRounds = $derived(roundsFor(events, plan, routine));
	let afterTitle = $derived(routineTitle(plan, routine) ?? routine);
	let afterEx = $derived(routineExercises(plan, { routine, ...(afterRounds !== undefined ? { rounds: afterRounds } : {}) }));
	let isClass = $derived(classes.includes(routine));
	let isRun = $derived(afterEx.some((e) => e.kind === 'run'));
	// a lift or the floor is sets you change; yoga and the stretch go in as the plan wrote them; a run and a class are their length
	let editable = $derived(!isClass && ['lift', 'bodyweight'].includes(disciplineOf(plan, routine) ?? ''));
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
	// the session's id is made when the sheet opens, not when it posts: a second tap or a resend over a slow link is the same session, and the decider refuses it
	let sessionId = $state('');
	let saving = $state(false);
	function planned(ex: Exercise): AfterSet[] {
		const s = suggest(historyFor(events, ex.name), ex, now);
		return Array.from({ length: ex.sets }, (_, k) => {
			const set = s.sets[Math.min(k, s.sets.length - 1)];
			const count = 'reps' in set ? set.reps : set.count;
			return { load: s.kind === 'load' ? s.sets[Math.min(k, s.sets.length - 1)].weight : 0, count, target: count };
		});
	}
	function choose(r: string) {
		openEx = null;
		const rounds = roundsFor(events, plan, r);
		const w = { routine: r, ...(rounds !== undefined ? { rounds } : {}) };
		afterSets = Object.fromEntries(routineExercises(plan, w).map((ex) => [ex.name, { did: true, sets: planned(ex) }]));
		const run = (plan.routines[r] ?? []).find((e) => e.kind === 'run');
		len = classes.includes(r) ? CLASS_MINUTES : run ? run.hi : Math.max(5, Math.round(estimateMinutes(sessionSteps(plan, w)) / 5) * 5);
		// until you set it, it began about its length ago, on the quarter hour
		if (!startSet) {
			const n = new Date();
			startMin = Math.max(0, Math.floor((n.getHours() * 60 + n.getMinutes() - len) / 15) * 15);
		}
	}
	/** Open the sheet on the routine, as the plan would have it, today, ended about now. */
	export function start() {
		sessionId = crypto.randomUUID();
		saving = false;
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
	let afterSummary = $derived.by(() => {
		const day = whenIdx === 0 ? 'today' : whenIdx === 1 ? 'yesterday' : days[whenIdx].label;
		if (editable) return `${afterTitle} · ${afterSetCount} ${afterSetCount === 1 ? 'set' : 'sets'} · ~${len} min · ${day}. Fix any set from the Ledger afterwards.`;
		return `${afterTitle} · ${len} min · ${day} at ${clockLabel(startMin)}.`;
	});
	const asWritten = (d: string | undefined) => (isRun ? 'The length is the run.' : `Written with the plan’s ${d === 'yoga' ? 'poses' : 'holds'} — the length is what changes.`);
</script>

<Sheet open={after} title="Log {afterTitle}" onclose={() => (after = false)}>
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
		<div class="say"><Note tone="ink">{plan.routineInfo[routine]?.desc ?? afterTitle}.{counts} No {disciplineOf(plan, routine) === 'yoga' ? 'poses' : 'sets'} to tick.</Note></div>
	{:else if editable}
		<div class="setshead"><Caption>{afterRounds !== undefined ? `${levelLine(levelsOf(plan, routine) ?? [], afterRounds)} · change any` : 'Sets · from the plan, change any'}</Caption><span class="count">{didCount} of {afterEx.length} done</span></div>
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
		<form method="POST" action="?/logAfter" use:enhance={() => { saving = true; return async ({ result, update }) => { afterError = result.type === 'failure' ? String(result.data?.message ?? 'That didn’t save.') : ''; saving = false; await update(); }; }}>
			<input type="hidden" name="session" value={sessionId} />
			<input type="hidden" name="plan" value={plan.id} />
			<input type="hidden" name="routine" value={routine} />
			{#if afterRounds !== undefined}<input type="hidden" name="rounds" value={afterRounds} />{/if}
			<input type="hidden" name="startAt" value={startAt.toISOString()} />
			<input type="hidden" name="at" value={endAt.toISOString()} />
			<input type="hidden" name="entries" value={JSON.stringify(entries)} />
			<Primary type="submit" disabled={!entries.length || saving}>{saving ? 'Saving…' : 'Log it'}</Primary>
		</form>
	{/snippet}
</Sheet>

<style>
	.err { color: var(--signal); font-weight: 700; }
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
