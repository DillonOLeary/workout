<script module lang="ts">
	/** one row of the ⋯ sheet: a section, never a set; `jump` is the step index a tap lands on */
	export type SheetSection = { title: string; status: string; active: boolean; done: boolean; jump: number };
</script>

<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { glyphFor } from '$lib/design/glyphs';
	import { frame, joints } from '$lib/design/rig';
	import { durationMs } from '$lib/design/motion';
	import { stamp } from '$lib/design/stamp';
	import { holdDose } from '$lib/domain/labels';
	import type { Exercise } from '$lib/domain/plan';

	let {
		open,
		title,
		ex,
		cue,
		figure,
		sections,
		stretches = [],
		backLabel,
		/** what Finish finishes: workout · practice · stretch · run */
		noun,
		logged,
		total,
		allDone,
		onJump,
		onAdd,
		onFinishEarly,
		onExit,
		onClose
	}: {
		open: boolean;
		title: string;
		ex?: Exercise;
		cue?: string;
		/** the figure on the floor right now — scrub its rep here, with the cue the rig wrote for it */
		figure?: string;
		sections: SheetSection[];
		/** the stretches not already in this session — one tap appends one as a section */
		stretches?: Exercise[];
		/** "Set 4/20" — where the way back lands */
		backLabel: string;
		noun: string;
		logged: number;
		total: number;
		allDone: boolean;
		onJump: (i: number) => void;
		onAdd?: (name: string) => void;
		onFinishEarly: () => void;
		onExit: () => void;
		onClose: () => void;
	} = $props();

	let confirming = $state(false);
	$effect(() => {
		if (!open) confirming = false;
	});
	const SLIDE = durationMs('--dur-slow', 320);
	const FADE = durationMs('--dur-med', 180);

	const SCRUB_PX = 120;
	let glyph = $derived(figure ? glyphFor(figure) : null);
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

