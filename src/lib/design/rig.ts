// The dot athlete, live. One skeleton (hip, torso angle, ankles, hands — knees and elbows by IK), one world
// (the ground is FLOOR for every pose), one interpolator (a pose is a function of depth 0..1, and any two
// normalized poses lerp). Seeded from two Claude Design projects; the poses are data, the rest draws them.
// `tools/glyphs/bake.mjs` snapshots every stamp to JSON, and the test suite proves the snapshot still matches.

export const GRID = 31;
/** one dot, in figure units */
const U = 0.042;
export const FLOOR = 0.021;
/** ankle height when the foot is flat on the floor */
export const ANK = FLOOR + 0.9 * U;

export type Motion = 'rep' | 'breath' | 'still';
/** how a gear runs: the depths it stamps, and the clock that plays them */
export type Gear = { seq: number[]; frameMs: number; holdMs: number };
/** three gears — a rep out and back then a rest, a breath rising and falling, a still */
export const MOTIONS: Record<Motion, Gear> = {
	rep: { seq: [0, 0.16, 0.34, 0.55, 0.76, 0.92, 1, 0.9, 0.72, 0.5, 0.28, 0.1], frameMs: 130, holdMs: 900 },
	breath: { seq: [0, 0.5, 1, 0.5], frameMs: 800, holdMs: 0 },
	still: { seq: [1], frameMs: 0, holdMs: 0 }
};
/** one hop of a transition: six stamps, on the rep clock */
export const HOP_FRAMES = 6;
export const HOP_MS = MOTIONS.rep.frameMs;
/** a side figure can't rotate — a turn is four dithered stamps */
export const TURN_FRAMES = 4;

export type View = 'side' | 'front';
/** where a pose is entered from and left to; stand is the default and the hub */
export type Waypoint = 'stand' | 'kneel' | 'sit' | 'back';
export type Pt = [number, number];
/** a leg: the ankle exactly where you put it, the knee by IK (bend ±1 toward ±x, 0 straight) unless given; foot in degrees heel-up */
export type LegIn = { ank: Pt; bend?: 1 | -1 | 0; knee?: Pt; foot?: number };
/** an arm: the hand by IK, or the elbow and hand placed */
export type ArmIn = { hand: Pt; bend?: 1 | -1 } | { el: Pt; hd: Pt };
/** a bar, a bench, a wall: [x1, y1, x2, y2, radius?] */
export type World = number[];
export type Pose = { view?: View; hip: Pt; t?: number; headFwd?: number; legs: LegIn[]; arms: ArmIn[]; world?: World[] };
/** every joint placed, both legs and both arms — the shape any two of which lerp */
export type Joints = {
	view: View;
	hip: Pt;
	t: number;
	headFwd: number;
	legs: { knee: Pt; ank: Pt; foot: number }[];
	arms: { el: Pt; hd: Pt }[];
	world: World[];
};
export type Figure = {
	id: string;
	name: string;
	aliases?: string[];
	cue: string;
	motion?: Motion;
	waypoint?: Waypoint;
	pose: (d: number) => Pose;
};
/** 31 rows of 31 characters, top row first; '#' prints */
export type Frame = string[];

const rad = (a: number) => (a * Math.PI) / 180;
const dot = (o: Pt, dir: Pt, len: number): Pt => [o[0] + dir[0] * len, o[1] + dir[1] * len];
const rot = (v: Pt, a: number): Pt => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const THIGH = 7 * U, SHIN = 6.5 * U, UARM = 5.5 * U, FARM = 5 * U;

/** the joint between a and b; side +1 bends toward +x, −1 toward −x, 0 straight */
export function ik(a: Pt, b: Pt, l1: number, l2: number, side: number): Pt {
	let dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1e-6;
	const dmax = l1 + l2 - 1e-4;
	if (d > dmax) { dx *= dmax / d; dy *= dmax / d; d = dmax; }
	const x = (d * d + l1 * l1 - l2 * l2) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
	const ux = dx / d, uy = dy / d, px = uy, py = -ux;
	if (!side) return [a[0] + ux * x, a[1] + uy * x];
	const k1: Pt = [a[0] + ux * x + px * h, a[1] + uy * x + py * h], k2: Pt = [a[0] + ux * x - px * h, a[1] + uy * x - py * h];
	return side > 0 ? (k1[0] >= k2[0] ? k1 : k2) : k1[0] < k2[0] ? k1 : k2;
}

const hipHalfOf = (view: View) => (view === 'front' ? 1.5 * U : 0.4 * U);
const shHalfOf = (view: View) => (view === 'front' ? 3 * U : 0);
const SPINE = { lumbar: -6, thoracic: 5 };
const spineTop = (hip: Pt, t: number): Pt => {
	const lum: Pt = [Math.sin(rad(t + SPINE.lumbar)), Math.cos(rad(t + SPINE.lumbar))];
	const tho: Pt = [Math.sin(rad(t + SPINE.thoracic)), Math.cos(rad(t + SPINE.thoracic))];
	return dot(dot(hip, lum, 3.6 * U), tho, 4.6 * U);
};

/** fills both legs and both arms (a missing one mirrors the first) and solves every joint, so any two poses lerp */
export function normalize(P: Pose): Joints {
	const view = P.view ?? 'side', t = P.t ?? 0, hipHalf = hipHalfOf(view), shHalf = shHalfOf(view), top = spineTop(P.hip, t);
	const legs = [0, 1].map((i) => {
		const l = P.legs[i] ?? P.legs[0], o: Pt = [P.hip[0] + (i === 0 ? -1 : 1) * hipHalf, P.hip[1]];
		return { knee: l.knee ?? ik(o, l.ank, THIGH, SHIN, l.bend ?? 1), ank: l.ank, foot: l.foot ?? 0 };
	});
	const arms = [0, 1].map((i) => {
		const a = P.arms[i] ?? P.arms[0], o: Pt = [top[0] + (i === 0 ? -1 : 1) * shHalf, top[1] - 0.4 * U];
		return 'el' in a ? { el: a.el, hd: a.hd } : { el: ik(o, a.hand, UARM, FARM, a.bend ?? -1), hd: a.hand };
	});
	return { view, hip: P.hip, t, headFwd: P.headFwd ?? 0, legs, arms, world: P.world ?? [] };
}

/** the joints d of the way from A to B — exactly A at 0 and B at 1, so a hop lands on the pose; the view and the world switch halfway */
export function lerp(A: Joints, B: Joints, d: number): Joints {
	const L = (a: number, b: number) => a * (1 - d) + b * d, P = (a: Pt, b: Pt): Pt => [L(a[0], b[0]), L(a[1], b[1])];
	return {
		view: d < 0.5 ? A.view : B.view,
		hip: P(A.hip, B.hip),
		t: L(A.t, B.t),
		headFwd: L(A.headFwd, B.headFwd),
		legs: A.legs.map((l, i) => ({ knee: P(l.knee, B.legs[i].knee), ank: P(l.ank, B.legs[i].ank), foot: L(l.foot, B.legs[i].foot) })),
		arms: A.arms.map((a, i) => ({ el: P(a.el, B.arms[i].el), hd: P(a.hd, B.arms[i].hd) })),
		world: d < 0.5 ? A.world : B.world
	};
}

