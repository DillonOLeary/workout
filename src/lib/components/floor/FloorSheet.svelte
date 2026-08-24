<script lang="ts">
	import type { Exercise } from '$lib/domain/types';

	/**
	 * The ⋯ sheet: everything that is reference material or a rare act —
	 * technique note, warm-up, jump-to-exercise, keyboard shortcuts, finishing
	 * early, leaving. None of it competes with Log set on the floor itself.
	 * Finishing early is a real confirm that states the cost; the 3-second
	 * arming pill is gone (D5).
	 */
	let {
		open,
		ex,
		warmup,
		exercises,
		doneFor,
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
		ex: Exercise;
		warmup?: string;
		exercises: Exercise[];
		doneFor: (name: string) => number;
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
	<div class="sheet" role="dialog" aria-modal="true" aria-label="Exercise details and session actions">
		<div class="tophead">
			<span class="caps">{ex.name}</span>
			<button type="button" class="close" onclick={onClose} aria-label="Close">×</button>
		</div>
		<section>
			<p class="equip">{ex.equip}{ex.each ? ' · weight is per hand' : ''}</p>
			{#if ex.note}<p class="note">{ex.note}</p>{/if}
		</section>
		{#if warmup}
			<section>
				<div class="caps">Warm-up</div>
				<p class="note">{warmup}</p>
			</section>
		{/if}
		<section>
			<div class="caps">Jump to</div>
			<div class="jump">
				{#each exercises as e, i (e.name)}
					<button type="button" class="jrow" class:now={i === current} onclick={() => onJump(i)}>
						<span class="jname">{e.name}</span>
						<span class="jdone">{doneFor(e.name)}/{e.sets}</span>
					</button>
				{/each}
			</div>
		</section>
		<section class="kbd-only">
			<div class="caps">Keyboard</div>
			<p class="note mono">↑↓ value · ←→ exercise · 1–9 reps · Enter log / start · Esc closes this</p>
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
		max-height: 82svh; overflow-y: auto;
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

	.jump { display: flex; flex-direction: column; }
	.jrow {
		display: flex; justify-content: space-between; align-items: center; gap: 12px;
		min-height: 48px; padding: 0 10px;
		background: transparent; border: none; border-top: 1px solid var(--border-soft);
		font: inherit; color: var(--ink); text-align: left; cursor: pointer;
		border-radius: var(--radius-sm);
	}
	.jrow:first-child { border-top: none; }
	.jrow:hover { background: var(--volt-tint); }
	.jrow.now .jname { font-weight: var(--weight-bold); }
	.jrow.now { background: var(--surface-sunken); }
	.jname { font-size: 15px; }
	.jdone { font-family: var(--font-mono); font-size: 13px; color: var(--ink-3); }

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
	@media (hover: none) { .kbd-only { display: none; } }
</style>
