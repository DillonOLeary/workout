<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { FPS, STAND, draw, figureFor, type Inks } from '$lib/design/rig';
	import { Stage } from '$lib/design/stage';

	/**
	 * The figure, live: rig v2 on a 12 fps clock. A new exercise walks the body over from the last, shows two reps at tempo,
	 * then breathes in the start pose; a tap shows it again. Reduced motion: the key pose, breathing, and a cut between
	 * exercises. Floor 92px, Done 84px; a name the rig doesn't know stands.
	 */
	let { exercise, size = 92 }: { exercise: string; size?: number } = $props();

	let canvas = $state<HTMLCanvasElement>();
	let stage: Stage | undefined;
	const figure = (name: string) => figureFor(name) ?? figureFor(STAND)!;
	const now = () => performance.now() / 1000;

	$effect(() => {
		const f = figure(exercise);
		untrack(() => {
			if (stage && stage.figure !== f) stage.show(f, now());
		});
	});

	onMount(() => {
		const motion = matchMedia('(prefers-reduced-motion: reduce)');
		stage = new Stage(figure(exercise), motion.matches, now());
		const onMotion = () => stage?.setReduced(motion.matches, now());
		motion.addEventListener('change', onMotion);
		const css = getComputedStyle(canvas!);
		const inks: Inks = { ink: css.getPropertyValue('--ink').trim(), grid: css.getPropertyValue('--dot').trim(), floor: css.getPropertyValue('--dot-floor').trim() };
		let raf = 0, last = -1;
		const tick = () => {
			raf = requestAnimationFrame(tick);
			const step = Math.floor(now() * FPS), ctx = canvas?.getContext('2d');
			if (step === last || !stage || !canvas || !ctx) return;
			last = step;
			const dpr = Math.min(2.5, window.devicePixelRatio || 1), px = Math.round(size * dpr);
			if (canvas.width !== px) canvas.width = canvas.height = px;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			draw(ctx, size, stage.frame(step / FPS).grid, 'halftone', inks);
		};
		tick();
		return () => {
			cancelAnimationFrame(raf);
			motion.removeEventListener('change', onMotion);
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
