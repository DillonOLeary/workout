<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import type { AfterEntry } from '$lib/domain/commands';
	import { lineValue, turnLabel, weekMeta } from '$lib/domain/labels';
	import { measureFor } from '$lib/domain/measure';
	import { cycleOf, disciplineOf, routineKeys, routinesOf, type Exercise } from '$lib/domain/plan';
	import { historyFor, weekProgress } from '$lib/domain/projections';
	import { bumpCount, bumpLoad, suggest } from '$lib/domain/progression';
	import { estimateMinutes, sessionSteps } from '$lib/domain/steps';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const opened = Date.now();

	/**
	 * "Log it after": a session done without the phone, usually as planned,
	 * written in seconds. The same session shape the floor writes live, in
	 * one shot and backdated — a run is one entry; a lift is its sets. The
	 * rule's numbers are the lines; a tap opens the one that went
	 * differently. What it was and when are one card; the sets are another;
	 * the button says what it will write.
	 */
	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let keys = $derived(routineKeys(plan));
	// Today says what it sent you for: ?what=<routine>; else the run, the thing most often done without the phone
	// svelte-ignore state_referenced_locally
	const asked = page.url.searchParams.get('what');
	let picked = $state<string | null>(null);
	let routine = $derived(picked ?? (asked && plan.routines[asked] ? asked : (routinesOf(plan, 'run')[0] ?? keys[0])));
	let isRun = $derived(disciplineOf(plan, routine) === 'run');
	let cycle = $derived(cycleOf(plan, routine));
	let title = $derived(plan.routineInfo[routine].title);

	// something else: every routine, grouped by cycle in the plan's order — a
	// routine two cycles share is listed under the first
	let pickerOpen = $state(false);
	let groups = $derived.by(() => {
		const seen = new Set<string>();
		return plan.cycles.map((c) => {
			const routines = c.routines.filter((r) => !seen.has(r));
			routines.forEach((r) => seen.add(r));
			const standIn = plan.cycles.find((x) => x.id === c.standsInFor);
			return {
				cycle: c,
				routines,
				meta: c.target > 0 ? weekMeta(c.target, weekProgress(data.events, plan, c, opened).done) : `stands in for ${standIn?.title ?? 'the lift'}`
			};
		});
	});
	function pick(r: string) {
		picked = r;
		pickerOpen = false;
	}

	// when: the last seven days, ending today. A backdated session needs a
	// day, not a minute — it gets noon; today gets now
	const days = (() => {
		const now = new Date(opened);
		const out: { key: number; wd: string; n: number; at: Date; today: boolean }[] = [];
		for (let d = 6; d >= 0; d--) {
			const at = d === 0 ? now : new Date(now.getFullYear(), now.getMonth(), now.getDate() - d, 12, 0, 0);
			out.push({ key: 6 - d, wd: at.toLocaleDateString('en-US', { weekday: 'narrow' }), n: at.getDate(), at, today: d === 0 });
		}
		return out;
	})();
	let when = $state(6);
	let endAt = $derived(days[when].at);
	let dateLabel = $derived(endAt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
	let stamp = $derived(`${dateLabel} · ${days[when].today ? 'now' : 'noon'}`);

	/* one line per exercise, every set the same numbers. The rule's
	   suggestion for set 1 is the line — a session you did without the phone
	   was most likely the one the plan asked for — and it is kept beside your
	   numbers, so a changed line can say what the rule asked, and go back. */
	type Numbers = { sets: number; weight: number; count: number };
	type Line = Numbers & { ex: Exercise; asked: Numbers };
	let lines = $state<Line[]>([]);
	let openLine = $state<string | null>(null);
	$effect(() => {
		const exs = plan.routines[routine] ?? [];
		lines = exs.map((ex) => {
			const s = suggest(historyFor(data.events, ex.name), ex, opened);
			const asked = { sets: ex.sets, weight: s.kind === 'load' ? s.weight : 0, count: s.kind === 'load' ? s.sets[0].reps : s.sets[0].count };
			return { ex, ...asked, asked };
		});
		openLine = null;
	});
	const touched = (l: Line) => l.sets !== l.asked.sets || l.weight !== l.asked.weight || l.count !== l.asked.count;
	const reset = (l: Line) => {
		l.sets = l.asked.sets;
		l.weight = l.asked.weight;
		l.count = l.asked.count;
	};
	// the same ± as the floor: the rule's own one-size step
	const bumpWeight = (l: Line, dir: 1 | -1) => {
		if (l.ex.kind === 'load') l.weight = bumpLoad(l.ex, l.weight, dir);
	};
	const bumpReps = (l: Line, dir: 1 | -1) => (l.count = bumpCount(l.ex, l.count, dir));
	const bumpSets = (l: Line, dir: 1 | -1) => (l.sets = Math.max(0, Math.min(8, l.sets + dir)));
	const countCaps = (ex: Exercise) => (ex.kind === 'hold' ? 'Seconds' : ex.kind === 'run' ? 'Minutes' : 'Reps');
	// skipping is a set count of zero: the line stays, and writes nothing
	function skip() {
		const l = lines.find((x) => x.ex.name === openLine);
		if (l) l.sets = 0;
	}

	let entries = $derived.by((): AfterEntry[] => {
		const out: AfterEntry[] = [];
		for (const l of lines)
			for (let k = 1; k <= l.sets; k++)
				out.push({
					item: l.ex.name,
					index: k,
					// a backdated hold rang its bell: target = seconds, so the rule reads it as earned
					measure: measureFor(l.ex, { load: l.weight, count: l.count, target: l.count })
				});
		return out;
	});
	// a run done without the phone was the run, not the drills around it
	let runMinutes = $derived(lines.find((l) => l.ex.kind === 'run')?.count ?? 0);
	let durationMin = $derived(isRun ? runMinutes : estimateMinutes(sessionSteps(plan, { routine })));
	let startAt = $derived(new Date(endAt.getTime() - durationMin * 60000));
	let totalSets = $derived(lines.reduce((n, l) => n + (l.ex.kind === 'run' ? 0 : l.sets), 0));
	let changedN = $derived(lines.filter(touched).length);
	let whatLine = $derived(isRun ? `about ${runMinutes} min` : `${lines.length} exercises · ${totalSets} sets · about ${durationMin} min`);
	let submitLabel = $derived(isRun ? `Log ${runMinutes} min` : `Log ${title}`);
	let summaryLine = $derived(
		`${isRun ? `${runMinutes} min` : `${totalSets} ${totalSets === 1 ? 'set' : 'sets'}`} · ${
			changedN === 0 ? 'as the rule asked' : changedN === 1 ? 'one changed from the plan' : `${changedN} changed from the plan`
		}`
	);
</script>

<div class="col">
	<div class="head">
		<a class="back" href="/" aria-label="Back to Today">←</a>
		<h1>Log it after</h1>
	</div>

	<form method="POST" action="?/log" use:enhance class="col">
		<!-- what, and when: one card -->
		<Card interactive>
			{#if pickerOpen}
				<div class="sechead">
					<span class="caps">What did you do?</span>
					<span class="meta">grouped by cycle</span>
				</div>
				{#each groups as g (g.cycle.id)}
					{#if g.routines.length}
						<div class="group">
							<div class="sechead">
								<span class="caps">{g.cycle.title}</span>
								<span class="meta">{g.meta}</span>
							</div>
							<div class="chips">
								{#each g.routines as r (r)}
									<button type="button" class="chip" class:on={routine === r} aria-pressed={routine === r} onclick={() => pick(r)}>
										{plan.routineInfo[r].title}
									</button>
								{/each}
							</div>
						</div>
					{/if}
				{/each}
			{:else}
				<div class="what">
					<div class="whatmain">
						<span class="caps">{cycle ? turnLabel(cycle, routine) : ''}</span>
						<span class="title">{title}</span>
						<span class="meta">{whatLine}</span>
					</div>
					<button type="button" class="elsebtn" onclick={() => (pickerOpen = true)} aria-expanded={pickerOpen}>Something else ▾</button>
				</div>
				<div class="sechead whenhead">
					<span class="caps">When</span>
					<span class="meta">{stamp}</span>
				</div>
				<div class="strip">
					{#each days as d (d.key)}
						<button type="button" class="day" class:picked={when === d.key} class:today={d.today} aria-pressed={when === d.key} onclick={() => (when = d.key)}>
							<span class="wd">{d.wd}</span>
							<span class="n">{d.n}</span>
						</button>
					{/each}
				</div>
			{/if}
		</Card>

		<!-- the sets: the rule's numbers, one line each; a tap opens the one that went differently -->
		<Card pad={false}>
			<div class="sechead setshead">
				<span class="caps">{isRun ? 'The run' : 'The sets'}</span>
				<span class="meta">as the rule asked · tap to change</span>
			</div>
			{#each lines as l (l.ex.name)}
				{@const open = openLine === l.ex.name}
				<button type="button" class="row" class:open onclick={() => (openLine = open ? null : l.ex.name)} aria-expanded={open}>
					<span class="name">{l.ex.name}{#if touched(l)}<span class="dot" role="img" aria-label="changed"></span>{/if}</span>
					<span class="val">{lineValue(l.ex, l.sets, l.weight, l.count)}</span>
				</button>
				{#if open}
					<div class="steppers">
						{#if l.ex.kind === 'load'}
							<span class="lbl">Weight</span>
							<span class="ctl">
								<button type="button" class="pm" aria-label="Less weight" onclick={() => bumpWeight(l, -1)}>−</button>
								<span class="num">{l.weight}<span class="unit"> {l.ex.progress.each ? '/hand' : 'lb'}</span></span>
								<button type="button" class="pm" aria-label="More weight" onclick={() => bumpWeight(l, 1)}>+</button>
							</span>
						{/if}
						{#if l.ex.kind !== 'run'}
							<span class="lbl">Sets</span>
							<span class="ctl">
								<button type="button" class="pm" aria-label="Fewer sets" onclick={() => bumpSets(l, -1)}>−</button>
								<span class="num">{l.sets}</span>
								<button type="button" class="pm" aria-label="More sets" onclick={() => bumpSets(l, 1)}>+</button>
							</span>
						{/if}
						<span class="lbl">{countCaps(l.ex)}</span>
						<span class="ctl">
							<button type="button" class="pm" aria-label="Fewer" onclick={() => bumpReps(l, -1)}>−</button>
							<span class="num">{l.count}</span>
							<button type="button" class="pm" aria-label="More" onclick={() => bumpReps(l, 1)}>+</button>
						</span>
						<div class="askedrow">
							<span class="meta">the rule asked {lineValue(l.ex, l.asked.sets, l.asked.weight, l.asked.count)}</span>
							<button type="button" class="reset" onclick={() => reset(l)} disabled={!touched(l)}>Reset</button>
						</div>
					</div>
				{/if}
			{/each}
			{#if !isRun}
				<div class="setsfoot">
					<button type="button" class="skip" onclick={skip} disabled={!openLine}>Skip an exercise</button>
				</div>
			{/if}
		</Card>

		{#if form?.message}<p class="err">{form.message}</p>{/if}

		<input type="hidden" name="plan" value={plan.id} />
		<input type="hidden" name="routine" value={routine} />
		<input type="hidden" name="startAt" value={startAt.toISOString()} />
		<input type="hidden" name="at" value={endAt.toISOString()} />
		<input type="hidden" name="entries" value={JSON.stringify(entries)} />
		<div class="submit">
			<Button variant="accent" size="lg" type="submit" style="width: 100%" disabled={entries.length === 0}>
				{submitLabel} <span class="btndate">{dateLabel}</span>
			</Button>
			<p class="summary">{summaryLine}</p>
		</div>
	</form>
</div>

<style>
	.col { display: flex; flex-direction: column; gap: 16px; }
	.head { display: flex; align-items: center; gap: 14px; }
	.back {
		width: 48px; height: 48px; flex: none;
		display: inline-flex; align-items: center; justify-content: center;
		background: var(--white); border: var(--border-w) solid var(--ink); border-radius: var(--radius-md);
		box-shadow: var(--shadow-raised); text-decoration: none;
		font-family: var(--font-display); font-weight: var(--weight-black); font-size: 22px; color: var(--ink);
	}
	.back:hover { background: var(--volt-tint); }
	.back:active { transform: translateY(2px); box-shadow: var(--shadow-pressed); }
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: var(--text-display);
		line-height: var(--leading-tight);
	}
	.caps {
		font-size: 12px; font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-3);
	}
	.meta { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); }
	.sechead { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; }

	/* what: the routine Today sent you for, and the way out of it */
	.what { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
	.whatmain { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
	.title { font-family: var(--font-display); font-weight: var(--weight-black); font-size: 26px; line-height: 1.1; }
	.elsebtn {
		flex: none; min-height: 40px; padding: 0 14px;
		background: var(--white); border: 1px solid var(--ink); border-radius: var(--radius-pill);
		font-family: var(--font-body); font-size: 13px; font-weight: var(--weight-bold); color: var(--ink); cursor: pointer;
		touch-action: manipulation;
	}
	.elsebtn:hover { background: var(--volt-tint); }
	.group { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
	.chips { display: flex; gap: 8px; flex-wrap: wrap; }
	.chip {
		min-height: 40px; padding: 0 14px;
		background: var(--white); border: var(--border-w) solid var(--border-soft); border-radius: var(--radius-pill);
		font-family: var(--font-body); font-size: 14px; font-weight: var(--weight-bold); color: var(--ink-2); cursor: pointer;
		touch-action: manipulation;
	}
	.chip:hover { background: var(--volt-tint); color: var(--ink); }
	.chip.on { background: var(--volt); border-color: var(--ink); color: var(--ink); }

	/* when: seven days, the picked one volt, today dashed — the calendar's convention */
	.whenhead { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-soft); }
	.strip { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-top: 8px; }
	.day {
		min-height: 48px; padding: 4px 0; border-radius: var(--radius-sm);
		display: flex; flex-direction: column; align-items: center; justify-content: center;
		background: var(--white); border: var(--border-w) solid var(--border-soft); color: var(--ink); cursor: pointer;
		font-family: var(--font-mono); touch-action: manipulation;
	}
	.day:hover { background: var(--volt-tint); }
	.day.picked { background: var(--volt); border-color: var(--ink); }
	.day.today { outline: 2px dashed var(--ink); outline-offset: 1px; }
	.wd { font-size: 10px; font-weight: 700; color: var(--ink-3); }
	.n { font-size: 15px; font-weight: 800; }

	/* the sets: two columns, the exercise and its line */
	.setshead { padding: 12px 16px 8px; }
	.row {
		display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center;
		width: 100%; min-height: 48px; padding: 10px 16px; border: none; border-top: 1px solid var(--border-soft);
		background: transparent; font: inherit; color: inherit; text-align: left; cursor: pointer; touch-action: manipulation;
		transition: background var(--dur-med) var(--ease-snap);
	}
	.row:hover { background: var(--volt-tint); }
	.row.open { background: var(--paper-2); }
	.name { font-size: 15px; font-weight: var(--weight-bold); min-width: 0; }
	.dot {
		display: inline-block; width: 8px; height: 8px; margin-left: 8px; vertical-align: middle;
		background: var(--volt); border: 1px solid var(--ink); border-radius: 50%;
	}
	.val { font-family: var(--font-mono); font-size: 14px; color: var(--ink-2); text-align: right; white-space: nowrap; }
	.row.open .val { color: var(--ink); font-weight: 800; }
	/* the open line: label / stepper, the steppers right-aligned so the numbers line up */
	.steppers {
		display: grid; grid-template-columns: auto 1fr; column-gap: 12px; row-gap: 2px; align-items: center;
		padding: 0 16px 10px; background: var(--paper-2);
	}
	.lbl { font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-3); }
	.ctl { display: inline-flex; align-items: center; gap: 2px; justify-self: end; }
	.pm {
		width: 44px; min-height: 44px;
		background: transparent; border: none; border-radius: var(--radius-sm);
		font-family: var(--font-mono); font-size: 20px; font-weight: 700; color: var(--ink-2); cursor: pointer;
		touch-action: manipulation;
	}
	.pm:hover { background: var(--volt-tint); }
	.num { font-family: var(--font-mono); font-weight: 800; font-size: 18px; min-width: 88px; text-align: center; }
	.unit { font-size: 12px; font-weight: 700; color: var(--ink-3); }
	.askedrow { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-top: 4px; }
	.reset {
		min-height: 36px; padding: 0 12px;
		background: var(--white); border: 1px solid var(--border-soft); border-radius: var(--radius-pill);
		font-family: var(--font-body); font-size: 12px; font-weight: var(--weight-bold); color: var(--ink-2); cursor: pointer;
	}
	.reset:disabled { opacity: 0.4; cursor: default; }
	.setsfoot { display: flex; justify-content: flex-end; padding: 8px 16px 12px; border-top: 1px solid var(--border-soft); }
	.skip {
		min-height: 40px; padding: 0 14px;
		background: transparent; border: 1px solid var(--border-soft); border-radius: var(--radius-pill);
		font-family: var(--font-body); font-size: 12px; font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps);
		text-transform: uppercase; color: var(--ink-3); cursor: pointer;
	}
	.skip:hover { color: var(--ink); border-color: var(--ink); }
	.skip:disabled { opacity: 0.4; cursor: default; }

	.submit { display: flex; flex-direction: column; gap: 8px; }
	.btndate { font-family: var(--font-mono); font-size: 13px; font-weight: 400; color: var(--ink-2); margin-left: 4px; }
	.summary { margin: 0; text-align: center; font-family: var(--font-mono); font-size: 12px; color: var(--ink-3); }
	.err { margin: 0; color: var(--danger); font-weight: var(--weight-bold); font-size: var(--text-sm); }
</style>
