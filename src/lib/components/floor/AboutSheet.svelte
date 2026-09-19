<script lang="ts">
	import Sheet from './Sheet.svelte';
	import { glyphFor } from '$lib/design/glyphs';
	import { frame, joints } from '$lib/design/rig';
	import { stamp } from '$lib/design/stamp';
	import { doseSentence, fmtDate, loadLine, ruleLine, setsLine } from '$lib/domain/labels';
	import type { Exercise } from '$lib/domain/plan';
	import type { HistoryEntry } from '$lib/domain/progression';

	/** what is this — everything the plan already knows about one exercise, and the rig's figure to scrub */
	let {
		open,
		name,
		ex,
		text,
		rest = 0,
		partOf = [],
		last = null,
		backLabel,
		onClose
	}: {
		open: boolean;
		name: string;
		ex?: Exercise;
		/** for a step that isn't an exercise: the routine's cue, the run's note */
		text?: string;
		rest?: number;
		/** the routines this exercise is part of */
		partOf?: string[];
		last?: HistoryEntry | null;
		backLabel: string;
		onClose: () => void;
	} = $props();

	const SCRUB_PX = 120;
	let glyph = $derived(glyphFor(name));
	let depth = $state(0.5);
	let scrubCanvas = $state<HTMLCanvasElement>();
	// the rig draws the depth on demand — a slider position is not one of the gear's stamps
	$effect(() => {
		const el = scrubCanvas, g = glyph, d = depth;
		if (!el || !g) return;
		const dpr = Math.min(2.5, window.devicePixelRatio || 1);
		el.width = el.height = Math.round(SCRUB_PX * dpr);
		const ink = getComputedStyle(el).getPropertyValue('--ink').trim() || '#1A1915';
		stamp(el.getContext('2d')!, frame(joints(g.figure, d)), SCRUB_PX, SCRUB_PX, dpr, ink);
	});
</script>

<Sheet {open} title={name} {backLabel} label="About {name}" {onClose}>
	{#if ex || text}
		<section>
			<div class="caps">How</div>
			{#if ex?.note ?? text}<p class="note">{ex?.note ?? text}</p>{/if}
			{#if ex}<p class="dose">{doseSentence(ex, rest)}.</p>{/if}
		</section>
	{/if}
	{#if glyph}
		<section class="scrub">
			<canvas bind:this={scrubCanvas} class="scrubfig" aria-hidden="true"></canvas>
			<div class="scrubside">
				<span class="caps">Scrub the rep</span>
				<input type="range" min="0" max="1" step="0.01" bind:value={depth} aria-label="Depth of the movement" />
				<span class="scrubline">depth {Math.round(depth * 100)}% · <em>{glyph.cue}</em></span>
			</div>
		</section>
	{/if}
	{#if ex && (ex.why || ex.tag || partOf.length)}
		<section>
			<div class="caps">Why it's here</div>
			<p class="note">
				{#if ex.tag}<b>{ex.tag}</b>{#if ex.why} · {/if}{/if}{ex.why ?? ''}
				{#if partOf.length}<span class="muted">{ex.why || ex.tag ? ' ' : ''}Part of {partOf.join(' and ')}.</span>{/if}
			</p>
		</section>
	{/if}
	{#if ex}
		<section>
			<div class="caps">The rule</div>
			<p class="note">{ruleLine(ex)} <span class="muted">{loadLine(ex)}</span></p>
		</section>
		{#if last}
			<section>
				<div class="caps">Last time</div>
				<p class="note mono">{fmtDate(last.at)} · {setsLine(last.sets, ex)}</p>
			</section>
		{/if}
	{/if}
</Sheet>

<style>
	.caps {
		font-size: 12px; font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-3);
	}
	section { display: flex; flex-direction: column; gap: 6px; }
	.note { margin: 0; font-size: 15px; line-height: 1.5; color: var(--ink); }
	.note b { font-weight: var(--weight-bold); }
	.note.mono { font-family: var(--font-mono); font-size: 13px; color: var(--ink-2); }
	.muted { color: var(--ink-3); }
	.dose { margin: 0; font-family: var(--font-mono); font-size: 13px; color: var(--ink-2); }
	.scrub {
		display: grid; grid-template-columns: auto 1fr; gap: 14px; align-items: center;
		padding: 12px 14px; background: var(--white); border: 1px solid var(--border-soft); border-radius: var(--radius-lg);
	}
	.scrubfig { width: 120px; height: 120px; display: block; background: var(--paper); border-radius: var(--radius-md); }
	.scrubside { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
	.scrub input { width: 100%; accent-color: var(--ink); }
	.scrubline { font-family: var(--font-mono); font-size: 12px; line-height: 1.45; color: var(--ink-2); }
	.scrubline em { font-style: normal; color: var(--ink-3); }
</style>
