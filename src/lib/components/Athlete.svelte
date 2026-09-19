<script module lang="ts">
	/**
	 * What the figure does once it is in the pose — the floor's state, read off the body:
	 * `set` enter, then one rep (a breath or a still just settles) · `ready` enter and wait at the top ·
	 * `running` loop the pose's own gear (a hold, the run, the standing breath of a rest) · `still` hold one frame.
	 */
	export type Phase = 'set' | 'ready' | 'running' | 'still';
</script>

<script lang="ts">
	import { MOTIONS, frameAt, repMs, workFrame } from '$lib/design/glyphs';
	import { HOP_MS, STAND, figureFor, frameFor, hopStamps, joints, motionOf, restDepth, route, type Figure, type Frame, type Joints } from '$lib/design/rig';
	import { stamp } from '$lib/design/stamp';

	/** one athlete for the whole session: `pose` is an exercise name (or STAND); it works out the path itself */
	let { pose, phase, size = 240 }: { pose: string; phase: Phase; size?: number } = $props();

	const MIN_PX = 24;
	let canvas = $state<HTMLCanvasElement>();

	// the playback clock is plain lets: it changes every stamp and nothing in the template reads it
	let w = 0, h = 0, dpr = 1, ink = '#1A1915';
	let reduced = false;
	let raf = 0;
	let cur = STAND;
	let fig: Figure = figureFor(STAND)!;
	let here: Joints = joints(fig, 0);
	let path: { J: Joints; frame: () => Frame }[] = [];
	let segStart = 0, segShown: unknown = null;
	let mode: 'idle' | 'pass' | 'loop' = 'idle';
	let lastFrame: Frame | null = null;

	function measure(): boolean {
		if (!canvas) return false;
		const r = canvas.getBoundingClientRect();
		if (r.width < MIN_PX) {
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

	function draw(f: Frame) {
		lastFrame = f;
		const ctx = canvas?.getContext('2d');
		if (ctx && w) stamp(ctx, f, w, h, dpr, ink);
	}
	/** the k-th stamp of the current figure's gear */
	const gearFrame = (k: number) => frameFor(fig, MOTIONS[motionOf(fig)].seq[k] ?? restDepth(fig));
	/** what reduced motion shows: the work frame of a rep, the top of anything else */
	const cutFrame = () => gearFrame(motionOf(fig) === 'rep' ? workFrame('rep') : 0);

	function tick(now: number) {
		if (path.length) {
			const s = path[0];
			if (s !== segShown) {
				draw(s.frame());
				segShown = s;
				here = s.J;
			}
			if (now - segStart >= HOP_MS) {
				path.shift();
				segStart = now;
			}
			raf = requestAnimationFrame(tick);
			return;
		}
		const motion = motionOf(fig);
		if (mode === 'pass') {
			const t = now - segStart;
			if (t >= repMs(motion)) mode = 'idle';
			else {
				draw(gearFrame(Math.floor(t / MOTIONS[motion].frameMs)));
				raf = requestAnimationFrame(tick);
				return;
			}
		} else if (mode === 'loop') {
			draw(gearFrame(frameAt(now - segStart, motion)));
			raf = requestAnimationFrame(tick);
			return;
		}
		draw(gearFrame(0));
		raf = 0;
	}

	function run() {
		if (!raf) raf = requestAnimationFrame(tick);
	}

	/** plan the hops from wherever the body is now; a still figure with no path just shows its frame */
	function goTo(name: string) {
		const to = figureFor(name) ?? figureFor(STAND)!;
		if (reduced) {
			fig = to;
			here = joints(fig, restDepth(fig));
			draw(cutFrame());
			return;
		}
		path = route(fig, to, here).flatMap(hopStamps);
		fig = to;
		if (!path.length) here = joints(fig, restDepth(fig));
		segShown = null;
		segStart = performance.now();
	}

	function settle(ph: Phase) {
		if (reduced) return;
		const motion = motionOf(fig);
		mode = ph === 'running' && MOTIONS[motion].frameMs ? 'loop' : ph === 'set' && motion === 'rep' ? 'pass' : 'idle';
		if (!path.length) segStart = performance.now();
		run();
	}

	function replay() {
		if (reduced || mode !== 'idle' || path.length || motionOf(fig) !== 'rep') return;
		mode = 'pass';
		segStart = performance.now();
		run();
	}

	$effect(() => {
		const el = canvas;
		if (!el) return;
		reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const ro = new ResizeObserver(() => {
			if (measure() && lastFrame) draw(lastFrame);
		});
		ro.observe(el);
		return () => {
			ro.disconnect();
			cancelAnimationFrame(raf);
			raf = 0;
		};
	});

	// the floor says where the body should be and what it is doing; the figure finds its own way there
	$effect(() => {
		const name = pose, ph = phase;
		if (name !== cur) {
			cur = name;
			goTo(name);
		}
		settle(ph);
	});
</script>

<canvas bind:this={canvas} class="glyph" style="--gs: {size}px" aria-hidden="true" onpointerdown={replay}></canvas>

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
