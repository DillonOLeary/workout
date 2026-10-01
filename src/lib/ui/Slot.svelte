<script lang="ts">
	import { figureFor, frameFor, motionOf, restDepth, GRID, STAND, MOTIONS } from '$lib/design/rig';

	/**
	 * Where the figure goes. Floor only, 92px; Done, 84px. The contract is fixed here so rig v2 can land without touching a screen:
	 * `<Slot exercise phase size />`. Until then it stamps one still frame of the current rig — the work frame for a set, the top for the rest.
	 */
	let { exercise, phase = 'ready', size = 92 }: { exercise: string; phase?: 'set' | 'ready' | 'running' | 'still'; size?: number } = $props();

	let canvas = $state<HTMLCanvasElement>();
	$effect(() => {
		const el = canvas, name = exercise, ph = phase, px = size;
		if (!el) return;
		const fig = figureFor(name) ?? figureFor(STAND)!;
		const seq = MOTIONS[motionOf(fig)].seq;
		const depth = ph === 'set' || ph === 'running' ? seq[Math.max(0, seq.indexOf(1))] : restDepth(fig);
		const f = frameFor(fig, depth);
		const dpr = Math.min(2.5, window.devicePixelRatio || 1);
		el.width = el.height = Math.round(px * dpr);
		const ctx = el.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, px, px);
		ctx.fillStyle = getComputedStyle(el).getPropertyValue('--ink').trim() || '#1A1915';
		const pitch = px / GRID, r = 0.34 * pitch;
		for (let row = 0; row < GRID; row++)
			for (let col = 0; col < GRID; col++)
				if (f[row][col] === '#') { ctx.beginPath(); ctx.arc((col + 0.5) * pitch, (row + 0.5) * pitch, r, 0, Math.PI * 2); ctx.fill(); }
	});
</script>

<span class="slot" style="--s: {size}px" aria-hidden="true"><canvas bind:this={canvas}></canvas></span>

<style>
	.slot { display: grid; place-items: center; flex: none; width: var(--s); height: var(--s); background: var(--ash); border-radius: 14px; }
	canvas { width: 100%; height: 100%; display: block; }
</style>
