<script lang="ts">
	import { enhance } from '$app/forms';
	import Badge from '$lib/components/Badge.svelte';
	import Card from '$lib/components/Card.svelte';
	import MonthGrid from '$lib/components/MonthGrid.svelte';
	import SheetPage from '$lib/components/SheetPage.svelte';
	import { disciplineLabel, fmtShort, monthLine, sessionSummary, setsLine, weekChangeLine, weekSentence } from '$lib/domain/labels';
	import { countOf, loadOf, uniformLoad, type Measure } from '$lib/domain/measure';
	import { DISCIPLINES, disciplinesOf, routineTitle, type Discipline, type Exercise } from '$lib/domain/plan';
	import { anySetEarned, bumpCount, bumpLoad } from '$lib/domain/progression';
	import { GRID_WEEKS, monthGrid, projectSessions, weekChanges, weekTally, type SessionRow, type SessionView, type WeekChange } from '$lib/domain/projections';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const now = Date.now();

	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let grid = $derived(monthGrid(data.events, now));
	let tally = $derived(weekTally(data.events, plan, now));
	let entries = $derived(projectSessions(data.events));
	// the legend: what the week asks for, plus anything you did that it doesn't
	let legend = $derived.by(() => {
		const out = disciplinesOf(plan);
		for (const s of entries) if (!out.includes(s.discipline)) out.push(s.discipline);
		return out;
	});

	let removing = $state<string | null>(null);
	function onWindowClick(e: MouseEvent) {
		if (removing && !(e.target as HTMLElement | null)?.closest('.remove')) removing = null;
	}

	let changes = $derived(weekChanges(data.events));
	type Item = { kind: 'session'; s: SessionView } | { kind: 'change'; c: WeekChange };
	type Month = { key: string; line: string; items: Item[] };
	// a month is the fold: its line is the monthly view, its items the daily one — the newest month open, the rest one line each
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
			const counts = DISCIPLINES.map((discipline) => ({ discipline, n: sessions.filter((s) => s.discipline === discipline).length }));
			m.line = monthLine(at(m.items[0]), sessions.length, counts, now);
		}
		return out;
	});
	let openMonths = $state<string[] | null>(null);
	const isMonthOpen = (k: string) => (openMonths ? openMonths.includes(k) : k === months[0]?.key);
	const toggleMonth = (k: string) => {
		const open = months.filter((m) => isMonthOpen(m.key)).map((m) => m.key);
		openMonths = open.includes(k) ? open.filter((x) => x !== k) : [...open, k];
	};
	let sinceLine = $derived(
		entries.length
			? `${entries.length} ${entries.length === 1 ? 'session' : 'sessions'} since ${fmtShort(entries[entries.length - 1].at)}`
			: ''
	);

	let opened = $state<string | null | undefined>(undefined);
	const isOpen = (id: string) => (opened === undefined ? id === data.latestSession : opened === id);
	function toggleSession(id: string) {
		const shut = isOpen(id);
		opened = shut ? null : id;
		if (shut) editingRow = null;
	}
	const summaryOf = (s: SessionView) => {
		const sets = s.rows.reduce((n, r) => n + r.sets.length, 0);
		const holds = sets > 0 && s.rows.every((r) => r.sets.every((m) => m.of === 'hold'));
		const walked = s.mode === 'live' && s.finishedAt ? Math.round((Date.parse(s.finishedAt) - Date.parse(s.at)) / 60000) : 0;
		return sessionSummary({ sets, holds, minutes: s.minutes || (walked > 0 && walked <= 240 ? walked : 0) });
	};

	const exByName = (name: string): Exercise | undefined =>
		data.plans.flatMap((p) => Object.values(p.routines).flat()).find((e) => e.name === name);
	const planName = (id: string) => data.plans.find((x) => x.id === id)?.name ?? id;
	const planById = (id: string) => data.plans.find((x) => x.id === id);
	const titleOf = (s: SessionView) => routineTitle(planById(s.plan), s.workout.routine) ?? disciplineLabel(s.discipline);
	const restText = (c: WeekChange) => {
		const t = weekChangeLine({ blocks: c.blocks, goals: c.goals }, planName);
		return t ? `${c.programme ? ' · ' : ''}${t}` : '';
	};

	type EditSet = { item: string; index: number; ex?: Exercise; of: Measure['of']; weight: number; count: number; target?: number };
	let editingRow = $state<string | null>(null);
	let edit = $state<EditSet[]>([]);
	let original = $state<Measure[]>([]);
	let uniform = $state(false);

	function openRow(s: SessionView, row: SessionRow) {
		const key = `${s.id}:${row.item}`;
		if (editingRow === key) return (editingRow = null);
		const ex = exByName(row.item);
		original = row.sets;
		uniform = row.sets[0]?.of === 'load' && uniformLoad(row.sets);
		// the set number the entry was logged as — a skipped set 1 must not shift the rest
		edit = row.sets.map((m, i) => ({
			item: row.item, index: row.indices[i], ex, of: m.of, weight: loadOf(m), count: countOf(m),
			...(m.of === 'hold' && m.target !== undefined ? { target: m.target } : {})
		}));
		editingRow = key;
	}
	function openRun(s: SessionView) {
		const key = `${s.id}:run`;
		if (editingRow === key) return (editingRow = null);
		original = s.durations.map((d) => ({ of: 'duration', minutes: d.minutes }));
		uniform = false;
		edit = s.durations.map((d) => ({ item: d.item, index: d.index, of: 'duration', weight: 0, count: d.minutes }));
		editingRow = key;
	}
	const stepWeight = (e: EditSet, dir: 1 | -1) => (e.ex?.kind === 'load' ? bumpLoad(e.ex, e.weight, dir) : Math.max(0, e.weight + dir * 5));
	const bumpWeight = (e: EditSet, dir: 1 | -1) => (e.weight = stepWeight(e, dir));
	const bumpAll = (dir: 1 | -1) => {
		const w = stepWeight(edit[0], dir);
		for (const e of edit) e.weight = w;
	};
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
	let corrections = $derived(
		edit
			.map((e, i) => ({ item: e.item, index: e.index, measure: measureOf(e), was: original[i] }))
			.filter((c) => JSON.stringify(c.measure) !== JSON.stringify(c.was))
			.map(({ item, index, measure }) => ({ item, index, measure }))
	);
	const unitOf = (e: EditSet) => (e.of === 'hold' ? 's' : e.of === 'duration' ? ' min' : ' reps');
	const weightUnit = (e: EditSet) => (e.ex?.kind === 'load' && e.ex.progress.each ? '/hand' : 'lb');
	const labelOf = (e: EditSet) => (e.of === 'duration' ? 'Run' : e.of === 'hold' ? `Hold ${e.index}` : `Set ${e.index}`);
