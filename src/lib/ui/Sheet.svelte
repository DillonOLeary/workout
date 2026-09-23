<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade, fly } from 'svelte/transition';

	/** Bottom, ink border, × and tap-out. Two exist: Programme, Log-after. A sheet never opens a sheet. Esc closes it. */
	let { open, title, onclose, children }: { open: boolean; title: string; onclose: () => void; children: Snippet } = $props();

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
		<div class="sheet" role="dialog" aria-modal="true" aria-label={title} transition:fly={{ y: 80, duration: ms(320), easing: (t) => 1 - Math.pow(1 - t, 4) }}>
			<div class="head">
				<span class="title">{title}</span>
				<button type="button" class="x" onclick={onclose} aria-label="Close">×</button>
			</div>
			<div class="body">{@render children()}</div>
		</div>
	</div>
{/if}

<style>
	.scrim { position: fixed; inset: 0; z-index: 70; background: rgba(26, 25, 21, 0.4); display: flex; flex-direction: column; justify-content: flex-end; }
	.out { position: absolute; inset: 0; background: none; border: 0; padding: 0; cursor: pointer; }
	.sheet {
		position: relative; width: 100%; max-width: var(--content-max); margin: 0 auto; max-height: 84svh;
		display: flex; flex-direction: column; gap: 14px;
		background: var(--paper); border: var(--border-w) solid var(--ink); border-bottom: 0; border-radius: 18px 18px 0 0;
		padding: 14px 16px calc(24px + env(safe-area-inset-bottom));
	}
	.head { flex: none; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
	.title { font-family: var(--font-display); font-weight: var(--weight-black); font-size: 22px; line-height: 1.1; }
	.x { width: 40px; height: 40px; flex: none; background: none; border: 0; border-radius: 10px; font-size: 24px; color: var(--slate); cursor: pointer; }
	.x:hover { background: var(--volt-light); color: var(--ink); }
	.body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 14px; }
</style>
