// Dot-matrix exercise glyphs: a name is looked up and a stamp of the live rig drawn — memoized, so a gear costs geometry once.
// Three gears — rep · breath · still — chosen per figure in the rig; this file tells a clock which stamp is due in a gear.
import { MOTIONS, figureFor, frameFor, motionOf, waypointOf, type Figure, type Frame, type Motion, type Waypoint } from './rig';

export { GRID, MOTIONS } from './rig';
export type { Frame, Gear, Motion } from './rig';

export type Glyph = { name: string; aliases: string[]; cue: string; motion: Motion; waypoint: Waypoint; figure: Figure };

/** `Exercise.name` (plans.ts) → its glyph. Not here → nothing, never a stand-in. */
export function glyphFor(name: string): Glyph | null {
	const f = figureFor(name);
	return f && { name: f.name, aliases: f.aliases ?? [], cue: f.cue, motion: motionOf(f), waypoint: waypointOf(f), figure: f };
}

/** the k-th stamp of a name's gear (the first when k is past the end); null for a name with no glyph */
export function frameOf(name: string, k: number): Frame | null {
	const f = figureFor(name);
	if (!f) return null;
	const seq = MOTIONS[motionOf(f)].seq;
	return frameFor(f, seq[k] ?? seq[0]);
}

/** every stamp of a name's gear — the tests and the bake; a screen asks for one at a time */
export function framesFor(name: string): Frame[] | null {
	const f = figureFor(name);
	return f ? MOTIONS[motionOf(f)].seq.map((d) => frameFor(f, d)) : null;
}

/** the gear a figure runs in */
export function motionFor(name: string): Motion | null {
	const f = figureFor(name);
	return f ? motionOf(f) : null;
}

/** one pass through a gear's stamps, ms — a rep, a breath; 0 for a still */
export const repMs = (motion: Motion): number => MOTIONS[motion].seq.length * MOTIONS[motion].frameMs;
/** the pass, then the hold on frame 0 — a looping glyph repeats this */
export const cycleMs = (motion: Motion): number => repMs(motion) + MOTIONS[motion].holdMs;
/** the deepest stamp — what reduced motion shows instead of a rep; the only frame of a still */
export const workFrame = (motion: Motion): number => Math.max(0, MOTIONS[motion].seq.indexOf(1));

/** the frame due at t ms on a clock in this gear: the pass, the hold on frame 0, again */
export function frameAt(t: number, motion: Motion): number {
	const cycle = cycleMs(motion);
	if (!cycle) return 0;
	const tt = Math.max(0, t) % cycle;
	const pass = repMs(motion);
	return tt < pass ? Math.floor(tt / MOTIONS[motion].frameMs) : 0;
}
