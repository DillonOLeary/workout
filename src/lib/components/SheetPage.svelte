<script lang="ts">
	import type { Snippet } from 'svelte';

	/** a sheet that is a page: the one-tap-deeper screens (How it's going, Log it after, the programme, Why) — a header, a body that scrolls, and the way back above the home bar */
	let {
		title,
		sub,
		back,
		backLabel,
		children
	}: { title: string; sub?: string; /** where Back goes */ back: string; /** "Today" · "The Week" */ backLabel: string; children: Snippet } = $props();
</script>

<div class="sp">
	<div class="sp-inner">
		<header class="sp-head">
			<div class="sp-titles">
				<h1 class="sp-title">{title}</h1>
				{#if sub}<span class="sp-sub">{sub}</span>{/if}
			</div>
			<a class="sp-close" href={back} aria-label="Back to {backLabel}">×</a>
		</header>
		<main class="sp-body">{@render children()}</main>
		<footer class="sp-foot">
			<a class="sp-back" href={back}>Back to {backLabel}</a>
		</footer>
	</div>
</div>

<style>
	/* the cabin recipe again: the document is locked and only the body scrolls, so the way back never leaves the screen */
	:global(html:has(.sp)),
	:global(body:has(.sp)) {
		height: 100%;
		min-height: 0;
		overflow: hidden;
	}
	.sp {
		height: 100vh;
		height: 100svh;
		display: flex;
		flex-direction: column;
		background: var(--paper);
		padding: env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left);
	}
	.sp-inner {
		width: 100%;
		max-width: var(--content-max);
		margin: 0 auto;
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.sp-head { flex: none; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px 8px 4px 16px; }
	.sp-titles { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding-top: 8px; }
	.sp-title { margin: 0; font-family: var(--font-display); font-weight: var(--weight-black); font-size: 20px; line-height: 1.1; }
	.sp-sub { font-family: var(--font-mono); font-size: 12px; color: var(--ink-3); }
	.sp-close {
		width: 44px; height: 44px; flex: none;
		display: inline-flex; align-items: center; justify-content: center;
		border-radius: var(--radius-md); text-decoration: none;
		font-family: var(--font-display); font-weight: 700; font-size: 24px; color: var(--ink-2);
	}
	.sp-close:hover { background: var(--volt-tint); color: var(--ink); }
	.sp-body {
		flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
		display: flex; flex-direction: column; gap: 16px; padding: 8px 16px 16px;
	}
	.sp-foot { flex: none; padding: 8px 16px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid var(--border-soft); background: var(--paper); }
	.sp-back {
		display: flex; align-items: center; justify-content: center; width: 100%; min-height: 64px;
		background: var(--ink); color: var(--volt);
		border: var(--border-w) solid var(--ink); border-radius: var(--radius-lg);
		box-shadow: 0 4px 0 var(--ink-2); text-decoration: none;
		font-family: var(--font-display); font-weight: var(--weight-black); font-size: 20px;
		letter-spacing: 0.02em; text-transform: uppercase; touch-action: manipulation;
	}
	.sp-back:hover { background: var(--ink); color: var(--volt); }
	.sp-back:active { transform: translateY(3px); box-shadow: var(--shadow-pressed); }
	@media (max-height: 700px) {
		.sp-back { min-height: 56px; font-size: 18px; }
	}
</style>
