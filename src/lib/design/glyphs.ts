/**
 * Dot-matrix exercise glyphs — the pose table and the grid rule.
 *
 * A glyph is a stick skeleton posed by a keyframe function, rasterized through
 * a FIXED dot grid: the grid never moves, the body moves through it, like a
 * receipt printer stamping one frame per line. Six discrete frames per rep,
 * no tweening; ink only. Ported verbatim from Claude Design's
 * "Exercise Animation v4" — every number here is the design's, not ours.
 *
 * Unit space: y up, ground = 0, figure height ≈ 1. A Pose is a list of
 * capsules (segments with a radius) and circles, plus the box to fit.
 */

/** [x1, y1, x2, y2, r] — a capsule: the segment plus everything within r */
export type Seg = [number, number, number, number, number];
/** [x, y, r] */
export type Circ = [number, number, number];
/** box: [x0, x1, yTop] — the frame to fit; y0 is always the ground */
export type Pose = { segs: Seg[]; circs: Circ[]; box: [number, number, number] };
export type PoseFn = (d: number) => Pose;

/** the rep cycle — depth 0..1, six stamped frames: down, bottom, back up */
export const SEQ = [0, 0.45, 0.9, 1, 0.6, 0.2] as const;
export const FRAME_MS = 260;
/** grid pitch in unit space (~24 dots across a standing figure) */
export const GRID_STEP = 0.042;

/**
 * Two-link IK for an arm: shoulder (sx,sy) → hand (hx,hy) with upper/lower
 * lengths l1/l2. Prefers the LOWER elbow (elbows hang); on a tie, breaks
 * outward by the sign of `out`.
 */
export function ik(
	sx: number, sy: number, hx: number, hy: number, l1: number, l2: number, out: number
): { x: number; y: number } {
	let dx = hx - sx, dy = hy - sy, d = Math.hypot(dx, dy);
	const mn = Math.abs(l1 - l2) + 1e-4, mx = l1 + l2 - 1e-4;
	if (d < mn) { const k = mn / (d || 1e-6); dx *= k; dy *= k; d = mn; }
	if (d > mx) { const k = mx / d; dx *= k; dy *= k; d = mx; }
	const base = Math.atan2(dy, dx);
	const off = Math.acos(Math.max(-1, Math.min(1, (d * d + l1 * l1 - l2 * l2) / (2 * d * l1))));
	const e1 = { x: sx + l1 * Math.cos(base + off), y: sy + l1 * Math.sin(base + off) };
	const e2 = { x: sx + l1 * Math.cos(base - off), y: sy + l1 * Math.sin(base - off) };
	if (Math.abs(e1.y - e2.y) > 0.02) return e1.y < e2.y ? e1 : e2;
	return out > 0 ? (e1.x > e2.x ? e1 : e2) : (e1.x < e2.x ? e1 : e2);
}

// front view, bell at the sternum; `deep` sits the hips below the knees
function squatPose(d: number, deep: boolean): Pose {
	const L = (a: number, b: number) => a + (b - a) * d;
	const kX = L(0.15, deep ? 0.24 : 0.22), kY = L(0.27, deep ? 0.22 : 0.24);
	const hipY = L(0.52, deep ? 0.24 : 0.31), shY = L(0.8, deep ? 0.52 : 0.585);
	const headY = L(0.92, deep ? 0.66 : 0.715), bellY = L(0.7, deep ? 0.44 : 0.5);
	const eX = L(0.15, 0.18), eY = L(0.6, deep ? 0.34 : 0.4);
	const segs: Seg[] = [], g2 = [-1, 1];
	for (const g of g2) {
		segs.push([g * 0.2, 0.03, g * 0.12, 0.03, 0.025]);
		segs.push([g * 0.16, 0.03, g * kX, kY, 0.03]);
		segs.push([g * kX, kY, g * 0.05, hipY, 0.042]);
		segs.push([g * 0.1, shY, g * eX, eY, 0.024]);
		segs.push([g * eX, eY, g * 0.04, bellY, 0.02]);
	}
	segs.push([0, hipY - 0.02, 0, shY, 0.062]);
	segs.push([-0.1, shY, 0.1, shY, 0.04]);
	return { segs, circs: [[0, headY, 0.06], [0, bellY - 0.01, 0.055]], box: [-0.32, 0.32, 1.02] };
}

