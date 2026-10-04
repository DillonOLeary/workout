// Rig v2 — the dot athlete as a 3D figure. A fixed-length skeleton posed by joint ROTATION (FK spine and legs), arms
// solved by 2-bone IK to targets (the bell at the chest, hands planted). The body is ~25 smooth-blended volumes,
// ray-marched and lit, then sampled into the dot grid; the ground re-solves every frame, so contacts never float or sink.
// From the Claude Design project's Figure Lab (rig2.js), typed. Framework-free: figureFor(name) → a figure;
// figureFrame(...) → a scene; render(...) → a dot grid; draw(...) → a canvas. No imports, so Node runs it as-is (tools/glyphs).

/** dots across and down */
export const GRID = 41;
/** frames a second — animators' "on twos" */
export const FPS = 12;
/** the figure Today and the Done screen show; a rest */
export const STAND = 'Stand';
/** metres the grid spans, centred a little above the hip */
export const SPAN = 2.0;
export const CENTER_Y = 0.9;

type V3 = number[];
type M3 = number[];
/** ambient: two demo reps at tempo, then the start pose, breathing · still: the key pose and a breath (reduced motion) · pace: loops at tempo */
export type Mode = 'ambient' | 'still' | 'pace';
/** where a hand goes: hanging from the shoulder, riding the ribcage or the pelvis, planted on the floor, or at a world point; z is outward-positive */
export type Hand = { s: 'hang' | 'chest' | 'pelvis' | 'plant' | 'world'; p: V3; pole?: V3 | null; hd?: V3 | null; via?: 'side' };
/** which part of the body stays where it is when a pose changes */
export type Anchor = 'feet' | 'toes' | 'knees' | 'pelvis' | 'shoulders' | 'footR' | 'footL' | 'kneeL' | 'kneeR';
/** the joint angles, degrees: one leg is [flex, abduct, twist] */
export type Angles = {
	yaw: number; roll: number; lift: number; pelvis: number; spine: number; twist?: number; chest: number; neck: number; head: number;
	hip: number[][]; knee: number[]; foot: number[]; ground?: 'torso'; groundT?: number;
};
/** a key pose: angles, hands, what it is anchored by, what it holds */
export type Key = Angles & { hand: Hand[]; handM?: Hand[]; anchor: Anchor; props: string[] };
type KeyIn = Partial<Key>;
/** the shapes every pose is entered from and left to */
export type Waypoint = 'stand' | 'kneel' | 'heels' | 'floor' | 'sit' | 'back' | 'prone' | 'bench' | 'benchback' | 'benchprone';
type Lock = { T: V3; h: V3; abs?: boolean } | null;
type Gait = { px: number; py: number; legs: { ank: V3; pitch: number; pole?: V3 }[]; h: V3 };
/** how a solve is placed: by an anchor at ax (or a fixed shift sx), offset dx, with feet locked or walking */
type Ctx = { anchor?: Anchor; ax?: number; sx?: number; dx?: number; lock?: Lock[] | null; lockM?: Lock[]; lockW?: number[]; gait?: Gait };
type PathKey = [number, number, number, number, number, ('TD' | 'LO')?];
type Knot = { ph: number; v: number[]; fl: string; stv?: number[]; tan: number[] };
type PathDef = { keys: PathKey[]; off?: number; pole?: V3; K?: Knot[]; fmax?: number };
type Loco = {
	speed?: number; period: number; duty?: number; lift?: number; kneeFwd?: number; bob?: number; lean?: number; arm?: 'hang' | 'run' | 'T'; armAmp?: number;
	width?: number; cycles: number; hipH?: number; run?: boolean; toes?: boolean; absZ?: boolean; cross?: boolean; yawAmp?: number;
	yawFrom?: number; yawK?: number; yawMax?: number; paths?: PathDef[]; dir?: V3; sub?: number;
};
type FigureDef = {
	id: string; name: string; aliases?: string[]; kind: 'rep' | 'hold' | 'stretch' | 'idle'; cue: string;
	k0: KeyIn; k1?: KeyIn; base?: Waypoint; yaw?: number; pitch?: number; props?: string[];
	tempo?: number[]; labels?: string[]; ecc?: boolean; reps?: number; hold?: number; breath?: number[];
	plantRef?: number; swing?: { leg: number; knee: number; hip: number }; lock?: boolean[]; alt?: boolean; free?: number[]; gait?: number[]; loco?: Loco;
};
/** one figure of the library, ready to pose: both keys filled, centred, planted hands pinned, feet locked */
export type Figure = Omit<FigureDef, 'k0' | 'k1' | 'props' | 'base' | 'yaw' | 'pitch'> & {
	k0: Key; k1: Key; ctx: Ctx; props: string[]; base: Waypoint; yaw: number; pitch: number; group: string;
};
type Leg = { hip: V3; knee: V3; ank: V3; Rk: M3; heel: V3; toe: V3 };
type Arm = { E: V3; W: V3; H: V3; T: V3; pole: V3; hd: V3 };
/** every joint in world space, and the frames that carry them */
export type Joints = {
	Ry: M3; Rp: M3; Rs: M3; Rc: M3; Rn: M3; Rh: M3;
	pelvis: V3; spine: V3; chest: V3; neck: V3; head: V3; sh: V3[]; legs: Leg[]; arms: Arm[]; shift: V3; benchAt: number[];
};
type Prim =
	| { t: 0; a: V3; b: V3; ra: number; rb: number; g: number }
	| { t: 1; c: V3; R: M3; r: V3; g: number }
	| { t: 2; c: V3; h: V3; g: number };
type CPrim =
	| { t: 0; g: number; ax: number; ay: number; az: number; bx: number; by: number; bz: number; inv: number; ra: number; dr: number }
	| { t: 1; g: number; cx: number; cy: number; cz: number; R: M3; i0: number; i1: number; i2: number; j0: number; j1: number; j2: number }
	| { t: 2; g: number; cx: number; cy: number; cz: number; hx: number; hy: number; hz: number };
/** what render reads: the compiled volumes, their bounds, the joints */
export type Scene = { P: CPrim[]; box: { lo: V3; hi: V3 }; J: Joints };
/** where the figure is in time: depth 0..1 into the move, the breath, and the words the lab shows */
export type Timeline = {
	d: number; b: number; amp: number; sway?: number; segs: [string, number][]; seg: number; u: number; rep: number; label: string; sub: string; settled?: boolean;
};
type LocoTimeline = Timeline & { ph: number; r: number; I: number; still?: boolean };
/** the floor scrolling under a walk or a run: its offset, and whether gravel shows */
export type Ground = { o: V3; gravel: boolean };
/** one frame of a figure */
export type Frame = { tl: Timeline; body: Angles; props: string[]; lock: Lock[] | null; scene: Scene; ground?: Ground };
/** where the camera looks from */
export type Camera = { yaw: number; pitch: number; center: V3; span: number };
/** a sampled grid: kind per dot (0 paper · 1 floor, val = contact shadow · 2 body · 3 prop or furniture · 4 gravel) and its ink 0..1 */
export type Grid = { N: number; kind: Uint8Array; val: Float32Array; proj: (p: V3) => number[] };
/** the colours draw paints with; a missing grid colour leaves paper bare */
export type Inks = { ink: string; grid: string | null; floor: string; gravel?: string };
type Node = { body: Angles; hand: Hand[]; ctx: Ctx; props: string[]; name: string; lock?: Lock[] | null };
/** one leg of a transition, pinned to a contact both ends share */
export type Hop = {
	A: Node; B: Node; cA: Ctx; cB: Ctx; lift: number[]; bench: number[] | null; dur: number; pin: string;
	first?: boolean; last?: boolean; lockA?: Lock[] | null; lockB?: Lock[] | null;
};

