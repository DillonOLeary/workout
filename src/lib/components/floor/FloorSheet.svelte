<script module lang="ts">
	/**
	 * The session by section: what the ⋯ shows. One row per section — the
	 * warm-up, each exercise, the cooldown, or the run — never the sets: the
	 * sheet is for finding your place, the floor is for the set. A row says
	 * "done" when the whole section is, else how far in; tapping jumps there.
	 */
	export type SheetSection = { title: string; status: string; active: boolean; done: boolean; jump: number };
</script>

<script lang="ts">
	import type { Exercise } from '$lib/domain/plan';

	/**
	 * The ⋯ sheet: the list is where you look, the floor is where you are.
	 * Reference material (the technique note), the session as a short list
	 * of sections, keyboard hints, and the rare acts — finishing early,
	 * leaving. None of it competes with the primary on the floor itself.
	 */
	let {
		open,
		title,
		ex,
		cue,
		sections,
		current,
		logged,
		total,
		allDone,
		onJump,
		onFinishEarly,
		onExit,
		onClose
	}: {
		open: boolean;
		title: string;
		ex?: Exercise;
		cue?: string;
		sections: SheetSection[];
		current: number;
		logged: number;
		total: number;
		allDone: boolean;
		onJump: (i: number) => void;
		onFinishEarly: () => void;
		onExit: () => void;
		onClose: () => void;
	} = $props();

	let confirming = $state(false);
	$effect(() => {
		if (!open) confirming = false;
	});
</script>

{#if open}
	<button type="button" class="scrim" aria-label="Close" onclick={onClose}></button>
	<div class="sheet" role="dialog" aria-modal="true" aria-label="The session, and session actions">
		<div class="tophead">
			<span class="caps">{title}</span>
			<button type="button" class="close" onclick={onClose} aria-label="Close">×</button>
		</div>
		{#if ex}
			<section>
				<p class="equip">{ex.equip}{ex.kind === 'load' && ex.each ? ' · weight is per hand' : ''}</p>
				{#if ex.note}<p class="note">{ex.note}</p>{/if}
			</section>
		{:else if cue}
			<section><p class="note">{cue}</p></section>
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
		<section class="kbd-only">
			<div class="caps">Keyboard</div>
			<p class="note mono">↑↓ value · ←→ step · 1–9 reps · Enter log / start · Esc closes this</p>
		</section>
		<section class="actions">
			{#if !allDone}
				{#if confirming}
					<div class="confirm">
						<span class="ctext">Finish with {logged} / {total} sets logged?</span>
						<div class="cbtns">
							<button type="button" class="cyes" onclick={onFinishEarly}>Finish now</button>
							<button type="button" class="cno" onclick={() => (confirming = false)}>Cancel</button>
						</div>
					</div>
				{:else}
					<button type="button" class="arow" onclick={() => (confirming = true)}>
						Finish early — {logged} / {total} sets logged
					</button>
				{/if}
			{/if}
			<button type="button" class="arow" onclick={onExit}>Pause and go back — the session stays open</button>
		</section>
		<div class="backrow">
			<button type="button" class="back" onclick={onClose}>Back to step {current + 1}</button>
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

	/* the section list: one row each, the exercises you already know about plus
	   warm-up and cooldown — never the sets. "done" is the only tick there is. */
	.list {
		display: flex; flex-direction: column; margin-top: 4px;
		background: var(--white); border: 1px solid var(--border-soft); border-radius: var(--radius-lg); overflow: hidden;
	}
	.secrow {
		width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 12px;
		min-height: 48px; padding: 0 14px;
		background: transparent; border: none; border-top: 1px solid var(--border-soft);
		font: inherit; color: var(--ink); text-align: left; cursor: pointer;
	}
	.secrow:first-child { border-top: none; }
	.secrow:hover { filter: brightness(0.97); }
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
	/* the way back: ink with volt text — an advance, never a second volt fill */
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
