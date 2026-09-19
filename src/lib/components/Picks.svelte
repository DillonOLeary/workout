<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import type { LedgerEvent } from '$lib/domain/events';
	import type { Plan } from '$lib/domain/plan';
	import { EQUIPMENT, INTENTS, MAX_INTENTS, samePreferences, type Equipment, type Intent, type Preferences } from '$lib/domain/preferences';
	import { queue } from '$lib/domain/projections';

	/** one menu of the two, edited as a draft; Save posts the whole snapshot to the page's ?/save */
	let {
		which,
		plan,
		events,
		preferences,
		message
	}: { which: 'intents' | 'equipment'; plan: Plan; events: LedgerEvent[]; preferences: Preferences; message?: string } = $props();
	const now = Date.now();

	// svelte-ignore state_referenced_locally
	let intents = $state<Intent[]>([...preferences.intents]);
	// svelte-ignore state_referenced_locally
	let equipment = $state<Equipment[]>([...preferences.equipment]);
	let full = $derived(intents.length >= MAX_INTENTS);
	function toggleIntent(id: Intent) {
		if (intents.includes(id)) intents = intents.filter((x) => x !== id);
		else if (!full) intents = [...intents, id];
	}
	function toggleGear(id: Equipment) {
		equipment = equipment.includes(id) ? equipment.filter((x) => x !== id) : [...equipment, id];
	}
	let draft = $derived<Preferences>({ intents, equipment });
	let changed = $derived(!samePreferences(draft, preferences));
	let first = $derived(queue(events, plan, draft, now)[0]);
	let preview = $derived(
		!first ? '' : first.out ? 'Nothing you can do with what you have — check the gear.' : `Today leads with ${first.title} · ${first.why}`
	);
</script>

<form method="POST" action="?/save" use:enhance class="prefs">
	{#if message}<p class="err">{message}</p>{/if}
	<div class="pills">
		{#if which === 'intents'}
			{#each INTENTS as it (it.id)}
				{@const on = intents.includes(it.id)}
				<button type="button" class="pick" class:on class:dim={full && !on} aria-pressed={on} onclick={() => toggleIntent(it.id)}>{it.label}</button>
			{/each}
		{:else}
			{#each EQUIPMENT as g (g.id)}
				{@const on = equipment.includes(g.id)}
				<button type="button" class="pick" class:on aria-pressed={on} onclick={() => toggleGear(g.id)}>{g.label}</button>
			{/each}
		{/if}
	</div>
	<div class="previewrow">
		<span class="preview">{preview}</span>
		{#if changed}
			<input type="hidden" name="intents" value={JSON.stringify(intents)} />
			<input type="hidden" name="equipment" value={JSON.stringify(equipment)} />
			<Button variant="accent" type="submit" disabled={!intents.length && which === 'intents'}>Save</Button>
		{/if}
	</div>
</form>

<style>
	.prefs { display: flex; flex-direction: column; gap: 8px; }
	.err { margin: 0; color: var(--danger); font-weight: var(--weight-bold); font-size: var(--text-sm); }
	.pills { display: flex; gap: 8px; flex-wrap: wrap; }
	.pick {
		min-height: 44px; padding: 0 16px;
		background: var(--white); color: var(--ink);
		border: var(--border-w) solid var(--border-soft); border-radius: var(--radius-pill);
		font-family: var(--font-body); font-weight: var(--weight-bold); font-size: 15px; cursor: pointer; touch-action: manipulation;
		transition: background var(--dur-med) var(--ease-snap), color var(--dur-med) var(--ease-snap);
	}
	.pick:hover { background: var(--volt-tint); }
	.pick.on { background: var(--ink); color: var(--paper); border-color: var(--ink); }
	.pick.dim { color: var(--ink-3); cursor: default; }
	.pick.dim:hover { background: var(--white); }
	.previewrow {
		display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
		margin-top: 12px; padding: 10px 12px; background: var(--paper-2); border-radius: var(--radius-md);
	}
	.preview { flex: 1 1 200px; font-family: var(--font-mono); font-size: 13px; line-height: 1.45; color: var(--ink); }
</style>
