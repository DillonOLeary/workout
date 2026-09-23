<script lang="ts">
	import { enhance } from '$app/forms';
	import { Caption, Card, Cell, Note, Row, Stepper, Title } from '$lib/ui';
	import { cellLegend, disciplineLabel, disciplineLetter, monthLine, paceLine, sessionSummary, setValue, setsLine, weekChangeLine, whenLabel } from '$lib/domain/labels';
	import { countOf, loadOf, type Measure } from '$lib/domain/measure';
	import { DISCIPLINES, disciplinesOf, routineTitle, type Discipline, type Exercise } from '$lib/domain/plan';
	import { bumpCount, bumpLoad } from '$lib/domain/progression';
	import { GRID_WEEKS, monthGrid, projectSessions, weekChanges, type DayCell, type SessionView, type WeekChange } from '$lib/domain/projections';
	import { weekTally } from '$lib/domain/week';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const now = Date.now();

	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let grid = $derived(monthGrid(data.events, now));
	let tally = $derived(weekTally(data.events, plan, now));
	let entries = $derived(projectSessions(data.events));
	let legend = $derived.by((): Discipline[] => {
		const out = disciplinesOf(plan);
		for (const s of entries) if (!out.includes(s.discipline)) out.push(s.discipline);
		return out;
	});
	const cellLabel = (c: DayCell) => (c.did.length ? c.did.map(disciplineLetter).join('') : c.future ? '' : '·');

	// a month is the fold: its line is the monthly view, its items the daily one — the newest month open, the rest one line each
	let changes = $derived(weekChanges(data.events));
	type Item = { kind: 'session'; s: SessionView } | { kind: 'change'; c: WeekChange };
	type Month = { key: string; line: string; items: Item[] };
	const monthKey = (iso: string) => {
		const d = new Date(iso);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	};
	let months = $derived.by((): Month[] => {
		const all: Item[] = [...entries.map((s): Item => ({ kind: 'session', s })), ...changes.map((c): Item => ({ kind: 'change', c }))];
		const at = (i: Item) => (i.kind === 'session' ? i.s.at : i.c.at);
		all.sort((a, b) => at(b).localeCompare(at(a)));
		const out: Month[] = [];
		for (const it of all) {
			const key = monthKey(at(it));
			let m = out.find((x) => x.key === key);
			if (!m) out.push((m = { key, line: '', items: [] }));
			m.items.push(it);
		}
		for (const m of out) {
			const sessions = m.items.flatMap((i) => (i.kind === 'session' ? [i.s] : []));
			m.line = monthLine(at(m.items[0]), sessions.length, DISCIPLINES.map((discipline) => ({ discipline, n: sessions.filter((s) => s.discipline === discipline).length })), now);
		}
		return out;
	});
	let openMonths = $state<string[] | null>(null);
	const isMonthOpen = (k: string) => (openMonths ? openMonths.includes(k) : k === months[0]?.key);
	const toggleMonth = (k: string) => {
		const open = months.filter((m) => isMonthOpen(m.key)).map((m) => m.key);
		openMonths = open.includes(k) ? open.filter((x) => x !== k) : [...open, k];
	};

	const planById = (id: string) => data.plans.find((x) => x.id === id);
	const planName = (id: string) => planById(id)?.name ?? id;
	const titleOf = (s: SessionView) => routineTitle(planById(s.plan), s.workout.routine) ?? disciplineLabel(s.discipline);
	const exByName = (name: string): Exercise | undefined => data.plans.flatMap((p) => Object.values(p.routines).flat()).find((e) => e.name === name);
	const whenOf = (s: SessionView) => {
		const sets = s.rows.reduce((n, r) => n + r.sets.length, 0);
		const holds = sets > 0 && s.rows.every((r) => r.sets.every((m) => m.of === 'hold'));
		const walked = s.mode === 'live' && s.finishedAt ? Math.round((Date.parse(s.finishedAt) - Date.parse(s.at)) / 60000) : 0;
		return `${whenLabel(s.at, now)} · ${sessionSummary({ sets, holds, minutes: s.minutes || (walked > 0 && walked <= 240 ? walked : 0) })}${s.mode === 'after' ? ' · after' : ''}`;
	};
	const changeText = (c: WeekChange) => weekChangeLine({ programme: c.programme, blocks: c.blocks, goals: c.goals }, planName);

	// fixing the latest session: every set of every line as −/+ in place; one CorrectEntry per changed set when Done
	type EditSet = { item: string; index: number; ex?: Exercise; of: Measure['of']; weight: number; count: number; target?: number; was: Measure };
	let fixing = $state<string | null>(null);
	let edit = $state<EditSet[]>([]);
	function startFix(s: SessionView) {
		edit = [
			...s.rows.flatMap((row) => row.sets.map((m, i): EditSet => ({
				item: row.item, index: row.indices[i], ex: exByName(row.item), of: m.of, weight: loadOf(m), count: countOf(m),
				...(m.of === 'hold' && m.target !== undefined ? { target: m.target } : {}), was: m
			}))),
			...s.durations.map((d): EditSet => ({ item: d.item, index: d.index, of: 'duration', weight: 0, count: d.minutes, was: { of: 'duration', minutes: d.minutes } }))
		];
		fixing = s.id;
	}
	const bumpWeight = (e: EditSet, dir: 1 | -1) => (e.weight = e.ex?.kind === 'load' ? bumpLoad(e.ex, e.weight, dir) : Math.max(0, e.weight + dir * 5));
	const bumpReps = (e: EditSet, dir: 1 | -1) => {
		if (e.of === 'duration') e.count = Math.max(1, Math.min(600, e.count + dir * 5));
		else if (e.of === 'hold') e.count = Math.max(1, Math.min(600, e.count + dir * (e.ex?.kind === 'hold' && e.ex.progress.of === 'time' ? e.ex.progress.inc : 5)));
		else if (e.ex && e.ex.kind !== 'hold') e.count = bumpCount(e.ex, e.count, dir);
		else e.count = Math.max(1, Math.min(100, e.count + dir));
	};
	const measureOf = (e: EditSet): Measure => {
		switch (e.of) {
			case 'load': return { of: 'load', load: e.weight, reps: e.count };
			case 'reps': return { of: 'reps', reps: e.count };
			case 'hold': return { of: 'hold', seconds: e.count, ...(e.target !== undefined ? { target: e.target } : {}) };
			case 'duration': return { of: 'duration', minutes: e.count };
			case 'step': return { of: 'step' };
		}
	};
	let corrections = $derived(edit.map((e) => ({ item: e.item, index: e.index, measure: measureOf(e), was: e.was })).filter((c) => JSON.stringify(c.measure) !== JSON.stringify(c.was)).map(({ item, index, measure }) => ({ item, index, measure })));
	const valueOf = (e: EditSet) => (e.of === 'duration' ? `${e.count} min` : e.ex ? setValue(e.ex, e.weight, e.count) : e.of === 'hold' ? `${e.count}s` : e.of === 'load' ? `${e.weight} lb × ${e.count}` : `${e.count} reps`);
	let fixForm = $state<HTMLFormElement>();
	function doneFix() {
		if (corrections.length) fixForm?.requestSubmit();
		else fixing = null;
	}

	// Remove arms on the first tap and posts on the second
	let removing = $state<string | null>(null);
	function onWindowClick(e: MouseEvent) {
		if (removing && !(e.target as HTMLElement | null)?.closest('.remove')) removing = null;
	}
