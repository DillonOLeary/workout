<script lang="ts">
	import { setsLine } from '$lib/domain/projections';
	import type { Trend } from '$lib/domain/projections';
	import type { Exercise } from '$lib/domain/plan';

	/**
	 * One exercise over time: name · load strip · what the rule has queued,
	 * with the status sentence as the hero. Tap to expand this exercise's own
	 * session list in place — the trust surface stays in the table.
	 */
	let {
		ex,
		trend,
		open = false,
		ontoggle
	}: { ex: Exercise; trend: Trend; open?: boolean; ontoggle: () => void } = $props();

	const unit = $derived(ex.kind === 'load' ? 'lb' : ex.kind === 'hold' ? 's' : '');
	// plain divs, not SVG: one bar per session, normalised to this exercise's
	// own min/max over the window, plus the load the rule has queued next
	const bars = $derived.by(() => {
		const loads = [...trend.points.map((p) => p.load), trend.next];
		const min = Math.min(...loads);
		const max = Math.max(...loads);
		const h = (v: number) => (max === min ? 14 : 6 + ((v - min) / (max - min)) * 18);
		return [
			...trend.points.map((p) => ({ h: h(p.load), kind: p.earned ? 'earned' : p.missed ? 'missed' : 'plain' })),
			{ h: h(trend.next), kind: 'next' }
		];
	});
	const recent = $derived([...trend.points].reverse());
</script>

<div class="row" class:open>
	<button type="button" class="hit" onclick={ontoggle} aria-expanded={open}>
		<span class="name">{ex.name}</span>
		<span class="strip" aria-hidden="true">
			{#each bars as b, i (i)}<span class="bar {b.kind}" style="height: {b.h}px"></span>{/each}
		</span>
		<span class="now"><b>{trend.next}</b>{#if unit}<i>{unit}</i>{/if}</span>
		<span class="sentence {trend.tone}">{trend.sentence}</span>
	</button>
	{#if open}
		<div class="hist">
			{#each recent as p (p.at)}
				<div class="hrow">
					<span class="hdate">{p.dateLabel}</span>
					<span class="hsets">{setsLine(p.sets, ex)}{#if p.earned}<span class="up">↑</span>{/if}</span>
				</div>
			{/each}
			{#if !trend.points.length}
				<div class="more">Nothing logged yet.</div>
			{:else if trend.sessions > trend.points.length}
				<div class="more">{trend.sessions - trend.points.length} earlier — see By day</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.row { border-top: 1px solid var(--border-soft); }
	.row:first-child { border-top: none; }
	.hit {
		width: 100%; min-height: 64px; padding: 10px 16px;
		display: grid; grid-template-columns: 1fr auto auto; grid-template-areas: 'name strip now' 'sent sent sent';
		column-gap: 14px; row-gap: 4px; align-items: center;
		background: transparent; border: none; text-align: left; font: inherit; color: var(--ink); cursor: pointer;
	}
	.hit:hover { background: var(--volt-tint); }
	.row.open .hit { background: var(--surface-sunken); }
	.name { grid-area: name; font-weight: var(--weight-bold); font-size: 15px; min-width: 0; }
	.strip { grid-area: strip; display: flex; align-items: flex-end; gap: 2px; height: 24px; }
	.bar { display: block; width: 5px; border-radius: 1px; background: var(--ink-3); }
	.bar.earned { background: var(--volt); border: 1px solid var(--ink); }
	.bar.missed { background: var(--white); border: 1px solid var(--danger); }
	.bar.next { background: var(--ink-2); opacity: 0.6; }
	.now { grid-area: now; font-family: var(--font-mono); font-size: 16px; font-weight: 800; min-width: 44px; text-align: right; }
	.now i { font-style: normal; font-size: 11px; color: var(--ink-3); margin-left: 2px; }
	.sentence { grid-area: sent; font-family: var(--font-mono); font-size: 12px; color: var(--ink-2); line-height: 1.4; }
	.sentence.flat { color: var(--ink-3); }
	.sentence.up { background: var(--volt-tint); display: inline-block; padding: 1px 6px; border-radius: 4px; color: var(--ink); justify-self: start; }
	.sentence.down, .sentence.warn { color: var(--ink-2); }

	.hist { padding: 4px 16px 12px; background: var(--surface-sunken); }
	.hrow { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-top: 1px solid var(--border-soft); }
	.hdate { font-family: var(--font-mono); font-size: 12px; font-weight: 700; white-space: nowrap; }
	.hsets { font-family: var(--font-mono); font-size: 12px; color: var(--ink-2); text-align: right; }
	.up { margin-left: 6px; background: var(--volt); border: 1px solid var(--ink); border-radius: var(--radius-pill); padding: 0 6px; font-weight: 700; color: var(--ink); }
	.more { font-size: 12px; color: var(--ink-3); padding-top: 8px; }
</style>
