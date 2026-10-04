<script lang="ts">
	import { onMount } from 'svelte';
	import { Caption, Note, Slot, Switch, Title } from '$lib/ui';
	import { FIGURES, FPS, GROUPS, draw, drawRig, keyGrid, type Figure, type Inks } from '$lib/design/rig';
	import { Stage, type Readout } from '$lib/design/stage';

	const byId = new Map(FIGURES.map((f) => [f.id, f]));
	let picked = $state<Figure>(FIGURES[0]);
	let reduced = $state(false);
	let osReduced = $state(false);
	let skeleton = $state(false);
	let readout = $state<Readout>({ label: 'Ready', sub: '', notation: '', segs: [] });
	let stageEl = $state<HTMLCanvasElement>();
	let tiles = $state<HTMLCanvasElement[]>([]);
	let stage: Stage | undefined;
	const now = () => performance.now() / 1000;
	const cap = (c: string) => (c ? c.charAt(0).toUpperCase() + c.slice(1) + (/[.!?]$/.test(c) ? '' : '.') : '');

	function pick(f: Figure) {
		stage?.show(f, now());
		picked = f;
	}
	function toggleReduced() {
		reduced = !reduced;
		stage?.setReduced(reduced, now());
	}

	onMount(() => {
		osReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
		reduced = osReduced;
		stage = new Stage(picked, reduced, now());
		const css = getComputedStyle(document.documentElement), v = (n: string) => css.getPropertyValue(n).trim();
		const inks: Inks = { ink: v('--ink'), grid: v('--dot'), floor: v('--dot-floor') };
		const dpr = Math.min(2.5, window.devicePixelRatio || 1);
		const paint = (el: HTMLCanvasElement, draw: (ctx: CanvasRenderingContext2D, size: number) => void) => {
			const size = el.clientWidth, px = Math.round(size * dpr), ctx = el.getContext('2d');
			if (!size || !ctx) return;
			if (el.width !== px) el.width = el.height = px;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			draw(ctx, size);
		};
		FIGURES.forEach((f, i) => tiles[i] && paint(tiles[i], (ctx, size) => draw(ctx, size, keyGrid(f), 'halftone', { ...inks, grid: null })));
		let raf = 0, last = -1, lastKey = '';
		const tick = () => {
			raf = requestAnimationFrame(tick);
			const step = Math.floor(now() * FPS);
			if (step === last || !stage || !stageEl) return;
			last = step;
			const shot = stage.frame(step / FPS);
			paint(stageEl, (ctx, size) => {
				draw(ctx, size, shot.grid, 'halftone', inks);
				if (skeleton) drawRig(ctx, size, shot.grid, shot.J, { ink: inks.ink, bone: v('--volt'), joint: v('--white') });
			});
			const key = JSON.stringify(shot.readout);
			if (key !== lastKey) {
				lastKey = key;
				readout = shot.readout;
			}
		};
		tick();
		return () => cancelAnimationFrame(raf);
	});
</script>

