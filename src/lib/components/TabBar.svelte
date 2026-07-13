<script lang="ts">
	import { page } from '$app/state';

	let { tabs }: { tabs: { label: string; href: string }[] } = $props();
</script>

<!-- Tabs are plain links: SvelteKit's file-based routes do the "switching". -->
<nav class="tabbar">
	{#each tabs as tab (tab.href)}
		<a
			href={tab.href}
			class="tab"
			class:active={page.url.pathname === tab.href}
			aria-current={page.url.pathname === tab.href ? 'page' : undefined}
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
		gap: 4px;
		padding: 4px;
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
		min-height: 48px;
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
