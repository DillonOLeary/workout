<script lang="ts">
	import { page } from '$app/state';

	type Tab = { label: string; href: string; also?: string[] };
	let { tabs }: { tabs: Tab[] } = $props();
	
	// a child page keeps its tab lit: /plan/why is still The Plan, and the
	// chronological "By day" view is still Today
	const isActive = (t: Tab) =>
		page.url.pathname === t.href ||
		(t.href !== '/' && page.url.pathname.startsWith(t.href + '/')) ||
		(t.also ?? []).some((a) => page.url.pathname === a || page.url.pathname.startsWith(a + '/'));
</script>

<!-- Tabs are plain links: SvelteKit's file-based routes do the "switching". -->
<nav class="tabbar">
	{#each tabs as tab (tab.href)}
		<a
			href={tab.href}
			class="tab"
			class:active={isActive(tab)}
			aria-current={isActive(tab) ? 'page' : undefined}
		>
			{tab.label}
		</a>
	{/each}
</nav>

<style>
	/* Placement (top on wide, bottom on touch) is the app shell's job —
	   the bar itself is just an in-flow pill. */
	.tabbar {
		display: flex;
		gap: 0;
		padding: 0;
		overflow: hidden;
		background: var(--white);
		border: var(--border-w) solid var(--ink);
		border-radius: var(--radius-pill);
		box-shadow: var(--shadow-raised);
	}
	.tab {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 56px;
		border-radius: var(--radius-pill);
		font-weight: var(--weight-bold);
		font-size: 16px;
		color: var(--ink-2);
		text-decoration: none;
		transition: background var(--dur-med) var(--ease-snap);
	}
	.tab:hover { background: var(--volt-tint); color: var(--ink); }
	.tab.active { background: var(--ink); color: var(--paper); }
</style>
