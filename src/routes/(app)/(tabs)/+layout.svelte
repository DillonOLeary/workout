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
			<TabBar
				tabs={[
					{ label: 'Today', href: '/' },
					{ label: 'The Plan', href: '/plan' },
					{ label: 'Ledger', href: '/ledger' }
				]}
			/>
		</div>
	</div>
	<main class="app-main" bind:this={mainEl}>
		<div class="shell">
			{#if data.showWelcome}
				<div class="welcome" role="status">
					<span class="caps">You're in</span>
					This device stays signed in — no password, nothing to bookmark. Same phone number,
					same ledger, on any device.
				</div>
			{/if}
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
		height: 100%;
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
	@media (max-width: 640px) {
		.tabwrap {
			order: 2;
			padding: 8px 12px;
			padding-bottom: max(env(safe-area-inset-bottom), 12px);
			border-top: 1px solid var(--border-soft);
			background: var(--paper);
		}
		.shell {
			padding-bottom: 24px;
		}
	}

	.welcome {
		display: flex;
		flex-direction: column;
		gap: 4px;
		background: var(--white);
		border: var(--border-w) solid var(--ink);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-raised);
		padding: 16px 20px;
		font-size: 15px;
		line-height: var(--leading-body);
	}
	.welcome .caps {
		font-size: 12px;
		font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--ink-3);
	}
</style>