/** every pose, keyed as in the design; d in 0..1 is the depth into the rep */
export const POSES: Record<string, PoseFn> = {
	goblet: (d) => squatPose(d, false),
	gobletdeep: (d) => squatPose(d, true),
	pulldown: (d) => {
		const barY = 1.04 - 0.36 * d;
		const segs: Seg[] = [
			[0, 0.27, -0.18, 0.26, 0.042], [-0.19, 0.25, -0.2, 0.04, 0.03],
			[0, 0.27, 0.18, 0.26, 0.042], [0.19, 0.25, 0.2, 0.04, 0.03],
			[0, 0.24, 0, 0.62, 0.062],
			[-0.36, barY, 0.36, barY, 0.013], [0, barY, 0, 1.22, 0.007],
			[-0.11, 0.17, 0.11, 0.17, 0.018]
		];
		for (const g of [-1, 1]) {
			const S = { x: g * 0.13, y: 0.64 }, H = { x: g * 0.3, y: barY };
			const E = ik(S.x, S.y, H.x, H.y, 0.2, 0.18, g);
			segs.push([S.x, S.y, E.x, E.y, 0.028], [E.x, E.y, H.x, H.y, 0.022]);
		}
		return { segs, circs: [[0, 0.77, 0.062]], box: [-0.42, 0.42, 1.24] };
	},
	chestpress: (d) => {
		const L = (a: number, b: number) => a + (b - a) * d, hx = L(0.16, 0.38);
		const E = ik(0.02, 0.62, hx, 0.6, 0.19, 0.17, 1);
		return { segs: [
			[0, 0, 0, 0.26, 0.015], [-0.08, 0.28, 0.1, 0.28, 0.02], [-0.08, 0.3, -0.08, 0.6, 0.015],
			[0, 0.32, 0, 0.64, 0.058],
			[0, 0.32, 0.2, 0.32, 0.04], [0.2, 0.32, 0.24, 0.05, 0.028], [0.2, 0.03, 0.3, 0.03, 0.02],
			[0.02, 0.62, E.x, E.y, 0.026], [E.x, E.y, hx, 0.6, 0.022],
			[hx, 0.53, hx, 0.67, 0.015]
		], circs: [[0.02, 0.76, 0.058]], box: [-0.2, 0.48, 0.92] };
	},
	facepull: (d) => {
		const L = (a: number, b: number) => a + (b - a) * d;
		const hx = L(0.42, 0.14), hy = L(0.8, 0.86);
		const ex = L(0.25, -0.09), ey = L(0.79, 0.85);
		return { segs: [
			[-0.06, 0.03, 0.09, 0.03, 0.022],
			[0, 0.03, 0.02, 0.28, 0.034], [0.02, 0.28, 0, 0.53, 0.045],
			[0, 0.53, -0.02, 0.82, 0.058],
			[0, 0.8, ex, ey, 0.024], [ex, ey, hx, hy, 0.02],
			[hx, hy, 0.55, 0.86, 0.007]
		], circs: [[-0.02, 0.94, 0.056], [0.55, 0.86, 0.024]], box: [-0.24, 0.62, 1.06] };
	},
	rdl: (d) => {
		const L = (a: number, b: number) => a + (b - a) * d;
		const knee = [L(0.02, 0.06), 0.28], hip = [L(0, -0.09), L(0.53, 0.47)];
		const sh = [L(0.02, 0.3), L(0.8, 0.54)], head = [L(0.02, 0.42), L(0.92, 0.57)];
		const hand = [L(0.06, 0.33), L(0.55, 0.26)];
		return { segs: [
			[-0.07, 0.02, 0.09, 0.02, 0.02],
			[0, 0.03, knee[0], knee[1], 0.034], [knee[0], knee[1], hip[0], hip[1], 0.046],
			[hip[0], hip[1], sh[0], sh[1], 0.058],
			[sh[0], sh[1], hand[0], hand[1], 0.022]
		], circs: [[head[0], head[1], 0.054], [hand[0], hand[1] - 0.05, 0.05]], box: [-0.26, 0.56, 1.0] };
	},
	kbdl: (d) => {
		const L = (a: number, b: number) => a + (b - a) * d;
		const knee = [L(0.02, 0.1), L(0.28, 0.25)], hip = [L(0, -0.12), L(0.53, 0.4)];
		const sh = [L(0.02, 0.26), L(0.8, 0.46)], head = [L(0.02, 0.38), L(0.92, 0.5)];
		const hand = [L(0.06, 0.25), L(0.5, 0.16)];
		return { segs: [
			[-0.07, 0.02, 0.09, 0.02, 0.02],
			[0, 0.03, knee[0], knee[1], 0.034], [knee[0], knee[1], hip[0], hip[1], 0.046],
			[hip[0], hip[1], sh[0], sh[1], 0.058],
			[sh[0], sh[1], hand[0], hand[1], 0.022]
		], circs: [[head[0], head[1], 0.054], [hand[0], hand[1] - 0.055, 0.058]], box: [-0.28, 0.56, 1.0] };
	},
	calf: (d) => {
		const r = d * 0.09, h = d * 0.13;
		return { segs: [
			[0.02, 0.015, 0.16, 0.015, 0.014],
			[0.08, 0.04, -0.06, 0.03 + h, 0.02],
			[-0.03, 0.05 + h * 0.9, 0, 0.3 + r, 0.034], [0, 0.3 + r, 0, 0.55 + r, 0.045],
			[0, 0.55 + r, 0, 0.84 + r, 0.056],
			[-0.14, 0.86 + r, 0.14, 0.86 + r, 0.026]
		], circs: [[0, 0.97 + r, 0.055]], box: [-0.28, 0.28, 1.12] };
	},
	plankll: (d) => {
		const hy = 0.18 + d * 0.04;
		return { segs: [
			[0.55, 0.05, 0.35, 0.12, 0.028], [0.35, 0.12, 0.12, hy, 0.045],
			[0.12, hy, -0.32, 0.26, 0.056],
			[-0.32, 0.26, -0.5, 0.03, 0.024], [-0.5, 0.03, -0.3, 0.03, 0.02]
		], circs: [[-0.42, 0.31, 0.05]], box: [-0.6, 0.62, 0.46] };
	},
	ohp: (d) => {
		const L = (a: number, b: number) => a + (b - a) * d;
		const hy = L(0.7, 1.0), hx = L(0.2, 0.12);
		const segs: Seg[] = [
			[-0.11, 0.17, 0.11, 0.17, 0.018], [0, 0.17, 0, 0.03, 0.014],
			[0, 0.25, 0, 0.62, 0.06]
		];
		for (const g of [-1, 1]) {
			segs.push([0, 0.27, g * 0.18, 0.26, 0.04], [g * 0.19, 0.25, g * 0.2, 0.05, 0.028]);
			const E = ik(g * 0.12, 0.62, g * hx, hy, 0.2, 0.18, g);
			segs.push([g * 0.12, 0.62, E.x, E.y, 0.026], [E.x, E.y, g * hx, hy, 0.022]);
			segs.push([g * hx, hy - 0.035, g * hx, hy + 0.035, 0.014]);
		}
		return { segs, circs: [[0, 0.76, 0.06]], box: [-0.38, 0.38, 1.16] };
	},
	row: (d) => {
		const L = (a: number, b: number) => a + (b - a) * d;
		const hx = L(0.25, -0.02), ex = L(0.05, -0.3);
		return { segs: [
			[-0.25, 0.14, 0.05, 0.14, 0.02],
			[-0.1, 0.2, -0.12, 0.55, 0.058],
			[-0.1, 0.2, 0.15, 0.3, 0.042], [0.15, 0.3, 0.32, 0.12, 0.03],
			[0.36, 0.03, 0.36, 0.26, 0.016],
			[-0.12, 0.53, ex, L(0.5, 0.42), 0.025], [ex, L(0.5, 0.42), hx, 0.42, 0.02],
			[hx, 0.42, 0.6, 0.42, 0.007]
		], circs: [[-0.12, 0.67, 0.055]], box: [-0.4, 0.64, 0.82] };
	},
	lunge: (d) => {
		const L = (a: number, b: number) => a + (b - a) * d;
		const hip = [L(0.02, -0.04), L(0.53, 0.37)], sh = [L(0.04, -0.02), L(0.8, 0.66)];
		return { segs: [
			[0.08, 0.03, L(0.06, 0.16), L(0.28, 0.3), 0.034],
			[L(0.06, 0.16), L(0.28, 0.3), hip[0], hip[1], 0.045],
			[L(0.06, -0.38), 0.03, L(0.0, -0.22), L(0.28, 0.14), 0.03],
			[L(0.0, -0.22), L(0.28, 0.14), hip[0], hip[1], 0.04],
			[hip[0], hip[1], sh[0], sh[1], 0.058],
			[sh[0], sh[1], sh[0] + 0.08, L(0.52, 0.4), 0.02]
		], circs: [[sh[0], sh[1] + 0.12, 0.055], [sh[0] + 0.08, L(0.48, 0.36), 0.045]], box: [-0.5, 0.35, 1.0] };
	},
	legcurl: (d) => {
		const L = (a: number, b: number) => a + (b - a) * d;
		const foot = [L(0.44, 0.3), L(0.32, 0.1)];
		return { segs: [
			[0, 0.02, 0, 0.3, 0.015], [-0.15, 0.32, 0.15, 0.32, 0.022], [-0.15, 0.34, -0.19, 0.6, 0.015],
			[-0.05, 0.36, -0.1, 0.66, 0.056],
			[-0.05, 0.36, 0.2, 0.36, 0.045],
			[0.2, 0.36, foot[0], foot[1], 0.032],
			[-0.08, 0.6, 0.0, 0.36, 0.02]
		], circs: [[-0.1, 0.78, 0.055], [foot[0] + 0.02, foot[1] - 0.01, 0.032]], box: [-0.3, 0.56, 0.94] };
	},
	cph: (d) => {
		const L = (a: number, b: number) => a + (b - a) * d, hipY = L(0.2, 0.34);
		const bf = [L(0.5, 0.58), L(0.14, 0.23)];
		return { segs: [
			[0.6, 0.26, 0.9, 0.26, 0.04], [0.65, 0.02, 0.65, 0.2, 0.015], [0.85, 0.02, 0.85, 0.2, 0.015],
			[0.72, 0.32, 0.38, (0.32 + hipY) / 2 + 0.01, 0.028],
			[0.38, (0.32 + hipY) / 2 + 0.01, 0.02, hipY, 0.04],
			[0.02, hipY, 0.28, hipY - 0.05, 0.034], [0.28, hipY - 0.05, bf[0], bf[1], 0.024],
			[0.02, hipY, -0.4, 0.32, 0.056],
			[-0.4, 0.32, -0.46, 0.03, 0.024], [-0.46, 0.03, -0.28, 0.03, 0.02]
		], circs: [[-0.53, L(0.31, 0.37), 0.052]], box: [-0.62, 0.94, 0.62] };
	},
	deadbug: (d) => {
		const L = (a: number, b: number) => a + (b - a) * d;
		const a = L(1.57, 2.75);
		const hand = [-0.3 + 0.32 * Math.cos(a), 0.1 + 0.32 * Math.sin(a)];
		const knee = [L(0.2, 0.32), L(0.3, 0.2)], foot = [L(0.35, 0.56), L(0.28, 0.13)];
		return { segs: [
			[-0.35, 0.07, 0.05, 0.07, 0.055],
			[-0.3, 0.1, hand[0], hand[1], 0.022],
			[0.05, 0.09, knee[0], knee[1], 0.04], [knee[0], knee[1], foot[0], foot[1], 0.028],
			[0.05, 0.08, 0.17, 0.25, 0.034], [0.17, 0.25, 0.3, 0.23, 0.024]
		], circs: [[-0.46, 0.09, 0.052]], box: [-0.68, 0.62, 0.5] };
	},
	bridge: (d) => {
		const hy = 0.1 + d * 0.2;
		return { segs: [
			[-0.3, 0.09, 0, hy, 0.055],
			[0, hy, 0.2, 0.32, 0.045], [0.2, 0.32, 0.26, 0.05, 0.03], [0.22, 0.03, 0.32, 0.03, 0.018],
			[-0.3, 0.09, -0.08, 0.03, 0.02]
		], circs: [[-0.42, 0.09, 0.052], [0, hy + 0.1, 0.05]], box: [-0.54, 0.44, 0.56] };
	},
	sideplank: (d) => {
		const L = (a: number, b: number) => a + (b - a) * d, hy = L(0.12, 0.26);
		return { segs: [
			[0.45, 0.06, 0.25, L(0.09, 0.17), 0.03], [0.25, L(0.09, 0.17), 0.05, hy, 0.045],
			[0.05, hy, -0.3, 0.28, 0.055],
			[-0.3, 0.28, -0.36, 0.03, 0.024], [-0.36, 0.03, -0.18, 0.03, 0.02]
		], circs: [[-0.4, 0.34, 0.052]], box: [-0.52, 0.52, 0.48] };
	}
};

