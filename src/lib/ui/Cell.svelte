<script lang="ts">
	/**
	 * One day — or, on the floor's strip, one section of the session. Ink = done (the letters say what: L lift · Y yoga · S stretch · R run · F floor),
	 * white = not, dashed outline = today (or where you are), volt-light = in progress (`now`), transparent = still to come.
	 * The same cell in the week strip (`size` strip, 30px) and the month (34px).
	 */
	let {
		label,
		done = false,
		today = false,
		now = false,
		future = false,
		size = 'month',
		title
	}: { label: string; done?: boolean; today?: boolean; now?: boolean; future?: boolean; size?: 'strip' | 'month'; title?: string } = $props();
</script>

<span class="cell {size}" class:done class:today class:now class:future class:long={label.length > 2} role="listitem" aria-label={title ?? label}>{label}</span>

<style>
	.cell {
		display: grid; place-items: center; height: 34px; border-radius: 8px;
		font-family: var(--font-mono); font-size: 10px; font-weight: 700; color: var(--paper-3);
		background: var(--white); border: 1px solid var(--paper-3); letter-spacing: 0.02em;
	}
	.cell.strip { height: 30px; font-size: 11px; color: var(--stone); }
	.cell.done { background: var(--ink); color: var(--volt); border-color: var(--ink); }
	.cell.now { background: var(--volt-light); border-color: var(--volt-light); color: var(--ink); }
	.cell.today { outline: 2px dashed var(--ink); outline-offset: 1px; }
	.cell.future { background: transparent; }
	.cell.long { font-size: 8px; letter-spacing: 0; }
	.cell.strip.long { font-size: 10px; }
</style>
