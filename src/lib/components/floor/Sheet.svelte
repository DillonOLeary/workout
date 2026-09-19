<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { durationMs } from '$lib/design/motion';

	/** the one sheet shell: a header, a body that scrolls, a footer that doesn't — the way back sits above the home bar, never under a row */
	let {
		open,
		title,
		sub,
		backLabel,
		label,
		onClose,
		children
	}: { open: boolean; title: string; sub?: string; backLabel: string; label: string; onClose: () => void; children: Snippet } = $props();

	const SLIDE = durationMs('--dur-slow', 320);
	const FADE = durationMs('--dur-med', 180);
</script>

{#if open}
	<button type="button" class="scrim" aria-label="Close" onclick={onClose} transition:fade={{ duration: FADE }}></button>
	<div class="sheet" role="dialog" aria-modal="true" aria-label={label} transition:fly={{ y: 80, duration: SLIDE, easing: (t) => 1 - Math.pow(1 - t, 4) }}>
		<div class="tophead">
			<div class="titles">
				<span class="title">{title}</span>
				{#if sub}<span class="sub">{sub}</span>{/if}
			</div>
			<button type="button" class="close" onclick={onClose} aria-label="Close">×</button>
		</div>
		<div class="body">{@render children()}</div>
		<div class="foot">
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
		max-height: 88svh;
		display: flex; flex-direction: column;
		background: var(--paper);
		border: var(--border-w) solid var(--ink); border-bottom: none;
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
	}
	.tophead { flex: none; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px 8px 4px 16px; }
	.titles { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding-top: 8px; }
	.title { font-family: var(--font-display); font-weight: var(--weight-black); font-size: 20px; line-height: 1.1; }
	.sub { font-family: var(--font-mono); font-size: 12px; color: var(--ink-3); }
	.close {
		width: 44px; height: 44px; flex: none;
		background: transparent; border: none; border-radius: var(--radius-md);
		font-family: var(--font-display); font-weight: 700; font-size: 24px; color: var(--ink-2);
		cursor: pointer;
	}
	.close:hover { background: var(--volt-tint); color: var(--ink); }
	.body {
		flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
		display: flex; flex-direction: column; gap: 16px; padding: 8px 16px 16px;
	}
	.foot { flex: none; padding: 8px 16px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid var(--border-soft); background: var(--paper); }
	.back {
		width: 100%; min-height: 64px;
		background: var(--ink); color: var(--volt);
		border: var(--border-w) solid var(--ink); border-radius: var(--radius-lg);
		box-shadow: 0 4px 0 var(--ink-2);
		font-family: var(--font-display); font-weight: var(--weight-black); font-size: 20px;
		letter-spacing: 0.02em; text-transform: uppercase; cursor: pointer; touch-action: manipulation;
	}
	.back:active { transform: translateY(3px); box-shadow: var(--shadow-pressed); }
</style>