/* ---- masses: the body as tapered capsules, shaded by a dithered normal ---- */

type Mass = { x1: number; y1: number; x2: number; y2: number; r0: number; r1: number; world?: boolean };
const K: Record<string, number> = { chest: 0.88, pelvis: 0.88, glute: 0.88, quad: 0.86, shin: 0.88, calf: 0.88, delt: 0.88, uarm: 0.86, farm: 0.86, neck: 0.9 };
const kk = (n: string) => K[n] ?? 1;
const cap = (a: Pt, b: Pt, r0: number, r1: number, group: string): Mass => ({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], r0: r0 * kk(group), r1: r1 * kk(group) });

function masses(J: Joints): Mass[] {
	const front = J.view === 'front', M: Mass[] = [], t = J.t, hip = J.hip;
	const lum: Pt = [Math.sin(rad(t + SPINE.lumbar)), Math.cos(rad(t + SPINE.lumbar))], tho: Pt = [Math.sin(rad(t + SPINE.thoracic)), Math.cos(rad(t + SPINE.thoracic))];
	const mid = dot(hip, lum, 3.6 * U), top = dot(mid, tho, 4.6 * U), neck = dot(top, tho, 1.2 * U);
	const headC = dot(dot(neck, tho, 2.3 * U), [tho[1], -tho[0]], J.headFwd * U);
	const fwd: Pt = [Math.cos(rad(t)), -Math.sin(rad(t))];
	const hipHalf = hipHalfOf(J.view), shHalf = shHalfOf(J.view);
	if (front) {
		M.push(cap([top[0] - shHalf, top[1]], [top[0] + shHalf, top[1]], 0.085, 0.085, 'chest'));
		M.push(cap(top, mid, 0.12, 0.085, 'chest'), cap(mid, hip, 0.085, 0.1, 'pelvis'));
		M.push(cap([hip[0] - 1.6 * U, hip[1]], [hip[0] + 1.6 * U, hip[1]], 0.085, 0.085, 'pelvis'));
	} else {
		M.push(cap(top, mid, 0.115, 0.08, 'chest'));
		M.push(cap(dot(top, fwd, 0.06), dot(mid, fwd, 0.03), 0.065, 0.04, 'chest'));
		M.push(cap(mid, hip, 0.075, 0.095, 'pelvis'));
		M.push(cap(dot(hip, fwd, -0.075), dot(hip, fwd, -0.05), 0.09, 0.08, 'glute'));
	}
	M.push(cap(top, neck, 0.042, 0.038, 'neck'));
	M.push(cap(dot(headC, tho, -0.03), dot(headC, tho, 0.035), 0.078, 0.072, 'head'));
	J.legs.forEach((l, i) => {
		const knee = l.knee, ank = l.ank;
		M.push(cap([hip[0] + (i === 0 ? -1 : 1) * hipHalf, hip[1]], knee, 0.105, 0.068, 'quad'));
		M.push(cap(knee, ank, 0.06, 0.038, 'shin'));
		const sd: Pt = [ank[0] - knee[0], ank[1] - knee[1]], sl = Math.hypot(sd[0], sd[1]) || 1, su: Pt = [sd[0] / sl, sd[1] / sl];
		const back: Pt = front ? [0, 0] : [-su[1], su[0]];
		const bk: Pt = back[0] > 0 ? [-back[0], -back[1]] : back;
		M.push(cap(dot(dot(knee, su, 1.4 * U), bk, 0.012), dot(dot(knee, su, 3.6 * U), bk, 0.014), 0.068, 0.045, 'calf'));
		const fa = -rad(l.foot);
		const heel: Pt = front ? [ank[0] - 1.2 * U, ank[1] - 0.9 * U] : dot(ank, rot([-1.1 * U, -0.9 * U], fa), 1);
		const toe: Pt = front ? [ank[0] + 1.2 * U, ank[1] - 0.9 * U] : dot(ank, rot([3.4 * U, -1.05 * U], fa), 1);
		M.push(cap(heel, toe, 0.045, 0.024, 'foot'));
	});
	J.arms.forEach((ar, i) => {
		const s = i === 0 ? -1 : 1, o: Pt = [top[0] + s * shHalf, top[1] - 0.4 * U], el = ar.el, hd = ar.hd;
		const ud: Pt = [el[0] - o[0], el[1] - o[1]], ul = Math.hypot(ud[0], ud[1]) || 1, uu: Pt = [ud[0] / ul, ud[1] / ul];
		const fd: Pt = [hd[0] - el[0], hd[1] - el[1]], fl = Math.hypot(fd[0], fd[1]) || 1, fu: Pt = [fd[0] / fl, fd[1] / fl];
		M.push(cap(o, dot(o, uu, 1.5 * U), 0.075, 0.062, 'delt'));
		M.push(cap(dot(o, uu, 1.2 * U), el, 0.06, 0.045, 'uarm'));
		M.push(cap(el, hd, 0.048, 0.03, 'farm'));
		M.push(cap(hd, dot(hd, fu, 1.4 * U), 0.03, 0.02, 'hand'));
	});
	for (const w of J.world) M.push({ x1: w[0], y1: w[1], x2: w[2], y2: w[3], r0: w[4] ?? 0.013, r1: w[4] ?? 0.013, world: true });
	return M;
}

function sdf(M: Mass[], x: number, y: number): { d: number; m: Mass | null } {
	let best: { d: number; m: Mass | null } = { d: Infinity, m: null };
	for (const m of M) {
		const dx = m.x2 - m.x1, dy = m.y2 - m.y1, LL = dx * dx + dy * dy;
		let t = LL ? ((x - m.x1) * dx + (y - m.y1) * dy) / LL : 0;
		t = Math.max(0, Math.min(1, t));
		const r = m.r0 + (m.r1 - m.r0) * t, dd = Math.hypot(x - (m.x1 + dx * t), y - (m.y1 + dy * t)) / r;
		if (dd < best.d) best = { d: dd, m };
	}
	return best;
}
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const dither = (v: number, i: number, j: number) => v > (BAYER[j & 3][i & 3] + 0.5) / 16;
const LIGHT = [-0.6, 0.8];
function lit(M: Mass[], body: Mass[], x: number, y: number, i: number, j: number): boolean {
	const s = sdf(M, x, y);
	if (s.d > 1) return false;
	if (s.m?.world) return true;
	const e = U * 0.6;
	const nx = sdf(body, x + e, y).d - sdf(body, x - e, y).d, ny = sdf(body, x, y + e).d - sdf(body, x, y - e).d, n = Math.hypot(nx, ny) || 1;
	const l = (nx / n) * LIGHT[0] + (ny / n) * LIGHT[1];
	return dither(0.62 - 0.4 * l + 0.25 * s.d, i, j);
}

