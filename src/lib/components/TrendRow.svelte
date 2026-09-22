<script lang="ts">
	import { slide } from 'svelte/transition';
	import { durationMs } from '$lib/design/motion';
	import { setsLine, unitLabel } from '$lib/domain/labels';
	import type { Trend } from '$lib/domain/projections';
	import type { Exercise } from '$lib/domain/plan';

	/** one exercise, one line: where the rule has it now and what it will do next; tap for the sessions behind the sentence */
	let {
		ex,
		trend,
		open = false,
		ontoggle
	}: { ex: Exercise; trend: Trend; open?: boolean; ontoggle: () => void } = $props();

	const MARK: Record<Trend['tone'], string> = { up: '▲', down: '▼', warn: '!', flat: '—', start: '·' };
	const recent = $derived([...trend.points].reverse());
	const OPEN = durationMs('--dur-med', 180);
</script>

<div class="row" class:open>
	<button type="button" class="hit" onclick={ontoggle} aria-expanded={open}>
		<span class="mark {trend.tone}" aria-label={trend.tone}>{MARK[trend.tone]}</span>
		<span class="name">{ex.name}</span>
		<span class="line">{unitLabel(trend.next, ex)} · {trend.sentence}</span>
	</button>
	{#if open}
		<div class="hist" transition:slide={{ duration: OPEN }}>
			{#each recent as p (p.at)}
				<div class="hrow">
					<span class="hdate">{p.dateLabel}</span>
					<span class="hsets">{setsLine(p.sets, ex)}{#if p.earned}<span class="up">↑</span>{/if}</span>
				</div>
			{/each}
			{#if !trend.points.length}
				<div class="more">Nothing logged yet.</div>
			{:else if trend.sessions > trend.points.length}
				<div class="more">{trend.sessions - trend.points.length} earlier — in How it's going</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.row { border-top: 1px solid var(--border-soft); }
	.row:first-child { border-top: none; }
	.hit {
		width: 100%; padding: 9px 12px;
		display: grid; grid-template-columns: 18px 1fr; column-gap: 10px; row-gap: 2px; align-items: baseline;
		background: transparent; border: none; text-align: left; font: inherit; color: var(--ink); cursor: pointer;
		transition: background var(--dur-med) var(--ease-snap);
	}
	.hit:hover { background: var(--volt-tint); }
	.row.open .hit { background: var(--paper-2); }
	.mark { font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--ink-2); }
	.mark.up { color: var(--ink); }
	.mark.down, .mark.warn { color: var(--danger); }
	.name { font-weight: var(--weight-bold); font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.line { grid-column: 2; font-family: var(--font-mono); font-size: 11px; color: var(--ink-2); line-height: 1.4; }
	.hist { display: flex; flex-direction: column; padding: 2px 12px 10px 40px; background: var(--paper-2); }
	.hrow { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-top: 1px solid var(--border-soft); }
	.hdate { font-family: var(--font-mono); font-size: 12px; font-weight: 700; white-space: nowrap; }
	.hsets { font-family: var(--font-mono); font-size: 12px; color: var(--ink-2); text-align: right; }
	.up { margin-left: 6px; background: var(--volt); border: 1px solid var(--ink); border-radius: var(--radius-pill); padding: 0 6px; font-weight: 700; color: var(--ink); }
	.more { font-size: 12px; color: var(--ink-3); padding-top: 8px; }
</style>