/** `Exercise.name` (plans.ts) → pose key. Not here → no glyph, never a stand-in. */
export const POSE_BY_NAME: Record<string, string> = {
	'Goblet Squat': 'goblet',
	'Deep Goblet Squat': 'gobletdeep',
	'Chest Press': 'chestpress',
	'Face Pull': 'facepull',
	// a stand-in: the same arms-out, pull-wide shape — author a real pose in Claude Design when there is one
	'Band Pull-Apart': 'facepull',
	'Lat Pulldown': 'pulldown',
	'Romanian Deadlift': 'rdl',
	'KB Deadlift': 'kbdl',
	'Standing Calf Raise': 'calf',
	'Long-Lever Plank': 'plankll',
	'Shoulder Press': 'ohp',
	'Seated Row': 'row',
	'DB Reverse Lunge': 'lunge',
	'Leg Curl': 'legcurl',
	'Copenhagen Plank': 'cph',
	'Dead Bug': 'deadbug',
	'DB Glute Bridge': 'bridge',
	'Side Plank': 'sideplank'
};

export function poseFor(name: string): PoseFn | null {
	const key = POSE_BY_NAME[name];
	return key ? (POSES[key] ?? null) : null;
}

// distance from a point to a segment — the capsule test
function distSeg(px: number, py: number, sg: Seg): number {
	const dx = sg[2] - sg[0], dy = sg[3] - sg[1], LL = dx * dx + dy * dy;
	let t = LL ? ((px - sg[0]) * dx + (py - sg[1]) * dy) / LL : 0;
	t = Math.max(0, Math.min(1, t));
	return Math.hypot(px - (sg[0] + dx * t), py - (sg[1] + dy * t));
}

/** The grid rule: a point prints if it is inside any circle or within r of any segment. */
export function prints(p: Pose, gx: number, gy: number): boolean {
	for (const c of p.circs) if (Math.hypot(gx - c[0], gy - c[1]) <= c[2]) return true;
	for (const sg of p.segs) if (distSeg(gx, gy, sg) <= sg[4]) return true;
	return false;
}
