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
					{ label: 'Ledger', href: '/ledger' },
					{ label: 'The Plan', href: '/plan' }
				]}
			/>
		</div>
	</div>
	<main class="app-main" bind:this={mainEl}>
		<div class="shell">
			{@render children()}
			<footer class="signout">
				<!-- plain form on purpose: works with zero JS, full-page nav to /login -->
				<form method="POST" action="/logout">
					<button type="submit">Sign out</button>
				</form>
			</footer>
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
		.signout { margin-top: 0; }
		.signout button { min-height: 32px; }
		.tabwrap { padding-top: 8px; }
	}

	@media (max-height: 700px) {
		.shell { padding: 8px; padding-bottom: 10px; gap: 12px; }
		.signout button { min-height: 26px; font-size: 10px; }
	}

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

	/* rare action, quiet home: caps text at the end of the scroll */
	.signout { display: flex; justify-content: center; margin-top: 8px; }
	.signout button {
		min-height: 44px;
		padding: 0 16px;
		background: transparent;
		border: none;
		cursor: pointer;
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--ink-3);
		text-decoration: underline;
		text-underline-offset: 3px;
		text-decoration-color: var(--border-soft);
	}
	.signout button:hover { color: var(--ink); background: var(--volt-tint); border-radius: var(--radius-sm); }
</style>