const D = Math.PI / 180;
const rx = (a: number): M3 => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const ry = (a: number): M3 => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rz = (a: number): M3 => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
const mm = (A: M3, B: M3): M3 => { const r = new Array<number>(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return r; };
const mv = (A: M3, p: V3): V3 => [A[0] * p[0] + A[1] * p[1] + A[2] * p[2], A[3] * p[0] + A[4] * p[1] + A[5] * p[2], A[6] * p[0] + A[7] * p[1] + A[8] * p[2]];
const tr = (M: M3): M3 => [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dt = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpV = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const wrap = (d: number) => ((d + 540) % 360) - 180;

function dph(a: number, b: number) { return (((b - a) % 1) + 1) % 1 || 1; }
function prepPath(keys: PathKey[]): Knot[] {
	const K: Knot[] = keys.map((k) => ({ ph: k[0], v: [k[1], k[2], k[3], k[4]], fl: k[5] || '', tan: [] })).sort((a, b) => a.ph - b.ph), n = K.length;
	const nx = (i: number) => K[(i + 1) % n], pv = (i: number) => K[(i - 1 + n) % n];
	K.forEach((k, i) => { if (k.fl === 'TD') { const e = nx(i); k.stv = k.v.map((x, j) => (e.v[j] - x) / dph(k.ph, e.ph)); } });
	K.forEach((k, i) => {
		if (k.fl === 'TD') k.tan = k.stv!;
		else if (k.fl === 'LO') k.tan = pv(i).stv!;
		else { const a = pv(i), b = nx(i); k.tan = b.v.map((x, j) => (x - a.v[j]) / (dph(a.ph, k.ph) + dph(k.ph, b.ph))); }
	});
	return K;
}
// bone lengths, metres — a 1.78 m adult, ~7.5 heads
const THIGH = 0.44, SHIN = 0.43, UARM = 0.29, FARM = 0.27;

/* ---------- poses ---------- */
const H = (x: number, y: number, z: number, pole?: V3, hd?: V3 | null): Hand => ({ s: 'hang', p: [x, y, z], pole, hd });
const C = (x: number, y: number, z: number, pole?: V3, hd?: V3 | null, via?: 'side'): Hand => ({ s: 'chest', p: [x, y, z], pole, hd, via });
const PL = (dx: number, y: number, dz: number, pole: V3, hd?: V3): Hand => ({ s: 'plant', p: [dx, y, dz], pole, hd: hd || [1, 0, 0] });
const two = <T>(h: T): T[] => [h, h];
const Lg = (fl: number, ab = 4, tw = 0) => [fl, ab, tw];
const HANG = H(0.03, -0.52, 0.05, [-1, 0, 0.25]);
const DEF: Key = { yaw: 0, roll: 0, lift: 0, pelvis: 0, spine: 0, chest: 0, neck: 0, head: 0, hip: [[0, 4, 6], [0, 4, 6]], knee: [3, 3], foot: [0, 0], hand: [HANG, HANG], anchor: 'feet', props: [] };
const full = (P: KeyIn): Key => Object.assign({}, DEF, P);
const ANGLES = ['yaw', 'roll', 'lift', 'pelvis', 'spine', 'twist', 'chest', 'neck', 'head'] as const;
function lerpBody(A: Angles, B: Angles, t: number): Angles {
	const o = {} as Angles;
	for (const k of ANGLES) o[k] = lerp(A[k] || 0, B[k] || 0, t);
	o.hip = [0, 1].map((i) => [0, 1, 2].map((j) => lerp(A.hip[i][j], B.hip[i][j], t)));
	o.knee = [0, 1].map((i) => lerp(A.knee[i], B.knee[i], t));
	o.foot = [0, 1].map((i) => A.foot[i] + wrap(B.foot[i] - A.foot[i]) * t);
	o.groundT = lerp(A.ground === 'torso' ? 1 : A.groundT || 0, B.ground === 'torso' ? 1 : B.groundT || 0, t);
	return o;
}
function mirrorBody(b: Angles): Angles {
	return Object.assign({}, b, { hip: [b.hip[1], b.hip[0]], knee: [b.knee[1], b.knee[0]], foot: [b.foot[1], b.foot[0]] });
}
const mirrorHand = (h: Hand): Hand => (h.s === 'world' ? Object.assign({}, h, { p: [h.p[0], h.p[1], -h.p[2]], pole: h.pole && [h.pole[0], h.pole[1], -h.pole[2]] }) : h);
const MIRROR_ANCHOR: Partial<Record<Anchor, Anchor>> = { footR: 'footL', footL: 'footR', kneeR: 'kneeL', kneeL: 'kneeR' };

/* ---------- forward kinematics ---------- */
function fk(b: Angles): Joints {
	const J = {} as Joints;
	const Ry = ry((b.yaw || 0) * D); J.Ry = Ry;
	const Rp = mm(Ry, mm(rx((b.roll || 0) * D), rz(-b.pelvis * D))); J.Rp = Rp;
	J.pelvis = [0, 1, 0];
	J.spine = add(J.pelvis, mv(Rp, [0, 0.1, 0])); const Rs = mm(Rp, mm(rz(-b.spine * D), ry((b.twist || 0) * D))); J.Rs = Rs;
	J.chest = add(J.spine, mv(Rs, [0, 0.14, 0])); const Rc = mm(Rs, rz(-b.chest * D)); J.Rc = Rc;
	J.neck = add(J.chest, mv(Rc, [0.01, 0.25, 0])); const Rn = mm(Rc, rz(-b.neck * D)); J.Rn = Rn;
	J.head = add(J.neck, mv(Rn, [0, 0.09, 0])); J.Rh = mm(Rn, rz(-b.head * D));
	J.sh = [0, 1].map((i) => add(J.chest, mv(Rc, [0, 0.205, (i ? 1 : -1) * 0.185])));
	J.legs = [0, 1].map((i) => {
		const zs = i ? 1 : -1, s = i ? -1 : 1, [fl, ab, tw] = b.hip[i];
		const hip = add(J.pelvis, mv(Rp, [0, -0.07, zs * 0.09]));
		const Rt = mm(Rp, mm(rz(fl * D), mm(rx(s * ab * D), ry(s * tw * D))));
		const knee = add(hip, mv(Rt, [0, -THIGH, 0]));
		const Rk = mm(Rt, rz(-b.knee[i] * D));
		const ank = add(knee, mv(Rk, [0, -SHIN, 0]));
		// foot: the angle that lays the sole flat, plus the pose's pitch (− toes down, + toes up, 180 = pointing back)
		const Rf = mm(Rk, rz(Math.atan2(-Rk[3], Rk[4]) + b.foot[i] * D));
		return { hip, knee, ank, Rk, heel: add(ank, mv(Rf, [-0.05, -0.045, 0])), toe: add(ank, mv(Rf, [0.17, -0.055, 0])) };
	});
	return J;
}

function ik2(S: V3, T: V3, a: number, b: number, pole: V3) {
	const d = sub(T, S); let L = len(d);
	L = clamp(L, Math.abs(a - b) + 1e-3, a + b - 1e-4);
	const u = nrm(d), x = (a * a - b * b + L * L) / (2 * L), h = Math.sqrt(Math.max(0, a * a - x * x));
	let p = sub(pole, scl(u, dt(pole, u))); p = len(p) < 1e-5 ? [0, -1, 0] : nrm(p);
	return { E: add(add(S, scl(u, x)), scl(p, h)), W: add(S, scl(u, L)) };
}

/** hands travel on arcs around the shoulder, not straight lines through the body */
function arc(S: V3, A: V3, B: V3, t: number, bias: V3): V3 {
	if (t <= 0) return A; if (t >= 1) return B;
	const a = sub(A, S), b = sub(B, S), la = len(a), lb = len(b), ua = nrm(a), ub = nrm(b);
	const c = clamp(dt(ua, ub), -1, 1);
	// the more opposed the two reaches, the more the path bows (forward, or out to the side) — continuous, never snaps
	let bp = sub(bias, scl(ua, dt(bias, ua))); if (len(bp) < 0.3) { bp = sub([0, 1, 0], scl(ua, ua[1])); if (len(bp) < 0.3) bp = sub([0, 0, 1], scl(ua, ua[2])); }
	const mid = nrm(add(add(ua, ub), scl(nrm(bp), 1.2 * Math.max(0, 0.3 - c))));
	const sl = (p: V3, q: V3, k: number) => { const w = Math.acos(clamp(dt(p, q), -1, 1)); if (w < 1e-4) return nrm(lerpV(p, q, k)); return add(scl(p, Math.sin((1 - k) * w) / Math.sin(w)), scl(q, Math.sin(k * w) / Math.sin(w))); };
	const u = t < 0.5 ? sl(ua, mid, t * 2) : sl(mid, ub, t * 2 - 1);
	return add(S, scl(u, lerp(la, lb, t)));
}
function resolveHand(h: Hand, i: number, J: Joints, dx?: number) {
	const zs = i ? 1 : -1, p = h.p, q = h.pole;
	if (h.s === 'chest' || h.s === 'pelvis') {
		const R = h.s === 'chest' ? J.Rc : J.Rp, o = h.s === 'chest' ? J.chest : J.pelvis;
		return { T: add(o, mv(R, [p[0], p[1], zs * p[2]])), pole: mv(R, q ? [q[0], q[1], zs * q[2]] : [-1, -0.5, 0.3 * zs]), hd: h.hd || null, via: h.via, world: false };
	}
	if (h.s === 'hang') return { T: add(J.sh[i], mv(J.Ry, [p[0], p[1], zs * p[2]])), pole: mv(J.Ry, q ? [q[0], q[1], zs * q[2]] : [-1, 0, 0.25 * zs]), hd: h.hd || null, via: h.via, world: false };
	return { T: [p[0] + (dx || 0), p[1], p[2]], pole: q || [-1, 0, 0], hd: h.hd || null, via: undefined, world: true };
}

/** foot IK to an absolute ankle target with a given pitch; the knee bends toward the pole */
function placeFoot(J: Joints, i: number, ankT: V3, pitch: number, h: V3, pole: V3) {
	const l = J.legs[i], up = [0, 1, 0], p = pitch * D;
	const fx = add(scl(h, Math.cos(p)), scl(up, Math.sin(p))), fy = add(scl(h, -Math.sin(p)), scl(up, Math.cos(p)));
	const { E: knee, W: ank } = ik2(l.hip, ankT, THIGH, SHIN, pole);
	const y = nrm(sub(knee, ank)), x = nrm(sub(h, scl(y, dt(h, y)))), z = cross(x, y);
	l.knee = knee; l.ank = ank; l.Rk = [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
	l.toe = add(add(ank, scl(fx, 0.17)), scl(fy, -0.055)); l.heel = add(add(ank, scl(fx, -0.05)), scl(fy, -0.045));
}
/** ankle height that keeps the lowest point of a foot at this pitch exactly on the floor */
const footClear = (pitch: number) => { const p = pitch * D, c = Math.cos(p), sn = Math.sin(p); return Math.max(0.05 * sn + 0.045 * c + 0.042, -0.17 * sn + 0.055 * c + 0.028); };
/** foot IK: the ball of the foot stays where it was planted; the knee bends toward where FK put it */
function lockFoot(J: Joints, i: number, lk: NonNullable<Lock>, pitch: number, dx: number, w = 1) {
	if (w <= 0.001) return;
	const l = J.legs[i], h = lk.h, up = [0, 1, 0], p = pitch * D;
	const fx = add(scl(h, Math.cos(p)), scl(up, Math.sin(p))), fy = add(scl(h, -Math.sin(p)), scl(up, Math.cos(p)));
	const toe = [lk.T[0] + dx, lk.T[1], lk.T[2]];
	const ankT = lerpV(J.legs[i].ank, add(sub(toe, scl(fx, 0.17)), scl(fy, 0.055)), w);
	const pole = sub(l.knee, lerpV(l.hip, l.ank, 0.5));
	const { E: knee, W: ank } = ik2(l.hip, ankT, THIGH, SHIN, len(pole) > 1e-4 ? pole : h);
	const y = nrm(sub(knee, ank)), x = nrm(sub(h, scl(y, dt(h, y)))), z = cross(x, y);
	l.knee = knee; l.ank = ank; l.Rk = [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
	const toeL = add(add(ank, scl(fx, 0.17)), scl(fy, -0.055)), heelL = add(add(ank, scl(fx, -0.05)), scl(fy, -0.045));
	const fkd = sub(ank, l.ank);
	l.toe = lerpV(add(l.toe, fkd), toeL, w); l.heel = lerpV(add(l.heel, fkd), heelL, w);
}

/* ---------- volumes ---------- */
function bodyPrims(J: Joints): Prim[] {
	const L: Prim[] = [];
	const E = (c: V3, R: M3, r: V3) => L.push({ t: 1, c, R, r, g: 0 }), Cp = (a: V3, b: V3, ra: number, rb: number) => L.push({ t: 0, a, b, ra, rb, g: 0 });
	E(add(J.pelvis, mv(J.Rp, [-0.01, -0.02, 0])), J.Rp, [0.115, 0.11, 0.165]);
	E(add(J.pelvis, mv(J.Rp, [-0.065, -0.075, 0])), J.Rp, [0.085, 0.095, 0.15]);
	E(add(J.spine, mv(J.Rs, [0, 0.04, 0])), J.Rs, [0.105, 0.11, 0.14]);
	E(add(J.chest, mv(J.Rc, [0.012, 0.1, 0])), J.Rc, [0.118, 0.17, 0.155]);
	E(add(J.chest, mv(J.Rc, [0.03, 0.16, 0])), J.Rc, [0.11, 0.1, 0.185]);
	for (const s of J.sh) Cp(add(J.neck, mv(J.Rc, [-0.02, -0.03, 0])), s, 0.06, 0.05);
	Cp(J.neck, add(J.head, mv(J.Rh, [0, 0.02, 0])), 0.054, 0.05);
	E(add(J.head, mv(J.Rh, [0.012, 0.085, 0])), J.Rh, [0.1, 0.115, 0.086]);
	E(add(J.head, mv(J.Rh, [0.055, 0.035, 0])), J.Rh, [0.055, 0.06, 0.06]);
	for (const l of J.legs) {
		Cp(l.hip, l.knee, 0.088, 0.056);
		Cp(l.knee, l.ank, 0.052, 0.034);
		Cp(add(l.knee, mv(l.Rk, [-0.025, -0.07, 0])), add(l.knee, mv(l.Rk, [-0.012, -0.23, 0])), 0.056, 0.038);
		Cp(l.heel, l.toe, 0.042, 0.028);
	}
	return L;
}
const extY = (R: M3, r: V3) => Math.sqrt((R[3] * r[0]) ** 2 + (R[4] * r[1]) ** 2 + (R[5] * r[2]) ** 2);
const bottom = (p: Prim) => (p.t === 0 ? Math.min(p.a[1] - p.ra, p.b[1] - p.rb) : p.t === 1 ? p.c[1] - extY(p.R, p.r) : p.c[1] - p.h[1]);
const minY = (L: Prim[]) => L.reduce((m, p) => Math.min(m, bottom(p)), 1e9);
function anchorPt(J: Joints, a?: Anchor | string): number {
	const L = J.legs, mid = (l: Leg) => (l.heel[0] + l.toe[0]) / 2;
	switch (a) {
		case 'toes': return (L[0].toe[0] + L[1].toe[0]) / 2;
		case 'knees': return (L[0].knee[0] + L[1].knee[0]) / 2;
		case 'pelvis': return J.pelvis[0];
		case 'shoulders': return (J.sh[0][0] + J.sh[1][0]) / 2;
		case 'footR': return mid(L[1]);
		case 'footL': return mid(L[0]);
		case 'kneeL': return L[0].knee[0];
		case 'kneeR': return L[1].knee[0];
		default: return (mid(L[0]) + mid(L[1])) / 2;
	}
}
const sxOf = (J: Joints, c: Ctx) => (c.sx != null ? c.sx : c.ax! - anchorPt(J, c.anchor));
function shiftJ(J: Joints, s: V3) {
	for (const k of ['pelvis', 'spine', 'chest', 'neck', 'head'] as const) J[k] = add(J[k], s);
	J.sh = J.sh.map((p) => add(p, s));
	for (const l of J.legs) for (const k of ['hip', 'knee', 'ank', 'heel', 'toe'] as const) l[k] = add(l[k], s);
}
function shiftPrims(L: Prim[], s: V3) { for (const p of L) { if (p.t === 0) { p.a = add(p.a, s); p.b = add(p.b, s); } else p.c = add(p.c, s); } }

/** body angles + two hand-spec sets blended by t + two anchoring contexts → a renderable scene */
export function solve(body: Angles, hA: Hand[], hB: Hand[], t: number, cA: Ctx, cB: Ctx, props?: string[], benchAt?: number[] | null): Scene {
	const J = fk(body); let L = bodyPrims(J);
	const gT = body.ground === 'torso' ? 1 : body.groundT || 0;
	const gy = gT > 0 ? lerp(minY(L), Math.min(...L.slice(2, 5).map(bottom), bottom(L[7])), gT) : minY(L);
	const s = [lerp(sxOf(J, cA), sxOf(J, cB), t), -gy + (body.lift || 0), 0];
	shiftJ(J, s); J.shift = s;
	if (cA.gait) {
		const g = cA.gait, s2 = [g.px - J.pelvis[0], g.py - J.pelvis[1], 0];
		shiftJ(J, s2); J.shift = add(J.shift, s2);
		for (let i = 0; i < 2; i++) placeFoot(J, i, g.legs[i].ank, g.legs[i].pitch, g.h, g.legs[i].pole || add(add(g.h, [0, 0.25, 0]), scl([0, 0, i ? 1 : -1], 0.15)));
	}
	if (cA.lock) { for (let i = 0; i < 2; i++) { const lk = cA.lock[i]; if (lk) lockFoot(J, i, lk, body.foot[i], lk.abs ? 0 : cA.dx || 0, cA.lockW ? cA.lockW[i] : 1); } }
	L = bodyPrims(J);
	{
		const top = Math.min(...L.slice(0, 5).map(bottom)), lying = Math.abs(body.pelvis) > 50;
		const dir = Math.sign(J.chest[0] - J.pelvis[0]) || 1, px = J.pelvis[0];
		const x0 = lying ? px - dir * 0.35 : px - 0.28, x1 = lying ? px + dir * 0.75 : px + 0.2;
		J.benchAt = [Math.min(x0, x1), Math.max(x0, x1), top];
	}
	J.arms = [0, 1].map((i) => {
		const A = resolveHand(hA[i], i, J, cA.dx), B = resolveHand(hB[i], i, J, cB.dx);
		let T: V3;
		if (A.world || B.world) { T = lerpV(A.T, B.T, t); const d = len(sub(A.T, B.T)); if (d > 0.03) T[1] += (A.world && B.world ? 0.1 : 0.16) * Math.min(1, d / 0.15) * Math.sin(Math.PI * t); }
		else T = arc(J.sh[i], A.T, B.T, t, (A.via || B.via) === 'side' ? mv(J.Rc, [0, 0, i ? 1 : -1]) : mv(J.Ry, [1, 0, 0]));
		const pl = lerpV(nrm(A.pole), nrm(B.pole), t), out = mv(J.Rc, [0, 0, i ? 1 : -1]);
		const pole = nrm(add(pl, scl(out, 1.2 * Math.max(0, 0.7 - len(pl)))));
		const { E, W } = ik2(J.sh[i], T, UARM, FARM, pole);
		const fd = nrm(sub(W, E));
		const hd = A.hd || B.hd ? nrm(lerpV(A.hd || fd, B.hd || fd, t)) : fd;
		const Hh = add(W, scl(hd, 0.085));
		L.push({ t: 0, a: J.sh[i], b: add(J.sh[i], scl(nrm(sub(E, J.sh[i])), 0.07)), ra: 0.062, rb: 0.05, g: 0 });
		L.push({ t: 0, a: J.sh[i], b: E, ra: 0.052, rb: 0.04, g: 0 });
		L.push({ t: 0, a: E, b: W, ra: 0.043, rb: 0.03, g: 0 });
		L.push({ t: 0, a: W, b: Hh, ra: 0.03, rb: 0.024, g: 0 });
		return { E, W, H: Hh, T, pole, hd };
	});
	const P = props || [], W0 = J.arms[0].W, W1 = J.arms[1].W, mid = lerpV(W0, W1, 0.5);
	const cap = (a: V3, b: V3, r: number) => L.push({ t: 0, a, b, ra: r, rb: r, g: 1 });
	const box = (c: V3, h: V3) => L.push({ t: 2, c, h, g: 2 }); // furniture: drawn lighter than the body
	if (P.includes('bench')) { const [x0, x1, top] = benchAt || J.benchAt; if (top > 0.05) box([(x0 + x1) / 2, top / 2, 0], [(x1 - x0) / 2, top / 2, 0.15]); }
	if (P.includes('kb')) { cap(W0, W1, 0.016); cap(add(mid, [0, -0.1, 0]), add(mid, [0, -0.1, 0]), 0.088); }
	if (P.includes('db')) for (const a of J.arms) {
		const c = add(a.W, scl(nrm(sub(a.H, a.W)), 0.045));
		cap(add(c, [0, 0, -0.1]), add(c, [0, 0, 0.1]), 0.02);
		for (const z of [-1, 1]) cap(add(c, [0, 0, z * 0.06]), add(c, [0, 0, z * 0.11]), 0.05);
	}
	if (P.includes('bar')) { const u = nrm(sub(W1, W0)); cap(add(W0, scl(u, -0.25)), add(W1, scl(u, 0.25)), 0.015); }
	if (P.includes('cableF')) cap(mid, add(mid, [0.95, 0.04, 0]), 0.007);
	if (P.includes('cableUp')) cap(mid, [mid[0] + 0.04, 2.3, mid[2]], 0.007);
	if (P.includes('wall')) box([Math.max(W0[0], W1[0]) + 0.07, 1.05, 0], [0.035, 1.05, 0.55]);
	if (P.includes('postL')) cap([W0[0] + 0.03, 0, W0[2]], [W0[0] + 0.03, 1.9, W0[2]], 0.025);
	if (P.includes('frame')) cap([W1[0] + 0.03, 0, W1[2]], [W1[0] + 0.03, 2.1, W1[2]], 0.03);
	const R = J.legs[1];
	if (P.includes('step')) { const top = Math.min(R.heel[1] - 0.042, R.toe[1] - 0.028); if (top > 0.05) box([(R.heel[0] + R.toe[0]) / 2, top / 2, 0], [0.2, top / 2, 0.32]); }
	if (P.includes('boxR')) { const top = R.heel[1] - 0.042; if (top > 0.05) box([R.heel[0] + 0.02, top / 2, R.heel[2]], [0.14, top / 2, 0.16]); }
	if (P.includes('shinBox')) { const top = R.ank[1] - 0.05; if (top > 0.05) box([R.ank[0], top / 2, R.ank[2]], [0.16, top / 2, 0.16]); }
	return { P: compile(L), box: bounds(L), J };
}

function bounds(L: Prim[]) {
	const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
	const put = (c: V3, r: number) => { for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], c[k] - r); hi[k] = Math.max(hi[k], c[k] + r); } };
	for (const p of L) {
		if (p.t === 0) { put(p.a, p.ra); put(p.b, p.rb); }
		else if (p.t === 1) put(p.c, Math.max(...p.r));
		else { put(sub(p.c, p.h), 0.02); put(add(p.c, p.h), 0.02); }
	}
	return { lo: lo.map((v) => v - 0.03), hi: hi.map((v) => v + 0.03) };
}
function compile(L: Prim[]): CPrim[] {
	return L.map((p): CPrim => {
		if (p.t === 0) { const b = sub(p.b, p.a), bb = dt(b, b); return { t: 0, g: p.g, ax: p.a[0], ay: p.a[1], az: p.a[2], bx: b[0], by: b[1], bz: b[2], inv: bb > 1e-9 ? 1 / bb : 0, ra: p.ra, dr: p.rb - p.ra }; }
		if (p.t === 1) { const R = tr(p.R); return { t: 1, g: p.g, cx: p.c[0], cy: p.c[1], cz: p.c[2], R, i0: 1 / p.r[0], i1: 1 / p.r[1], i2: 1 / p.r[2], j0: 1 / p.r[0] ** 2, j1: 1 / p.r[1] ** 2, j2: 1 / p.r[2] ** 2 }; }
		return { t: 2, g: p.g, cx: p.c[0], cy: p.c[1], cz: p.c[2], hx: p.h[0], hy: p.h[1], hz: p.h[2] };
	});
}

let HITPROP = false, HITFURN = false;
const SMOOTH = 0.035;
function sd(P: CPrim[], x: number, y: number, z: number) {
	let body = 1e9, prop = 1e9, furn = 1e9;
	for (let i = 0; i < P.length; i++) {
		const p = P[i]; let d: number;
		if (p.t === 0) {
			const px = x - p.ax, py = y - p.ay, pz = z - p.az;
			let h = (px * p.bx + py * p.by + pz * p.bz) * p.inv; h = h < 0 ? 0 : h > 1 ? 1 : h;
			const qx = px - p.bx * h, qy = py - p.by * h, qz = pz - p.bz * h;
			d = Math.sqrt(qx * qx + qy * qy + qz * qz) - (p.ra + p.dr * h);
		} else if (p.t === 1) {
			const px = x - p.cx, py = y - p.cy, pz = z - p.cz, R = p.R;
			const lx = R[0] * px + R[1] * py + R[2] * pz, ly = R[3] * px + R[4] * py + R[5] * pz, lz = R[6] * px + R[7] * py + R[8] * pz;
			const k0 = Math.sqrt((lx * p.i0) ** 2 + (ly * p.i1) ** 2 + (lz * p.i2) ** 2), k1 = Math.sqrt((lx * p.j0) ** 2 + (ly * p.j1) ** 2 + (lz * p.j2) ** 2);
			d = k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -0.01;
		} else {
			const qx = Math.abs(x - p.cx) - p.hx, qy = Math.abs(y - p.cy) - p.hy, qz = Math.abs(z - p.cz) - p.hz;
			d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - 0.012;
		}
		if (p.g === 0) { if (body === 1e9) body = d; else { const h = Math.max(SMOOTH - Math.abs(body - d), 0) / SMOOTH; body = Math.min(body, d) - h * h * SMOOTH * 0.25; } }
		else if (p.g === 1) { if (d < prop) prop = d; }
		else if (d < furn) furn = d;
	}
	const m = Math.min(body, prop, furn);
	HITPROP = m === prop && prop < body; HITFURN = m === furn && furn < body && furn < prop;
	return m;
}

/* ---------- camera + sampling into the grid ---------- */
function camera(cam: Camera) {
	const yaw = cam.yaw * D, pit = cam.pitch * D;
	const f = [-Math.sin(yaw) * Math.cos(pit), -Math.sin(pit), -Math.cos(yaw) * Math.cos(pit)];
	const r = [Math.cos(yaw), 0, -Math.sin(yaw)], u = cross(r, f);
	return { f, r, u, C: cam.center, S: cam.span };
}
/** ray-march the scene from the camera into an N × N grid of dots, lit from the upper left; the floor carries the contact shadow */
export function render(scene: Scene, cam: Camera, N: number, ground?: Ground | null): Grid {
	const gv = ground && ground.gravel, go = ground ? ground.o : [0, 0, 0];
	const { P, box } = scene, K = camera(cam), { f, r, u, C, S } = K, pitch = S / N;
	const Lt = nrm(add(add(scl(f, -0.7), scl(u, 0.75)), scl(r, -0.3)));
	const fh = nrm([f[0], 0, f[2]]);
	const kind = new Uint8Array(N * N), val = new Float32Array(N * N);
	const e = 0.006;
	for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
		const sx = (i + 0.5 - N / 2) * pitch, sy = (N / 2 - j - 0.5) * pitch;
		const O = [C[0] + r[0] * sx + u[0] * sy - f[0] * 4, C[1] + r[1] * sx + u[1] * sy - f[1] * 4, C[2] + r[2] * sx + u[2] * sy - f[2] * 4];
		let t0 = 0, t1 = 9, miss = false;
		for (let k = 0; k < 3; k++) {
			if (Math.abs(f[k]) < 1e-9) { if (O[k] < box.lo[k] || O[k] > box.hi[k]) { miss = true; break; } continue; }
			let a = (box.lo[k] - O[k]) / f[k], b = (box.hi[k] - O[k]) / f[k]; if (a > b) { const tmp = a; a = b; b = tmp; }
			t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) { miss = true; break; }
		}
		const idx = j * N + i;
		if (!miss) {
			let t = t0, hit = false;
			for (let s = 0; s < 64 && t < t1; s++) {
				const d = sd(P, O[0] + f[0] * t, O[1] + f[1] * t, O[2] + f[2] * t);
				if (d < 0.003) { hit = true; break; }
				t += d * 0.9;
			}
			if (hit) {
				const x = O[0] + f[0] * t, y = O[1] + f[1] * t, z = O[2] + f[2] * t;
				sd(P, x, y, z); const prop = HITPROP, furn = HITFURN;
				const a = sd(P, x + e, y - e, z - e), b = sd(P, x - e, y - e, z + e), c = sd(P, x - e, y + e, z - e), dd = sd(P, x + e, y + e, z + e);
				const n = nrm([a - b - c + dd, -a - b + c + dd, -a + b - c + dd]);
				const diff = Math.max(0, dt(n, Lt));
				const ao = clamp(sd(P, x + n[0] * 0.07, y + n[1] * 0.07, z + n[2] * 0.07) / 0.07, 0, 1);
				const rim = 1 - Math.abs(dt(n, f));
				let ink = 1 - (0.1 + 0.9 * diff) * (0.6 + 0.4 * ao);
				ink = clamp(0.22 + 0.78 * ink + 0.35 * rim ** 3, 0, 1);
				kind[idx] = prop || furn ? 3 : 2; val[idx] = furn ? 0.08 + 0.4 * ink : prop ? Math.max(ink, 0.72) : ink;
				continue;
			}
		}
		if (f[1] < 0) {
			const tf = -O[1] / f[1], X = O[0] + f[0] * tf, Z = O[2] + f[2] * tf;
			const depth = (X - C[0]) * fh[0] + (Z - C[2]) * fh[2];
			if (Math.abs(depth) < (gv ? 0.85 : 0.55)) {
				kind[idx] = 1; val[idx] = Math.pow(clamp(1 - sd(P, X, 0, Z) / 0.22, 0, 1), 1.6);
				if (gv) { const gx = Math.floor((X + go[0]) / 0.11), gz = Math.floor((Z + go[2]) / 0.11), hsh = Math.sin(gx * 127.1 + gz * 311.7) * 43758.5453; if (hsh - Math.floor(hsh) < 0.13) kind[idx] = 4; }
			}
		}
	}
	const proj = (p: V3) => { const q = sub(p, C); return [dt(q, r) / pitch + N / 2, N / 2 - dt(q, u) / pitch]; };
	return { N, kind, val, proj };
}

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const dith = (v: number, i: number, j: number) => v > (BAYER[j & 3][i & 3] + 0.5) / 16;
/** a dot's radius as a fraction of its cell, and which colour it takes — 0 radius draws nothing */
export function dotAt(R: Grid, i: number, j: number, style: 'halftone' | '1bit'): { rad: number; c: 'ink' | 'gravel' | 'grid' | 'floor' } {
	const N = R.N, k = R.kind[j * N + i], v = R.val[j * N + i];
	if (k === 4) return { rad: style === '1bit' ? (dith(0.35, i, j) ? 0.3 : 0) : 0.13 + 0.25 * v, c: v > 0.3 ? 'ink' : 'gravel' };
	if (style === '1bit') {
		if (k >= 2) return { rad: dith(v * 0.9 + 0.1, i, j) ? 0.36 : 0, c: 'ink' };
		if (k === 1) return { rad: v > 0.08 && dith(v * 0.75, i, j) ? 0.36 : 0, c: 'ink' };
		return { rad: 0.06, c: 'grid' };
	}
	if (k >= 2) return { rad: 0.16 + 0.32 * v, c: 'ink' };
	if (k === 1) return v > 0.05 ? { rad: 0.08 + 0.3 * v, c: 'ink' } : { rad: 0.085, c: 'floor' };
	return { rad: 0.06, c: 'grid' };
}
/** paint a sampled grid; style 'halftone' (dot size = shade) or '1bit' (one dot size, dithered) */
export function draw(ctx: CanvasRenderingContext2D, size: number, R: Grid, style: 'halftone' | '1bit', col: Inks) {
	const N = R.N, p = size / N;
	const inks = { ink: col.ink, gravel: col.gravel || '#A8A18B', grid: col.grid, floor: col.floor };
	ctx.clearRect(0, 0, size, size);
	for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
		const { rad, c } = dotAt(R, i, j, style), fill = inks[c];
		if (rad <= 0 || !fill) continue;
		ctx.fillStyle = fill; ctx.beginPath(); ctx.arc((i + 0.5) * p, (j + 0.5) * p, rad * p, 0, 6.2832); ctx.fill();
	}
}
/** the skeleton over the dots: bones, joints, and the dashed targets the hands reach for */
export function drawRig(ctx: CanvasRenderingContext2D, size: number, R: Grid, J: Joints, col: { ink: string; bone: string; joint: string }) {
	const p = size / R.N, P = (q: V3) => { const s = R.proj(q); return [s[0] * p, s[1] * p]; };
	const head = add(J.head, mv(J.Rh, [0.012, 0.2, 0]));
	const chains = [[J.pelvis, J.spine, J.chest, J.neck, J.head, head]];
	for (let i = 0; i < 2; i++) {
		const l = J.legs[i], a = J.arms[i];
		chains.push([J.pelvis, l.hip, l.knee, l.ank, l.toe], [l.ank, l.heel], [J.chest, J.sh[i], a.E, a.W, a.H]);
	}
	ctx.lineCap = 'round'; ctx.lineJoin = 'round';
	const lw = Math.max(2.5, size / 140);
	for (const pass of [[col.ink, lw + 3], [col.bone, lw]] as const) for (const ch of chains) { ctx.beginPath(); ch.forEach((q, k) => { const s = P(q); if (k) ctx.lineTo(s[0], s[1]); else ctx.moveTo(s[0], s[1]); }); ctx.strokeStyle = pass[0]; ctx.lineWidth = pass[1]; ctx.stroke(); }
	const joints = [J.pelvis, J.spine, J.chest, J.neck, J.head, ...J.sh, ...J.legs.flatMap((l) => [l.hip, l.knee, l.ank]), ...J.arms.flatMap((a) => [a.E, a.W])];
	for (const q of joints) { const s = P(q); ctx.beginPath(); ctx.arc(s[0], s[1], Math.max(3, size / 110), 0, 6.2832); ctx.fillStyle = col.joint; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = col.ink; ctx.stroke(); }
	for (const a of J.arms) { const s = P(a.T); ctx.beginPath(); ctx.arc(s[0], s[1], Math.max(5, size / 70), 0, 6.2832); ctx.setLineDash([3, 3]); ctx.strokeStyle = col.ink; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]); }
}