/** the joints stamped on the grid: row 0 is the top, the ground is the bottom row */
export function frame(J: Joints): Frame {
	const M = masses(J), body = M.filter((m) => !m.world), out: Frame = [];
	for (let r = 0; r < GRID; r++) {
		const j = GRID - 1 - r;
		let row = '';
		for (let i = 0; i < GRID; i++) row += lit(M, body, (i - 15) * U, 0.65 + (j - 15) * U, i, j) ? '#' : '.';
		out.push(row);
	}
	return out;
}

/** frame a dissolving into b, d of the way — a fixed noise so the same turn always looks the same */
export function dissolve(a: Frame, b: Frame, d: number): Frame {
	const noise = (r: number, i: number) => { const x = Math.sin((r * GRID + i + 1) * 12.9898) * 43758.5453; return x - Math.floor(x); };
	return a.map((row, r) => row.split('').map((c, i) => (noise(r, i) < d ? b[r][i] : c)).join(''));
}

/* ---- the poses ---- */

const L = (d: number) => (a: number, b: number) => a + (b - a) * d;

/** the hub every transition passes through; a breath lifts the hip a fifth of a dot */
export function stand(view: View, breath = 0): Pose {
	return view === 'front'
		? { view: 'front', hip: [0, 0.6 + breath], t: 0, legs: [{ ank: [-0.1, ANK], bend: 0 }, { ank: [0.1, ANK], bend: 0 }], arms: [{ hand: [-0.17, 0.5], bend: -1 }, { hand: [0.17, 0.5], bend: 1 }] }
		: { hip: [0, 0.6 + breath], t: 2, legs: [{ ank: [-0.03, ANK], bend: 1 }, { ank: [0.05, ANK], bend: 1 }], arms: [{ hand: [0.08, 0.5], bend: -1 }] };
}
/** the three waypoints off the floor: the shape a pose is entered from and left to */
export const WAYPOINTS: Record<Exclude<Waypoint, 'stand'>, Pose> = {
	kneel: { hip: [0, 0.33], t: 4, legs: [{ ank: [0.27, ANK], bend: 1 }, { knee: [-0.2, 0.09], ank: [-0.46, 0.1], foot: 170 }], arms: [{ hand: [0.2, 0.42], bend: -1 }] },
	sit: { hip: [-0.14, 0.13], t: 6, legs: [{ ank: [0.3, 0.1], bend: 0, foot: -70 }], arms: [{ hand: [0.06, 0.16], bend: 1 }] },
	back: { hip: [-0.04, 0.1], t: -90, legs: [{ ank: [0.46, 0.09], bend: 0, foot: -70 }], arms: [{ el: [-0.2, 0.06], hd: [0, 0.06] }] }
};

/** the figure between poses: standing, breathing — the rest, the warm-up lines, the done screen */
export const STAND = 'Stand';
const STANDING: Figure = { id: 'stand', name: STAND, motion: 'breath', cue: 'standing by', pose: (d) => stand('side', d * 0.008) };

