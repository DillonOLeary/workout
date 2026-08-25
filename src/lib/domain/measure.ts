import { ValidationError } from '@event-driven-io/emmett';

/**
 * What an entry measured — a closed set, so every reader switches on `of`
 * exhaustively instead of guessing from optional fields.
 *
 *   load     — a weighted set: the load and the reps
 *   reps     — a bodyweight set: just the count (a dead bug, a sun salutation)
 *   hold     — a timed hold: seconds held, the bell aimed for, any load carried
 *   duration — minutes (a run)
 *   step     — it happened (a warm-up line, a cooldown stretch, a walk)
 *
 * The measure is the heart of the vocabulary: a command carries one in, an
 * event carries one out, and the read side never has to consult the plan to
 * know what a number meant. That is why `reps` is its own variant rather
 * than "a load of 0" — a convention is exactly what a union exists to remove.
 */
export type Measure =
	| { of: 'load'; load: number; reps: number }
	| { of: 'reps'; reps: number }
	| { of: 'hold'; seconds: number; target?: number; load?: number }
	| { of: 'duration'; minutes: number }
	| { of: 'step' };

/* ---------- reading a measure --------------------------------------------
   Three questions every screen asks. Each is an exhaustive switch, so adding
   a variant fails to compile here — in one place — instead of miscounting
   somewhere in a route. */

/** A set — the entries the progression rule, the receipt and "N sets logged" count. */
export function isSet(m: Measure): boolean {
	switch (m.of) {
		case 'load':
		case 'reps':
		case 'hold':
			return true;
		case 'duration':
		case 'step':
			return false;
	}
}

/** The count in the measure's own unit: reps, seconds for a hold, minutes for a run. */
export function countOf(m: Measure): number {
	switch (m.of) {
		case 'load':
		case 'reps':
			return m.reps;
		case 'hold':
			return m.seconds;
		case 'duration':
			return m.minutes;
		case 'step':
			return 0;
	}
}

/** The load carried, 0 where there was none. */
export function loadOf(m: Measure): number {
	switch (m.of) {
		case 'load':
			return m.load;
		case 'hold':
			return m.load ?? 0;
		case 'reps':
		case 'duration':
		case 'step':
			return 0;
	}
}

/* ---------- accepting a measure ------------------------------------------ */

const isInt = (n: unknown): n is number => Number.isInteger(n);

/**
 * The bounds a measure must sit inside to be recorded at all — the decider's
 * rule, kept next to the type it governs. Each variant validates on its own
 * branch; the union keeps this exhaustive.
 */
export function validateMeasure(m: Measure): void {
	switch (m.of) {
		case 'load':
			if (!Number.isFinite(m.load) || m.load < 0 || m.load > 2000)
				throw new ValidationError('Weight is out of range.');
			if (!isInt(m.reps) || m.reps < 1 || m.reps > 100) throw new ValidationError('Reps are out of range.');
			return;
		case 'reps':
			if (!isInt(m.reps) || m.reps < 1 || m.reps > 100) throw new ValidationError('Reps are out of range.');
			return;
		case 'hold':
			if (!isInt(m.seconds) || m.seconds < 1 || m.seconds > 600)
				throw new ValidationError('Hold time is out of range.');
			if (m.target !== undefined && (!isInt(m.target) || m.target < 1 || m.target > 600))
				throw new ValidationError('Hold target is out of range.');
			if (m.load !== undefined && (!Number.isFinite(m.load) || m.load < 0 || m.load > 2000))
				throw new ValidationError('Weight is out of range.');
			return;
		case 'duration':
			if (!Number.isFinite(m.minutes) || m.minutes < 1 || m.minutes > 600)
				throw new ValidationError('Minutes must be between 1 and 600.');
			return;
		case 'step':
			return;
		default:
			// unreachable for a typed caller; reachable for a form
			throw new ValidationError('Unknown measure.');
	}
}

/** Minutes land whole; everything else is already discrete. */
export const normaliseMeasure = (m: Measure): Measure =>
	m.of === 'duration' ? { of: 'duration', minutes: Math.round(m.minutes) } : m;

/**
 * A measure from the outside — a form field, a JSON body. Parse, don't
 * validate: the result is rebuilt from the fields each variant owns, so a
 * stray or missing field can't ride through on a cast. Shape only — the
 * bounds are validateMeasure's job, inside the decider.
 */
export function parseMeasure(raw: unknown): Measure | null {
	let v = raw;
	if (typeof v === 'string') {
		try {
			v = JSON.parse(v);
		} catch {
			return null;
		}
	}
	if (!v || typeof v !== 'object') return null;
	const o = v as Record<string, unknown>;
	const num = (k: string): boolean => typeof o[k] === 'number' && Number.isFinite(o[k]);
	const opt = (k: string): boolean => o[k] === undefined || num(k);
	switch (o.of) {
		case 'load':
			return num('load') && num('reps') ? { of: 'load', load: o.load as number, reps: o.reps as number } : null;
		case 'reps':
			return num('reps') ? { of: 'reps', reps: o.reps as number } : null;
		case 'hold':
			if (!num('seconds') || !opt('target') || !opt('load')) return null;
			return {
				of: 'hold',
				seconds: o.seconds as number,
				...(o.target !== undefined ? { target: o.target as number } : {}),
				...(o.load !== undefined ? { load: o.load as number } : {})
			};
		case 'duration':
			return num('minutes') ? { of: 'duration', minutes: o.minutes as number } : null;
		case 'step':
			return { of: 'step' };
		default:
			return null;
	}
}
