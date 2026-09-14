/**
 * Dot-matrix exercise glyphs — the baked frames and the clock.
 *
 * Every figure is one athlete on one fixed 31 × 31 dot grid, drawn by Claude
 * Design's generator (tools/glyphs/) and baked into glyph-frames.json, each
 * frame 31 strings of 31 characters, top row first, '#' lit. The app runs no
 * geometry — it looks a name up and stamps a frame. `node tools/glyphs/bake.mjs`
 * rewrites the JSON; `--check` proves the JSON is what the generator makes.
 *
 * Motion is baked into the figure: a hold is not a rep with the ends chopped
 * off, it is a body that stays where it is and breathes. Three gears, chosen
 * per glyph at bake time, and the JSON carries the timing for each — so the
 * clock here takes the gear instead of assuming one:
 *   rep    — twelve stamps at 130 ms (out over frames 0–6, back over 7–11),
 *            then frame 0 held 900 ms: a 2.46 s cycle, never tweened
 *   breath — four stamps at 800 ms, rising and falling, no rest: 3.2 s
 *   still  — one frame. There is nothing to play.
 */
import data from './glyph-frames.json';

/** 31 rows of 31 characters, top row first; '#' prints */
export type Frame = string[];
export type Motion = 'rep' | 'breath' | 'still';
/** how a gear runs: the depths it stamped, and the clock that plays them */
export type Gear = { seq: number[]; frameMs: number; holdMs: number };
export type Glyph = { name: string; aliases: string[]; cue: string; motion: Motion; frames: Frame[] };

export const GRID: number = data.grid;
export const MOTIONS: Record<Motion, Gear> = data.motions as Record<Motion, Gear>;

const glyphs = data.glyphs as Record<string, Glyph | undefined>;
const byName = data.byName as Record<string, string | undefined>;

/** `Exercise.name` (plans.ts) → its glyph. Not here → nothing, never a stand-in. */
export function glyphFor(name: string): Glyph | null {
	const id = byName[name];
	return (id && glyphs[id]) || null;
}

/** `Exercise.name` → its frames. Not here → no glyph, never a stand-in. */
export function framesFor(name: string): Frame[] | null {
	return glyphFor(name)?.frames ?? null;
}

/** the gear a figure runs in */
export function motionOf(name: string): Motion | null {
	return glyphFor(name)?.motion ?? null;
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
