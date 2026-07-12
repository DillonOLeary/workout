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
	<div class="uidline">/u/{data.uid} — bookmark this URL, it is your login</div>
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
	.uidline {
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--ink-3);
		text-align: center;
		margin-top: -12px;
	}
	/* Room for the bottom-fixed tab bar on touch layouts */
	@media (max-width: 640px) {
		.shell { padding-bottom: 128px; }
	}
</style>
