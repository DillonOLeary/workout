<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import TabBar from '$lib/components/TabBar.svelte';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	let mainEl = $state<HTMLElement>();
	// the document doesn't scroll (locked shell) — reset the inner scroller
	afterNavigate(() => mainEl?.scrollTo({ top: 0 }));
</script>

<div class="app-frame">
	<div class="tabwrap">
		<div class="tabwrap-inner">
			<!-- two tabs: your state now (and over time), and the plan. "By day"
			     is a child of Today, so it keeps that tab lit. -->
			<TabBar
				tabs={[
					{ label: 'Today', href: '/', also: ['/ledger'] },
					{ label: 'The Plan', href: '/plan' }
				]}
			/>
		</div>
	</div>
	<main class="app-main" bind:this={mainEl}>
		<div class="shell">
			{@render children()}
		</div>
	</main>
</div>

<style>
	/* The cabin recipe: LOCK the document and scroll only .app-main. A
	   fixed/sticky bar in a scrolling document slides around when mobile
	   browsers collapse their toolbars (the visual viewport re-anchors it a
	   frame late) — an in-flow bar at the edge of a locked frame cannot move. */
	:global(html:has(.app-frame)),
	:global(body:has(.app-frame)) {
		height: 100%;
		min-height: 0;
		overflow: hidden;
	}
	.app-frame {
		/* same reason as the gym floor: 100% of html resolves to the layout
		   viewport, so the tab bar hides behind Safari's toolbar */
		height: 100vh;
		height: 100svh;
		display: flex;
		flex-direction: column;
	}
	/* wide screens: bar at the top, in flow */
	.tabwrap {
		order: 0;
		flex-shrink: 0;
		padding: 12px 16px 0;
	}
	.tabwrap-inner {
		max-width: var(--content-max);
		margin: 0 auto;
	}
	.app-main {
		order: 1;
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		overscroll-behavior-y: contain;
	}
	.shell {
		max-width: var(--content-max);
		margin: 0 auto;
		padding: var(--page-pad);
		padding-bottom: 64px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	/* touch layouts: same bar, last flex child — pinned to the real bottom */
	@media (max-width: 900px) {
		.shell { padding: 12px; padding-bottom: 16px; gap: 16px; }
		.tabwrap { padding-top: 8px; }
	}

	@media (max-height: 700px) {
		.shell { padding: 8px; padding-bottom: 10px; gap: 12px; }
	}

	@media (max-width: 640px) {
		/* 8px side padding: two tabs stay ≥ 180px wide at 390px */
		.tabwrap {
			order: 2;
			padding: 8px 8px;
			padding-bottom: max(env(safe-area-inset-bottom), 10px);
			border-top: 1px solid var(--border-soft);
			background: var(--paper);
		}
		.shell {
			padding-bottom: 24px;
		}
	}

	
</style>
