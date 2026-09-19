<script lang="ts">
	import Athlete, { type Phase } from '$lib/components/Athlete.svelte';
	import ExerciseGlyph from '$lib/components/ExerciseGlyph.svelte';
	import { EXERCISES, STAND, motionOf, waypointOf } from '$lib/design/rig';
	import { exerciseNamed } from '$lib/domain/plan';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);

	let playing = $state(false);
	let pose = $state(STAND);
	let phase = $state<Phase>('running');
	const noteOf = (name: string) => data.plans.map((p) => exerciseNamed(p, name)?.note).find(Boolean) ?? '';
</script>

<div class="col">
	<div class="head">
		<h1>Every figure</h1>
		<label class="play"><input type="checkbox" bind:checked={playing} /> play every gear</label>
	</div>
	<p class="lede">{EXERCISES.length} figures from the rig, beside the name the plan uses and the note it shows. Is it right? Scroll.</p>

	<div class="stage">
		<Athlete {pose} {phase} size={240} />
		<div class="ctls">
			<select bind:value={pose} aria-label="Pose">
				<option value={STAND}>{STAND}</option>
				{#each EXERCISES as ex (ex.id)}<option value={ex.name}>{ex.name}</option>{/each}
			</select>
			<select bind:value={phase} aria-label="Phase">
				{#each ['set', 'ready', 'running', 'still'] as ph (ph)}<option value={ph}>{ph}</option>{/each}
			</select>
			<span class="meta">the athlete routes through the waypoints between any two poses</span>
		</div>
	</div>

	<div class="grid">
		{#each EXERCISES as ex (ex.id)}
			<div class="card">
				<ExerciseGlyph name={ex.name} size={120} play={false} loop={playing} />
				<div class="txt">
					<div class="name">{ex.name}</div>
					<div class="meta">{ex.id} · {motionOf(ex)} · via {waypointOf(ex)}{ex.aliases?.length ? ` · also ${ex.aliases.join(', ')}` : ''}</div>
					<div class="cue">{ex.cue}</div>
					{#if noteOf(ex.name)}<div class="note">{noteOf(ex.name)}</div>{/if}
					{#if !exerciseNamed(plan, ex.name) && !ex.aliases?.some((a) => exerciseNamed(plan, a))}<div class="meta">not an exercise on this plan — a warm-up line, or another plan's</div>{/if}
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.col { display: flex; flex-direction: column; gap: 16px; padding: 16px; max-width: var(--content-max); margin: 0 auto; }
	.head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
	h1 { margin: 0; font-family: var(--font-display); font-weight: var(--weight-black); font-size: var(--text-display); line-height: var(--leading-tight); }
	.play { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; font-weight: var(--weight-bold); }
	.lede, .meta { margin: 0; font-family: var(--font-mono); font-size: 12px; color: var(--ink-3); line-height: 1.45; }
	.stage { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; background: var(--white); border: var(--border-w) solid var(--ink); border-radius: var(--radius-lg); padding: 16px; }
	.ctls { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
	select { min-height: 44px; font: inherit; padding: 0 10px; border: 1px solid var(--ink); border-radius: var(--radius-md); background: var(--white); }
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
	.card { display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: start; background: var(--white); border: 1px solid var(--border-soft); border-radius: var(--radius-lg); padding: 12px; }
	.txt { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
	.name { font-weight: var(--weight-bold); font-size: 15px; }
	.cue { font-size: 13px; color: var(--ink-2); line-height: 1.45; }
	.note { font-size: 12px; color: var(--ink-3); line-height: 1.45; border-top: 1px solid var(--border-soft); padding-top: 4px; }
</style>