<div class="lab">
	<header class="head">
		<Caption>Rig v2 · figure lab · {FIGURES.length} figures</Caption>
		<Title caps>The dot athlete, rebuilt as a body</Title>
		<p>Same dot grid. Underneath it's now a 3D skeleton with fixed-length bones, real volumes and light, timed to each exercise's tempo. Every figure in the plans is here.</p>
	</header>

	<div class="top">
		<section class="stage">
			<div class="namebar"><span class="name">{picked.name}</span><span class="pill">{readout.label}</span></div>
			<button type="button" class="canvas" aria-label="Replay" onclick={() => stage?.replay(now())}><canvas bind:this={stageEl}></canvas></button>
			<div class="segs">
				{#each readout.segs as s, i (i)}
					<div class="seg" style="flex: {s.flex}" class:zero={s.zero}><span class="fill" style="width: {Math.round(s.u * 100)}%"></span><span class="slbl">{s.label}</span><span class="secs">{s.secs}</span></div>
				{/each}
			</div>
			<div class="meta"><b>{readout.sub}</b><span>{readout.notation}</span></div>
			<div class="foot">
				<Note size="sm" tone="stone">Tap to replay · the camera picks each angle</Note>
				<button type="button" class="chip" class:on={skeleton} aria-pressed={skeleton} onclick={() => (skeleton = !skeleton)}>{skeleton ? 'Hide skeleton' : 'Show skeleton'}</button>
			</div>
		</section>

		<div class="side">
			<section class="box">
				<Caption tone="slate">Exercise · switching walks the route</Caption>
				<div class="groups">
					{#each GROUPS as [g, ids] (g)}
						<div class="group">
							<span class="gname">{g}</span>
							<div class="chips">
								{#each ids as id (id)}
									{@const f = byId.get(id)!}
									<button type="button" class="chip" class:on={f === picked} onclick={() => pick(f)}>{f.name}</button>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</section>
			<section class="box">
				<div class="row"><Caption tone="slate">Motion · {reduced ? 'Still' : 'Ambient'}</Caption><span class="sw">Reduced motion <Switch on={reduced} label="Reduced motion" onclick={toggleReduced} /></span></div>
				<p>
					{#if !reduced}Two demo reps at tempo, then the start pose, breathing. Tap the figure to replay. Reduced motion takes over automatically when the phone asks for it.
					{:else if osReduced}Your device asks for reduced motion, so each figure holds its key pose with a faint breath. No reps, no camera moves.
					{:else}Previewing reduced motion: each figure holds its key pose with a faint breath. Switching exercises cuts straight to the next one.{/if}
				</p>
			</section>
			<section class="box paper">
				<Caption tone="slate">On the floor · actual size · the real Slot</Caption>
				<div class="ctx">
					<Slot exercise={picked.name} />
					<div class="words"><Title size="md" caps>{picked.name}</Title><span class="cue">{cap(picked.cue)}</span></div>
				</div>
			</section>
		</div>
	</div>

	<section class="all">
		<Caption tone="slate">Every figure · key pose · tap to load</Caption>
		<div class="tiles">
			{#each FIGURES as f, i (f.id)}
				<button type="button" class="tile" class:on={f === picked} onclick={() => pick(f)}><canvas bind:this={tiles[i]}></canvas><span>{f.name}</span></button>
			{/each}
		</div>
	</section>

	<section class="all">
		<Caption tone="slate">How it works</Caption>
		<div class="how">
			<div class="card"><b>Bones, not dots</b><p>A 3D skeleton with fixed-length bones, posed by rotating joints. Hands reach their targets by IK (the bell, the floor). Feet that stay down for the whole rep are pinned by IK too, so they stay rooted while the knees track.</p></div>
			<div class="card"><b>Masses, not sticks</b><p>This is how 3D artists block out a figure: ribcage, pelvis and head as solid shapes on a bending spine, then tapered limbs. It looks real because of proportion (about 7½ heads tall), weight over the feet and contact with the floor, not because of detail.</p></div>
			<div class="card"><b>Same grid, real light</b><p>41 × 41 dots. Each one samples light from the upper left, and darker means a bigger dot. Equipment is drawn lighter so the body always reads first. Frames step at 12 fps (animators' "on twos"), so it reads as deliberate, not jittery.</p></div>
			<div class="card"><b>Tempo is data</b><p>Every lift carries gym tempo notation: lower · pause · drive · pause. The lowering eases in evenly and the drive is snappier. Breathing follows the rep: in on the way down, out on the effort.</p></div>
			<div class="card"><b>Holds breathe</b><p>No pulsing. A hold sits still on a 2 s in / 3 s out breath with a faint sway. A stretch sinks a little on each exhale for about three breaths, then stays put.</p></div>
			<div class="card"><b>The camera chooses</b><p>Each figure has its own angle: side-on for squats and hinges, front-on for presses and Warrior II, three-quarter where depth matters. For walking, running and carioca the camera travels with the body and light gravel scrolls past underneath, so the feet stay planted on a moving floor.</p></div>
			<div class="card"><b>Calm, accessible</b><p>By default it plays two demo reps and then stays still, breathing. When the phone asks for reduced motion, every figure shows its key pose with no reps, no orbit and no walking between exercises. The figure is decorative; the name and cue carry the instructions.</p></div>
		</div>
	</section>
</div>

<style>
	.lab { max-width: 1160px; margin: 0 auto; padding: 28px 16px 56px; display: flex; flex-direction: column; gap: 22px; }
	.head { display: flex; flex-direction: column; gap: 6px; max-width: 760px; }
	.head :global(.title) { font-size: clamp(28px, 4vw, 40px); }
	p { margin: 0; font-size: 15px; line-height: 1.5; color: var(--slate); text-wrap: pretty; }
	.top { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 20px; align-items: start; }
	.stage { background: var(--paper); border: var(--border-w) solid var(--ink); border-radius: 20px; padding: 16px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
	.namebar { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
	.name { font-family: var(--font-display); font-weight: var(--weight-black); font-size: 20px; line-height: 1.1; text-transform: uppercase; }
	.pill { display: flex; align-items: center; min-height: 30px; padding: 0 12px; border: 1.5px solid var(--ink); border-radius: var(--radius-pill); background: var(--volt); font-family: var(--font-mono); font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
	.canvas { display: block; width: 100%; max-width: 520px; aspect-ratio: 1; margin: 0 auto; padding: 0; background: none; border: 0; cursor: pointer; }
	.canvas canvas, .tile canvas { width: 100%; aspect-ratio: 1; display: block; }
	.segs { display: flex; gap: 6px; }
	.seg { position: relative; min-width: 0; overflow: hidden; display: flex; flex-direction: column; padding: 6px 8px; border: 1.5px solid var(--ink); border-radius: 10px; background: var(--white); }
	.seg.zero { opacity: 0.4; }
	.fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--volt); }
	.slbl, .secs { position: relative; font-family: var(--font-mono); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.slbl { font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; }
	.secs { font-size: 12px; }
	.meta { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font-family: var(--font-mono); font-size: 12px; color: var(--slate); }
	.meta b { color: var(--ink); }
	.foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; border-top: 1.5px dashed var(--dot-floor); padding-top: 10px; }
	.side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
	.box { background: var(--white); border: var(--border-w) solid var(--ink); border-radius: var(--radius-lg); padding: 14px; display: flex; flex-direction: column; gap: 10px; }
	.box.paper { background: var(--paper); }
	.box p { font-size: 14px; line-height: 1.45; }
	.groups { display: flex; flex-direction: column; gap: 12px; max-height: 340px; overflow: auto; overscroll-behavior: contain; padding-right: 4px; }
	.group { display: flex; flex-direction: column; gap: 6px; }
	.gname { font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--stone); }
	.chips { display: flex; flex-wrap: wrap; gap: 6px; }
	.chip { min-height: 36px; padding: 0 12px; border-radius: var(--radius-pill); border: var(--border-w) solid var(--ink); background: var(--white); color: var(--ink); font-family: var(--font-body); font-weight: 700; font-size: 13px; cursor: pointer; }
	.chip.on { background: var(--ink); color: var(--paper); }
	.row { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
	.sw { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; font-size: 13px; }
	.ctx { display: flex; gap: 14px; align-items: center; }
	.words { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
	.cue { font-size: 13px; line-height: 1.4; color: var(--slate); }
	.all { display: flex; flex-direction: column; gap: 12px; }
	.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 10px; }
	.tile { display: flex; flex-direction: column; gap: 6px; padding: 8px; border-radius: 14px; border: var(--border-w) solid var(--paper-3); background: var(--paper); cursor: pointer; text-align: left; }
	.tile canvas { background: var(--ash); border-radius: 10px; }
	.tile span { font-family: var(--font-body); font-weight: 700; font-size: 12px; line-height: 1.25; color: var(--ink); }
	.tile.on { border-color: var(--ink); }
	.how { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); gap: 12px; }
	.card { background: var(--white); border: var(--border-w) solid var(--ink); border-radius: var(--radius-lg); padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; }
	.card b { font-family: var(--font-display); font-weight: var(--weight-black); font-size: 16px; text-transform: uppercase; }
	.card p { font-size: 14px; line-height: 1.45; }
</style>
