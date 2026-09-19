<script lang="ts">
	import { MOTIONS, cycleMs, frameAt, frameOf, glyphFor, repMs, workFrame } from '$lib/design/glyphs';
	import { stamp } from '$lib/design/stamp';

	/** `size` — the stage's side in px; a parent's `--glyph-size` overrides it */
	/** `play` — a rep plays once on arrival (a breath waits to be pressed, a still never moves) */
	let {
		name,
		size = 88,
		play = true,
		loop = false
	}: { name: string; size?: number; play?: boolean; loop?: boolean } = $props();

	const REST = 0;
	/** the rep waits for the screen to settle first */
	const ARRIVE_MS = 320;
	const MIN_PX = 24;

	let glyph = $derived(glyphFor(name));
	let canvas = $state<HTMLCanvasElement>();

	let w = 0, h = 0, dpr = 1, ink = '#1A1915';
	let reduced = false;
	let raf = 0, start = 0, lastIdx = -1;
	let arrive: ReturnType<typeof setTimeout> | undefined;

	function measure(): boolean {
		if (!canvas) return false;
		const r = canvas.getBoundingClientRect();
		if (r.width < MIN_PX) {
			// a squeezed stage: clear the bitmap too, or the last frame lingers
			canvas.width = canvas.height = 0;
			w = 0;
			return false;
		}
		dpr = Math.min(2.5, window.devicePixelRatio || 1);
		w = r.width;
		h = r.height;
		canvas.width = Math.round(w * dpr);
		canvas.height = Math.round(h * dpr);
		ink = getComputedStyle(canvas).getPropertyValue('--ink').trim() || ink;
		return true;
	}

	function show(k: number) {
		lastIdx = k;
		const ctx = canvas?.getContext('2d');
		const f = frameOf(name, k);
		if (ctx && f && w) stamp(ctx, f, w, h, dpr, ink);
	}

	const restFrame = () => (reduced && glyph?.motion === 'rep' ? workFrame('rep') : REST);

	// a frame's timestamp can precede the press that queued it, so the first tick is clamped
	function pass(now: number) {
		if (!glyph) return;
		const gear = MOTIONS[glyph.motion];
		const total = repMs(glyph.motion);
		const t = Math.max(0, now - start);
		const idx = t < total ? Math.floor(t / gear.frameMs) : REST;
		if (idx !== lastIdx) show(idx);
		raf = t < total ? requestAnimationFrame(pass) : 0;
	}

	function cycle(now: number) {
		if (!glyph) return;
		const idx = frameAt(now, glyph.motion);
		if (idx !== lastIdx) show(idx);
		raf = requestAnimationFrame(cycle);
	}

	function replay() {
		if (reduced || loop || !glyph || !cycleMs(glyph.motion)) return;
		start = performance.now();
		if (!raf) raf = requestAnimationFrame(pass);
	}

	$effect(() => {
		const el = canvas;
		const g = glyph;
		if (!el || !g) return;
		reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		// a ResizeObserver fires once on observe, which is the first paint
		const ro = new ResizeObserver(() => {
			if (!measure()) return;
			if (raf) lastIdx = -1;
			else show(restFrame());
		});
		ro.observe(el);
		if (play && g.motion === 'rep') arrive = setTimeout(replay, ARRIVE_MS);
		return () => {
			ro.disconnect();
			clearTimeout(arrive);
			cancelAnimationFrame(raf);
			raf = 0;
			lastIdx = -1;
		};
	});

	$effect(() => {
		if (!loop || !glyph || reduced || !cycleMs(glyph.motion)) return;
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(cycle);
		return () => {
			cancelAnimationFrame(raf);
			raf = 0;
			if (canvas && w) show(restFrame());
		};
	});
</script>

{#if glyph}
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
