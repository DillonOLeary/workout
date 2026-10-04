<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount, type Snippet } from 'svelte';
	import { watchOnline } from '$lib/net';

	let { children }: { children: Snippet } = $props();

	/** Tabs are the only navigation. Three: Today · Ledger · Plan. The floor covers them; ‹ brings them back. */
	const tabs = [
		{ label: 'Today', href: '/' },
		{ label: 'Ledger', href: '/ledger' },
		{ label: 'Plan', href: '/plan' }
	];
	const active = (href: string) => page.url.pathname === href || (href !== '/' && page.url.pathname.startsWith(href + '/'));

	let mainEl = $state<HTMLElement>();
	afterNavigate(() => mainEl?.scrollTo({ top: 0 }));
	let online = $state(true);
	onMount(() => watchOnline((on) => (online = on)));
</script>

<div class="app-frame">
	<main class="app-main" bind:this={mainEl}>
		<div class="shell">
			<!-- the page's name for a screen reader; the tab bar already says it to the eye -->
			<h1 class="sr">{tabs.find((t) => active(t.href))?.label ?? 'LEDGER'}</h1>
			{#if !online}<div class="offline" role="status">No connection · changes here need the server; sets you log on the floor wait on the phone</div>{/if}
			{@render children()}
		</div>
	</main>
	<nav class="tabwrap" aria-label="Tabs">
		<div class="tabbar">
			{#each tabs as t (t.href)}
				<a href={t.href} class="tab" class:active={active(t.href)} aria-current={active(t.href) ? 'page' : undefined}>{t.label}</a>
			{/each}
		</div>
	</nav>
</div>

<style>
	/* the cabin recipe: lock the document and scroll only .app-main, so the bar never rides a collapsing toolbar */
	:global(html:has(.app-frame)),
	:global(body:has(.app-frame)) {
		height: 100%;
		min-height: 0;
		overflow: hidden;
	}
	.app-frame {
		height: 100vh;
		height: 100svh;
		display: flex;
		flex-direction: column;
	}
	.app-main {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
		overscroll-behavior-y: contain;
		display: flex;
		flex-direction: column;
	}
	.shell {
		width: 100%;
		max-width: var(--content-max);
		margin: 0 auto;
		padding: calc(8px + env(safe-area-inset-top)) 16px 16px;
		flex: 1 0 auto;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.tabwrap {
		flex: none;
		padding: 8px 12px max(env(safe-area-inset-bottom), 12px);
		border-top: 1px solid var(--paper-3);
		background: var(--paper);
	}
	.tabbar {
		display: flex; overflow: hidden; max-width: var(--content-max); margin: 0 auto;
		background: var(--white); border: var(--border-w) solid var(--ink); border-radius: var(--radius-pill); box-shadow: var(--shadow-raised);
	}
	.tab {
		flex: 1; display: flex; align-items: center; justify-content: center; min-height: 54px;
		font-weight: 700; font-size: 15px; color: var(--slate); text-decoration: none;
		border-left: 1px solid var(--paper-3);
		transition: background var(--dur-med) var(--ease-snap);
	}
	.tab:first-child { border-left-color: transparent; }
	.tab:hover { background: var(--volt-light); color: var(--ink); }
	.tab.active { background: var(--ink); color: var(--paper); }
	.tab:focus-visible { outline: none; box-shadow: inset 0 0 0 3px var(--volt); }
	@media (min-width: 720px) {
		.shell { padding-top: 24px; gap: 18px; }
	}
	.offline { padding: 8px 12px; border-radius: 12px; background: var(--ash); border: 1.5px dashed var(--stone); font-family: var(--font-mono); font-size: 12px; line-height: 1.4; color: var(--ink); }
	.sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
</style>