export const EXERCISES: Figure[] = [
	/* lifts */
	{ id: 'goblet', name: 'Goblet Squat', aliases: ['Bodyweight Squat'], cue: 'hips drop between the heels, knees forward, torso tips just enough to keep the bell over mid-foot',
		pose: (d) => { const l = L(d); return { hip: [l(0, -0.07), l(0.6, 0.34)], t: l(2, 28), legs: [{ ank: [0.0, ANK] }, { ank: [0.06, ANK] }], arms: [{ hand: [l(0.1, 0.02), l(0.82, 0.62)], bend: -1 }], world: [[l(0.1, 0.02), l(0.82, 0.62), l(0.1, 0.02), l(0.86, 0.66), 0.03]] }; } },
	{ id: 'rdl', name: 'Romanian Deadlift', cue: 'hips travel back, knees stay soft, back flat; the bar slides down the thighs',
		pose: (d) => { const l = L(d), hip: Pt = [l(0, -0.11), l(0.6, 0.55)], hand: Pt = [l(0.05, 0.1), l(0.5, 0.26)]; return { hip, t: l(2, 82), legs: [{ ank: [0.0, ANK] }, { ank: [0.05, ANK] }], arms: [{ hand, bend: 1 }], world: [[hand[0] - 0.05, hand[1] - 0.02, hand[0] + 0.05, hand[1] - 0.02, 0.03]] }; } },
	{ id: 'kbdl', name: 'KB Deadlift', cue: 'standing tall with the bell hanging; knees and hips bend together and the bell goes to the floor between the feet',
		pose: (d) => { const l = L(d), hip: Pt = [l(0, -0.1), l(0.6, 0.38)], hand: Pt = [l(0.04, 0.06), l(0.42, 0.12)]; return { hip, t: l(2, 60), legs: [{ ank: [0.0, ANK], bend: 1 }, { ank: [0.06, ANK], bend: 1 }], arms: [{ hand, bend: 1 }], world: [[hand[0], hand[1] - 0.02, hand[0], hand[1] - 0.07, 0.03]] }; } },
	{ id: 'ohp', name: 'Shoulder Press', waypoint: 'sit', cue: 'seated, front view: bar from the collarbones to lockout overhead, elbows travel under the bar',
		pose: (d) => { const l = L(d), y = l(0.78, 1.04), x = l(0.16, 0.1); return { view: 'front', hip: [0, 0.4], t: 0, legs: [{ ank: [-0.1, ANK], bend: 0 }, { ank: [0.1, ANK], bend: 0 }], arms: [{ hand: [-x, y], bend: -1 }, { hand: [x, y], bend: 1 }], world: [[-0.34, y, 0.34, y, 0.014], [-0.16, 0.37, 0.16, 0.37, 0.013], [-0.12, FLOOR, -0.12, 0.36, 0.013], [0.12, FLOOR, 0.12, 0.36, 0.013]] }; } },
	{ id: 'row', name: 'Seated Row', waypoint: 'sit', cue: 'seated, feet braced, torso still; the handle comes to the ribs and the elbow passes behind',
		pose: (d) => { const l = L(d), hand: Pt = [l(0.3, -0.02), l(0.5, 0.44)]; return { hip: [-0.12, 0.3], t: l(10, -6), legs: [{ ank: [0.3, ANK], bend: 1 }], arms: [{ hand, bend: -1 }], world: [[-0.34, 0.27, 0.02, 0.27, 0.013], [-0.28, FLOOR, -0.28, 0.26, 0.013], [hand[0] + 0.02, hand[1], 0.6, 0.5, 0.008], [0.6, FLOOR, 0.6, 0.9, 0.013]] }; } },
	{ id: 'plank', name: 'Long-Lever Plank', aliases: ['Plank', 'Forearm Plank'], motion: 'breath', waypoint: 'kneel', cue: 'a hold: elbows well ahead of the shoulders, one straight line from ear to heel. No pulse — just a breath: the hips settle a dot and come back',
		pose: (d) => { const l = L(d); return { hip: [0.08, l(0.3, 0.28)], t: l(-100, -98), legs: [{ ank: [0.52, 0.09], bend: 0, foot: 70 }], arms: [{ el: [-0.5, 0.055], hd: [-0.36, 0.055] }] }; } },
	{ id: 'lunge', name: 'DB Reverse Lunge', aliases: ['Reverse Lunge'], cue: 'front foot planted, shin vertical; the rear foot steps back onto its toes and the rear knee drops under the hip',
		pose: (d) => { const l = L(d), hip: Pt = [l(0.0, -0.02), l(0.6, 0.36)]; return { hip, t: l(2, 6), legs: [{ ank: [0.06, ANK], bend: 1 }, { knee: [l(0.01, -0.1), l(0.32, 0.09)], ank: [l(0.01, -0.37), l(ANK, 0.11)], foot: l(0, 80) }], arms: [{ hand: [hip[0] + 0.05, hip[1] + 0.02], bend: -1 }], world: [[hip[0] + 0.01, hip[1], hip[0] + 0.09, hip[1], 0.026]] }; } },
	{ id: 'chest', name: 'Chest Press', waypoint: 'back', cue: 'lying on the bench, feet flat; the bar presses from the chest to a straight arm',
		pose: (d) => { const l = L(d), hand: Pt = [-0.28, l(0.5, 0.76)]; return { hip: [0.06, 0.37], t: -92, legs: [{ ank: [0.36, ANK], bend: 1 }, { ank: [0.42, ANK], bend: 1 }], arms: [{ hand, bend: 1 }], world: [[-0.5, 0.29, 0.26, 0.29, 0.013], [-0.42, FLOOR, -0.42, 0.28, 0.013], [0.2, FLOOR, 0.2, 0.28, 0.013], [hand[0], hand[1] - 0.05, hand[0], hand[1] + 0.05, 0.018]] }; } },
	{ id: 'pulldown', name: 'Lat Pulldown', waypoint: 'sit', cue: 'seated under the cable; the bar is pulled from full stretch to the collarbones, chest up',
		pose: (d) => { const l = L(d), hand: Pt = [l(0.16, 0.12), l(1.08, 0.78)]; return { hip: [-0.06, 0.3], t: l(-4, -12), legs: [{ ank: [0.24, ANK], bend: 1 }], arms: [{ hand, bend: 1 }], world: [[-0.28, 0.27, 0.08, 0.27, 0.013], [-0.22, FLOOR, -0.22, 0.26, 0.013], [hand[0] - 0.14, hand[1], hand[0] + 0.14, hand[1], 0.013], [hand[0], hand[1], hand[0] + 0.02, 1.29, 0.008]] }; } },
	{ id: 'bridge', name: 'DB Glute Bridge', waypoint: 'back', cue: 'shoulders on the floor, feet flat and close; the hips drive up until hip and knee are in line',
		pose: (d) => { const l = L(d), hip: Pt = [0.02, l(0.17, 0.36)], sh: Pt = [-0.3, 0.13]; const t = (Math.atan2(sh[0] - hip[0], sh[1] - hip[1]) * 180) / Math.PI; return { hip, t, legs: [{ ank: [0.26, ANK], bend: 1 }, { ank: [0.32, ANK], bend: 1 }], arms: [{ el: [-0.16, 0.06], hd: [0.02, 0.06] }] }; } },
	{ id: 'calf', name: 'Standing Calf Raise', aliases: ['Single-leg Calf Raise'], cue: 'hand on the wall; the whole body rises on the toes — the heel lifts, the toe never does',
		pose: (d) => { const l = L(d), rise = l(0, 0.06); return { hip: [0, 0.6 + rise], t: 1, legs: [{ ank: [0.0, ANK + rise], foot: l(0, 25) }, { ank: [0.04, ANK + rise], foot: l(0, 25) }], arms: [{ hand: [0.4, 0.86 + rise], bend: -1 }], world: [[0.42, FLOOR, 0.42, 1.24, 0.013]] }; } },
	{ id: 'gobletdeep', name: 'Deep Goblet Squat', cue: 'same squat, hips all the way down to the calves, torso tips a little more',
		pose: (d) => { const l = L(d); return { hip: [l(0, -0.09), l(0.6, 0.26)], t: l(2, 34), legs: [{ ank: [0.0, ANK] }, { ank: [0.07, ANK] }], arms: [{ hand: [l(0.1, 0.0), l(0.82, 0.56)], bend: -1 }], world: [[l(0.1, 0.0), l(0.82, 0.56), l(0.1, 0.0), l(0.86, 0.6), 0.03]] }; } },
	{ id: 'facepull', name: 'Face Pull', aliases: ['Band Face Pull'], cue: 'split stance, cable at face height; the rope comes to the eyes with the elbow high and travelling behind',
		pose: (d) => { const l = L(d), hand: Pt = [l(0.3, 0.04), l(0.9, 0.93)]; return { hip: [-0.06, 0.6], t: 4, legs: [{ ank: [0.08, ANK], bend: 1 }, { ank: [-0.18, ANK], bend: 0 }], arms: [{ hand, bend: -1 }], world: [[hand[0] + 0.02, hand[1], 0.6, 0.95, 0.008], [0.6, FLOOR, 0.6, 1.24, 0.013]] }; } },
	{ id: 'legcurl', name: 'Leg Curl', waypoint: 'back', cue: 'prone on the bench; the shin swings from flat to past vertical while the hips stay down',
		pose: (d) => { const l = L(d), a = rad(l(0, 100)), knee: Pt = [0.34, 0.33]; const ank: Pt = [knee[0] + 0.27 * Math.cos(a), knee[1] + 0.27 * Math.sin(a)]; return { hip: [0.1, 0.37], t: -92, legs: [{ knee, ank, foot: l(0, -100) }], arms: [{ el: [-0.42, 0.24], hd: [-0.46, 0.1] }], world: [[-0.5, 0.29, 0.4, 0.29, 0.013], [-0.42, FLOOR, -0.42, 0.28, 0.013], [0.3, FLOOR, 0.3, 0.28, 0.013]] }; } },
	{ id: 'cph', name: 'Copenhagen Plank', motion: 'breath', waypoint: 'sit', cue: 'side plank with the top leg on a bench and the bottom leg held up to meet it. A breath: the hips dip a dot and come back',
		pose: (d) => { const l = L(d); return { hip: [0.05, l(0.34, 0.32)], t: -100, legs: [{ ank: [0.46, 0.27], bend: 0, foot: 60 }, { ank: [0.5, 0.31], bend: 0, foot: 60 }], arms: [{ el: [-0.46, 0.055], hd: [-0.3, 0.055] }], world: [[0.3, 0.27, 0.62, 0.27, 0.013], [0.34, FLOOR, 0.34, 0.26, 0.013], [0.58, FLOOR, 0.58, 0.26, 0.013]] }; } },
	{ id: 'deadbug', name: 'Dead Bug', waypoint: 'back', cue: 'on the back, arms up, knees at 90°; one arm reaches overhead as the opposite leg extends, low back stays down',
		pose: (d) => { const l = L(d); return { hip: [0.05, 0.12], t: -90, legs: [{ knee: [0.1, 0.4], ank: [0.37, 0.4], foot: -90 }, { knee: [l(0.1, 0.32), l(0.4, 0.27)], ank: [l(0.37, 0.58), l(0.4, 0.14)], foot: l(-90, -20) }], arms: [{ el: [-0.28, 0.33], hd: [-0.28, 0.54] }, { el: [l(-0.28, -0.48), l(0.33, 0.22)], hd: [l(-0.28, -0.6), l(0.54, 0.08)] }] }; } },
	{ id: 'sideplank', name: 'Side Plank', motion: 'breath', waypoint: 'sit', cue: 'a hold on the forearm, one straight line from shoulder to heel, top arm to the ceiling. A breath, no pulse',
		pose: (d) => { const l = L(d); return { hip: [0.05, l(0.25, 0.23)], t: -100, legs: [{ ank: [0.5, 0.09], bend: 0, foot: 75 }], arms: [{ el: [-0.34, 0.055], hd: [-0.18, 0.055] }, { el: [-0.28, 0.5], hd: [-0.29, 0.7] }] }; } },
	/* stretches */
	{ id: 'calfstretch', name: 'Calf stretch', motion: 'still', cue: 'hands on the wall, rear leg straight with the heel down; the hips move toward the wall',
		pose: (d) => { const l = L(d); return { hip: [l(-0.08, 0.0), 0.58], t: l(8, 14), legs: [{ ank: [0.12, ANK], bend: 1 }, { ank: [-0.3, ANK], bend: 0 }], arms: [{ hand: [0.4, 0.86], bend: -1 }], world: [[0.42, FLOOR, 0.42, 1.24, 0.013]] }; } },
	{ id: 'hipflexor', name: 'Hip flexor stretch', motion: 'still', waypoint: 'kneel', cue: 'half-kneeling, hand on the front knee; the hips glide forward while the torso stays tall',
		pose: (d) => { const l = L(d); return { hip: [l(-0.1, -0.02), l(0.38, 0.36)], t: l(0, -4), legs: [{ ank: [0.2, ANK], bend: 1 }, { knee: [-0.16, 0.09], ank: [-0.43, 0.1], foot: 80 }], arms: [{ hand: [0.18, 0.34], bend: -1 }] }; } },
	{ id: 'hamstring', name: 'Hamstring stretch', motion: 'still', cue: 'heel up on a box, toes up, leg straight; the hinge comes from the hips, back flat',
		pose: (d) => { const l = L(d); return { hip: [-0.06, 0.6], t: l(10, 58), legs: [{ ank: [-0.06, ANK], bend: 0 }, { ank: [0.34, 0.24], bend: 0, foot: -20 }], arms: [{ hand: [l(0.06, 0.3), l(0.56, 0.4)], bend: 1 }], world: [[0.2, FLOOR, 0.2, 0.2, 0.013], [0.44, FLOOR, 0.44, 0.2, 0.013], [0.2, 0.2, 0.44, 0.2, 0.013]] }; } },
	{ id: 'figure4', name: 'Figure-4 stretch', motion: 'still', waypoint: 'sit', cue: 'seated, ankle on the opposite knee; the torso folds forward over the shin',
		pose: (d) => { const l = L(d); return { hip: [-0.08, 0.32], t: l(4, 30), legs: [{ ank: [0.2, ANK], bend: 1 }, { knee: [0.14, 0.42], ank: [0.24, 0.35], foot: 0 }], arms: [{ hand: [0.16, 0.42], bend: 1 }], world: [[-0.3, 0.29, 0.1, 0.29, 0.013], [-0.24, FLOOR, -0.24, 0.28, 0.013], [0.04, FLOOR, 0.04, 0.28, 0.013]] }; } },
	{ id: 'doorway', name: 'Doorway chest stretch', motion: 'still', cue: 'forearm on the frame behind you; step through and let the chest lead',
		pose: (d) => { const l = L(d); return { hip: [l(0, 0.05), 0.6], t: l(2, 10), legs: [{ ank: [0.2, ANK], bend: 1 }, { ank: [-0.16, ANK], bend: 0 }], arms: [{ el: [-0.14, 0.92], hd: [-0.17, 1.1] }], world: [[-0.19, FLOOR, -0.19, 1.24, 0.013], [-0.19, 1.24, 0.4, 1.24, 0.013]] }; } },
	/* run drills, and the run itself */
	{ id: 'jog', name: 'Easy jog', aliases: ['Easy run'], cue: 'a conversational pace: light on the feet, elbows at ninety, the shoulders quiet — one rep is one stride',
		pose: (d) => { const l = L(d), lift = 0.09 * Math.sin(Math.PI * d); return { hip: [0, 0.6 + 0.012 * Math.sin(Math.PI * d)], t: 8, legs: [{ ank: [l(0.14, -0.18), ANK], bend: 1, foot: l(0, 45) }, { ank: [l(-0.18, 0.14), ANK + lift], bend: 1, foot: l(45, 0) }], arms: [{ hand: [l(0.16, -0.06), l(0.64, 0.58)], bend: -1 }, { hand: [l(-0.06, 0.16), l(0.58, 0.64)], bend: -1 }] }; } },
	{ id: 'highknees', name: 'High knees', cue: 'on the toes; the knee drives to hip height while the arms run',
		pose: (d) => { const l = L(d); return { hip: [0, l(0.6, 0.63)], t: 6, legs: [{ ank: [0.0, l(ANK, ANK + 0.03)], bend: 1, foot: l(0, 25) }, { knee: [l(0.02, 0.26), l(0.31, 0.5)], ank: [l(0.03, 0.16), l(ANK, 0.25)], foot: l(0, 40) }], arms: [{ hand: [l(0.2, -0.12), l(0.7, 0.68)], bend: -1 }, { hand: [l(-0.12, 0.22), l(0.68, 0.76)], bend: 1 }] }; } },
	{ id: 'carioca', name: 'Carioca', cue: 'front view, moving sideways; the trailing leg crosses in front, arms out for balance',
		pose: (d) => { const l = L(d); return { view: 'front', hip: [0, l(0.6, 0.58)], t: 0, legs: [{ knee: [l(-0.08, 0.16), l(0.31, 0.42)], ank: [l(-0.12, 0.26), l(ANK, 0.2)] }, { ank: [0.1, ANK], bend: 0 }], arms: [{ hand: [-0.36, 0.8], bend: -1 }, { hand: [0.36, 0.8], bend: 1 }] }; } },
	{ id: 'legswing', name: 'Leg swings', cue: 'hand on the wall; the straight leg swings from behind to in front, torso quiet',
		pose: (d) => { const l = L(d), a = rad(l(-35, 60)), hip: Pt = [-0.06, 0.6]; return { hip, t: l(-2, -8), legs: [{ ank: [-0.08, ANK], bend: 0 }, { ank: [hip[0] + 0.55 * Math.sin(a), hip[1] - 0.55 * Math.cos(a)], bend: 0, foot: l(-30, 20) }], arms: [{ hand: [-0.48, 0.9], bend: 1 }], world: [[-0.5, FLOOR, -0.5, 1.24, 0.013]] }; } },
	{ id: 'askip', name: 'A-skips', cue: 'a skip with a knee drive: the whole body hops off the toes as the knee comes up',
		pose: (d) => { const l = L(d), hop = l(0, 0.06); return { hip: [0, 0.6 + hop], t: 4, legs: [{ ank: [0.0, ANK + hop * 0.9], bend: 1, foot: l(0, 30) }, { knee: [l(0.02, 0.24), l(0.31, 0.5) + hop], ank: [l(0.03, 0.14), l(ANK, 0.26) + hop], foot: l(0, 30) }], arms: [{ hand: [l(0.18, -0.1), l(0.7, 0.68)], bend: -1 }, { hand: [l(-0.1, 0.2), l(0.68, 0.76)], bend: 1 }] }; } },
	{ id: 'walklunge', name: 'Walking lunges', cue: 'a long stride; the rear knee drops toward the floor under the hip, front shin vertical',
		pose: (d) => { const l = L(d), hip: Pt = [l(0.0, 0.04), l(0.6, 0.37)]; return { hip, t: l(2, 5), legs: [{ ank: [0.22, ANK], bend: 1 }, { knee: [l(-0.02, -0.08), l(0.32, 0.1)], ank: [l(-0.02, -0.34), l(ANK, 0.12)], foot: l(0, 80) }], arms: [{ hand: [hip[0] + 0.05, hip[1] + 0.02], bend: -1 }], world: [[hip[0] + 0.01, hip[1], hip[0] + 0.09, hip[1], 0.026]] }; } },
	/* yoga */
	{ id: 'lowlunge', name: 'Low Lunge', motion: 'still', waypoint: 'kneel', cue: 'back knee down, shin along the mat; front knee over the ankle; torso tall, hands on the front thigh',
		pose: () => ({ hip: [0, 0.33], t: 2, legs: [{ ank: [0.27, ANK], bend: 1 }, { knee: [-0.2, 0.09], ank: [-0.46, 0.1], foot: 170 }], arms: [{ hand: [0.2, 0.42], bend: -1 }] }) },
	{ id: 'halfsplit', name: 'Half Splits', motion: 'still', waypoint: 'kneel', cue: 'hips back over the rear knee, front leg straight with the toes up, hinge from the hip',
		pose: () => ({ hip: [-0.14, 0.34], t: 52, legs: [{ ank: [0.36, ANK + 0.02], bend: 0, foot: -25 }, { knee: [-0.12, 0.09], ank: [-0.38, 0.1], foot: 170 }], arms: [{ hand: [0.2, 0.14], bend: 1 }] }) },
	{ id: 'chair', name: 'Chair Pose', motion: 'breath', cue: 'a squat you hold: knees over the ankles, arms in line with the torso. Breath: the hips settle a dot',
		pose: (d) => { const l = L(d); return { hip: [-0.08, l(0.41, 0.395)], t: 32, legs: [{ ank: [0.04, ANK], bend: 1 }, { ank: [0.09, ANK], bend: 1 }], arms: [{ hand: [0.3, l(1.02, 1.005)], bend: -1 }] }; } },
	{ id: 'warrior2', name: 'Warrior II', motion: 'breath', cue: 'front view: wide stance, one knee bent to 90, arms out in a T. Breath: the hips settle',
		pose: (d) => { const l = L(d), y = l(0.79, 0.78); return { view: 'front', hip: [0, l(0.44, 0.43)], t: 0, legs: [{ ank: [-0.3, ANK], bend: 0 }, { ank: [0.34, ANK], bend: 1 }], arms: [{ hand: [-0.52, y], bend: -1 }, { hand: [0.52, y], bend: 1 }] }; } },
	{ id: 'pigeon', name: 'Pigeon', motion: 'still', waypoint: 'kneel', cue: 'front shin folded across on the mat, back leg long behind, torso upright with a hand down',
		pose: () => ({ hip: [0, 0.17], t: 4, legs: [{ knee: [0.26, 0.12], ank: [0.05, 0.08], foot: 60 }, { knee: [-0.28, 0.1], ank: [-0.54, 0.09], foot: 170 }], arms: [{ hand: [0.18, 0.12], bend: 1 }] }) },
	{ id: 'bridgepose', name: 'Bridge', motion: 'breath', waypoint: 'back', cue: 'shoulders down, feet flat and close, hips up until hip and knee are in line, arms on the mat. Breath: the hips',
		pose: (d) => { const l = L(d), hip: Pt = [0.02, l(0.33, 0.345)], sh: Pt = [-0.3, 0.13]; const t = (Math.atan2(sh[0] - hip[0], sh[1] - hip[1]) * 180) / Math.PI; return { hip, t, legs: [{ ank: [0.26, ANK], bend: 1 }, { ank: [0.32, ANK], bend: 1 }], arms: [{ el: [-0.16, 0.06], hd: [0.02, 0.06] }] }; } },
	{ id: 'seatedfold', name: 'Seated Forward Fold', motion: 'still', waypoint: 'sit', cue: 'legs long, toes up, hinge forward with the hands to the shins. Bend the knees if the back rounds',
		pose: () => ({ hip: [-0.24, 0.13], t: 62, legs: [{ ank: [0.3, 0.1], bend: 0, foot: -70 }], arms: [{ hand: [0.24, 0.18], bend: 1 }] }) },
	{ id: 'supinetwist', name: 'Supine Twist', motion: 'still', waypoint: 'back', cue: 'on the back, knees folded over to one side, one arm long overhead. The rotation is toward the camera',
		pose: () => ({ hip: [0, 0.12], t: -90, legs: [{ knee: [0.2, 0.28], ank: [0.42, 0.13], foot: 20 }], arms: [{ el: [-0.46, 0.07], hd: [-0.62, 0.07] }] }) },
	{ id: 'downdog', name: 'Downward Dog', motion: 'breath', waypoint: 'kneel', cue: 'hands and feet down, hips the apex, head between the arms. Breath: hips rise a dot, heels drop',
		pose: (d) => { const l = L(d); return { hip: [0.06, l(0.6, 0.61)], t: -125, legs: [{ ank: [0.3, ANK], bend: 0 }, { ank: [0.36, ANK], bend: 0 }], arms: [{ el: [-0.34, 0.24], hd: [-0.46, 0.06] }] }; } },
	{ id: 'puppy', name: 'Puppy Pose', motion: 'still', waypoint: 'kneel', cue: 'hips stacked over the knees, chest and arms down the mat, forehead down',
		pose: () => ({ hip: [0, 0.33], t: 118, legs: [{ knee: [0.01, 0.09], ank: [-0.24, 0.1], foot: 170 }], arms: [{ el: [0.44, 0.09], hd: [0.62, 0.06] }] }) },
	{ id: 'thread', name: 'Thread the Needle', motion: 'still', waypoint: 'kneel', cue: 'one shoulder on the mat with that arm along the floor; the free arm reaches to the ceiling',
		pose: () => ({ hip: [-0.06, 0.33], t: 118, legs: [{ knee: [-0.05, 0.09], ank: [-0.3, 0.1], foot: 170 }], arms: [{ el: [0.4, 0.07], hd: [0.56, 0.06] }, { el: [0.26, 0.38], hd: [0.28, 0.58] }] }) },
	{ id: 'sphinx', name: 'Sphinx', motion: 'still', waypoint: 'kneel', cue: 'prone on the forearms, elbows under the shoulders, chest lifted, legs long',
		pose: () => ({ hip: [0.1, 0.1], t: -66, legs: [{ knee: [0.36, 0.09], ank: [0.6, 0.09], foot: 170 }], arms: [{ el: [-0.24, 0.07], hd: [-0.44, 0.07] }] }) },
	{ id: 'cowface', name: 'Cow-Face Arms', motion: 'still', cue: 'front view: one arm overhead and bent behind the head, the other bent behind the low back',
		pose: () => ({ view: 'front', hip: [0, 0.6], t: 0, legs: [{ ank: [-0.12, ANK], bend: 0 }, { ank: [0.12, ANK], bend: 0 }], arms: [{ el: [-0.3, 0.66], hd: [-0.1, 0.64] }, { el: [0.3, 1.02], hd: [0.1, 1.08] }] }) },
	{ id: 'childreach', name: 'Child’s Pose, side reach', motion: 'still', waypoint: 'kneel', cue: 'hips on the heels, forehead down, both arms walked to one side. The reach is toward the camera',
		pose: () => ({ hip: [-0.12, 0.2], t: 100, legs: [{ knee: [0.1, 0.09], ank: [-0.16, 0.09], foot: 170 }], arms: [{ el: [0.4, 0.08], hd: [0.58, 0.06] }] }) },
	{ id: 'savasana', name: 'Savasana', motion: 'breath', waypoint: 'back', cue: 'flat on the back, toes up, arms by the sides. Breath: the chest, one dot',
		pose: (d) => { const l = L(d); return { hip: [-0.04, 0.1], t: l(-90, -88), legs: [{ ank: [0.46, 0.09], bend: 0, foot: -70 }, { ank: [0.5, 0.09], bend: 0, foot: -70 }], arms: [{ el: [-0.2, 0.06], hd: [0.0, 0.06] }] }; } },
	/* bodyweight */
	{ id: 'pushup', name: 'Push-up', waypoint: 'kneel', cue: 'hands under the shoulders, one line from ear to heel; the chest drops to a fist off the floor and presses back',
		pose: (d) => { const l = L(d); return { hip: [0.08, l(0.36, 0.17)], t: -95, legs: [{ ank: [0.54, 0.08], bend: 0, foot: 75 }], arms: [{ hand: [-0.3, 0.03], bend: 1 }] }; } },
	{ id: 'splitsquat', name: 'Split Squat', cue: 'a long stance, the rear heel up; the hips drop straight down until the rear knee is a fist off the floor',
		pose: (d) => { const l = L(d); return { hip: [l(0.0, -0.02), l(0.58, 0.36)], t: l(2, 6), legs: [{ ank: [0.16, ANK], bend: 1 }, { knee: [l(-0.1, -0.12), l(0.33, 0.12)], ank: [l(-0.3, -0.36), l(0.13, 0.13)], foot: 70 }], arms: [{ hand: [l(0.06, 0.04), l(0.62, 0.4)], bend: -1 }] }; } },
	{ id: 'steplunge', name: 'Step-up', cue: 'one foot flat on the step; the whole body rises onto it and the trailing foot lands beside',
		pose: (d) => { const l = L(d), top = 0.14 + 0.9 * U; return { hip: [l(-0.06, 0.18), l(0.5, 0.71)], t: l(12, 2), legs: [{ ank: [0.2, top], bend: 1 }, { ank: [l(-0.14, 0.12), l(ANK, top)], bend: 1 }], arms: [{ hand: [l(-0.02, 0.22), l(0.42, 0.61)], bend: -1 }], world: [[0.06, FLOOR, 0.06, 0.14, 0.013], [0.34, FLOOR, 0.34, 0.14, 0.013], [0.06, 0.14, 0.34, 0.14, 0.013]] }; } },
	{ id: 'slrdl', name: 'Single-leg RDL Reach', cue: 'balanced on one soft knee; the hips hinge back, the free leg reaches behind and the hand toward the floor',
		pose: (d) => { const l = L(d); return { hip: [l(0, -0.1), l(0.6, 0.55)], t: l(2, 78), legs: [{ ank: [0.02, ANK], bend: 1 }, { knee: [l(-0.04, -0.34), l(0.32, 0.52)], ank: [l(-0.05, -0.58), l(ANK, 0.44)], foot: l(0, 120) }], arms: [{ hand: [l(0.06, 0.16), l(0.5, 0.2)], bend: 1 }] }; } },
	{ id: 'hipbridge', name: 'Single-leg Hip Bridge', waypoint: 'back', cue: 'one foot flat, the other leg held long; the hips drive up until hip and knee are in line',
		pose: (d) => { const l = L(d), hip: Pt = [0.02, l(0.17, 0.36)], sh: Pt = [-0.3, 0.13]; const t = (Math.atan2(sh[0] - hip[0], sh[1] - hip[1]) * 180) / Math.PI; const knee: Pt = [hip[0] + 0.2, hip[1] + 0.21]; return { hip, t, legs: [{ ank: [0.26, ANK], bend: 1 }, { knee, ank: [knee[0] + 0.2, knee[1] + 0.18], foot: -40 }], arms: [{ el: [-0.16, 0.06], hd: [0.02, 0.06] }] }; } },
	{ id: 'bearcrawl', name: 'Bear Crawl', waypoint: 'kneel', cue: 'hands under the shoulders, knees an inch off the floor; opposite hand and foot step together',
		pose: (d) => { const l = L(d); return { hip: [0.12, 0.44], t: -96, legs: [{ knee: [l(0.14, 0.2), 0.14], ank: [l(0.38, 0.44), 0.07], foot: 60 }, { knee: [l(0.22, 0.12), 0.14], ank: [l(0.46, 0.36), 0.07], foot: 60 }], arms: [{ hand: [l(-0.2, -0.3), 0.03], bend: 1 }, { hand: [l(-0.32, -0.22), 0.03], bend: 1 }] }; } },
	{ id: 'supermanhold', name: 'Superman Hold', motion: 'breath', waypoint: 'kneel', cue: 'prone: arms and legs lifted off the floor, chin down. Breath: everything lifts a dot',
		pose: (d) => { const l = L(d), up = l(0, 0.015); return { hip: [0.06, 0.1], t: -80, legs: [{ knee: [0.32, 0.13 + up], ank: [0.56, 0.17 + up], foot: 0 }], arms: [{ el: [-0.44, 0.15 + up], hd: [-0.57, 0.2 + up] }] }; } },
	{ id: 'hollow', name: 'Hollow Hold', motion: 'breath', waypoint: 'back', cue: 'on the back, low back pressed down; shoulders and straight legs held off the floor, arms overhead. Breath: a dot higher',
		pose: (d) => { const l = L(d), up = l(0, 0.015); return { hip: [0.04, 0.1], t: -74, legs: [{ knee: [0.3, 0.17 + up], ank: [0.55, 0.24 + up], foot: -60 }], arms: [{ el: [-0.48, 0.2 + up], hd: [-0.59, 0.27 + up] }] }; } },
	{ id: 'reversecrunch', name: 'Reverse Crunch', waypoint: 'back', cue: 'on the back, knees at ninety; the hips curl up off the floor and lower slowly, the low back kept down',
		pose: (d) => { const l = L(d); return { hip: [l(0.05, -0.02), l(0.12, 0.2)], t: l(-90, -78), legs: [{ knee: [l(0.12, -0.1), l(0.4, 0.44)], ank: [l(0.38, 0.14), l(0.4, 0.52)], foot: -90 }], arms: [{ el: [-0.14, 0.06], hd: [0.06, 0.06] }] }; } }
];

