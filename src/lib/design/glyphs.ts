/**
 * Dot-matrix exercise glyphs — the baked frames and the clock.
 *
 * Every figure is one athlete on one fixed 31 × 31 dot grid, drawn by Claude
 * Design's generator (tools/glyphs/) and baked into glyph-frames.json: 27
 * exercises × 12 stamped frames, each frame 31 strings of 31 characters, top
 * row first, '#' lit. The app runs no geometry — it looks a name up and stamps
 * a frame. `node tools/glyphs/bake.mjs` rewrites the JSON; `--check` proves
 * the JSON is what the generator makes.
 *
 * The rep is twelve stamps at 130 ms — the drive out over frames 0–6, back
 * over 7–11 — then frame 0 held for 900 ms: a 2.46 s cycle, never tweened.
 * Frame 0 is the still; frame 6 (depth 1) is the working pose.
 */
import data from './glyph-frames.json';

/** 31 rows of 31 characters, top row first; '#' prints */
export type Frame = string[];
type Glyph = { name: string; aliases: string[]; cue: string; frames: Frame[] };

export const GRID = data.grid;
export const FRAME_MS = data.frameMs;
export const HOLD_MS = data.holdMs;
/** stamps in a rep */
export const FRAMES = data.seq.length;
/** the rep: every frame once */
export const REP_MS = FRAMES * FRAME_MS;
/** the rep, then the hold on frame 0 — a looping glyph repeats this */
export const CYCLE_MS = REP_MS + HOLD_MS;
/** the deepest stamp — what reduced motion shows instead of a rep */
export const WORK = data.seq.indexOf(1);

const glyphs: Record<string, Glyph | undefined> = data.glyphs;
const byName: Record<string, string | undefined> = data.byName;

/** `Exercise.name` (plans.ts) → its frames. Not here → no glyph, never a stand-in. */
export function framesFor(name: string): Frame[] | null {
	const id = byName[name];
	return (id && glyphs[id]?.frames) || null;
}

/** the frame due at t ms on a clock: the rep, the hold on frame 0, again */
export function frameAt(t: number): number {
	const tt = t % CYCLE_MS;
	return tt < REP_MS ? Math.floor(tt / FRAME_MS) : 0;
}