/* ---------- waypoints: the shapes every pose is entered from and left to ---------- */
const PLANT0 = PL(0.0, 0.035, -0.015, [-1, 0, 0.3]);
const ARMS_SIDE = PL(0.42, 0.035, 0.06, [0, -1, 0.5]);
const WAYPOINTS: Record<Waypoint, KeyIn> = {
	stand: { chest: 2, neck: -2 },
	kneel: { chest: 2, neck: -2, hip: [Lg(0), Lg(90)], knee: [90, 90], foot: [180, 0], hand: two(H(0.1, -0.5, 0.06)), anchor: 'footR' },
	heels: { pelvis: 15, chest: 2, neck: -2, hip: two(Lg(75, 6)), knee: [150, 150], foot: [180, 180], hand: two(H(0.2, -0.42, 0.08)), anchor: 'knees' },
	floor: { pelvis: 80, head: 8, hip: two(Lg(80)), knee: [90, 90], foot: [180, 180], hand: two(PLANT0), anchor: 'knees' },
	sit: { pelvis: -12, hip: two(Lg(78)), knee: [0, 0], foot: [90, 90], hand: two(PL(-0.12, 0.035, 0.05, [1, 0, 0.3])), anchor: 'pelvis' },
	back: { pelvis: -90, hip: two(Lg(45, 6)), knee: [90, 90], hand: two(ARMS_SIDE), anchor: 'pelvis' },
	prone: { pelvis: 90, hip: two(Lg(0)), knee: [0, 0], foot: [180, 180], hand: two(PL(0.22, 0.03, -0.03, [-0.2, -1, 0.2])), anchor: 'pelvis' },
	bench: { pelvis: -3, spine: -2, hip: two(Lg(86, 12, 10)), knee: [88, 88], hand: two(H(0.24, -0.42, 0.08)), anchor: 'pelvis', props: ['bench'] },
	benchback: { pelvis: -90, hip: two(Lg(0, 8)), knee: [90, 90], hand: two(C(0.1, -0.1, 0.3)), anchor: 'feet', props: ['bench'] },
	benchprone: { pelvis: 90, lift: 0.5, hip: two(Lg(0)), knee: [0, 0], foot: [180, 180], hand: two(C(0.35, 0.25, 0.2, [1, 0, 0.5])), anchor: 'pelvis', props: ['bench'] }
};
const GRAPH: Record<Waypoint, Waypoint[]> = { stand: ['kneel', 'bench', 'benchprone'], kneel: ['stand', 'heels'], heels: ['kneel', 'floor', 'sit'], floor: ['heels', 'prone'], sit: ['heels', 'back'], back: ['sit'], prone: ['floor'], bench: ['stand', 'benchback'], benchback: ['bench'], benchprone: ['stand'] };
const WPN: Record<Waypoint, string> = { stand: 'Stand', kneel: 'Half-kneel', heels: 'Sit back', floor: 'All fours', sit: 'Sit', back: 'Lie back', prone: 'Lie face-down', bench: 'Bench', benchback: 'Lie on bench', benchprone: 'Bench, face-down' };

