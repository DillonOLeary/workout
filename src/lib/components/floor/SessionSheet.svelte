<script module lang="ts">
	/** one row of the session map: a section, never a set; `jump` is the step index a tap lands on */
	export type SheetSection = { title: string; status: string; active: boolean; done: boolean; jump: number };
</script>

<script lang="ts">
	import Sheet from './Sheet.svelte';
	
	/** where am I — the map of the session, and how to leave */
	let {
		open,
		title,
		sub,
		sections,
		backLabel,
		noun,
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
		sub: string;
		sections: SheetSection[];
		backLabel: string;
		/** what Finish finishes: workout · practice · stretch · run */
		noun: string;
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

<Sheet {open} {title} {sub} {backLabel} label="The session" {onClose}>
	<section>
		<div class="list">
			{#each sections as sec (sec.title)}
				<button type="button" class="secrow" class:now={sec.active} class:done={sec.done} onclick={() => onJump(sec.jump)}>
					<span class="sectitle">{sec.title}</span>
					<span class="secstatus">{sec.status}</span>
				</button>
			{/each}
			</div>
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
				<button type="button" class="arow" onclick={() => (confirming = true)}>Finish {noun} early</button>
			{/if}
		{/if}
		<button type="button" class="arow" onclick={onExit}>Pause · keep it open</button>
	</section>
	<section class="kbd-only">
		<div class="caps">Keyboard</div>
		<p class="note mono">↑↓ value · ←→ step · 1–9 reps · Enter log / start · Esc closes this</p>
	</section>
</Sheet>

<style>
	.caps {
		font-size: 12px; font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-3);
	}
	section { display: flex; flex-direction: column; gap: 6px; }
	.note { margin: 0; font-size: 14px; line-height: 1.5; color: var(--ink-2); }
	.note.mono { font-family: var(--font-mono); font-size: 12px; }

	.list {
		display: flex; flex-direction: column;
		background: var(--white); border: 1px solid var(--border-soft); border-radius: var(--radius-lg); overflow: hidden;
	}
	.secrow {
		width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 12px;
		min-height: 48px; padding: 0 14px;
		background: transparent; border: none; border-top: 1px solid var(--border-soft);
		font: inherit; color: var(--ink); text-align: left; cursor: pointer; touch-action: manipulation;
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
	@media (hover: none) { .kbd-only { display: none; } }
</style>