const byName = new Map<string, Figure>([[STAND, STANDING]]);
for (const e of EXERCISES) {
	byName.set(e.name, e);
	for (const a of e.aliases ?? []) byName.set(a, e);
}

/** `Exercise.name` (plans.ts) or STAND → its figure. Not here → null, never a stand-in. */
export const figureFor = (name: string): Figure | null => byName.get(name) ?? null;
export const motionOf = (f: Figure): Motion => f.motion ?? 'rep';
export const waypointOf = (f: Figure): Waypoint => f.waypoint ?? 'stand';
export const viewOf = (f: Figure): View => f.pose(0).view ?? 'side';
/** the depth a figure waits at: a still is only ever at full depth */
export const restDepth = (f: Figure): number => (motionOf(f) === 'still' ? 1 : 0);

/** the figure's joints at depth d */
export const joints = (f: Figure, d: number): Joints => normalize(f.pose(d));

const cache = new Map<string, Frame>();
/** the figure stamped at depth d — memoized, since a gear stamps the same depths every pass */
export function frameFor(f: Figure, d: number): Frame {
	const key = `${f.id}@${d}`;
	let fr = cache.get(key);
	if (!fr) cache.set(key, (fr = frame(joints(f, d))));
	return fr;
}

/** one leg of a transition: a → b in HOP_FRAMES stamps, or a turn dissolving a into b */
export type Hop = { label: string; a: Joints; b: Joints; turn?: boolean };