/* ---------- the library — names and aliases match plans.ts, so figureFor(name) keeps working ---------- */
const UP = C(0.05, 0.74, 0.13, [0, 0, 1]);
const GOB = C(0.21, 0.02, 0.07, [-0.3, -1, 0.6]);
const DB0 = H(0.11, -0.5, -0.03, [-1, 0, 0.1]), DB1 = H(0.03, -0.53, -0.03, [-1, 0, 0.1]);
const SEAT: KeyIn = { pelvis: -3, spine: -2, chest: -2, hip: two(Lg(86, 12, 10)), knee: [88, 88], anchor: 'pelvis' };
const BACK: KeyIn = { pelvis: -90, hip: two(Lg(45, 6)), knee: [90, 90], hand: two(ARMS_SIDE), anchor: 'feet' };
const FOURS: KeyIn = { pelvis: 80, head: 8, hip: two(Lg(80)), knee: [90, 90], foot: [180, 180], hand: two(PLANT0), anchor: 'knees' };
const RUNARMS: Hand[] = [C(-0.12, -0.12, 0.2, [-1, 0, 0.3]), C(0.18, -0.04, 0.18, [-1, 0, 0.3])];
const TARM = C(0, 0.2, 0.74, [0, 1, 0]);
const X = (o: KeyIn, p: KeyIn): KeyIn => Object.assign({}, o, p);

