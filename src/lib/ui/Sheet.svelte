<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade, fly } from 'svelte/transition';

	/**
	 * Bottom, ink border, × and tap-out. Three exist: Programme, Log-after, the floor's session map. A sheet never opens a sheet. Esc closes it.
	 * `foot` pins a footer under a body that scrolls on its own, and the sheet stands at 88% whatever the body holds (Log-after).
	 */
	let { open, title, onclose, children, foot }: { open: boolean; title: string; onclose: () => void; children: Snippet; foot?: Snippet } = $props();

	const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const ms = (n: number) => (reduced() ? 0 : n);
	function onkey(e: KeyboardEvent) {
		if (open && e.key === 'Escape') { e.preventDefault(); onclose(); }
	}
</script>

<svelte:window onkeydown={onkey} />

{#if open}
	<div class="scrim" transition:fade={{ duration: ms(180) }}>
		<button type="button" class="out" aria-label="Close" onclick={onclose}></button>
		<div class="sheet" class:footed={!!foot} role="dialog" aria-modal="true" aria-label={title} transition:fly={{ y: 80, duration: ms(320), easing: (t) => 1 - Math.pow(1 - t, 4) }}>
			<div class="head">
				<span class="title">{title}</span>
				<button type="button" class="x" onclick={onclose} aria-label="Close">×</button>
			</div>
			<div class="body">{@render children()}</div>
			{#if foot}<div class="foot">{@render foot()}</div>{/if}
		</div>
	</div>
{/if}

<style>
	.scrim { position: fixed; inset: 0; z-index: 70; background: rgba(26, 25, 21, 0.4); display: flex; flex-direction: column; justify-content: flex-end; }
	.out { position: absolute; inset: 0; background: none; border: 0; padding: 0; cursor: pointer; }
	/* the sheet scrolls itself and stops at a share of the scrim — not of svh, which an older iPhone ignores, leaving the sheet to grow past the screen with nothing to scroll */
	.sheet {
		position: relative; width: 100%; max-width: var(--content-max); margin: 0 auto; max-height: 84%;
		overflow-y: auto; overscroll-behavior: contain;
		display: flex; flex-direction: column; gap: 14px;
		background: var(--paper); border: var(--border-w) solid var(--ink); border-bottom: 0; border-radius: 18px 18px 0 0;
		padding: 14px 16px calc(24px + env(safe-area-inset-bottom));
	}
	/* the title and × stay put while the body scrolls under them */
	.head {
		flex: none; position: sticky; top: -14px; z-index: 1; margin: -14px -16px -8px; padding: 14px 16px 8px; background: var(--paper);
		display: flex; justify-content: space-between; align-items: center; gap: 12px;
	}
	.title { font-family: var(--font-display); font-weight: var(--weight-black); font-size: 22px; line-height: 1.1; }
	.x { width: 40px; height: 40px; flex: none; background: none; border: 0; border-radius: 10px; font-size: 24px; color: var(--slate); cursor: pointer; }
	.x:hover { background: var(--volt-light); color: var(--ink); }
	.body { flex: none; display: flex; flex-direction: column; gap: 14px; }
	.sheet.footed { height: 88%; max-height: none; overflow: hidden; gap: 0; padding: 0; }
	.footed .head { position: static; margin: 0; padding: 14px 16px 10px; border-bottom: 1px solid var(--paper-3); }
	.footed .body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 14px 16px 20px; }
	.foot { flex: none; display: flex; flex-direction: column; gap: 10px; padding: 12px 16px calc(20px + env(safe-area-inset-bottom)); border-top: 1px solid var(--paper-3); background: var(--paper); }
</style>
