<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Chip from '$lib/components/Chip.svelte';
	import Stepper from '$lib/components/Stepper.svelte';
	import type { AfterEntry } from '$lib/domain/commands';
	import { RUN_DAY, RUN_ITEM } from '$lib/domain/events';
	import { dayTitle, nextLoad, suggestedCount } from '$lib/domain/projections';
	import { nextRung, prevRung } from '$lib/domain/racks';
	import { estimateMinutes, sessionSteps } from '$lib/domain/steps';
	import type { Exercise } from '$lib/domain/types';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/**
	 * "Log it after": the same session shape the floor writes live, written
	 * in one shot and backdated. A run is one entry; a lift is its sets — the
	 * rule's numbers prefilled, yours to change. Nothing here is a second
	 * kind of thing in the ledger.
	 */
	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let dayKeys = $derived(Object.keys(plan.days));
	let hasRun = $derived(plan.runs !== false);
	let what = $state<string>('');
	let whatKey = $derived(what || (hasRun ? RUN_DAY : dayKeys[0]));
	let isRun = $derived(whatKey === RUN_DAY);

	// when: today, or one of the last few days at noon — a backdated
	// session needs a day, not a minute
	const DAY = 86400000;
	const whenOptions = (() => {
		const out: { key: string; label: string; at: Date }[] = [];
		const now = new Date();
		for (let d = 0; d < 5; d++) {
			const at = d === 0 ? now : new Date(now.getFullYear(), now.getMonth(), now.getDate() - d, 12, 0, 0);
			const label = d === 0 ? 'Today' : d === 1 ? 'Yesterday' : at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
			out.push({ key: String(d), label, at });
		}
		return out;
	})();
	let when = $state('0');
	let endAt = $derived(whenOptions.find((w) => w.key === when)?.at ?? new Date());

	let minutes = $state(30);
	$effect(() => {
		minutes = plan.run?.minutes ?? 30;
	});

	/* the lift: one line per exercise, every set the same numbers. The rule's
	   suggestion for set 1 is the starting point — a session you did without
	   the phone was most likely the one the plan asked for. */
	type Line = { ex: Exercise; sets: number; weight: number; count: number };
	let lines = $state<Line[]>([]);
	$effect(() => {
		const exs = isRun ? [] : (plan.days[whatKey] ?? []);
		lines = exs.map((ex) => ({
			ex,
			sets: ex.sets,
			weight: ex.bodyweight ? 0 : nextLoad(data.events, ex).weight,
			count: ex.bodyweight || ex.mode === 'seconds' ? suggestedCount(data.events, ex) : nextLoad(data.events, ex).sets[0].reps
		}));
	});
	function bumpWeight(l: Line, dir: 1 | -1) {
		if (l.ex.rack) l.weight = dir > 0 ? nextRung(l.weight, l.ex.rack) : prevRung(l.weight, l.ex.rack);
		else l.weight = Math.max(0, l.weight + dir * l.ex.inc);
	}
	function bumpCount(l: Line, dir: 1 | -1) {
		const step = l.ex.mode === 'seconds' ? l.ex.inc : 1;
		l.count = Math.max(1, Math.min(l.ex.mode === 'seconds' ? 600 : 100, l.count + dir * step));
	}
	const bumpSets = (l: Line, dir: 1 | -1) => (l.sets = Math.max(0, Math.min(8, l.sets + dir)));

	let entries = $derived.by((): AfterEntry[] => {
		if (isRun) return [{ item: RUN_ITEM, index: 1, measure: { of: 'duration', minutes } }];
		const out: AfterEntry[] = [];
		for (const l of lines)
			for (let k = 1; k <= l.sets; k++)
				out.push({
					item: l.ex.name,
					index: k,
					measure:
						l.ex.mode === 'seconds'
							? { of: 'hold', seconds: l.count, target: l.count, ...(l.weight > 0 ? { load: l.weight } : {}) }
							: l.ex.bodyweight
								? { of: 'reps', reps: l.count }
								: { of: 'load', load: l.weight, reps: l.count }
				});
		return out;
	});
	let durationMin = $derived(isRun ? minutes : estimateMinutes(sessionSteps(plan, whatKey)));
	let startAt = $derived(new Date(endAt.getTime() - durationMin * 60000));
	let title = $derived(dayTitle(plan, whatKey));
	let submitLabel = $derived(isRun ? `Log ${minutes} min` : `Log ${title}`);
	let shapeLine = $derived(
		isRun
			? 'Same session shape · one entry · backdated.'
			: `Writes start · ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} · finish, backdated.`
	);
</script>