const LIB: [string, FigureDef[]][] = [
	['Lifts', [
		{ id: 'goblet', name: 'Goblet Squat', aliases: ['Bodyweight Squat', 'Bodyweight squats'], kind: 'rep', tempo: [3, 1, 1, 0], labels: ['Lower', 'Pause', 'Drive', 'Top'], ecc: true, props: ['kb'],
			cue: 'hips drop between the heels, knees forward, torso tips just enough to keep the bell over mid-foot',
			k0: { neck: -2, hip: two(Lg(4, 12, 18)), knee: [4, 4], hand: two(GOB) },
			k1: { pelvis: 40, spine: -8, chest: -6, neck: -14, head: -4, hip: two(Lg(114, 20, 20)), knee: [115, 115], hand: two(GOB) } },
		{ id: 'rdl', name: 'Romanian Deadlift', kind: 'rep', tempo: [3, 0, 1, 1], labels: ['Hinge', 'Bottom', 'Stand', 'Squeeze'], ecc: true, props: ['db'],
			cue: 'hips travel back, knees stay soft, back flat; the bar slides down the thighs',
			k0: { chest: 2, hip: two(Lg(0, 4, 4)), knee: [4, 4], hand: two(DB0) },
			k1: { pelvis: 72, spine: 8, chest: 6, neck: -12, head: -6, hip: two(Lg(84, 4, 4)), knee: [20, 20], hand: two(DB1) } },
		{ id: 'kbdl', name: 'KB Deadlift', kind: 'rep', tempo: [2, 0, 1, 1], labels: ['Lower', 'Floor', 'Stand', 'Lockout'], ecc: true, props: ['kb'],
			cue: 'standing tall with the bell hanging; knees and hips bend together and the bell goes to the floor between the feet',
			k0: { chest: 2, hip: two(Lg(0, 6, 8)), knee: [4, 4], hand: two(H(0.08, -0.5, -0.12, [-1, 0, 0.2])) },
			k1: { pelvis: 58, spine: 6, chest: 4, neck: -14, head: -4, hip: two(Lg(105, 10, 10)), knee: [70, 70], hand: two(H(0.04, -0.52, -0.12, [-1, 0, 0.2])) } },
		{ id: 'ohp', name: 'Shoulder Press', base: 'bench', kind: 'rep', tempo: [1, 0, 2, 1], labels: ['Press', 'Lockout', 'Lower', 'Reset'], ecc: false, props: ['bench', 'bar'], yaw: 72,
			cue: 'seated, front view: bar from the collarbones to lockout overhead, elbows travel under the bar',
			k0: X(SEAT, { hand: two(C(0.08, 0.17, 0.24, [-0.1, -0.4, 1])) }), k1: X(SEAT, { hand: two(C(0.03, 0.66, 0.15, [-0.1, -0.2, 1])) }) },
		{ id: 'row', name: 'Seated Row', base: 'bench', kind: 'rep', tempo: [1, 1, 2, 0], labels: ['Pull', 'Squeeze', 'Return', 'Reach'], ecc: false, props: ['bench', 'cableF'],
			cue: 'seated, feet braced, torso still; the handle comes to the ribs and the elbow passes behind',
			k0: { pelvis: 10, spine: 4, hip: two(Lg(80, 8, 4)), knee: [70, 70], hand: two(C(0.52, 0.05, 0.12, [-1, -0.3, 0.4])), anchor: 'pelvis' },
			k1: { pelvis: -6, spine: -4, chest: -4, hip: two(Lg(80, 8, 4)), knee: [70, 70], hand: two(C(0.12, -0.02, 0.17, [-1, -0.2, 0.5])), anchor: 'pelvis' } },
		{ id: 'plank', name: 'Long-Lever Plank', aliases: ['Plank', 'Forearm Plank'], base: 'floor', kind: 'hold', hold: 45, breath: [2, 3], plantRef: 1,
			cue: 'a hold: elbows well ahead of the shoulders, one straight line from ear to heel. No pulse — just a breath',
			k0: { pelvis: 79, head: 6, hip: two(Lg(2, 3)), knee: [2, 2], foot: [-78, -78], hand: two(PL(0.36, 0.03, -0.075, [-0.3, -1, 0.2])), anchor: 'toes' },
			k1: { pelvis: 84, head: 6, hip: two(Lg(0, 3)), knee: [0, 0], foot: [-78, -78], hand: two(PL(0.36, 0.03, -0.075, [-0.3, -1, 0.2])), anchor: 'toes' } },
		{ id: 'lunge', name: 'DB Reverse Lunge', aliases: ['Reverse Lunge'], kind: 'rep', tempo: [2, 0, 1, 0], labels: ['Step back', 'Bottom', 'Drive', 'Top'], ecc: true, props: ['db'], yaw: 25, swing: { leg: 0, knee: 40, hip: 18 },
			cue: 'front foot planted, shin vertical; the rear foot steps back onto its toes and the rear knee drops under the hip',
			k0: { chest: 2, hip: two(Lg(0, 4, 4)), knee: [3, 3], hand: two(DB0), anchor: 'footR' },
			k1: { pelvis: 4, neck: -4, hip: [Lg(-6), Lg(84)], knee: [100, 90], foot: [-55, 0], hand: two(DB0), anchor: 'footR' } },
		{ id: 'chest', name: 'Chest Press', base: 'benchback', kind: 'rep', tempo: [2, 0, 1, 0], labels: ['Lower', 'Chest', 'Press', 'Lockout'], ecc: true, props: ['bench', 'db'], pitch: 16,
			cue: 'lying on the bench, feet flat; the weights press from the chest to a straight arm',
			k0: { pelvis: -90, hip: two(Lg(0, 8)), knee: [90, 90], hand: two(C(0.6, 0.13, 0.2, [-0.6, 0, 1])) },
			k1: { pelvis: -90, hip: two(Lg(0, 8)), knee: [90, 90], hand: two(C(0.14, 0.12, 0.27, [-0.6, 0, 1])) } },
		{ id: 'pulldown', name: 'Lat Pulldown', base: 'bench', kind: 'rep', tempo: [1, 1, 2, 0], labels: ['Pull', 'Squeeze', 'Return', 'Stretch'], ecc: false, props: ['bench', 'bar', 'cableUp'], yaw: 40,
			cue: 'seated under the cable; the bar is pulled from full stretch to the collarbones, chest up',
			k0: X(SEAT, { pelvis: -4, hand: two(C(0.12, 0.8, 0.3, [-0.2, -0.3, 1])) }),
			k1: X(SEAT, { pelvis: -10, spine: -4, chest: -6, hand: two(C(0.16, 0.24, 0.3, [-0.3, -1, 0.8])) }) },
		{ id: 'bridge', name: 'DB Glute Bridge', base: 'back', lock: [true, true], kind: 'rep', tempo: [1, 1, 2, 0], labels: ['Drive', 'Squeeze', 'Lower', 'Floor'], ecc: false, pitch: 16,
			cue: 'shoulders on the floor, feet flat and close; the hips drive up until hip and knee are in line',
			k0: X(BACK, { anchor: 'shoulders', ground: 'torso' }), k1: X(BACK, { pelvis: -115, hip: two(Lg(0, 6)), knee: [118, 118], anchor: 'shoulders', ground: 'torso' }) },
		{ id: 'calf', name: 'Standing Calf Raise', aliases: ['Single-leg Calf Raise'], kind: 'rep', tempo: [1, 1, 2, 0], labels: ['Rise', 'Squeeze', 'Lower', 'Floor'], ecc: false,
			cue: 'the whole body rises on the toes — the heel lifts, the toe never does',
			k0: { chest: 2, neck: -2, anchor: 'toes' }, k1: { chest: 2, neck: -2, foot: [-32, -32], anchor: 'toes' } },
		{ id: 'gobletdeep', name: 'Deep Goblet Squat', kind: 'rep', tempo: [3, 1, 1, 0], labels: ['Lower', 'Pause', 'Drive', 'Top'], ecc: true, props: ['kb'],
			cue: 'same squat, hips all the way down to the calves, torso tips a little more',
			k0: { neck: -2, hip: two(Lg(4, 12, 18)), knee: [4, 4], hand: two(GOB) },
			k1: { pelvis: 44, spine: -8, chest: -6, neck: -16, head: -4, hip: two(Lg(124, 22, 22)), knee: [134, 134], hand: two(GOB) } },
		{ id: 'facepull', name: 'Face Pull', aliases: ['Band Face Pull'], kind: 'rep', tempo: [1, 1, 2, 0], labels: ['Pull', 'Hold', 'Return', 'Reach'], ecc: false, props: ['cableF'], yaw: 30,
			cue: 'split stance, cable at face height; the rope comes to the eyes with the elbow high and travelling behind',
			k0: { chest: 2, hip: [Lg(-12), Lg(12)], knee: [0, 8], hand: two(C(0.55, 0.25, 0.1, [-0.5, 0, 1])) },
			k1: { chest: 0, hip: [Lg(-12), Lg(12)], knee: [0, 8], hand: two(C(0.16, 0.42, 0.3, [-0.6, 0.5, 1])) } },
		{ id: 'legcurl', name: 'Leg Curl', base: 'benchprone', kind: 'rep', tempo: [1, 1, 2, 0], labels: ['Curl', 'Squeeze', 'Lower', 'Flat'], ecc: false, props: ['bench'],
			cue: 'prone on the bench; the shin swings from flat to past vertical while the hips stay down',
			k0: { pelvis: 90, lift: 0.5, hip: two(Lg(0)), knee: [0, 0], foot: [180, 180], hand: two(C(0.35, 0.25, 0.2, [1, 0, 0.5])), anchor: 'pelvis' },
			k1: { pelvis: 90, lift: 0.5, hip: two(Lg(0)), knee: [100, 100], foot: [180, 180], hand: two(C(0.35, 0.25, 0.2, [1, 0, 0.5])), anchor: 'pelvis' } },
		{ id: 'cph', name: 'Copenhagen Plank', base: 'sit', kind: 'hold', hold: 30, breath: [2, 3], props: ['shinBox'], yaw: 80,
			cue: 'side plank with the top leg on a bench and the bottom leg held up to meet it. A breath: the hips dip a dot and come back',
			k0: { roll: -64, lift: 0.18, hip: [Lg(0, -14), Lg(0, 0)], knee: [0, 0], hand: [PL(0.25, 0.03, 0, [0, -1, 0]), C(0, -0.25, 0.2, [-1, 0, 0.5])], anchor: 'pelvis' },
			k1: { roll: -68, lift: 0.2, hip: [Lg(0, -18), Lg(0, 0)], knee: [0, 0], hand: [PL(0.25, 0.03, 0, [0, -1, 0]), C(0, -0.25, 0.2, [-1, 0, 0.5])], anchor: 'pelvis' } },
		{ id: 'deadbug', name: 'Dead Bug', base: 'back', kind: 'rep', tempo: [2, 1, 2, 0], labels: ['Reach', 'Hold', 'Return', '—'], ecc: false, alt: true, yaw: 25, pitch: 16,
			cue: 'on the back, arms up, knees at 90°; one arm reaches overhead as the opposite leg extends, low back stays down',
			k0: { pelvis: -90, hip: two(Lg(90, 8)), knee: [90, 90], hand: two(C(0.55, 0.12, 0.18, [0, 0, 1])), anchor: 'pelvis' },
			k1: { pelvis: -90, hip: [Lg(90, 8), Lg(18, 8)], knee: [90, 10], hand: [C(0.12, 0.62, 0.2, [0, 0, 1]), C(0.55, 0.12, 0.18, [0, 0, 1])], anchor: 'pelvis' } },
		{ id: 'sideplank', name: 'Side Plank', base: 'sit', kind: 'hold', hold: 30, breath: [2, 3], yaw: 80,
			cue: 'a hold on the forearm, one straight line from shoulder to heel, top arm to the ceiling. A breath, no pulse',
			k0: { roll: -72, hip: two(Lg(0, 2)), knee: [0, 0], hand: [PL(0.25, 0.03, 0, [0, -1, 0]), C(0, 0.2, 0.72, [0, 1, 0])], anchor: 'pelvis' },
			k1: { roll: -76, hip: two(Lg(0, 2)), knee: [0, 0], hand: [PL(0.25, 0.03, 0, [0, -1, 0]), C(0, 0.2, 0.72, [0, 1, 0])], anchor: 'pelvis' } }
	]],
	['Stretches', [
		{ id: 'calfstretch', name: 'Calf stretch', kind: 'stretch', hold: 45, breath: [3, 5], props: ['wall'], yaw: 25,
			cue: 'hands on the wall, rear leg straight with the heel down; the hips move toward the wall',
			k0: { pelvis: 10, hip: [Lg(-12), Lg(30)], knee: [0, 35], hand: two(C(0.5, 0.22, 0.2, [-0.5, -0.6, 0.6])), anchor: 'footR' },
			k1: { pelvis: 16, hip: [Lg(-24), Lg(36)], knee: [0, 45], hand: two(C(0.5, 0.22, 0.2, [-0.5, -0.6, 0.6])), anchor: 'footR' } },
		{ id: 'hipflexor', name: 'Hip flexor stretch', base: 'kneel', kind: 'stretch', hold: 45, breath: [3, 5], yaw: 25,
			cue: 'half-kneeling, hand on the front knee; the hips glide forward while the torso stays tall',
			k0: { hip: [Lg(-5), Lg(85)], knee: [85, 85], foot: [180, 0], hand: two(H(0.2, -0.4, 0.1)), anchor: 'footR' },
			k1: { spine: -4, hip: [Lg(-24), Lg(72)], knee: [66, 92], foot: [180, 0], hand: two(H(0.24, -0.4, 0.1)), anchor: 'footR' } },
		{ id: 'hamstring', name: 'Hamstring stretch', kind: 'stretch', hold: 45, breath: [3, 5], props: ['boxR'], yaw: 20,
			cue: 'heel up on a box, toes up, leg straight; the hinge comes from the hips, back flat',
			k0: { pelvis: 10, hip: [Lg(10), Lg(75)], knee: [3, 0], foot: [0, 70], hand: two(C(0.32, -0.28, 0.15)), anchor: 'footL' },
			k1: { pelvis: 48, spine: 6, chest: 4, neck: -8, hip: [Lg(48), Lg(113)], knee: [3, 0], foot: [0, 70], hand: two(C(0.42, -0.2, 0.12)), anchor: 'footL' } },
		{ id: 'figure4', name: 'Figure-4 stretch', base: 'bench', kind: 'stretch', hold: 45, breath: [3, 5], props: ['bench'], yaw: 40,
			cue: 'seated, ankle on the opposite knee; the torso folds forward over the shin',
			k0: { hip: [Lg(86, 10, 6), Lg(70, 35, 55)], knee: [88, 100], hand: two(C(0.35, -0.25, 0.12)), anchor: 'pelvis' },
			k1: { pelvis: 30, spine: 8, chest: 6, hip: [Lg(116, 10, 6), Lg(100, 35, 55)], knee: [88, 100], hand: two(C(0.35, -0.25, 0.12)), anchor: 'pelvis' } },
		{ id: 'doorway', name: 'Doorway chest stretch', kind: 'stretch', hold: 45, breath: [3, 5], props: ['frame'], yaw: 50,
			cue: 'forearm on the frame behind you; step through and let the chest lead',
			k0: { pelvis: 2, hip: [Lg(-12), Lg(18)], knee: [0, 12], hand: [HANG, C(-0.12, 0.42, 0.42, [0, 0.4, 1])] },
			k1: { pelvis: 8, chest: -6, hip: [Lg(-20), Lg(26)], knee: [0, 20], hand: [HANG, C(-0.25, 0.42, 0.42, [0, 0.4, 1])] } }
	]],
	['Warm-up', [
		{ id: 'catcow', name: 'Cat–Cow', base: 'floor', plantRef: 0.5, kind: 'rep', tempo: [2, 0, 2, 0], labels: ['Arch', '—', 'Round', '—'], ecc: true,
			cue: 'on all fours: the spine rounds to the ceiling with the chin tucked, then dips with the chest forward and the eyes up',
			k0: X(FOURS, { pelvis: 88, spine: -12, chest: -10, neck: -24, hip: two(Lg(88)) }),
			k1: X(FOURS, { pelvis: 72, spine: 14, chest: 12, neck: 20, hip: two(Lg(72)) }) },
		{ id: 'sunsal', name: 'Sun Salutation A', kind: 'rep', tempo: [3, 1, 3, 1], labels: ['Fold', 'Hang', 'Rise', 'Reach'], ecc: true,
			cue: 'reach up, fold forward, halfway lift, step back and through — one round is one rep, breathed',
			k0: { pelvis: -6, spine: -6, chest: -6, neck: -8, hand: two(UP) },
			k1: { pelvis: 100, spine: 8, chest: 6, neck: 16, hip: two(Lg(100)), knee: [6, 6], hand: two(H(0.22, -0.52, 0.06)) } },
		{ id: 'walk', loco: { speed: 1.25, period: 1.0, duty: 0.62, lift: 0.07, bob: 0.02, lean: 3, arm: 'hang', armAmp: 0.17, width: 0.11, cycles: 4, hipH: 0.99 }, name: 'Walk', kind: 'rep', tempo: [0.55, 0, 0.55, 0], labels: ['Step', '—', 'Step', '—'], ecc: true, gait: [30, 12],
			cue: 'a walk, nothing more: heel to toe, arms easy, the heart rate coming down',
			k0: { chest: 2 } },
		{ id: 'march', loco: { speed: 0, period: 1.1, duty: 0.6, lift: 0.4, kneeFwd: 0.14, bob: 0.012, lean: 0, arm: 'hang', armAmp: 0.2, width: 0.12, cycles: 4, hipH: 0.99 }, name: 'March in place', kind: 'rep', tempo: [0.5, 0, 0.5, 0], labels: ['Knee up', '—', 'Down', '—'], ecc: false, alt: true,
			cue: 'knees to hip height, one at a time, the opposite arm swinging — a jog that goes nowhere',
			k0: { chest: 2 } },
		{ id: 'armcircles', name: 'Arm circles', kind: 'rep', tempo: [1, 0, 1, 0], labels: ['Up', '—', 'Down', '—'], ecc: false, yaw: 78,
			cue: 'front view: straight arms sweep from the sides to overhead and back, small circles growing to big ones',
			k0: { hip: two(Lg(0, 8)), hand: two(H(0, -0.5, 0.14, [0, 0, 1], null)) },
			k1: { hip: two(Lg(0, 8)), hand: two(C(0, 0.72, 0.28, [0, 0, 1], null, 'side')) } }
	]],
	['Run', [
		{ id: 'jog', loco: { period: 0.7, lean: 7, bob: 0.035, hipH: 0.97, width: 0.09, arm: 'run', armAmp: 0.17, cycles: 6, paths: [
				{ keys: [[0, 0.12, 0, 0, -4, 'TD'], [0.36, -0.40, 0, 0, -30, 'LO'], [0.48, -0.38, 0, 0.2, -42], [0.62, -0.12, 0, 0.36, -22], [0.78, 0.22, 0, 0.26, -2], [0.92, 0.24, 0, 0.08, 4]] },
				{ off: 0.5, keys: [[0, 0.12, 0, 0, -4, 'TD'], [0.36, -0.40, 0, 0, -30, 'LO'], [0.48, -0.38, 0, 0.2, -42], [0.62, -0.12, 0, 0.36, -22], [0.78, 0.22, 0, 0.26, -2], [0.92, 0.24, 0, 0.08, 4]] }] }, name: 'Easy jog', aliases: ['Easy run'], kind: 'rep', tempo: [0.34, 0, 0.34, 0], labels: ['Stride', '—', 'Stride', '—'], ecc: true, gait: [45, 20],
			cue: 'a conversational pace: light on the feet, elbows at ninety, the shoulders quiet — one rep is one stride',
			k0: { chest: 2, hand: RUNARMS } },
		{ id: 'highknees', loco: { period: 0.56, lean: -1, bob: 0.025, hipH: 0.99, width: 0.1, arm: 'run', armAmp: 0.24, cycles: 7, paths: [
				{ keys: [[0, 0.04, 0, 0, -20, 'TD'], [0.32, -0.16, 0, 0, -20, 'LO'], [0.45, -0.02, 0, 0.22, -35], [0.62, 0.3, 0, 0.46, -45], [0.8, 0.22, 0, 0.24, -30], [0.93, 0.08, 0, 0.05, -22]] },
				{ off: 0.5, keys: [[0, 0.04, 0, 0, -20, 'TD'], [0.32, -0.16, 0, 0, -20, 'LO'], [0.45, -0.02, 0, 0.22, -35], [0.62, 0.3, 0, 0.46, -45], [0.8, 0.22, 0, 0.24, -30], [0.93, 0.08, 0, 0.05, -22]] }] }, name: 'High knees', kind: 'rep', tempo: [0.3, 0, 0.3, 0], labels: ['Drive', '—', 'Down', '—'], ecc: false, alt: true,
			cue: 'travelling forward on the toes; each knee drives to hip height while the arms pump',
			k0: { chest: 2, hand: RUNARMS } },
		{ id: 'carioca', yaw: 45, pitch: 12, loco: { period: 1.2, absZ: true, width: 0.12, lean: 4, bob: 0.025, hipH: 0.93, arm: 'T', cycles: 3, yawFrom: 1, yawK: 210, yawMax: 40, paths: [
				{ pole: [1, 0.3, -0.3], keys: [[0, 0, -0.28, 0, -8, 'TD'], [0.3, 0, 0.2, 0, -8, 'LO'], [0.4, 0, -0.04, 0.08, -12], [0.5, 0, -0.28, 0, -8, 'TD'], [0.8, 0, 0.2, 0, -8, 'LO'], [0.9, 0, -0.04, 0.08, -12]] },
				{ pole: [1, 0.45, -0.35], keys: [[0.05, -0.18, 0.28, 0, -8, 'LO'], [0.12, 0.04, 0.2, 0.3, -32], [0.17, 0.32, 0.02, 0.5, -45], [0.22, 0.22, -0.14, 0.15, -20], [0.25, 0.16, -0.2, 0, -8, 'TD'], [0.55, 0.16, 0.28, 0, -8, 'LO'], [0.65, -0.14, 0.04, 0.08, -12], [0.75, -0.18, -0.2, 0, -8, 'TD']] }] }, name: 'Carioca', kind: 'rep', tempo: [0.4, 0, 0.4, 0], labels: ['Cross front', '—', 'Cross behind', '—'], ecc: false,
			cue: 'moving sideways fast: the trailing knee drives high and across in front, then crosses behind; hips turn, shoulders stay square',
			k0: { hip: two(Lg(0, 4)), hand: two(TARM) } },
		{ id: 'legswing', name: 'Leg swings', kind: 'rep', tempo: [0.6, 0, 0.6, 0], labels: ['Forward', '—', 'Back', '—'], ecc: false, props: ['postL'],
			cue: 'hand on the wall; the straight leg swings from behind to in front, torso quiet',
			k0: { hip: [Lg(0, 4, 4), Lg(-35)], knee: [3, 0], foot: [0, -30], hand: [C(0.2, 0.1, 0.34, [-0.5, -0.6, 0.6]), HANG], anchor: 'footL' },
			k1: { hip: [Lg(0, 4, 4), Lg(60)], knee: [3, 5], foot: [0, 20], hand: [C(0.2, 0.1, 0.34, [-0.5, -0.6, 0.6]), HANG], anchor: 'footL' } },
		{ id: 'askip', loco: { speed: 1.2, period: 0.8, duty: 0.45, lift: 0.48, kneeFwd: 0.2, bob: 0.06, run: true, toes: true, lean: 4, arm: 'run', armAmp: 0.18, width: 0.11, cycles: 5, hipH: 0.97 }, name: 'A-skips', kind: 'rep', tempo: [0.32, 0, 0.32, 0], labels: ['Skip', '—', 'Land', '—'], ecc: false, alt: true,
			cue: 'a skip with a knee drive: the whole body hops off the toes as the knee comes up',
			k0: { chest: 2, hand: RUNARMS } },
		{ id: 'walklunge', name: 'Walking lunges', kind: 'rep', tempo: [1, 0, 1, 0], labels: ['Lunge', 'Bottom', 'Rise', 'Top'], ecc: true, alt: true, yaw: 25, swing: { leg: 0, knee: 40, hip: 18 },
			cue: 'a long stride; the rear knee drops toward the floor under the hip, front shin vertical',
			k0: { chest: 2, hip: two(Lg(0, 4, 4)), knee: [3, 3], anchor: 'footR' },
			k1: { pelvis: 4, neck: -4, hip: [Lg(-6), Lg(84)], knee: [100, 90], foot: [-55, 0], hand: two(H(0.08, -0.48, 0.06)), anchor: 'footR' } }
	]],
	['Yoga', [
		{ id: 'lowlunge', name: 'Low Lunge', base: 'kneel', kind: 'stretch', hold: 60, breath: [3, 5],
			cue: 'back knee down, shin along the mat; front knee over the ankle; torso tall, arms up',
			k0: { pelvis: -4, spine: -4, chest: -4, neck: -4, hip: [Lg(-19), Lg(90)], knee: [75, 99], foot: [180, 0], hand: two(UP), anchor: 'footR' },
			k1: { pelvis: -4, spine: -8, chest: -8, neck: -10, hip: [Lg(-39), Lg(95)], knee: [55, 119], foot: [180, 0], hand: two(UP), anchor: 'footR' } },
		{ id: 'halfsplit', name: 'Half Splits', base: 'kneel', kind: 'stretch', hold: 60, breath: [3, 5],
			cue: 'hips back over the rear knee, front leg straight with the toes up, hinge from the hip',
			k0: { pelvis: 20, hip: [Lg(20), Lg(81)], knee: [90, 0], foot: [180, 40], hand: two(H(0.15, -0.52, 0.12)), anchor: 'kneeL' },
			k1: { pelvis: 52, spine: 6, chest: 4, neck: -6, hip: [Lg(52), Lg(113)], knee: [90, 0], foot: [180, 40], hand: two(H(0.15, -0.52, 0.12)), anchor: 'kneeL' } },
		{ id: 'chair', name: 'Chair Pose', kind: 'hold', hold: 30, breath: [2, 3],
			cue: 'a squat you hold: knees over the ankles, arms in line with the torso',
			k0: { pelvis: 18, hip: two(Lg(58, 6, 4)), knee: [55, 55], hand: two(UP) },
			k1: { pelvis: 32, spine: -4, hip: two(Lg(92, 6, 4)), knee: [95, 95], hand: two(UP) } },
		{ id: 'warrior2', name: 'Warrior II', kind: 'hold', hold: 30, breath: [2, 3], yaw: 80,
			cue: 'front view: wide stance, one knee bent to 90, arms out in a T',
			k0: { hip: [Lg(0, 30, -8), Lg(35, 12, 90)], knee: [0, 50], hand: two(TARM) },
			k1: { hip: [Lg(0, 32, -8), Lg(55, 12, 90)], knee: [0, 80], hand: two(TARM) } },
		{ id: 'pigeon', name: 'Pigeon', base: 'kneel', kind: 'stretch', hold: 60, breath: [3, 5], yaw: 35,
			cue: 'front shin folded across on the mat, back leg long behind, torso upright with a hand down',
			k0: { hip: [Lg(-55), Lg(70, 30, 70)], knee: [0, 115], foot: [180, 0], hand: two(H(0.2, -0.48, 0.15)), anchor: 'pelvis' },
			k1: { pelvis: 10, hip: [Lg(-62), Lg(80, 30, 70)], knee: [0, 115], foot: [180, 0], hand: two(H(0.24, -0.46, 0.15)), anchor: 'pelvis' } },
		{ id: 'bridgepose', name: 'Bridge', base: 'back', lock: [true, true], kind: 'hold', hold: 30, breath: [2, 3], pitch: 16,
			cue: 'shoulders down, feet flat and close, hips up until hip and knee are in line, arms on the mat',
			k0: X(BACK, { pelvis: -108, hip: two(Lg(4, 6)), knee: [112, 112], anchor: 'shoulders', ground: 'torso' }), k1: X(BACK, { pelvis: -115, hip: two(Lg(0, 6)), knee: [118, 118], anchor: 'shoulders', ground: 'torso' }) },
		{ id: 'seatedfold', name: 'Seated Forward Fold', base: 'sit', kind: 'stretch', hold: 60, breath: [3, 5],
			cue: 'legs long, toes up, hinge forward with the hands to the shins. Bend the knees if the back rounds',
			k0: { pelvis: 0, hip: two(Lg(90)), knee: [0, 0], foot: [90, 90], hand: two(H(0.28, -0.45, 0.1)), anchor: 'pelvis' },
			k1: { pelvis: 55, spine: 8, chest: 6, neck: 6, hip: two(Lg(145)), knee: [0, 0], foot: [90, 90], hand: two(H(0.4, -0.4, 0.08)), anchor: 'pelvis' } },
		{ id: 'supinetwist', name: 'Supine Twist', base: 'back', kind: 'stretch', hold: 60, breath: [3, 5], yaw: 35, pitch: 18,
			cue: 'on the back, knees folded over to one side, one arm long overhead',
			k0: { pelvis: -90, hip: [Lg(85, -20), Lg(85, 20)], knee: [95, 95], hand: [PL(-0.45, 0.03, -0.05, [0, -1, 0]), PL(0.05, 0.03, 0.4, [0, -1, 0])], anchor: 'pelvis' },
			k1: { pelvis: -90, hip: [Lg(80, -45), Lg(80, 45)], knee: [95, 95], hand: [PL(-0.45, 0.03, -0.05, [0, -1, 0]), PL(0.05, 0.03, 0.4, [0, -1, 0])], anchor: 'pelvis' } },
		{ id: 'downdog', name: 'Downward Dog', base: 'floor', kind: 'hold', hold: 30, breath: [2, 3],
			cue: 'hands and feet down, hips the apex, head between the arms',
			k0: { pelvis: 118, hip: two(Lg(84)), knee: [8, 8], foot: [0, 0], hand: two(PL(0.34, 0.035, -0.01, [-0.3, 0.3, 1])), anchor: 'feet' },
			k1: { pelvis: 125, hip: two(Lg(90)), knee: [0, 0], foot: [0, 0], hand: two(PL(0.34, 0.035, -0.01, [-0.3, 0.3, 1])), anchor: 'feet' } },
		{ id: 'puppy', name: 'Puppy Pose', base: 'floor', kind: 'stretch', hold: 60, breath: [3, 5],
			cue: 'hips stacked over the knees, chest and arms down the mat, forehead down',
			k0: X(FOURS, { pelvis: 100, neck: 6, hip: two(Lg(100)), hand: two(PL(0.45, 0.03, 0, [1, 0.5, 0.3])) }),
			k1: X(FOURS, { pelvis: 120, neck: 10, hip: two(Lg(120)), hand: two(PL(0.45, 0.03, 0, [1, 0.5, 0.3])) }) },
		{ id: 'thread', name: 'Thread the Needle', base: 'floor', kind: 'stretch', hold: 60, breath: [3, 5], yaw: 35,
			cue: 'one shoulder on the mat with that arm along the floor; the free arm reaches to the ceiling',
			k0: X(FOURS, { pelvis: 88, roll: -12, hip: two(Lg(88)), hand: [PL(0.05, 0.03, 0.25, [0, -1, 0]), C(0.05, 0.2, 0.6, [0, 1, 0])] }),
			k1: X(FOURS, { pelvis: 96, roll: -24, hip: two(Lg(96)), hand: [PL(0.05, 0.03, 0.35, [0, -1, 0]), C(0.05, 0.2, 0.72, [0, 1, 0])] }) },
		{ id: 'sphinx', name: 'Sphinx', base: 'prone', kind: 'stretch', hold: 60, breath: [3, 5], pitch: 14,
			cue: 'prone on the forearms, elbows under the shoulders, chest lifted, legs long',
			k0: { pelvis: 80, hip: two(Lg(-10)), knee: [0, 0], foot: [180, 180], hand: two(PL(0.24, 0.03, -0.03, [-0.2, -1, 0.2])), anchor: 'pelvis' },
			k1: { pelvis: 66, hip: two(Lg(-24)), knee: [0, 0], foot: [180, 180], hand: two(PL(0.24, 0.03, -0.03, [-0.2, -1, 0.2])), anchor: 'pelvis' } },
		{ id: 'cowface', name: 'Cow-Face Arms', kind: 'stretch', hold: 45, breath: [3, 5], yaw: 80,
			cue: 'front view: one arm overhead and bent behind the head, the other bent behind the low back',
			k0: { hand: [C(-0.16, 0.0, 0.05, [0, -1, 0.4]), C(-0.14, 0.48, 0.04, [0, 1, 0.5])] },
			k1: { hand: [C(-0.16, 0.04, 0.03, [0, -1, 0.4]), C(-0.15, 0.44, 0.02, [0, 1, 0.5])] } },
		{ id: 'childreach', name: 'Child’s Pose, side reach', base: 'heels', kind: 'stretch', hold: 60, breath: [3, 5], yaw: 30,
			cue: 'hips on the heels, forehead down, both arms walked to one side',
			k0: { pelvis: 90, neck: 8, hip: two(Lg(150, 6)), knee: [150, 150], foot: [180, 180], hand: two(PL(0.42, 0.03, 0.15, [1, 0.3, 0.3])), anchor: 'knees' },
			k1: { pelvis: 100, neck: 10, hip: two(Lg(160, 6)), knee: [150, 150], foot: [180, 180], hand: two(PL(0.45, 0.03, 0.3, [1, 0.3, 0.3])), anchor: 'knees' } },
		{ id: 'savasana', name: 'Savasana', base: 'back', kind: 'hold', hold: 300, breath: [3, 5], pitch: 18,
			cue: 'flat on the back, toes up, arms by the sides',
			k0: { pelvis: -90, hip: two(Lg(0, 6, 6)), knee: [0, 0], foot: [90, 90], hand: two(PL(0.35, 0.035, 0.12, [0, -1, 0.3])), anchor: 'pelvis' },
			k1: { pelvis: -90, hip: two(Lg(0, 6, 6)), knee: [0, 0], foot: [90, 90], hand: two(PL(0.35, 0.035, 0.12, [0, -1, 0.3])), anchor: 'pelvis' } }
	]],
	['Bodyweight', [
		{ id: 'pushup', name: 'Push-up', base: 'floor', kind: 'rep', tempo: [2, 0, 1, 0], labels: ['Lower', 'Bottom', 'Press', 'Top'], ecc: true, plantRef: 0,
			cue: 'hands under the shoulders, one line from ear to heel; the chest drops to a fist off the floor and presses back',
			k0: { pelvis: 73, chest: -2, neck: -4, head: 4, hip: two(Lg(0, 3)), knee: [0, 0], foot: [-75, -75], hand: two(PL(0.03, 0.035, 0.025, [-0.7, 0, 0.7])), anchor: 'toes' },
			k1: { pelvis: 85, chest: -2, neck: -4, head: 4, hip: two(Lg(0, 3)), knee: [0, 0], foot: [-75, -75], hand: two(PL(0.03, 0.035, 0.025, [-0.7, 0, 0.7])), anchor: 'toes' } },
		{ id: 'splitsquat', name: 'Split Squat', kind: 'rep', tempo: [2, 0, 1, 0], labels: ['Lower', 'Bottom', 'Drive', 'Top'], ecc: true, yaw: 25,
			cue: 'a long stance, the rear heel up; the hips drop straight down until the rear knee is a fist off the floor',
			k0: { pelvis: 4, hip: [Lg(-18), Lg(22)], knee: [15, 10], foot: [-50, 0], hand: two(HANG), anchor: 'footR' },
			k1: { pelvis: 4, hip: [Lg(-8), Lg(85)], knee: [100, 95], foot: [-50, 0], hand: two(H(0.08, -0.5, 0.06)), anchor: 'footR' } },
		{ id: 'steplunge', name: 'Step-up', kind: 'rep', tempo: [1, 0, 2, 0], labels: ['Step up', 'Top', 'Step down', 'Floor'], ecc: false, props: ['step'], yaw: 20, swing: { leg: 0, knee: 45, hip: 25 },
			cue: 'one foot flat on the step; the whole body rises onto it and the trailing foot lands beside',
			k0: { pelvis: 8, hip: [Lg(0, 4, 4), Lg(62)], knee: [3, 78], hand: two(HANG), anchor: 'footR' },
			k1: { pelvis: 2, lift: 0.25, hip: [Lg(0, 4, 4), Lg(0, 4, 4)], knee: [3, 3], hand: two(HANG), anchor: 'footR' } },
		{ id: 'slrdl', name: 'Single-leg RDL Reach', kind: 'rep', tempo: [2, 1, 2, 0], labels: ['Hinge', 'Reach', 'Stand', '—'], ecc: true,
			cue: 'balanced on one soft knee; the hips hinge back, the free leg reaches behind and the hand toward the floor',
			k0: { chest: 2, hip: two(Lg(0, 4, 4)), knee: [3, 3], anchor: 'footL' },
			k1: { pelvis: 80, spine: 4, chest: 2, neck: -10, hip: [Lg(85, 4, 4), Lg(0)], knee: [15, 0], foot: [0, -70], hand: [HANG, H(0.06, -0.52, 0)], anchor: 'footL' } },
		{ id: 'hipbridge', name: 'Single-leg Hip Bridge', base: 'back', lock: [true, false], kind: 'rep', tempo: [1, 1, 2, 0], labels: ['Drive', 'Squeeze', 'Lower', 'Floor'], ecc: false, pitch: 16,
			cue: 'one foot flat, the other leg held long; the hips drive up until hip and knee are in line',
			k0: X(BACK, { hip: [Lg(45, 6), Lg(60, 6)], knee: [90, 0], anchor: 'shoulders', ground: 'torso' }),
			k1: X(BACK, { pelvis: -115, hip: [Lg(0, 6), Lg(4, 6)], knee: [118, 0], anchor: 'shoulders', ground: 'torso' }) },
		{ id: 'bearcrawl', name: 'Bear Crawl', base: 'floor', free: [1], kind: 'rep', tempo: [0.6, 0, 0.6, 0], labels: ['Step', '—', 'Step', '—'], ecc: false, alt: true,
			cue: 'hands under the shoulders, knees an inch off the floor; opposite hand and foot step together',
			k0: { pelvis: 88, head: 8, hip: two(Lg(88, 6)), knee: [85, 85], foot: [-75, -75], hand: two(PLANT0), anchor: 'toes' },
			k1: { pelvis: 88, head: 8, hip: [Lg(88, 6), Lg(108, 6)], knee: [85, 105], foot: [-75, -75], hand: [PL(0.15, 0.035, -0.015, [-1, 0, 0.3]), PLANT0], anchor: 'toes' } },
		{ id: 'supermanhold', name: 'Superman Hold', base: 'prone', kind: 'hold', hold: 30, breath: [2, 3], pitch: 14,
			cue: 'prone: arms and legs lifted off the floor, chin down',
			k0: { pelvis: 86, hip: two(Lg(-8)), knee: [0, 0], foot: [180, 180], hand: two(C(-0.06, 0.72, 0.12, [0, 0, 1])), anchor: 'pelvis' },
			k1: { pelvis: 80, chest: -4, hip: two(Lg(-16)), knee: [0, 0], foot: [180, 180], hand: two(C(-0.1, 0.72, 0.12, [0, 0, 1])), anchor: 'pelvis' } },
		{ id: 'hollow', name: 'Hollow Hold', base: 'back', kind: 'hold', hold: 30, breath: [2, 3], pitch: 16,
			cue: 'on the back, low back pressed down; shoulders and straight legs held off the floor, arms overhead',
			k0: { pelvis: -80, hip: two(Lg(30)), knee: [0, 0], foot: [20, 20], hand: two(C(0.08, 0.7, 0.12, [0, 0, 1])), anchor: 'pelvis' },
			k1: { pelvis: -74, hip: two(Lg(36)), knee: [0, 0], foot: [20, 20], hand: two(C(0.12, 0.7, 0.12, [0, 0, 1])), anchor: 'pelvis' } },
		{ id: 'reversecrunch', name: 'Reverse Crunch', base: 'back', kind: 'rep', tempo: [1, 1, 2, 0], labels: ['Curl', 'Hold', 'Lower', '—'], ecc: false, pitch: 16,
			cue: 'on the back, knees at ninety; the hips curl up off the floor and lower slowly, the low back kept down',
			k0: { pelvis: -90, hip: two(Lg(90, 6)), knee: [90, 90], hand: two(ARMS_SIDE), anchor: 'pelvis' },
			k1: { pelvis: -118, spine: 28, hip: two(Lg(84, 6)), knee: [95, 95], hand: two(ARMS_SIDE), anchor: 'pelvis' } }
	]],
	['Rest', [
		{ id: 'stand', name: 'Stand', aliases: ['Rest'], kind: 'idle', cue: 'standing by, breathing', k0: { chest: 2, neck: -2 } }
	]]
];