/**
 * The path from one figure to another, through the waypoints: EXIT the pose to its waypoint and up to a stand,
 * TURN if the view changes, ENTER via the new pose's waypoint. Two poses at the same waypoint skip the stand.
 * `fromJ` is where the body actually is when the plan is made — mid-hop, it need not be the pose.
 */
export function route(from: Figure, to: Figure, fromJ?: Joints): Hop[] {
	const fw = waypointOf(from), tw = waypointOf(to), fv = viewOf(from), tv = viewOf(to);
	const isStand = (f: Figure) => f.name === STAND;
	const nodes: { J: Joints; label: string; turn?: boolean }[] = [{ J: fromJ ?? joints(from, restDepth(from)), label: '' }];
	const same = !isStand(from) && !isStand(to) && fw === tw && fw !== 'stand' && fv === tv;
	if (!isStand(from)) {
		if (fw !== 'stand') nodes.push({ J: normalize(WAYPOINTS[fw]), label: `EXIT · ${from.name} → ${fw}` });
		if (!same) nodes.push({ J: normalize(stand(fv)), label: 'EXIT · → stand' });
	}
	if (fv !== tv) nodes.push({ J: normalize(stand(tv)), label: 'TURN', turn: true });
	if (!isStand(to)) {
		if (tw !== 'stand' && !same) nodes.push({ J: normalize(WAYPOINTS[tw]), label: `ENTER · stand → ${tw}` });
		nodes.push({ J: joints(to, restDepth(to)), label: `ENTER · → ${to.name}` });
	}
	const hops: Hop[] = [];
	for (let k = 1; k < nodes.length; k++) hops.push({ label: nodes[k].label, a: nodes[k - 1].J, b: nodes[k].J, turn: nodes[k].turn });
	return hops;
}

/** the stamps of one hop, each with the joints it shows; frames are drawn when asked for, not up front */
export function hopStamps(h: Hop): { J: Joints; frame: () => Frame }[] {
	if (h.turn) {
		const fa = frame(h.a), fb = frame(h.b);
		return Array.from({ length: TURN_FRAMES }, (_, s) => ({ J: h.b, frame: () => dissolve(fa, fb, (s + 1) / (TURN_FRAMES + 1)) }));
	}
	return Array.from({ length: HOP_FRAMES }, (_, s) => {
		const x = (s + 1) / HOP_FRAMES, J = lerp(h.a, h.b, x * x * (3 - 2 * x));
		return { J, frame: () => frame(J) };
	});
}