<div class="col">
	<div class="head">
		<a class="back" href="/" aria-label="Back to Today">←</a>
		<h1>Log it after</h1>
	</div>

	<Card>
		<form method="POST" action="?/log" use:enhance class="form">
			<div class="caps">What</div>
			<div class="chips">
				{#if hasRun}
					<Chip selected={isRun} onclick={() => (what = RUN_DAY)}>{dayTitle(plan, RUN_DAY)}</Chip>
				{/if}
				{#each dayKeys as d (d)}
					<Chip selected={whatKey === d} onclick={() => (what = d)}>{dayTitle(plan, d)}</Chip>
				{/each}
			</div>

			<div class="caps mt">When</div>
			<div class="chips">
				{#each whenOptions as w (w.key)}
					<Chip selected={when === w.key} onclick={() => (when = w.key)}>{w.label}</Chip>
				{/each}
			</div>

			{#if isRun}
				<div class="caps mt">Minutes</div>
				<Stepper bind:value={minutes} step={5} min={5} max={240} unit="min" label="minutes" />
			{:else}
				<div class="caps mt">The sets</div>
				<div class="lines">
					{#each lines as l (l.ex.name)}
						<div class="line">
							<div class="lhead">
								<span class="lname">{l.ex.name}</span>
								<span class="ctl">
									<button type="button" class="pm" aria-label="Fewer sets" onclick={() => bumpSets(l, -1)}>−</button>
									<span class="num">{l.sets} <span class="unit">{l.sets === 1 ? 'set' : 'sets'}</span></span>
									<button type="button" class="pm" aria-label="More sets" onclick={() => bumpSets(l, 1)}>+</button>
								</span>
							</div>
							<div class="lctls">
								{#if !l.ex.bodyweight}
									<span class="ctl">
										<button type="button" class="pm" aria-label="Less weight" onclick={() => bumpWeight(l, -1)}>−</button>
										<span class="num">{l.weight} <span class="unit">{l.ex.each ? '/hand' : 'lb'}</span></span>
										<button type="button" class="pm" aria-label="More weight" onclick={() => bumpWeight(l, 1)}>+</button>
									</span>
									<span class="times">×</span>
								{/if}
								<span class="ctl">
									<button type="button" class="pm" aria-label="Fewer" onclick={() => bumpCount(l, -1)}>−</button>
									<span class="num">{l.count}<span class="unit">{l.ex.mode === 'seconds' ? 's' : l.ex.bodyweight ? ' reps' : ''}</span></span>
									<button type="button" class="pm" aria-label="More" onclick={() => bumpCount(l, 1)}>+</button>
								</span>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<p class="shape">{shapeLine}</p>
			{#if form?.message}<p class="err">{form.message}</p>{/if}

			<input type="hidden" name="plan" value={plan.id} />
			<input type="hidden" name="day" value={whatKey} />
			<input type="hidden" name="startAt" value={startAt.toISOString()} />
			<input type="hidden" name="at" value={endAt.toISOString()} />
			<input type="hidden" name="entries" value={JSON.stringify(entries)} />
			<Button variant="accent" size="lg" type="submit" style="width: 100%" disabled={entries.length === 0}>
				{submitLabel}
			</Button>
		</form>
	</Card>
</div>

<style>
	.col { display: flex; flex-direction: column; gap: 20px; }
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
	.form { display: flex; flex-direction: column; gap: 10px; }
	.caps {
		font-size: 12px; font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-3);
	}
	.mt { margin-top: 8px; }
	.chips { display: flex; gap: 8px; flex-wrap: wrap; }

	.lines { display: flex; flex-direction: column; }
	.line { padding: 10px 0; border-top: 1px solid var(--border-soft); display: flex; flex-direction: column; gap: 6px; }
	.line:first-child { border-top: none; padding-top: 0; }
	.lhead { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
	.lname { font-weight: var(--weight-bold); font-size: 15px; min-width: 0; }
	.lctls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
	.ctl { display: inline-flex; align-items: center; gap: 2px; }
	.pm {
		width: 44px; min-height: 44px;
		background: transparent; border: none; border-radius: var(--radius-sm);
		font-family: var(--font-mono); font-size: 20px; font-weight: 700; color: var(--ink-2); cursor: pointer;
		touch-action: manipulation;
	}
	.pm:hover { background: var(--volt-tint); }
	.num { font-family: var(--font-mono); font-weight: 800; font-size: 18px; min-width: 44px; text-align: center; }
	.unit { font-size: 12px; font-weight: 700; color: var(--ink-3); }
	.times { font-family: var(--font-mono); color: var(--ink-3); }
	.shape { margin: 4px 0 0; font-family: var(--font-mono); font-size: 12px; color: var(--ink-3); }
	.err { margin: 0; color: var(--danger); font-weight: var(--weight-bold); font-size: var(--text-sm); }
</style>