function bodyBox(k: Key, ctx: Ctx) {
	const J = fk(k), L = bodyPrims(J), s = [sxOf(J, ctx), -minY(L) + (k.lift || 0), 0]; shiftJ(J, s); shiftPrims(L, s);
	const b = bounds(L); return { lo: b.lo[0], hi: b.hi[0], J };
}
/** fill defaults, centre the figure over its anchor, and pin planted hands to the floor */
function prep(def: Partial<FigureDef> & { k0: KeyIn }, group?: string): Figure {
	const keys = [full(def.k0), full(def.k1 || def.k0)];
	let lo = 1e9, hi = -1e9;
	for (const k of keys) { const b = bodyBox(k, { anchor: k.anchor, ax: 0 }); lo = Math.min(lo, b.lo); hi = Math.max(hi, b.hi); }
	const ctx: Ctx = { anchor: keys[0].anchor, ax: -(lo + hi) / 2 };
	const pr = def.plantRef || 0, ref = bodyBox(pr === 0 || pr === 1 ? keys[pr] : Object.assign({}, keys[0], lerpBody(keys[0], keys[1], pr)), ctx).J;
	let reachLo = lo, reachHi = hi;
	for (const k of keys) k.hand = k.hand.map((h, i): Hand => {
		if (h.s !== 'plant') return h;
		const zs = i ? 1 : -1, x = ref.sh[i][0] + h.p[0];
		reachLo = Math.min(reachLo, x - 0.14); reachHi = Math.max(reachHi, x + 0.14);
		return { s: 'world', p: [x, h.p[1], ref.sh[i][2] + zs * h.p[2]], pole: [h.pole![0], h.pole![1], zs * h.pole![2]], hd: h.hd };
	});
	ctx.ax! -= ((reachLo - lo) + (reachHi - hi)) / 2;
	for (const k of keys) k.handM = [mirrorHand(k.hand[1]), mirrorHand(k.hand[0])];
	// a foot on the floor at both ends of the rep is planted — lock it where it starts (unless it's the stepping leg)
	const J0 = bodyBox(keys[0], ctx).J, J1 = bodyBox(keys[1], ctx).J;
	ctx.lock = def.gait ? [null, null] : [0, 1].map((i): Lock => {
		const a = J0.legs[i], b = J1.legs[i], down = (l: Leg) => Math.min(l.toe[1] - 0.028, l.heel[1] - 0.042) < 0.03;
		if (def.lock) return def.lock[i] ? { T: [a.toe[0], 0.028, a.toe[2]], h: nrm([a.toe[0] - a.heel[0], 0, a.toe[2] - a.heel[2]]) } : null;
		if (!down(a) || !down(b) || (def.free || []).includes(i) || (def.swing && def.swing.leg === i)) return null;
		const hv = sub(a.toe, a.heel); hv[1] = 0;
		return { T: [a.toe[0], 0.028 + Math.max(0, a.toe[1] - 0.028 - Math.min(a.toe[1] - 0.028, a.heel[1] - 0.042)), a.toe[2]], h: nrm(hv) };
	});
	ctx.lockM = [0, 1].map((i) => { const lk = ctx.lock![1 - i]; return lk && { T: [lk.T[0], lk.T[1], -lk.T[2]], h: [lk.h[0], lk.h[1], -lk.h[2]] }; });
	if (def.loco && def.loco.paths) {
		const g = def.loco, P0 = g.paths![0];
		g.paths!.forEach((P) => { P.K = prepPath(P.keys); P.fmax = Math.max(0.05, ...P.keys.map((k) => Math.abs(k[1]))); });
		const ti = P0.K!.findIndex((k) => k.fl === 'TD'), td = P0.K![ti], lo = P0.K![(ti + 1) % P0.K!.length];
		const dx = lo.v[0] - td.v[0], dz = (g.absZ ? 1 : -1) * (lo.v[1] - td.v[1]), dist = Math.hypot(dx, dz);
		g.speed = +(dist / (dph(td.ph, lo.ph) * g.period)).toFixed(2); g.dir = dist ? [-dx / dist, 0, -dz / dist] : [1, 0, 0];
		g.sub = P0.K!.filter((k) => k.fl === 'TD').length;
	}
	return Object.assign({ base: 'stand', yaw: 18, pitch: 10, group }, def, { k0: keys[0], k1: keys[1], ctx, props: def.props || keys[0].props || [] }) as Figure;
}
/** every figure, in the library's order */
export const FIGURES: Figure[] = [];
for (const [g, list] of LIB) for (const d of list) FIGURES.push(prep(d, g));
/** the library's sections, each with its figure ids */
export const GROUPS: [string, string[]][] = LIB.map(([g, list]) => [g, list.map((d) => d.id)]);
const WP = {} as Record<Waypoint, Figure>;
for (const k of Object.keys(WAYPOINTS) as Waypoint[]) WP[k] = prep({ k0: WAYPOINTS[k], props: WAYPOINTS[k].props });
const byName = new Map<string, Figure>();
for (const e of FIGURES) { byName.set(e.name, e); for (const a of e.aliases || []) byName.set(a, e); }
/** plans.ts Exercise.name → its figure. Not here → null, never a stand-in. */
export const figureFor = (name: string): Figure | null => byName.get(name) || null;
function route(a: Waypoint, b: Waypoint): Waypoint[] {
	if (a === b) return [a];
	const prev: Partial<Record<Waypoint, Waypoint | null>> = { [a]: null }, q = [a];
	while (q.length) { const n = q.shift()!; for (const m of GRAPH[n]) if (!(m in prev)) { prev[m] = n; q.push(m); } }
	const out: Waypoint[] = []; for (let n: Waypoint | null | undefined = b; n != null; n = prev[n]) out.unshift(n); return out;
}

