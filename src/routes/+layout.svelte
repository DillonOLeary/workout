<script lang="ts">
	import '$lib/design/index.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>LEDGER — Training Ledger</title>
</svelte:head>

{@render children()}
