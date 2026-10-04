import { CENTER_Y, GRID, SPAN, easeCubic, figureFrame, hopFrame, planRoute, render, snapshot, type Angles, type Figure, type Grid, type Hop, type Joints, type Mode, type Scene } from './rig';

type Act =
	| { type: 'ex'; ex: Figure; t0: number }
	| { type: 'tr'; hops: Hop[]; total: number; wx: number; t0: number; to: Figure; yaw0: number; yaw1: number; pitch0: number; pitch1: number };

/** what a frame is doing, in words: the phase, where in it, the tempo or breath, and the segments of the move with the one under way filled */
export type Readout = { label: string; sub: string; notation: string; segs: { label: string; secs: string; flex: number; zero: boolean; u: number }[] };

/** one frame off the stage: the dots, the scene they came from (for the skeleton), and the words */
export type Shot = { grid: Grid; scene: Scene; readout: Readout };

/**
 * One figure on a clock (seconds, the caller's): it shows a figure, walks the route to the next one, replays, and honours
 * reduced motion — no reps, no walking, a cut between figures. Framework-free, so the Slot and the figure lab share it.
 */
export class Stage {
	reduced: boolean;
	private act: Act;
	private wx = 0;
	private cur: { body: Angles; props: string[]; J: Joints } | null = null;
	private yaw: number;
	private pitch: number;
	private camX: number | null = null;
	private lastT: number | null = null;

	constructor(fig: Figure, reduced: boolean, now: number) {
		this.reduced = reduced;
		this.act = { type: 'ex', ex: fig, t0: now };
		this.yaw = fig.yaw;
		this.pitch = fig.pitch;
	}

	/** the figure on stage, or the one it is walking to */
	get figure(): Figure {
		return this.act.type === 'ex' ? this.act.ex : this.act.to;
	}

	private get mode(): Mode {
		return this.reduced ? 'still' : 'ambient';
	}

	/** go to a figure: the same one replays; another is walked to, or cut to under reduced motion */
	show(to: Figure, now: number) {
		const a = this.act;
		if (a.type === 'ex' && a.ex === to) return this.replay(now);
		if (this.reduced || !this.cur) {
			this.wx = 0;
			this.act = { type: 'ex', ex: to, t0: now };
			return;
		}
		const fromBase = a.type === 'ex' ? a.ex.base : a.to.base;
		const p = planRoute(snapshot(this.cur.body, this.cur.J, this.cur.props), fromBase, to, this.mode);
		this.act = { type: 'tr', hops: p.hops, total: p.total, wx: p.wx, t0: now, to, yaw0: this.yaw, yaw1: to.yaw, pitch0: this.pitch, pitch1: to.pitch };
	}

	/** the demo again, from the top */
	replay(now: number) {
		if (this.act.type === 'ex') this.act.t0 = now;
	}

	/** the phone asked for reduced motion, or stopped asking — the figure starts over in the new mode */
	setReduced(on: boolean, now: number) {
		this.reduced = on;
		this.replay(now);
	}

	/** the figure at clock time t, sampled into an N × N grid */
	frame(t: number, N = GRID): Shot {
		const a = this.act;
		let scene: Scene, readout: Readout, camTarget: number, yaw: number, pitch: number, ground = null;
		if (a.type === 'tr') {
			const el = t - a.t0;
			if (el >= a.total) {
				this.wx = a.wx;
				this.act = { type: 'ex', ex: a.to, t0: a.t0 + a.total };
				return this.frame(t, N);
			}
			let acc = 0, h = 0;
			while (h < a.hops.length - 1 && el >= acc + a.hops[h].dur) acc += a.hops[h++].dur;
			const hop = a.hops[h], u = Math.min(1, (el - acc) / hop.dur), f = hopFrame(hop, u);
			scene = f.scene;
			const k = easeCubic(el / a.total);
			yaw = a.yaw0 + (a.yaw1 - a.yaw0) * k;
			pitch = a.pitch0 + (a.pitch1 - a.pitch0) * k;
			this.cur = { body: f.body, props: f.props, J: scene.J };
			camTarget = (scene.box.lo[0] + scene.box.hi[0]) / 2;
			readout = {
				label: 'Moving', sub: `→ ${a.to.name}`, notation: `route · ${a.hops.length} ${a.hops.length > 1 ? 'hops' : 'hop'}`,
				segs: a.hops.map((hp, i) => ({ label: hp.B.name, secs: `${hp.dur.toFixed(1)}s`, flex: hp.dur, zero: false, u: i === h ? u : i < h ? 1 : 0 }))
			};
		} else {
			const f = figureFrame(a.ex, this.mode, t - a.t0, t, this.wx), ex = a.ex, tl = f.tl;
			scene = f.scene;
			ground = f.ground ?? null;
			yaw = ex.yaw;
			pitch = ex.pitch;
			this.cur = { body: f.body, props: f.props, J: scene.J };
			camTarget = this.wx;
			readout = {
				label: tl.label, sub: tl.sub,
				notation: ex.kind === 'rep' ? `tempo ${ex.tempo!.join('·')}` : ex.kind === 'idle' ? 'breath 1.8 / 2.7 s' : `breath ${ex.breath!.join(' / ')} s`,
				segs: tl.segs.map((s, i) => ({ label: s[0], secs: `${s[1]}s`, flex: Math.max(s[1], 0.45), zero: !s[1], u: i === tl.seg ? tl.u : 0 }))
			};
		}
		this.yaw = yaw;
		this.pitch = pitch;
		// the camera follows a walking figure with a 0.45 s lag; under reduced motion it never travels
		const dtc = this.lastT == null ? 1 : Math.min(1, Math.max(0, t - this.lastT));
		this.lastT = t;
		this.camX = this.camX == null || this.reduced ? camTarget : this.camX + (camTarget - this.camX) * (1 - Math.exp(-dtc / 0.45));
		return { grid: render(scene, { yaw, pitch, center: [this.camX, CENTER_Y, 0], span: SPAN }, N, ground), scene, readout };
	}
}