/* ---------- time: tempo, holds, breath ---------- */
const easeSine = (u: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
/** ease in and out, cubic */
export const easeCubic = (u: number) => { u = clamp(u, 0, 1); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
function breathAt(tau: number, inh: number, exh: number) {
	const T = inh + exh, c = ((tau % T) + T) % T, n = Math.floor(tau / T);
	return c < inh ? { b: easeSine(c / inh), phase: 0, u: c / inh, n } : { b: 1 - easeSine((c - inh) / exh), phase: 1, u: (c - inh) / exh, n };
}
/**
 * where the figure is at tau seconds into an exercise:
 *  ambient — two demo reps at tempo, then the start pose, breathing (the default)
 *  still   — the work pose and a breath (forced when the OS asks for reduced motion)
 *  pace    — loops at tempo for the set's reps (kept for later; not shown)
 */
export function timeline(ex: Figure, mode: Mode, tau: number): Timeline {
	tau = Math.max(0, tau);
	const idle = breathAt(tau, 1.8, 2.7);
	if (ex.kind === 'idle') return { d: 0, b: idle.b, amp: 0.7, sway: 1, segs: [['Inhale', 1.8], ['Exhale', 2.7]], seg: idle.phase, u: idle.u, rep: 0, label: idle.phase ? 'Exhale' : 'Inhale', sub: 'rest' };
	if (ex.kind === 'rep') {
		const tempo = ex.tempo!, labels = ex.labels!;
		const T = tempo.reduce((a, b) => a + b, 0), segs = tempo.map((s, i): [string, number] => [labels[i], s]);
		if (mode === 'still') return { d: 1, b: idle.b, amp: 0.6, sway: 0.5, segs, seg: 1, u: 0.5, rep: 0, label: 'Still', sub: 'reduced motion' };
		const n = mode === 'pace' ? ex.reps || 8 : 2;
		if (tau >= n * T) return { d: 0, b: idle.b, amp: 0.7, sway: 1, segs, seg: -1, u: 0, rep: 0, label: mode === 'pace' ? 'Set done' : 'Ready', sub: mode === 'pace' ? 'set done' : 'tap to replay', settled: true };
		const rep = Math.floor(tau / T); let c = tau - rep * T, k = 0;
		while (k < 3 && c >= tempo[k]) { c -= tempo[k]; k++; }
		const u = tempo[k] ? c / tempo[k] : 1;
		const out = ex.ecc ? easeSine : easeCubic, back = ex.ecc ? easeCubic : easeSine;
		const d = k === 0 ? out(u) : k === 1 ? 1 : k === 2 ? 1 - back(u) : 0;
		return { d, b: ex.ecc ? d : 1 - d, amp: 0.8, sway: 0, segs, seg: k, u, rep, label: labels[k], sub: `rep ${rep + 1} of ${n}` };
	}
	const [inh, exh] = ex.breath!, br = breathAt(tau, inh, exh), segs: [string, number][] = [['Inhale', inh], ['Exhale', exh]];
	const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
	const sub = mode === 'still' ? 'reduced motion' : `${clock(Math.min(tau, ex.hold!))} / ${clock(ex.hold!)}`;
	if (ex.kind === 'hold') {
		const d = mode === 'still' ? 1 : easeCubic(tau / 1.2);
		return { d, b: br.b, amp: mode === 'still' ? 0.6 : 1.2, sway: mode === 'still' ? 0.3 : 1, segs, seg: br.phase, u: br.u, rep: 0, label: br.phase ? 'Exhale' : 'Inhale', sub };
	}
	const ex2 = br.n + (br.phase ? easeSine(br.u) : 0);
	const d = mode === 'still' ? 1 : clamp(0.3 + 0.24 * ex2, 0, 1);
	return { d, b: br.b, amp: mode === 'still' ? 0.6 : 1, sway: 0.6, segs, seg: br.phase, u: br.u, rep: 0, label: br.phase ? 'Exhale · sink' : 'Inhale · lengthen', sub };
}

/** body pose at a timeline sample: tempo depth, breath, sway, step lifts; head and neck read a slightly earlier sample */
function poseAt(ex: Figure, tl: Timeline, tlLag: Timeline, t: number): Angles {
	const b = lerpBody(ex.k0, ex.k1, tl.d), lag = lerpBody(ex.k0, ex.k1, tlLag.d);
	b.neck = lag.neck; b.head = lag.head;
	const br = (tl.b - 0.5) * tl.amp;
	b.chest -= 3 * br; b.spine -= 1.2 * br; b.neck += 1.5 * br;
	b.pelvis += tl.sway! * (0.5 * Math.sin(t * 0.83) + 0.3 * Math.sin(t * 2.1));
	if (ex.gait && (tl.seg === 0 || tl.seg === 2)) { const l = tl.seg === 0 ? 1 : 0, s = Math.sin(Math.PI * tl.u); b.knee[l] += ex.gait[0] * s; b.hip[l][0] += ex.gait[1] * s; }
	if (ex.swing) { const s = Math.sin(Math.PI * tl.d); b.knee[ex.swing.leg] += ex.swing.knee * s; b.hip[ex.swing.leg][0] += ex.swing.hip * s; }
	return b;
}
/* ---------- locomotion: a treadmill. The body stays put, the ground scrolls, feet in contact move with the ground ---------- */
const frac = (x: number) => x - Math.floor(x);
const smoother = (u: number) => u * u * u * (u * (u * 6 - 15) + 10);
function locoTL(ex: Figure, mode: Mode, tau: number): LocoTimeline {
	const g = ex.loco!, T = g.period, up = 0.7, down = 0.9, hold = mode === 'pace' ? 1e9 : g.cycles * T, sub = g.sub || 1;
	const spm = Math.round((60 * 2 * sub) / T);
	const info = spm + ' steps/min' + (g.speed ? ' · ' + g.speed + ' m/s' : ' · in place');
	const segs = ex.tempo!.map((x, i): [string, number] => [ex.labels![i], x]);
	if (mode === 'still') return { ph: 0.3, r: 1, I: 0, still: true, d: 0, segs, seg: -1, u: 0, rep: 0, label: 'Still', sub: 'reduced motion', b: 0.5, amp: 0 };
	let r: number, I: number;
	if (tau < up) { r = easeSine(tau / up); I = tau / 2 - (up / (2 * Math.PI)) * Math.sin((Math.PI * tau) / up); }
	else if (tau < up + hold) { r = 1; I = up / 2 + (tau - up); }
	else if (tau < up + hold + down) { const a = tau - up - hold; r = 1 - easeSine(a / down); I = up / 2 + hold + a / 2 + (down / (2 * Math.PI)) * Math.sin((Math.PI * a) / down); }
	else { r = 0; I = up / 2 + hold + down / 2; }
	const ph = tau / T, settled = tau >= up + hold + down, br = breathAt(tau, 1.8, 2.7);
	return {
		ph, r, I, d: 0, segs, seg: settled ? -1 : frac(ph) < 0.5 ? 0 : 2, u: frac(ph * 2), rep: Math.floor(ph), settled, b: br.b, amp: settled ? 0.7 : 0.3,
		label: settled ? 'Ready' : ex.labels![frac(ph) < 0.5 ? 0 : 2], sub: settled ? 'tap to replay' : info
	};
}
/* keyframed foot paths: [phase, forward, lateral, height, pitch, 'TD'|'LO'] — straight at ground speed between TD and LO, Hermite curves in the air */
function evalPath(K: Knot[], ph: number) {
	ph = frac(ph); const n = K.length;
	let i = n - 1; for (let k = 0; k < n; k++) if (K[k].ph <= ph) i = k;
	const a = K[i], b = K[(i + 1) % n], span = dph(a.ph, b.ph), u = (dph(a.ph, ph) % 1) / span;
	if (a.fl === 'TD') return { v: a.v.map((x, j) => lerp(x, b.v[j], u)), stance: true, u, p0: a.v[3], sw: 0, loP: 0, stP: 0 };
	let j = i; while (K[j].fl !== 'LO') j = (j - 1 + n) % n;
	let m = i; while (K[(m + 1) % n].fl !== 'TD') m = (m + 1) % n;
	const lo = K[j], td = K[(m + 1) % n], sw = (dph(lo.ph, ph) % 1) / dph(lo.ph, td.ph);
	let q = j; while (K[q].fl !== 'TD') q = (q - 1 + n) % n;
	const h00 = 2 * u * u * u - 3 * u * u + 1, h10 = u * u * u - 2 * u * u + u, h01 = -2 * u * u * u + 3 * u * u, h11 = u * u * u - u * u;
	return { v: a.v.map((x, k) => h00 * x + h10 * span * a.tan[k] + h01 * b.v[k] + h11 * span * b.tan[k]), stance: false, u, p0: 0, sw, loP: lo.v[3], stP: K[q].v[3] };
}
function pathFrame(ex: Figure, mode: Mode, tau: number, t: number, wx: number): Frame {
	const g = ex.loco!, tl = locoTL(ex, mode, tau), r = tl.r, h = [1, 0, 0], px = wx || 0;
	const body = lerpBody(ex.k0, ex.k0, 0);
	body.pelvis = (ex.k0.pelvis || 0) + (g.lean || 0) * r; body.neck = (ex.k0.neck || 0) - (g.lean || 0) * 0.6 * r;
	const br = (tl.b - 0.5) * tl.amp; body.chest -= 3 * br; body.spine -= 1.2 * br;
	const offT = (p: number) => 0.17 * Math.cos(p * D) + 0.055 * Math.sin(p * D);
	const legs: Gait['legs'] = [], info: { stance: boolean; s: number; f: number; y: number; fmax: number; wgt: number }[] = [];
	for (let i = 0; i < 2; i++) {
		const P = g.paths![i], zs = i ? 1 : -1, e = evalPath(P.K!, tl.ph + (P.off || 0));
		let [f, l, y, p] = e.v; y = Math.max(0, y);
		const z0 = zs * g.width!, z = g.absZ ? z0 + r * (l - z0) : zs * (g.width! + r * l);
		f *= r; y *= r; p *= r;
		const rx = e.stance ? offT(e.p0 * r) - offT(p) : (offT(e.stP * r) - offT(e.loP * r)) * (1 - easeSine(e.sw));
		legs.push({ ank: [px + f + rx, footClear(p) + y, z], pitch: p, pole: P.pole && nrm(P.pole) });
		// how much this foot still bears weight: 1 in contact, fading over the first and last quarter of the swing (keeps the pelvis continuous)
		const wgt = e.stance ? 1 : Math.max(0, 1 - e.sw / 0.25, (e.sw - 0.75) / 0.25);
		info.push({ stance: e.stance, s: e.u, f, y, fmax: P.fmax!, wgt });
	}
	const sink = Math.max(...info.map((o) => (o.stance ? Math.sin(Math.PI * o.s) : 0))), air = Math.min(...info.map((o) => 1 - o.wgt));
	const bob = -g.bob! * sink + g.bob! * air;
	let py = (g.hipH || 0.97) + bob * r;
	if (g.yawFrom != null) { body.yaw = clamp(g.yawK! * info[g.yawFrom].f, -g.yawMax!, g.yawMax!); body.twist = -0.85 * body.yaw; }
	for (let i = 0; i < 2; i++) {
		const a = legs[i].ank, yw = (body.yaw || 0) * D, hz = (i ? 1 : -1) * 0.09, hx = px + hz * Math.sin(yw), hzz = hz * Math.cos(yw);
		const dx = a[0] - hx, dz = a[2] - hzz, wgt = r < 0.05 ? 1 : info[i].wgt;
		py = Math.min(py, a[1] + Math.sqrt(Math.max(0.01, 0.862 ** 2 - dx * dx - dz * dz)) + 0.07 * Math.cos(body.pelvis * D) + (1 - wgt) * 0.4);
	}
	const sw = [0, 1].map((j) => ((g.armAmp || 0) * info[1 - j].f) / (info[1 - j].fmax || 1));
	const hand = sw.map((v) => (g.arm === 'T' ? C(0.06, 0.12, 0.7, [0, 1, 0]) : C(0.05 + v, -0.1 + 0.4 * Math.max(-0.1, v), 0.17, [-1, -0.2, 0.3])));
	const c: Ctx = { anchor: 'pelvis', ax: px, dx: px, gait: { px, py, legs, h } };
	const scene = solve(body, hand, hand, 0, c, c, ex.props), J = scene.J;
	for (let i = 0; i < 2; i++) {
		const l = J.legs[i], th = Math.atan2(l.knee[0] - l.hip[0], l.hip[1] - l.knee[1]) / D, shn = Math.atan2(l.ank[0] - l.knee[0], l.knee[1] - l.ank[1]) / D;
		body.hip[i] = [th + body.pelvis, body.hip[i][1], body.hip[i][2]]; body.knee[i] = th - shn; body.foot[i] = legs[i].pitch;
	}
	return { tl, body, props: ex.props, lock: null, scene, ground: { o: scl(g.dir!, g.speed! * tl.I), gravel: g.speed! > 0 && mode !== 'still' } };
}
function gaitFrame(ex: Figure, mode: Mode, tau: number, t: number, wx: number): Frame {
	if (ex.loco!.paths) return pathFrame(ex, mode, tau, t, wx);
	const g = ex.loco!, tl = locoTL(ex, mode, tau), r = tl.r, T = g.period, sub = g.sub || 1, duty = g.duty!;
	const dir = g.dir || [1, 0, 0], h = [1, 0, 0];
	const Lfull = g.speed! * (T / sub) * duty, L = Lfull * r;
	const body = lerpBody(ex.k0, ex.k0, 0);
	body.pelvis = (ex.k0.pelvis || 0) + (g.lean || 0) * r;
	const br = (tl.b - 0.5) * tl.amp; body.chest -= 3 * br; body.spine -= 1.2 * br;
	const px = wx || 0, legs: Gait['legs'] = [], info: { stance: boolean; s: number; along: number; y: number }[] = [];
	let trailX = 0;
	for (let i = 0; i < 2; i++) {
		const off = g.cross ? i * 0.5 : i * 0.5, q = tl.ph * sub + off, psi = frac(q), k = Math.floor(q);
		let along: number, y = 0, pitch: number, fwd = 0, s: number, roll = 0;
		const stance = psi < duty;
		if (stance) {
			s = psi / duty; along = L / 2 - L * s;
			pitch = g.toes ? -16 : g.run ? lerp(-4, -32, s) : s < 0.15 ? lerp(14, 0, s / 0.15) : s < 0.6 ? 0 : lerp(0, -32, (s - 0.6) / 0.4);
			roll = 1;
		} else {
			s = (psi - duty) / (1 - duty);
			const e = g.run ? smoother(s) : easeSine(s);
			along = -L / 2 + L * e;
			y = g.lift! * r * Math.sin(Math.PI * Math.pow(s, g.run && g.speed ? 0.7 : 1));
			fwd = (g.kneeFwd || 0) * r * Math.sin(Math.PI * s);
			pitch = g.toes ? -16 - 10 * Math.sin(Math.PI * s) : g.run ? lerp(-32, -4, s) : lerp(-32, 14, e);
		}
		pitch *= r;
		// rolling foot: the point touching the floor (heel, sole, then toe) moves with the ground; the ankle rolls around it
		const offH = (p: number) => -0.05 * Math.cos(p * D) + 0.045 * Math.sin(p * D), offT = (p: number) => 0.17 * Math.cos(p * D) + 0.055 * Math.sin(p * D);
		const p0 = (g.toes ? -16 : g.run ? -4 : 0) * r, rollOff = (p: number) => (p > 0 ? offH(0) - offH(p) : p < 0 ? offT(Math.max(p, p0)) - offT(p) : 0);
		const pS = (g.toes ? -16 : g.run ? -4 : 14) * r, pE = (g.toes ? -16 : -32) * r;
		let rx = 0;
		if (roll) rx = rollOff(pitch);
		else { const e = g.run ? smoother(s) : easeSine(s); rx = (1 - e) * rollOff(pE) + e * rollOff(pS); }
		let x0 = 0;
		if (g.cross && i === 1) {
			const X = (n: number) => (n % 2 ? 0.13 : -0.13) * r;
			x0 = stance ? X(k) : lerp(X(k), X(k + 1), easeSine(s));
			trailX = x0;
		}
		const zs = i ? 1 : -1;
		const ank = [px + x0 + rx + dir[0] * along + fwd, footClear(pitch) + y, zs * (g.width ?? 0.11) + dir[2] * along];
		legs.push({ ank, pitch }); info.push({ stance, s, along, y });
	}
	// pelvis: a walk rides highest over the stance leg; a run sinks into stance and floats in flight; never out of reach
	let bob = 0;
	const st = info.filter((o) => o.stance);
	if (g.run) bob = st.length ? -g.bob! * Math.max(...st.map((o) => Math.sin(Math.PI * o.s))) : g.bob!;
	else bob = st.length ? g.bob! * (Math.max(...st.map((o) => Math.sin(Math.PI * o.s))) - 0.5) : 0;
	let py = (g.hipH || 0.99) + bob * r;
	for (let i = 0; i < 2; i++) if (info[i].stance || r < 0.05) {
		const a = legs[i].ank, dx = a[0] - px, dz = a[2] - (i ? 1 : -1) * 0.09;
		py = Math.min(py, a[1] + Math.sqrt(Math.max(0.01, 0.862 ** 2 - dx * dx - dz * dz)) + 0.07 * Math.cos(body.pelvis * D));
	}
	if (g.yawAmp) body.yaw = g.yawAmp * (trailX / 0.13);
	// arms counter-swing the legs
	const sw = [0, 1].map((j) => (g.speed ? (-(g.armAmp || 0) * info[j].along) / (Lfull / 2 || 1) : ((g.armAmp || 0) * (info[1 - j].y - info[j].y)) / (g.lift || 1)));
	const hand = sw.map((v) => (g.arm === 'T' ? C(0, 0.2, 0.74, [0, 1, 0]) : g.arm === 'run' ? C(0.04 + v, -0.1 + 0.3 * v, 0.2, [-1, -0.2, 0.3]) : H(0.03 + v, -0.52, 0.05, [-1, 0, 0.25])));
	const c: Ctx = { anchor: 'pelvis', ax: px, dx: px, gait: { px, py, legs, h } };
	const scene = solve(body, hand, hand, 0, c, c, ex.props);
	// write the IK legs back as angles, so a transition can start from exactly this pose
	const J = scene.J;
	for (let i = 0; i < 2; i++) {
		const l = J.legs[i], th = Math.atan2(l.knee[0] - l.hip[0], l.hip[1] - l.knee[1]) / D, sh = Math.atan2(l.ank[0] - l.knee[0], l.knee[1] - l.ank[1]) / D;
		body.hip[i] = [th + body.pelvis, body.hip[i][1], body.hip[i][2]]; body.knee[i] = th - sh; body.foot[i] = legs[i].pitch;
	}
	return { tl, body, props: ex.props, lock: null, scene, ground: { o: scl(dir, g.speed! * tl.I), gravel: g.speed! > 0 && mode !== 'still' } };
}
/** one frame of a figure, tau seconds into it at clock time t; wx is where it stands (carried over from the transition that brought it here) */
export function figureFrame(ex: Figure, mode: Mode, tau: number, t: number, wx?: number): Frame {
	wx = wx || 0;
	if (ex.loco) return gaitFrame(ex, mode, tau, t, wx);
	const tl = timeline(ex, mode, tau);
	let body = poseAt(ex, tl, timeline(ex, mode, tau - 0.1), t), hA = ex.k0.hand, hB = ex.k1.hand, anchor = ex.ctx.anchor;
	if (ex.alt && tl.rep % 2) { body = mirrorBody(body); hA = ex.k0.handM!; hB = ex.k1.handM!; anchor = (anchor && MIRROR_ANCHOR[anchor]) || anchor; }
	const c: Ctx = { anchor, ax: ex.ctx.ax! + wx, dx: wx, lock: ex.alt && tl.rep % 2 ? ex.ctx.lockM : ex.ctx.lock };
	return { tl, body, props: ex.props, lock: c.lock ?? null, scene: solve(body, hA, hB, tl.d, c, c, ex.props) };
}
const delta = (A: Angles, B: Angles) => Math.max(Math.abs(A.pelvis - B.pelvis), Math.abs(A.spine - B.spine), Math.abs((A.roll || 0) - (B.roll || 0)), ...[0, 1].flatMap((i) => [Math.abs(A.hip[i][0] - B.hip[i][0]), Math.abs(A.hip[i][1] - B.hip[i][1]), Math.abs(A.knee[i] - B.knee[i]), Math.abs(wrap(B.foot[i] - A.foot[i])) * 0.5]));

/* ---------- transitions: a route of hops, each pinned to a contact both ends share ---------- */
const PINS = ['feet', 'toes', 'knees', 'footR', 'footL', 'kneeL', 'kneeR'] as const;
function keyBottom(J: Joints, k: (typeof PINS)[number]) {
	const L = J.legs, fb = (l: Leg) => Math.min(l.heel[1] - 0.042, l.toe[1] - 0.028);
	return {
		feet: Math.max(fb(L[0]), fb(L[1])), toes: Math.max(L[0].toe[1], L[1].toe[1]) - 0.028, knees: Math.max(L[0].knee[1], L[1].knee[1]) - 0.056,
		footL: fb(L[0]), footR: fb(L[1]), kneeL: L[0].knee[1] - 0.056, kneeR: L[1].knee[1] - 0.056
	}[k];
}
function nodeOf(kind: 'wp', x: Waypoint, mode: Mode): Node;
function nodeOf(kind: 'ex', x: Figure, mode: Mode): Node;
function nodeOf(kind: 'wp' | 'ex', x: Waypoint | Figure, mode: Mode): Node {
	if (kind === 'wp') { const w = WP[x as Waypoint]; return { body: w.k0, hand: w.k0.hand, ctx: w.ctx, props: w.props, name: WPN[x as Waypoint] }; }
	const f = x as Figure, d0 = timeline(f, mode, 0).d;
	const hand = f.k0.hand.map((a, i) => { const b = f.k1.hand[i]; return a.s === 'world' && b.s === 'world' ? Object.assign({}, a, { p: lerpV(a.p, b.p, d0) }) : d0 > 0.5 ? b : a; });
	return { body: lerpBody(f.k0, f.k1, d0), hand, ctx: f.ctx, props: f.props, name: f.name, lock: f.ctx.lock };
}
const solveN = (n: Node, c: Ctx) => solve(n.body, n.hand, n.hand, 0, c, c, []).J;
/** freeze the body as it is now; floating hands ride with the chest, planted hands stay put */
export function snapshot(body: Angles, J: Joints, props: string[], lock?: Lock[] | null): Node {
	const hand = J.arms.map((a, i): Hand => {
		if (a.T[1] < 0.08) return { s: 'world', p: a.T, pole: a.pole, hd: a.hd };
		const zs = i ? 1 : -1, q = mv(tr(J.Rc), sub(a.T, J.chest)), pl = mv(tr(J.Rc), a.pole);
		return { s: 'chest', p: [q[0], q[1], zs * q[2]], pole: [pl[0], pl[1], zs * pl[2]], hd: a.hd };
	});
	return { body, props, ctx: { sx: J.shift[0] }, hand, name: '', lock: lock ? lock.map((lk, i) => lk && { T: J.legs[i].toe.slice(), h: lk.h, abs: true }) : null };
}
/** from a snapshot to a figure: leave straight for the next waypoint, enter through every waypoint — the hops, and where the figure ends up */
export function planRoute(snap: Node, fromBase: Waypoint, to: Figure, mode: Mode): { hops: Hop[]; total: number; wx: number } {
	const nodes: Node[] = [snap];
	if (fromBase !== to.base) for (const b of route(fromBase, to.base).slice(1)) nodes.push(nodeOf('wp', b, mode));
	const tgt = nodeOf('ex', to, mode);
	if (nodes.length > 1 && delta(nodes[nodes.length - 1].body, tgt.body) < 6) nodes.pop();
	nodes.push(tgt);
	const hops: Hop[] = [];
	let Js = solveN(snap, snap.ctx), offA = 0, A = snap;
	for (let i = 1; i < nodes.length; i++) {
		const B = nodes[i];
		if (delta(A.body, B.body) < 4 && i < nodes.length - 1) continue;
		const JBn = solveN(B, B.ctx);
		let pin: string = 'pelvis', best = 0.05;
		for (const k of PINS) { const y = Math.max(keyBottom(Js, k), keyBottom(JBn, k)); if (y < best - 1e-3) { best = y; pin = k; } }
		const ax = anchorPt(Js, pin), cP: Ctx = { anchor: pin as Anchor, ax };
		const JB = solveN(B, Object.assign({ dx: 0 }, cP)), offB = JB.shift[0] - JBn.shift[0];
		const lift = [0, 1].map((l) => {
			const step = pin === 'footR' || pin === 'kneeR' ? l === 0 : pin === 'footL' || pin === 'kneeL' ? l === 1 : false;
			return step ? Math.min(1, len(sub(JB.legs[l].ank, Js.legs[l].ank)) / 0.45) : 0;
		});
		const bench = B.props.includes('bench') ? JB.benchAt : A.props.includes('bench') ? Js.benchAt : null;
		const reach = Math.max(...[0, 1].map((l) => { const a = sub(Js.arms[l].W, Js.sh[l]), b = sub(JB.arms[l].W, JB.sh[l]); return Math.acos(clamp(dt(nrm(a), nrm(b)), -1, 1)) * 0.55 + Math.abs(len(a) - len(b)); }));
		const dur = Math.min(1.9, Math.max(0.6, 0.55 + delta(A.body, B.body) / 150, 0.45 + reach / 1.3));
		hops.push({ A, B, cA: Object.assign({ dx: offA }, cP), cB: Object.assign({ dx: offB }, cP), lift, bench, dur, pin });
		Js = JB; offA = offB; A = B;
	}
	hops.forEach((h, k) => { h.first = k === 0; h.last = k === hops.length - 1; });
	if (hops.length) {
		const f = hops[0], l = hops[hops.length - 1];
		f.lockA = snap.lock || null;
		l.lockB = tgt.lock ? tgt.lock.map((lk) => lk && { T: [lk.T[0] + offA, lk.T[1], lk.T[2]], h: lk.h, abs: true }) : null;
	}
	// long routes compress so no switch takes much more than five seconds
	const tot = hops.reduce((s, h) => s + h.dur, 0);
	if (tot > 5.5) { const k = Math.max(0.65, 5.5 / tot); for (const h of hops) h.dur = Math.max(0.5, h.dur * k); }
	return { hops, total: hops.reduce((s, h) => s + h.dur, 0), wx: offA };
}
/** one frame of a hop, u 0..1 through it */
export function hopFrame(hop: Hop, u: number): { body: Angles; props: string[]; scene: Scene } {
	// ease into the first hop and out of the last; flow through the waypoints between
	const e = hop.first && hop.last ? easeCubic(u) : hop.first ? 1 - Math.cos((Math.PI * u) / 2) : hop.last ? Math.sin((Math.PI * u) / 2) : u;
	const b = lerpBody(hop.A.body, hop.B.body, e);
	const sw = Math.sin(Math.PI * e);
	for (let l = 0; l < 2; l++) if (hop.lift[l]) { b.knee[l] += 40 * hop.lift[l] * sw; b.hip[l][0] += 28 * hop.lift[l] * sw; }
	let props = (e < 0.5 ? hop.A.props : hop.B.props).filter((p) => p !== 'bench');
	if (hop.bench) props = props.concat('bench');
	let cA = hop.cA;
	if (hop.lockA || hop.lockB) {
		const lock: Lock[] = [], lockW: number[] = [];
		for (let i = 0; i < 2; i++) {
			const a = hop.lockA && hop.lockA[i], c = hop.lockB && hop.lockB[i];
			if (a && c) { lock[i] = { T: lerpV(a.T, c.T, e), h: nrm(lerpV(a.h, c.h, e)), abs: true }; lockW[i] = 1; }
			else if (a) { lock[i] = a; lockW[i] = 1 - e; } else if (c) { lock[i] = c; lockW[i] = e; } else { lock[i] = null; lockW[i] = 0; }
		}
		cA = Object.assign({}, hop.cA, { lock, lockW });
	}
	return { body: b, props, scene: solve(b, hop.A.hand, hop.B.hand, e, cA, hop.cB, props, hop.bench) };
}
/** the camera a figure is drawn with, standing at x */
export const cameraFor = (f: { yaw: number; pitch: number }, x = 0): Camera => ({ yaw: f.yaw, pitch: f.pitch, center: [x, CENTER_Y, 0], span: SPAN });
/** a figure's key pose under reduced motion — what a tile, the snapshot and a still Slot show */
export function keyGrid(f: Figure, N = GRID): Grid {
	const fr = figureFrame(f, 'still', 5, 0, 0);
	return render(fr.scene, cameraFor(f), N, fr.ground);
}
