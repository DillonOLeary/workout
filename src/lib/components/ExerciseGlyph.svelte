<script lang="ts">
	import { FRAME_MS, GRID_STEP, SEQ, poseFor, prints } from '$lib/design/glyphs';

	/**
	 * One exercise, stamped through the dot grid. Plays ONE rep when it
	 * arrives (or when pressed), then rests on frame 0 — it is never ambient
	 * motion. Ink only, transparent: Plan-tier content, never a control.
	 * Unknown exercise → nothing at all, never a placeholder.
	 */
	let { name, size = 88, play = true }: { name: string; size?: number; play?: boolean } = $props();

	const REST = 0; // where a glyph waits: the top of the rep
	const STILL = 3; // reduced motion: the working pose, and nothing moves
	const TOTAL = FRAME_MS * SEQ.length;

	let fn = $derived(poseFor(name));
	let canvas = $state<HTMLCanvasElement>();

	// playback state is deliberately not reactive: it changes 6 times a rep
	// and nothing in the template depends on it
	let w = 0, h = 0, dpr = 1, ink = '#1A1915';
	let reduced = false;
	let raf = 0, start = 0, lastIdx = -1;

	function measure(): boolean {
		if (!canvas) return false;
		const r = canvas.getBoundingClientRect();
		if (!r.width) return false;
		dpr = Math.min(2.5, window.devicePixelRatio || 1);
		w = r.width;
		h = r.height;
		canvas.width = Math.round(w * dpr);
		canvas.height = Math.round(h * dpr);
		ink = getComputedStyle(canvas).getPropertyValue('--ink').trim() || ink;
		return true;
	}

	/** the renderer: fit the box, walk the grid, print the dots that qualify */
	function draw(d: number) {
		const ctx = canvas?.getContext('2d');
		if (!ctx || !fn || !w) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);
		const p = fn(d);
		const [x0, x1, yt] = p.box;
		const s = Math.min((w * 0.88) / (x1 - x0), (h * 0.86) / yt);
		const cx = w / 2 - ((x0 + x1) / 2) * s, gy = h / 2 + (yt / 2) * s;
		const r = Math.max(1, 0.34 * GRID_STEP * s);
		ctx.fillStyle = ink;
		for (let gx = x0; gx <= x1 + 1e-6; gx += GRID_STEP) {
			for (let gyy = 0; gyy <= yt + 1e-6; gyy += GRID_STEP) {
				if (!prints(p, gx, gyy)) continue;
				ctx.beginPath();
				ctx.arc(cx + gx * s, gy - gyy * s, r, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}

	function show(idx: number) {
		lastIdx = idx;
		draw(SEQ[idx]);
	}

	// draws only when the frame index changes; the loop ends with the rep
	function tick(now: number) {
		const t = now - start;
		const idx = t < TOTAL ? Math.floor(t / FRAME_MS) : REST;
		if (idx !== lastIdx) show(idx);
		raf = t < TOTAL ? requestAnimationFrame(tick) : 0;
	}

	function replay() {
		if (reduced) return;
		start = performance.now();
		if (!raf) raf = requestAnimationFrame(tick);
	}

	$effect(() => {
		const el = canvas;
		const f = fn;
		if (!el || !f) return;
		reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		// size follows CSS (the parent may shrink it on short screens); the
		// observer also fires once on observe, which is the first paint
		const ro = new ResizeObserver(() => {
			if (!measure()) return;
			if (raf) lastIdx = -1; // mid-rep: the loop repaints at its frame
			else show(reduced ? STILL : REST);
		});
		ro.observe(el);
		if (play) replay();
		return () => {
			ro.disconnect();
			cancelAnimationFrame(raf);
			raf = 0;
			lastIdx = -1;
		};
	});
</script>

{#if fn}
	<!-- decorative: the exercise name is the adjacent text, so no label, no
	     tab stop — but a press runs the rep again -->
	<canvas bind:this={canvas} class="glyph" style="--gs: {size}px" aria-hidden="true" onpointerdown={replay}
	></canvas>
{/if}

<style>
	.glyph {
		display: block;
		flex: none;
		width: var(--glyph-size, var(--gs));
		height: var(--glyph-size, var(--gs));
		cursor: pointer;
		touch-action: manipulation;
	}
</style>
