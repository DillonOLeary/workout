<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { Stage } from '$lib/design/stage';

	/**
	 * The figure, live: rig v2 on a 12 fps clock. A new exercise walks the body over from the last, shows two reps at tempo,
	 * then breathes in the start pose; a tap shows it again. Reduced motion: the key pose, breathing, and a cut between
	 * exercises. Floor 92px, Done 84px; no exercise, or one the rig doesn't know, stands. The rig loads with the first Slot, not with the page.
	 */
	let { exercise, size = 92 }: { exercise?: string; size?: number } = $props();

	let canvas = $state<HTMLCanvasElement>();
	let stage: Stage | undefined;
	let show: ((name?: string) => void) | undefined;
	const now = () => performance.now() / 1000;

	$effect(() => {
		const name = exercise;
		untrack(() => show?.(name));
	});

	onMount(() => {
		let raf = 0, live = true, stop = () => {};
		void Promise.all([import('$lib/design/rig'), import('$lib/design/stage')]).then(([rig, { Stage }]) => {
			if (!live || !canvas) return;
			const figure = (name?: string) => (name && rig.figureFor(name)) || rig.figureFor(rig.STAND)!;
			const motion = matchMedia('(prefers-reduced-motion: reduce)');
			const s = (stage = new Stage(figure(exercise), motion.matches, now()));
			show = (name) => {
				const f = figure(name);
				if (s.figure !== f) s.show(f, now());
			};
			const onMotion = () => s.setReduced(motion.matches, now());
			motion.addEventListener('change', onMotion);
			const css = getComputedStyle(canvas);
			const inks = { ink: css.getPropertyValue('--ink').trim(), grid: css.getPropertyValue('--dot').trim(), floor: css.getPropertyValue('--dot-floor').trim() };
			let last = -1;
			const tick = () => {
				raf = requestAnimationFrame(tick);
				const step = Math.floor(now() * rig.FPS), ctx = canvas?.getContext('2d');
				if (step === last || !canvas || !ctx) return;
				last = step;
				const dpr = Math.min(2.5, window.devicePixelRatio || 1), px = Math.round(size * dpr);
				if (canvas.width !== px) canvas.width = canvas.height = px;
				ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
				rig.draw(ctx, size, s.frame(step / rig.FPS).grid, 'halftone', inks);
			};
			tick();
			stop = () => motion.removeEventListener('change', onMotion);
		});
		return () => {
			live = false;
			cancelAnimationFrame(raf);
			stop();
		};
	});
</script>

<button type="button" class="slot" style="--s: {size}px" aria-label="Show the movement again" onclick={() => stage?.replay(now())}><canvas bind:this={canvas}></canvas></button>

<style>
	.slot {
		display: grid; place-items: center; flex: none; width: var(--s); height: var(--s); padding: 0; margin: 0;
		background: var(--ash); border: 0; border-radius: 14px; overflow: hidden; cursor: pointer; touch-action: manipulation;
	}
	canvas { width: 100%; height: 100%; display: block; }
</style>