</script>

<svelte:window onclick={onWindowClick} />

<Caption>Ledger · last {GRID_WEEKS} weeks</Caption>
<div class="month" role="list" aria-label={grid.span}>
	{#each grid.weeks.flat() as c (c.key)}<Cell label={cellLabel(c)} done={c.did.length > 0} today={c.today} future={c.future} title="{c.label}: {c.did.map(disciplineLabel).join(', ') || 'nothing'}" />{/each}
</div>
<Note size="sm" tone="stone">{cellLegend(legend)}</Note>
<Title size="md">{paceLine(tally.done, tally.asked, tally.gaps)}</Title>

{#if form?.message}<Note tone="ink"><span class="err">{form.message}</span></Note>{/if}

{#if entries.length === 0}
	<Card tone="quiet"><Note>Nothing logged yet. Start from Today.</Note></Card>
{/if}

<div class="list">
	{#each months as m (m.key)}
		<Row label={m.line} right={isMonthOpen(m.key) ? '▾' : '▸'} onclick={() => toggleMonth(m.key)} expanded={isMonthOpen(m.key)} />
		{#if isMonthOpen(m.key)}
			{#each m.items as it (it.kind === 'session' ? it.s.id : it.c.at)}
				{#if it.kind === 'change'}
					<div class="change"><span class="rule"></span><Note size="sm" tone="stone">{it.c.dateLabel} · {changeText(it.c)}</Note><span class="rule"></span></div>
				{:else}
					{@const s = it.s}
					{@const latest = s.id === data.latestSession}
					{@const open = fixing === s.id}
					<Card tone={latest ? 'ink' : 'quiet'}>
						<div class="shead">
							<Title size="sm">{titleOf(s)}{#if !s.finished}<span class="live"> · in progress</span>{/if}</Title>
							<Note size="sm" tone="stone">{whenOf(s)}</Note>
						</div>
						{#if open}
							<form method="POST" action="?/correct" bind:this={fixForm} class="fix" use:enhance={() => async ({ update, result }) => { await update(); if (result.type === 'success') fixing = null; }}>
								<input type="hidden" name="session" value={s.id} />
								<input type="hidden" name="corrections" value={JSON.stringify(corrections)} />
								{#each edit as e, k (`${e.item}#${e.index}`)}
									{#if k === 0 || edit[k - 1].item !== e.item}<div class="line"><span class="lname">{e.item}</span></div>{/if}
									<div class="setline">
										<span class="slbl">{e.of === 'duration' ? 'Run' : e.of === 'hold' ? `Hold ${e.index}` : `Set ${e.index}`}</span>
										<span class="sval">{valueOf(e)}</span>
										<span class="sctl">
											{#if e.of === 'load'}<Stepper value="" size="pair" label="weight" onstep={(d) => bumpWeight(edit[k], d)} /><span class="x">×</span>{/if}
											<Stepper value="" size="pair" label={e.of === 'hold' ? 'seconds' : e.of === 'duration' ? 'minutes' : 'reps'} onstep={(d) => bumpReps(edit[k], d)} />
										</span>
									</div>
								{/each}
							</form>
						{:else}
							{#each s.rows as row (row.item)}
								<div class="line"><span class="lname">{row.item}</span><span class="lval">{setsLine(row.sets, exByName(row.item))}</span></div>
							{/each}
							{#each s.durations as d (d.index)}
								<div class="line"><span class="lname">{d.item}</span><span class="lval">{d.minutes} min</span></div>
							{/each}
							{#if s.prep}<Note size="sm" tone="stone">+ {s.prep} prep {s.prep === 1 ? 'step' : 'steps'}</Note>{/if}
						{/if}
						{#if latest}
							<div class="foot">
								{#if open}
									<button type="button" class="pill" onclick={doneFix}>{corrections.length ? `Save ${corrections.length} ${corrections.length === 1 ? 'fix' : 'fixes'}` : 'Done'}</button>
								{:else}
									<button type="button" class="pill" onclick={() => startFix(s)}>Fix a set</button>
									<form method="POST" action="?/remove" use:enhance>
										<input type="hidden" name="session" value={s.id} />
										{#if removing === s.id}
											<button type="submit" class="remove armed">Remove?</button>
										{:else}
											<button type="button" class="remove" onclick={() => (removing = s.id)}>Remove</button>
										{/if}
									</form>
								{/if}
							</div>
						{/if}
					</Card>
				{/if}
			{/each}
		{/if}
	{/each}
</div>

<style>
	.month { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
	.err { color: var(--signal); font-weight: 700; }
	.list { display: flex; flex-direction: column; gap: 10px; }
	.change { display: flex; align-items: center; gap: 10px; padding: 2px 4px; }
	.change :global(.note) { text-align: center; }
	.rule { flex: 1; border-top: 1px dashed var(--stone); }
	.shead { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
	.shead :global(.note) { white-space: nowrap; }
	.live { font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--slate); text-transform: uppercase; letter-spacing: var(--tracking-caps); }
	.line { display: flex; justify-content: space-between; align-items: center; gap: 8px; border-top: 1px solid var(--paper-2); padding-top: 6px; min-height: 32px; font-size: 14px; }
	.lname { font-weight: 700; }
	.lval { font-family: var(--font-mono); font-size: 12px; color: var(--slate); text-align: right; }
	.fix { display: flex; flex-direction: column; gap: 6px; }
	.setline { display: grid; grid-template-columns: 52px 1fr auto; align-items: center; gap: 8px; min-height: 40px; }
	.slbl { font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--stone); }
	.sval { font-family: var(--font-mono); font-size: 14px; font-weight: 800; }
	.sctl { display: inline-flex; align-items: center; gap: 6px; }
	.x { font-family: var(--font-mono); color: var(--stone); }
	.foot { display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding-top: 6px; }
	.pill {
		min-height: 36px; padding: 0 14px; border: 1.5px solid var(--ink); border-radius: var(--radius-pill); background: var(--white);
		font-family: var(--font-body); font-weight: 700; font-size: 13px; color: var(--ink); cursor: pointer; touch-action: manipulation;
	}
	.pill:hover { background: var(--volt-light); }
	.remove {
		min-height: 36px; padding: 0 14px; border: 1.5px solid var(--paper-3); border-radius: var(--radius-pill); background: none;
		font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--stone);
		cursor: pointer; touch-action: manipulation;
	}
	.remove:hover { color: var(--signal); border-color: var(--signal); }
	.remove.armed { color: var(--paper); background: var(--signal); border-color: var(--signal); }
</style>