</script>

<svelte:window onclick={onWindowClick} />

<SheetPage title="How it's going" sub="{tally.done} of {tally.asked} this week · last {GRID_WEEKS} weeks" back="/" backLabel="Today">
	{#if form?.message}
		<p class="err">{form.message}</p>
	{/if}

	<div class="cal"><MonthGrid {grid} /></div>
	<div class="legend">
		{#each legend as d (d)}
			<span class="lkey"><span class="lsw ink-{d}"></span>{disciplineLabel(d).toLowerCase()}</span>
		{/each}
	</div>
	<p class="answer">{weekSentence(tally.done, tally.asked, tally.gaps)}</p>

	<section class="sect">
		<div class="sechead">
			<span class="caps">What I did</span>
			<span class="meta">{sinceLine}</span>
		</div>

		{#if entries.length === 0}
			<Card><div class="empty">Nothing logged yet. Start from Today.</div></Card>
		{/if}

		{#snippet stepper(value: number, unit: string, less: () => void, more: () => void, wide = false)}
			<span class="ctl">
				<button type="button" class="pm" aria-label="Less" onclick={less}>−</button>
				<span class="num" class:wide>{value}<span class="unit">{unit}</span></span>
				<button type="button" class="pm" aria-label="More" onclick={more}>+</button>
			</span>
		{/snippet}

		{#snippet editor(s: SessionView)}
			<form
				method="POST"
				action="?/correct"
				class="editor"
				use:enhance={() =>
					async ({ update, result }) => {
						await update();
						if (result.type === 'success') editingRow = null;
					}}
			>
				<input type="hidden" name="session" value={s.id} />
				<input type="hidden" name="corrections" value={JSON.stringify(corrections)} />
				{#if uniform && edit[0]}
					<span class="elbl">Weight · all sets</span>
					{@render stepper(edit[0].weight, ` ${weightUnit(edit[0])}`, () => bumpAll(-1), () => bumpAll(1), true)}
					<span class="edivider"></span>
				{/if}
				{#each edit as e, i (e.index)}
					<span class="elbl">{labelOf(e)}</span>
					<span class="ectls">
						{#if e.of === 'load' && !uniform}
							{@render stepper(e.weight, ` ${weightUnit(e)}`, () => bumpWeight(edit[i], -1), () => bumpWeight(edit[i], 1), true)}
							<span class="times">×</span>
						{/if}
						{@render stepper(e.count, unitOf(e), () => bumpReps(edit[i], -1), () => bumpReps(edit[i], 1))}
					</span>
				{/each}
				<div class="ebtns">
					<button type="submit" class="esave" disabled={!corrections.length}>Save</button>
					<button type="button" class="ecancel" onclick={() => (editingRow = null)}>Cancel</button>
				</div>
			</form>
		{/snippet}

		<div class="list">
			{#each months as m (m.key)}
			<button type="button" class="mdiv" class:shut={!isMonthOpen(m.key)} onclick={() => toggleMonth(m.key)} aria-expanded={isMonthOpen(m.key)}>
				<span class="mtri">{isMonthOpen(m.key) ? '▾' : '▸'}</span>
				<span class="mtext">{m.line}</span>
			</button>
			{#if isMonthOpen(m.key)}
			{#each m.items as it (it.kind === 'session' ? it.s.id : it.c.at)}
				{#if it.kind === 'change'}
					<div class="wchange">
						<span class="wrule"></span>
						<span class="wtext">{it.c.dateLabel} · {#if it.c.programme}switched to <b>{planName(it.c.programme)}</b>{/if}{restText(it.c)}</span>
						<span class="wrule"></span>
					</div>
				{:else}
					{@const s = it.s}
					{@const latest = s.id === data.latestSession}
					{@const open = isOpen(s.id)}
					<Card pad={false} interactive={latest}>
						<button type="button" class="shead" class:open={open && latest} onclick={() => toggleSession(s.id)} aria-expanded={open}>
							<span class="date">{s.dateLabel}</span>
							<span class="sum">{summaryOf(s)}</span>
							<span class="ttl">
								{titleOf(s)}{#if s.mode === 'after'}<span class="after"> · after</span>{/if}
								{#if !s.finished}<Badge tone="open">In progress</Badge>{/if}
							</span>
						</button>
						{#if open}
							{#each s.rows as row (row.item)}
								{@const ex = exByName(row.item)}
								{@const lvl = ex ? anySetEarned(row.sets, ex) : false}
								{@const key = `${s.id}:${row.item}`}
								{#if latest}
									<button type="button" class="srow tap" class:opened={editingRow === key} onclick={() => openRow(s, row)} aria-expanded={editingRow === key}>
										<span class="exname">{row.item}{#if lvl}<span class="uppill">↑</span>{/if}</span>
										<span class="val">{setsLine(row.sets, ex)}</span>
									</button>
									{#if editingRow === key}{@render editor(s)}{/if}
								{:else}
									<div class="srow">
										<span class="exname">{row.item}{#if lvl}<span class="uppill">↑</span>{/if}</span>
										<span class="val">{setsLine(row.sets, ex)}</span>
									</div>
								{/if}
							{/each}
							{#each s.durations as d (d.index)}
								{#if latest}
									<button type="button" class="srow tap" class:opened={editingRow === `${s.id}:run`} onclick={() => openRun(s)} aria-expanded={editingRow === `${s.id}:run`}>
										<span class="exname">{d.item}</span>
										<span class="val">{d.minutes} min</span>
									</button>
								{:else}
									<div class="srow">
										<span class="exname">{d.item}</span>
										<span class="val">{d.minutes} min</span>
									</div>
								{/if}
							{/each}
							{#if latest && editingRow === `${s.id}:run`}{@render editor(s)}{/if}
							{#if latest}
								<div class="cfoot">
									<span class="prepline">{s.prep ? `+ ${s.prep} prep ${s.prep === 1 ? 'step' : 'steps'} · ` : ''}tap a line to fix it</span>
									<form method="POST" action="?/remove" use:enhance>
										<input type="hidden" name="session" value={s.id} />
										{#if removing === s.id}
											<button type="submit" class="remove armed">Remove?</button>
										{:else}
											<button type="button" class="remove" onclick={() => (removing = s.id)}>Remove</button>
										{/if}
									</form>
								</div>
							{:else if s.prep}
								<div class="prepline pad">+ {s.prep} prep {s.prep === 1 ? 'step' : 'steps'} — warm-up, cooldown</div>
							{/if}
						{/if}
					</Card>
				{/if}
			{/each}
			{/if}
			{/each}
		</div>
	</section>
</SheetPage>

<style>
	.caps {
		font-size: 12px; font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps);
		text-transform: uppercase; color: var(--ink-3);
	}
	.sect { display: flex; flex-direction: column; gap: 10px; }
	.sechead { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
	.meta { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); }
	.err { margin: 0; color: var(--danger); font-weight: var(--weight-bold); font-size: var(--text-sm); }
	.empty { font-size: 16px; color: var(--ink-2); }

	.cal { display: flex; justify-content: center; }
	.cal :global(.cal) { width: 100%; }
	.legend { display: flex; gap: 12px; flex-wrap: wrap; font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); }
	.lkey { display: inline-flex; align-items: center; gap: 5px; }
	.lsw { width: 10px; height: 10px; border-radius: 2px; border: 1px solid var(--ink); }
	.answer { margin: 0; font-size: 15px; line-height: 1.5; color: var(--ink); }

	.list { display: flex; flex-direction: column; gap: 8px; }
	.mdiv {
		display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 4px 4px;
		background: transparent; border: none; cursor: pointer; text-align: left; touch-action: manipulation;
		font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: var(--tracking-caps); color: var(--ink);
		border-radius: var(--radius-sm); transition: background var(--dur-med) var(--ease-snap);
	}
	.mdiv:hover { background: var(--volt-tint); }
	.mdiv.shut { color: var(--ink-3); }
	.mdiv.shut .mtext { border-bottom: 1px dashed var(--ink-3); }
	.mtri { font-size: 12px; flex: none; }
	.mtext { padding: 6px 0; }
	.wchange { display: flex; align-items: center; gap: 10px; padding: 6px 4px; }
	.wrule { flex: 1; border-top: 1px dashed var(--ink-3); }
	.wtext { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); text-align: center; }
	.wtext b { color: var(--ink); }
	.shead {
		width: 100%;
		display: grid; grid-template-columns: auto 1fr; grid-template-areas: 'date sum' 'ttl ttl';
		column-gap: 10px; row-gap: 2px; align-items: center;
		min-height: 56px; padding: 10px 16px;
		background: transparent; border: none; font: inherit; color: inherit; text-align: left;
		cursor: pointer; touch-action: manipulation; border-radius: var(--radius-lg);
		transition: background var(--dur-med) var(--ease-snap);
	}
	.shead:hover { background: var(--volt-tint); }
	.shead.open { background: var(--paper-2); border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
	.date { grid-area: date; font-family: var(--font-mono); font-weight: var(--weight-bold); font-size: 15px; white-space: nowrap; }
	.sum { grid-area: sum; font-family: var(--font-mono); font-size: 12px; color: var(--ink-3); text-align: right; white-space: nowrap; }
	.ttl { grid-area: ttl; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-weight: var(--weight-bold); font-size: 15px; }
	.after { font-family: var(--font-mono); font-size: 11px; font-weight: 400; color: var(--ink-3); }
	.srow {
		display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center;
		width: 100%; min-height: 44px; padding: 10px 16px; border-top: 1px solid var(--border-soft);
	}
	.tap {
		background: transparent; border-left: none; border-right: none; border-bottom: none;
		font: inherit; color: inherit; text-align: left; cursor: pointer; touch-action: manipulation;
		transition: background var(--dur-med) var(--ease-snap);
	}
	.tap:hover { background: var(--volt-tint); }
	.tap.opened { background: var(--paper-2); }
	.tap.opened .val { color: var(--ink); font-weight: 800; }
	.exname { font-weight: var(--weight-bold); font-size: 15px; }
	.uppill {
		margin-left: 8px; background: var(--volt); border: 1px solid var(--ink); border-radius: var(--radius-pill);
		padding: 0 7px; font-size: 12px; font-weight: var(--weight-bold);
	}
	.val { font-family: var(--font-mono); font-size: 14px; color: var(--ink-2); text-align: right; }
	.prepline { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); }
	.prepline.pad { padding: 8px 16px 12px; border-top: 1px solid var(--border-soft); }
	.cfoot {
		display: flex; justify-content: space-between; align-items: center; gap: 12px;
		padding: 8px 8px 8px 16px; background: var(--paper-2); border-top: 1px solid var(--border-soft);
		border-radius: 0 0 var(--radius-lg) var(--radius-lg);
	}
	.remove {
		min-height: 40px; padding: 0 14px;
		background: transparent; border: 1px solid var(--border-soft); border-radius: var(--radius-pill);
		font-family: var(--font-body); font-size: 12px; font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps);
		text-transform: uppercase; color: var(--ink-3); cursor: pointer;
		transition: background var(--dur-med) var(--ease-snap), color var(--dur-med) var(--ease-snap);
	}
	.remove:hover { color: var(--danger); border-color: var(--danger); }
	.remove.armed { color: var(--paper); background: var(--danger); border-color: var(--danger); }

	.editor {
		display: grid; grid-template-columns: auto 1fr; column-gap: 12px; row-gap: 2px; align-items: center;
		padding: 0 16px 12px; background: var(--paper-2);
	}
	.elbl { font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-3); }
	.edivider { grid-column: 1 / -1; border-top: 1px solid var(--border-soft); margin: 4px 0; }
	.ectls { display: inline-flex; align-items: center; gap: 8px; justify-self: end; flex-wrap: wrap; justify-content: flex-end; }
	.ctl { display: inline-flex; align-items: center; gap: 2px; justify-self: end; }
	.pm {
		width: 44px; min-height: 44px;
		background: transparent; border: none; border-radius: var(--radius-sm);
		font-family: var(--font-mono); font-size: 20px; font-weight: 700; color: var(--ink-2); cursor: pointer;
		touch-action: manipulation;
	}
	.pm:hover { background: var(--volt-tint); }
	.num { font-family: var(--font-mono); font-weight: 800; font-size: 18px; min-width: 72px; text-align: center; }
	.num.wide { min-width: 88px; }
	.unit { font-size: 12px; font-weight: 700; color: var(--ink-3); }
	.times { font-family: var(--font-mono); color: var(--ink-3); }
	.ebtns { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; margin-top: 8px; }
	.esave {
		flex: 1; min-height: 48px;
		background: var(--volt); color: var(--ink);
		border: var(--border-w) solid var(--ink); border-radius: var(--radius-md); box-shadow: var(--shadow-raised);
		font-family: var(--font-body); font-weight: var(--weight-bold); font-size: 15px;
		cursor: pointer; touch-action: manipulation;
	}
	.esave:disabled { opacity: 0.4; cursor: default; }
	.ecancel {
		min-height: 48px; padding: 0 12px; background: none; border: none; cursor: pointer;
		font-family: var(--font-body); font-size: 15px; font-weight: var(--weight-bold); color: var(--ink-2);
		text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--border-soft);
	}
</style>