{#if open}
	<button type="button" class="scrim" aria-label="Close" onclick={onClose} transition:fade={{ duration: FADE }}></button>
	<div
		class="sheet"
		role="dialog"
		aria-modal="true"
		aria-label="The session, and session actions"
		transition:fly={{ y: 80, duration: SLIDE, easing: (t) => 1 - Math.pow(1 - t, 4) }}
	>
		<div class="tophead">
			<span class="caps">{title}</span>
			<button type="button" class="close" onclick={onClose} aria-label="Close">×</button>
		</div>
		{#if ex}
			<section>
				<p class="equip">{ex.equip}{ex.kind === 'load' && ex.progress.each ? ' · weight is per hand' : ''}</p>
				{#if ex.note}<p class="note">{ex.note}</p>{/if}
			</section>
		{:else if cue}
			<section><p class="note">{cue}</p></section>
		{/if}
		{#if glyph}
			<section class="scrub">
				<canvas bind:this={scrubCanvas} class="scrubfig" aria-hidden="true"></canvas>
				<div class="scrubside">
					<span class="caps">Scrub the rep</span>
					<input type="range" min="0" max="1" step="0.01" bind:value={depth} aria-label="Depth of the movement" />
					<span class="scrubline">{glyph.name} · depth {Math.round(depth * 100)}% · <em>{glyph.cue}</em></span>
				</div>
			</section>
		{/if}
		<section>
			<div class="caps">The session</div>
			<div class="list">
				{#each sections as sec (sec.title)}
					<button type="button" class="secrow" class:now={sec.active} class:done={sec.done} onclick={() => onJump(sec.jump)}>
						<span class="sectitle">{sec.title}</span>
						<span class="secstatus">{sec.status}</span>
					</button>
				{/each}
			</div>
		</section>
		{#if stretches.length && onAdd}
			<section>
				<div class="caps">Add a stretch</div>
				<div class="list">
					{#each stretches as s (s.name)}
						<button type="button" class="secrow" onclick={() => onAdd(s.name)}>
							<span class="sectitle">{s.name}</span>
							<span class="secstatus">+ {holdDose(s)}</span>
						</button>
					{/each}
				</div>
			</section>
		{/if}
		<section class="kbd-only">
			<div class="caps">Keyboard</div>
			<p class="note mono">↑↓ value · ←→ step · 1–9 reps · Enter log / start · Esc closes this</p>
		</section>
		<section class="actions">
			{#if !allDone}
				{#if confirming}
					<div class="confirm">
						<span class="ctext">{total ? `Finish with ${logged} / ${total} sets logged?` : 'Finish now?'}</span>
						<div class="cbtns">
							<button type="button" class="cyes" onclick={onFinishEarly}>Finish now</button>
							<button type="button" class="cno" onclick={() => (confirming = false)}>Cancel</button>
						</div>
					</div>
				{:else}
					<button type="button" class="arow" onclick={() => (confirming = true)}>
						Finish {noun} early{total ? ` — ${logged} / ${total} sets logged` : ''}
					</button>
				{/if}
			{/if}
			<button type="button" class="arow" onclick={onExit}>Pause and go back — the session stays open</button>
		</section>
		<div class="backrow">
			<button type="button" class="back" onclick={onClose}>Back to {backLabel}</button>
		</div>
	</div>
{/if}

<style>
	.scrim {
		position: fixed; inset: 0; z-index: 70;
		background: rgba(26, 25, 21, 0.45);
		border: none; cursor: pointer; padding: 0;
	}
	.sheet {
		position: fixed; left: 0; right: 0; bottom: 0; z-index: 71;
		max-width: var(--content-max); margin: 0 auto;
		max-height: 88svh; overflow-y: auto;
		background: var(--paper);
		border: var(--border-w) solid var(--ink); border-bottom: none;
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		padding: 12px 16px calc(16px + env(safe-area-inset-bottom));
		display: flex; flex-direction: column; gap: 16px;
	}
	.tophead { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.close {
		width: 44px; height: 44px; flex: none;
		background: transparent; border: none; border-radius: var(--radius-md);
		font-family: var(--font-display); font-weight: 700; font-size: 24px; color: var(--ink-2);
		cursor: pointer;
	}
	.close:hover { background: var(--volt-tint); color: var(--ink); }
	.caps {
		font-size: 12px; font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-3);
	}
	section { display: flex; flex-direction: column; gap: 6px; }
	.equip { margin: 0; font-size: 13px; color: var(--ink-3); }
	.note { margin: 0; font-size: 14px; line-height: 1.5; color: var(--ink-2); }
	.note.mono { font-family: var(--font-mono); font-size: 12px; }

	.scrub {
		display: grid; grid-template-columns: auto 1fr; gap: 14px; align-items: center;
		padding: 12px 14px; background: var(--white); border: 1px solid var(--border-soft); border-radius: var(--radius-lg);
	}
	.scrubfig { width: 120px; height: 120px; display: block; background: var(--paper); border-radius: var(--radius-md); }
	.scrubside { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
	.scrub input { width: 100%; accent-color: var(--ink); }
	.scrubline { font-family: var(--font-mono); font-size: 12px; line-height: 1.45; color: var(--ink-2); }
	.scrubline em { font-style: normal; color: var(--ink-3); }

	.list {
		display: flex; flex-direction: column; margin-top: 4px;
		background: var(--white); border: 1px solid var(--border-soft); border-radius: var(--radius-lg); overflow: hidden;
	}
	.secrow {
		width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 12px;
		min-height: 48px; padding: 0 14px;
		background: transparent; border: none; border-top: 1px solid var(--border-soft);
		font: inherit; color: var(--ink); text-align: left; cursor: pointer;
		transition: background var(--dur-med) var(--ease-snap);
	}
	.secrow:first-child { border-top: none; }
	.secrow:hover { background: var(--volt-tint); }
	.secrow.now { background: var(--volt); }
	.secrow.now .sectitle { font-weight: var(--weight-bold); }
	.secrow.done .sectitle { color: var(--ink-3); }
	.sectitle { font-size: 15px; min-width: 0; }
	.secstatus { font-family: var(--font-mono); font-size: 13px; color: var(--ink-3); white-space: nowrap; }
	.secrow.done .secstatus { font-weight: 800; color: var(--ink-2); }

	.actions { gap: 8px; }
	.arow {
		min-height: 48px; padding: 0 14px; text-align: left;
		background: var(--white); border: 1px solid var(--border-soft); border-radius: var(--radius-md);
		font-family: var(--font-body); font-weight: var(--weight-bold); font-size: 14px; color: var(--ink-2);
		cursor: pointer; touch-action: manipulation;
	}
	.arow:hover { color: var(--ink); border-color: var(--ink); }
	.confirm {
		display: flex; flex-direction: column; gap: 10px;
		padding: 12px 14px; background: var(--white);
		border: 1px solid var(--ink); border-radius: var(--radius-md);
	}
	.ctext { font-weight: var(--weight-bold); font-size: 14px; }
	.cbtns { display: flex; gap: 8px; }
	.cyes {
		flex: 1; min-height: 48px;
		background: var(--ink); color: var(--volt);
		border: var(--border-w) solid var(--ink); border-radius: var(--radius-md);
		font-family: var(--font-body); font-weight: var(--weight-bold); font-size: 15px;
		cursor: pointer; touch-action: manipulation;
	}
	.cno {
		min-height: 48px; padding: 0 16px;
		background: var(--white); color: var(--ink-2);
		border: 1px solid var(--border-soft); border-radius: var(--radius-md);
		font-family: var(--font-body); font-weight: var(--weight-bold); font-size: 15px;
		cursor: pointer;
	}
	.backrow { position: sticky; bottom: 0; padding-top: 4px; background: var(--paper); }
	.back {
		width: 100%; min-height: 64px;
		background: var(--ink); color: var(--volt);
		border: var(--border-w) solid var(--ink); border-radius: var(--radius-lg);
		box-shadow: 0 4px 0 var(--ink-2);
		font-family: var(--font-display); font-weight: var(--weight-black); font-size: 20px;
		letter-spacing: 0.02em; text-transform: uppercase; cursor: pointer; touch-action: manipulation;
	}
	.back:active { transform: translateY(3px); box-shadow: var(--shadow-pressed); }
	@media (hover: none) { .kbd-only { display: none; } }
</style>
