<script lang="ts">
	import { slide } from 'svelte/transition';
	import { durationMs } from '$lib/design/motion';
	import { setsLine, unitOf } from '$lib/domain/labels';
	import type { Trend } from '$lib/domain/projections';
	import type { Exercise } from '$lib/domain/plan';

	let {
		ex,
		trend,
		open = false,
		ontoggle
	}: { ex: Exercise; trend: Trend; open?: boolean; ontoggle: () => void } = $props();

	const unit = $derived(unitOf(ex));
	const mark = $derived(trend.tone === 'up' ? '↑' : trend.tone === 'down' ? '↓' : '—');
	const bars = $derived.by(() => {
		const loads = [...trend.points.map((p) => p.load), trend.next];
		const min = Math.min(...loads);
		const max = Math.max(...loads);
		const h = (v: number) => (max === min ? 12 : 5 + ((v - min) / (max - min)) * 15);
		return [
			...trend.points.map((p) => ({ h: h(p.load), kind: p.earned ? 'earned' : p.missed ? 'missed' : 'plain' })),
			{ h: h(trend.next), kind: 'next' }
		];
	});
	const recent = $derived([...trend.points].reverse());
	const OPEN = durationMs('--dur-med', 180);
</script>

<div class="row" class:open>
	<button type="button" class="hit" onclick={ontoggle} aria-expanded={open}>
		<span class="mark {trend.tone}" aria-label={trend.tone}>{mark}</span>
		<span class="name">{ex.name}</span>
		<span class="strip" aria-hidden="true">
			{#each bars as b, i (i)}<span class="bar {b.kind}" style="height: {b.h}px"></span>{/each}
		</span>
		<span class="now"><b>{trend.next}</b>{#if unit}<i>{unit}</i>{/if}</span>
	</button>
	{#if open}
		<div class="hist" transition:slide={{ duration: OPEN }}>
			<span class="sentence {trend.tone}">{trend.sentence}</span>
			{#each recent as p (p.at)}
				<div class="hrow">
					<span class="hdate">{p.dateLabel}</span>
					<span class="hsets">{setsLine(p.sets, ex)}{#if p.earned}<span class="up">↑</span>{/if}</span>
				</div>
			{/each}
			{#if !trend.points.length}
				<div class="more">Nothing logged yet.</div>
			{:else if trend.sessions > trend.points.length}
				<div class="more">{trend.sessions - trend.points.length} earlier — see the days below</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.row { border-top: 1px solid var(--border-soft); }
	.hit {
		width: 100%; min-height: 52px; padding: 6px 16px;
		display: grid; grid-template-columns: 28px 1fr auto auto; column-gap: 10px; align-items: center;
		background: transparent; border: none; text-align: left; font: inherit; color: var(--ink); cursor: pointer;
		transition: background var(--dur-med) var(--ease-snap);
	}
	.hit:hover { background: var(--volt-tint); }
	.row.open .hit { background: var(--paper-2); }
	.mark {
		display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 22px;
		font-family: var(--font-mono); font-size: 12px; font-weight: 800; color: var(--ink-3); border-radius: var(--radius-pill);
	}
	.mark.up { background: var(--volt); border: 1px solid var(--ink); color: var(--ink); }
	.mark.down { background: var(--white); border: 1px solid var(--danger); color: var(--danger); }
	.name { font-weight: var(--weight-bold); font-size: 15px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.strip { display: flex; align-items: flex-end; gap: 2px; height: 20px; }
	.bar { display: block; width: 5px; border-radius: 1px; background: var(--ink-3); }
	.bar.earned { background: var(--volt); border: 1px solid var(--ink); }
	.bar.missed { background: var(--white); border: 1px solid var(--danger); }
	.bar.next { background: var(--ink-2); opacity: 0.6; }
	.now { font-family: var(--font-mono); font-size: 15px; font-weight: 800; min-width: 44px; text-align: right; }
	.now i { font-style: normal; font-size: 11px; color: var(--ink-3); margin-left: 2px; }

	.hist { display: flex; flex-direction: column; padding: 2px 16px 12px 54px; background: var(--paper-2); }
	.sentence { font-family: var(--font-mono); font-size: 12px; color: var(--ink-2); line-height: 1.4; margin-bottom: 6px; }
	.sentence.flat { color: var(--ink-3); }
	.sentence.up { background: var(--volt-tint); align-self: flex-start; padding: 1px 6px; border-radius: 4px; color: var(--ink); }
	.hrow { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-top: 1px solid var(--border-soft); }
	.hdate { font-family: var(--font-mono); font-size: 12px; font-weight: 700; white-space: nowrap; }
	.hsets { font-family: var(--font-mono); font-size: 12px; color: var(--ink-2); text-align: right; }
	.up { margin-left: 6px; background: var(--volt); border: 1px solid var(--ink); border-radius: var(--radius-pill); padding: 0 6px; font-weight: 700; color: var(--ink); }
	.more { font-size: 12px; color: var(--ink-3); padding-top: 8px; }
</style>
