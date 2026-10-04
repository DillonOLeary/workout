<script lang="ts">
	/**
	 * One day. Each session is a mark — its letter on its fill, side by side when a day holds more than one: volt L lift · stone Y yoga ·
	 * white S stretch · ink R run · hatched F floor, so the letter says what the colour does. Ash = nothing, dashed outline = today,
	 * transparent = still to come. `label` is what an empty day shows. The same cell in the week strip (`size` strip, 30px) and the month (34px).
	 */
	let {
		label,
		marks = [],
		today = false,
		future = false,
		size = 'month',
		title
	}: {
		label: string; marks?: { letter: string; ink: 'volt' | 'stone' | 'white' | 'ink' | 'hatch' }[];
		today?: boolean; future?: boolean; size?: 'strip' | 'month'; title?: string;
	} = $props();
</script>

<span class="cell {size}" class:done={marks.length > 0} class:today class:future class:long={marks.length > 2} role="listitem" aria-label={title ?? label}>
	{#each marks as m, i (i)}<span class="mark {m.ink}">{m.letter}</span>{:else}{label}{/each}
</span>

<style>
	.cell {
		display: flex; align-items: center; justify-content: center; height: 34px; border-radius: 8px; overflow: hidden;
		font-family: var(--font-mono); font-size: 10px; font-weight: 700; color: var(--stone);
		background: var(--ash); border: 1px solid var(--paper-3); letter-spacing: 0.02em;
	}
	.cell.strip { height: 30px; font-size: 11px; }
	.cell.done { border-color: var(--ink); }
	.mark { flex: 1 1 0; align-self: stretch; min-width: 0; display: grid; place-items: center; }
	.mark + .mark { border-left: 1px solid var(--ink); }
	.mark.volt { background: var(--volt); color: var(--ink); }
	.mark.stone { background: var(--stone); color: var(--white); }
	.mark.white { background: var(--white); color: var(--ink); }
	.mark.ink { background: var(--ink); color: var(--volt); }
	.mark.hatch { background: repeating-linear-gradient(135deg, var(--volt) 0 3px, var(--white) 3px 6px); color: var(--ink); text-shadow: 0 0 2px var(--white), 0 0 2px var(--white), 0 0 3px var(--white); }
	.cell.today { outline: 2px dashed var(--ink); outline-offset: 1px; }
	.cell.future { background: transparent; }
	.cell.long { font-size: 8px; letter-spacing: 0; }
</style>
