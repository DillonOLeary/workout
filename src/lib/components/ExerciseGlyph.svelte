<script lang="ts">
	import { GRID, MOTIONS, cycleMs, frameAt, glyphFor, repMs, workFrame } from '$lib/design/glyphs';

	/**
	 * One exercise, stamped through the dot grid: 31 × 31 dots, the same grid
	 * at every size, never scaled to the figure — a plank is low and a
	 * pulldown is tall on purpose. What it plays follows the figure's GEAR:
	 *
	 *   rep     one rep when it arrives (a beat after mount, so it never fires
	 *           while the screen is still changing) or when pressed, then
	 *           rests on frame 0; while `loop` is set it runs the cycle over
	 *           and over, on the page's clock, so every looping glyph is in
	 *           step
	 *   breath  nothing on arrival — it sits on frame 0; a press plays one
	 *           breath; while `loop` is set it breathes, no rest, because the
	 *           figure IS doing the hold
	 *   still   nothing, ever. There is one frame, and it is the pose.
	 *
	 * Reduced motion shows the working frame of a rep, and frame 0 otherwise.
	 * Ink only, transparent: Plan-tier content, never a control. Unknown
	 * exercise → nothing at all, never a placeholder.
	 */
	let {
		name,
		size = 88,
		play = true,
		loop = false
	}: { name: string; size?: number; play?: boolean; loop?: boolean } = $props();

	const REST = 0; // where a glyph waits: the still, frame 0
	/** the rep waits for the screen to settle first (§8: it read as a glitch mid-transition) */
	const ARRIVE_MS = 320;
	/** a dot's radius, in pitches — the design's */
	const DOT = 0.34;
	/** the design's floor: below this a figure is a smudge, so it is dropped, not shrunk */
	const MIN_PX = 24;

	let glyph = $derived(glyphFor(name));
	let canvas = $state<HTMLCanvasElement>();

	// playback state is deliberately not reactive: it changes twelve times a
	// rep and nothing in the template depends on it
	let w = 0, h = 0, dpr = 1, ink = '#1A1915';
	let reduced = false;
	let raf = 0, start = 0, lastIdx = -1;
	let arrive: ReturnType<typeof setTimeout> | undefined;

	function measure(): boolean {
		if (!canvas) return false;
		const r = canvas.getBoundingClientRect();
		if (r.width < MIN_PX) {
			// a squeezed stage: clear the bitmap too, or the last frame lingers, scaled down
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

	/** the stamper: pitch = side / 31; a dot prints where the frame says '#' */
	function draw(k: number) {
		const ctx = canvas?.getContext('2d');
		if (!ctx || !glyph || !w) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, w, h);
		const side = Math.min(w, h), pitch = side / GRID, r = DOT * pitch;
		const ox = (w - side) / 2, oy = (h - side) / 2;
		const f = glyph.frames[k] ?? glyph.frames[0];
		ctx.fillStyle = ink;
		for (let row = 0; row < GRID; row++) {
			for (let col = 0; col < GRID; col++) {
				if (f[row][col] !== '#') continue;
				ctx.beginPath();
				ctx.arc(ox + (col + 0.5) * pitch, oy + (row + 0.5) * pitch, r, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}

	function show(k: number) {
		lastIdx = k;
		draw(k);
	}

	/** the frame a resting glyph shows: the still — or, under reduced motion, a rep's working pose */
	const restFrame = () => (reduced && glyph?.motion === 'rep' ? workFrame('rep') : REST);

	// one pass: every frame of the gear once, then rest. Draws only when the
	// index changes; the loop ends with the pass. (A frame's timestamp can
	// precede the press that queued it, so the first tick is clamped.)
	function pass(now: number) {
		if (!glyph) return;
		const gear = MOTIONS[glyph.motion];
		const total = repMs(glyph.motion);
		const t = Math.max(0, now - start);
		const idx = t < total ? Math.floor(t / gear.frameMs) : REST;
		if (idx !== lastIdx) show(idx);
		raf = t < total ? requestAnimationFrame(pass) : 0;
	}

	// the hold: the cycle over and over, on the page's clock, so every looping
	// glyph on screen is in step — a rep with its rest, a breath without one
	function cycle(now: number) {
		if (!glyph) return;
		const idx = frameAt(now, glyph.motion);
		if (idx !== lastIdx) show(idx);
		raf = requestAnimationFrame(cycle);
	}

	/** a press: a rep or a breath, once. A still has nothing to play. */
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
		// size follows CSS (the parent may shrink it on short screens); the
		// observer also fires once on observe, which is the first paint
		const ro = new ResizeObserver(() => {
			if (!measure()) return;
			if (raf) lastIdx = -1; // mid-animation: the next tick repaints at its frame
			else show(restFrame());
		});
		ro.observe(el);
		// only a rep announces itself: a breath waits to be pressed, a still never moves
		if (play && g.motion === 'rep') arrive = setTimeout(replay, ARRIVE_MS);
		return () => {
			ro.disconnect();
			clearTimeout(arrive);
			cancelAnimationFrame(raf);
			raf = 0;
			lastIdx = -1;
		};
	});

	// the hold: the figure works through its gear for as long as it lasts
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
	<!-- decorative: the exercise name is the adjacent text, so no label, no
	     tab stop — but a press runs the rep (or the breath) again -->
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
