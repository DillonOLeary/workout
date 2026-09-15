import { ValidationError } from '@event-driven-io/emmett';

/** What an entry measured — a closed set: load (weight and reps), reps (a bodyweight count), hold (seconds, the bell aimed for, any load carried), duration (minutes), step (it happened). */
export type Measure =
	| { of: 'load'; load: number; reps: number }
	| { of: 'reps'; reps: number }
	| { of: 'hold'; seconds: number; target?: number; load?: number }
	| { of: 'duration'; minutes: number }
	| { of: 'step' };

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

/** True when every set carried the same load — the ledger collapses these to one number. */
export function uniformLoad(sets: Measure[]): boolean {
	return sets.every((m) => loadOf(m) === loadOf(sets[0]));
}

/** The measure a set of this exercise writes — the one place kind → variant is decided. */
export function measureFor(
	ex: { kind: 'load' | 'hold' | 'reps' | 'run' },
	v: { load: number; count: number; target?: number }
): Measure {
	switch (ex.kind) {
		case 'load':
			return { of: 'load', load: v.load, reps: v.count };
		case 'reps':
			return { of: 'reps', reps: v.count };
		case 'hold':
			return { of: 'hold', seconds: v.count, ...(v.target !== undefined ? { target: v.target } : {}) };
		case 'run':
			return { of: 'duration', minutes: v.count };
	}
}

const isInt = (n: unknown): n is number => Number.isInteger(n);

/** The bounds a measure must sit inside to be recorded at all — the decider's rule. */
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

/** A measure from the outside (a form field, a JSON body), rebuilt from the fields each variant owns — shape only; the bounds are validateMeasure's. */
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
