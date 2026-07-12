<script lang="ts">
	import TabBar from '$lib/components/TabBar.svelte';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	let base = $derived(`/u/${data.uid}`);
</script>

<div class="shell">
	<TabBar
		tabs={[
			{ label: 'Today', href: base },
			{ label: 'The Plan', href: `${base}/plan` },
			{ label: 'Ledger', href: `${base}/ledger` }
		]}
	/>
	{#if data.showWelcome}
		<div class="welcome" role="status">
			<span class="caps">You're in</span>
			Bookmark this page — <span class="mono">/u/{data.uid}</span> is your login. No password, no
			recovery.
		</div>
	{/if}
	{@render children()}
</div>

<style>
	.shell {
		max-width: var(--content-max);
		margin: 0 auto;
		padding: var(--page-pad);
		padding-bottom: 64px;
		display: flex;
		flex-direction: column;
		gap: 24px;
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
	.welcome .mono { font-family: var(--font-mono); background: var(--volt-tint); padding: 0 4px; border-radius: 4px; }
	/* Room for the bottom-fixed tab bar on touch layouts */
	@media (max-width: 640px) {
		.shell { padding-bottom: 128px; }
	}
</style>
