<script lang="ts">
	import Slot from './Slot.svelte';

	/**
	 * One section of a session on the floor's wall: the Cell's states at tile size, with the Slot's figure.
	 * `state` done = ink · now = volt-light (in progress) · open = white. `here` is the dashed outline: where you are.
	 * `note` is one mono line (what was logged, or the dose); `badge` the corner (✓ · 1/3). A tap goes there.
	 */
	let {
		exercise,
		title,
		note,
		badge = '',
		state = 'open',
		here = false,
		onclick
	}: { exercise: string; title: string; note: string; badge?: string; state?: 'open' | 'now' | 'done'; here?: boolean; onclick?: () => void } = $props();
</script>

<button type="button" class="tile {state}" class:here aria-current={here ? 'step' : undefined} {onclick}>
	<span class="top"><Slot {exercise} phase="still" size={54} tone={state === 'done' ? 'volt' : state === 'now' ? 'white' : 'ash'} /><span class="badge">{badge}</span></span>
	<span class="name">{title}</span>
	<span class="note">{note}</span>
</button>

<style>
	.tile {
		display: flex; flex-direction: column; gap: 6px; min-height: 122px; min-width: 0; padding: 8px; margin: 0; text-align: left;
		background: var(--white); border: 1px solid var(--paper-3); border-radius: 14px; color: var(--ink);
		font-family: var(--font-body); cursor: pointer; touch-action: manipulation;
		transition: transform var(--dur-fast) var(--ease-snap);
	}
	.tile:active { transform: translateY(2px); }
	.tile.open:hover { border-color: var(--ink); }
	.top { display: flex; justify-content: space-between; align-items: flex-start; }
	.top :global(.slot) { border-radius: 10px; }
	.badge { font-family: var(--font-mono); font-size: 10px; font-weight: 700; color: var(--stone); padding: 2px 2px 0 0; }
	.name { font-weight: 800; font-size: 12.5px; line-height: 1.15; overflow-wrap: anywhere; }
	.note { margin-top: auto; font-family: var(--font-mono); font-size: 10px; line-height: 1.3; color: var(--stone); }
	.tile.done { background: var(--ink); border-color: var(--ink); color: var(--paper); }
	.tile.done .badge, .tile.done .note { color: var(--volt); }
	.tile.now { background: var(--volt-light); border-color: var(--volt-light); }
	.tile.now .badge, .tile.now .note { color: var(--ink); }
	.tile.here { outline: 2px dashed var(--ink); outline-offset: 1px; }
	@media (prefers-reduced-motion: reduce) { .tile { transition: none; } }
</style>
