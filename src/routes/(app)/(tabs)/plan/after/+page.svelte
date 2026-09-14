<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import { EQUIPMENT, INTENTS, MAX_INTENTS, type Equipment, type Intent, type Preferences } from '$lib/domain/preferences';
	import { queue } from '$lib/domain/projections';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const now = Date.now();

	/**
	 * The only place a person tells the app about themselves: two menus. What
	 * they're after weights a cycle up; what they've got rules one out.
	 * Nothing here edits a routine, sets a cadence or takes free text — the
	 * app cannot act on a sentence, so it does not collect one. The sheet
	 * says what the picks do, live, before you save; Save writes one
	 * PreferencesSet event, a full snapshot with a date, so the Ledger can
	 * say when you changed your mind.
	 */
	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	// svelte-ignore state_referenced_locally
	let intents = $state<Intent[]>([...data.preferences.intents]);
	// svelte-ignore state_referenced_locally
	let equipment = $state<Equipment[]>([...data.preferences.equipment]);
	let full = $derived(intents.length >= MAX_INTENTS);

	function toggleIntent(id: Intent) {
		if (intents.includes(id)) intents = intents.filter((x) => x !== id);
		else if (!full) intents = [...intents, id]; // the fourth tap is refused
	}
	function toggleGear(id: Equipment) {
		equipment = equipment.includes(id) ? equipment.filter((x) => x !== id) : [...equipment, id];
	}

	// what Today would lead with, from the same fold Today runs
	let draft = $derived<Preferences>({ intents, equipment });
	let first = $derived(queue(data.events, plan, draft, now)[0]);
	let preview = $derived(
		!first ? '' : first.out ? 'Nothing you can do with what you have — check the gear.' : `${first.title} · ${first.why}`
	);
</script>

<div class="col">
	<div class="head">
		<a class="back" href="/plan" aria-label="Back to The Plan">←</a>
		<h1>What I'm after</h1>
	</div>

	<Card>
		<form method="POST" action="?/save" use:enhance class="form">
			<div class="caps">Right now I want to</div>
			<p class="note">Pick up to {MAX_INTENTS}. It changes what comes first on Today, not what is in a session.</p>
			<div class="chips">
				{#each INTENTS as it (it.id)}
					{@const on = intents.includes(it.id)}
					<button type="button" class="pick" class:on class:dim={full && !on} aria-pressed={on} onclick={() => toggleIntent(it.id)}>
						<span class="picklabel">{it.label}</span>
						<span class="pickeffect">{it.effect}</span>
					</button>
				{/each}
			</div>

			<div class="caps mt">I've got</div>
			<p class="note">Anything that needs what you don't have drops off Today.</p>
			<div class="chips">
				{#each EQUIPMENT as g (g.id)}
					{@const on = equipment.includes(g.id)}
					<button type="button" class="pick gear" class:on aria-pressed={on} onclick={() => toggleGear(g.id)}>
						<span class="picklabel">{g.label}</span>
					</button>
				{/each}
			</div>

			<div class="caps mt">So Today will lead with</div>
			<p class="preview">{preview}</p>

			{#if form?.message}<p class="err">{form.message}</p>{/if}

			<input type="hidden" name="intents" value={JSON.stringify(intents)} />
			<input type="hidden" name="equipment" value={JSON.stringify(equipment)} />
			<div class="btns">
				<Button variant="accent" size="lg" type="submit" style="flex: 1" disabled={!intents.length}>Save</Button>
				<a class="cancel" href="/plan">Cancel</a>
			</div>
		</form>
	</Card>
</div>

<style>
	.col { display: flex; flex-direction: column; gap: 20px; }
	.head { display: flex; align-items: center; gap: 14px; }
	.back {
		width: 48px; height: 48px; flex: none;
		display: inline-flex; align-items: center; justify-content: center;
		background: var(--white); border: var(--border-w) solid var(--ink); border-radius: var(--radius-md);
		box-shadow: var(--shadow-raised); text-decoration: none;
		font-family: var(--font-display); font-weight: var(--weight-black); font-size: 22px; color: var(--ink);
	}
	.back:hover { background: var(--volt-tint); }
	.back:active { transform: translateY(2px); box-shadow: var(--shadow-pressed); }
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: var(--text-display);
		line-height: var(--leading-tight);
	}
	.form { display: flex; flex-direction: column; gap: 8px; }
	.caps {
		font-size: 12px; font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-3);
	}
	.mt { margin-top: 12px; }
	.note { margin: 0; font-size: 13px; color: var(--ink-3); line-height: 1.45; }
	.chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
	/* a pick: white with a soft border; ink when on. The effect line says what it does, live. */
	.pick {
		display: flex; flex-direction: column; align-items: flex-start; gap: 1px;
		min-height: 48px; padding: 6px 16px;
		background: var(--white); color: var(--ink);
		border: var(--border-w) solid var(--border-soft); border-radius: var(--radius-pill);
		font-family: var(--font-body); cursor: pointer; touch-action: manipulation;
		transition: background var(--dur-med) var(--ease-snap), color var(--dur-med) var(--ease-snap);
	}
	.pick.gear { justify-content: center; min-height: 44px; }
	.pick:hover { background: var(--volt-tint); }
	.pick.on { background: var(--ink); color: var(--paper); border-color: var(--ink); }
	.pick.dim { color: var(--ink-3); cursor: default; }
	.pick.dim:hover { background: var(--white); }
	.picklabel { font-weight: var(--weight-bold); font-size: 15px; }
	.pickeffect { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); }
	.pick.on .pickeffect { color: var(--volt); }
	.preview { margin: 0; font-family: var(--font-mono); font-size: 14px; line-height: 1.45; color: var(--ink); background: var(--paper-2); padding: 10px 12px; border-radius: var(--radius-md); }
	.err { margin: 0; color: var(--danger); font-weight: var(--weight-bold); font-size: var(--text-sm); }
	.btns { display: flex; gap: 12px; align-items: center; margin-top: 8px; }
	.cancel {
		display: inline-flex; align-items: center; min-height: 44px; padding: 0 12px;
		font-family: var(--font-body); font-size: 13px; font-weight: var(--weight-bold); color: var(--ink-2);
		text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--border-soft);
	}
</style>
