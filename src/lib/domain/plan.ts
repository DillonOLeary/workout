import { RACKS, type Rack } from './racks';

/**
 * The plan model — reference data, NOT events. Plans are rows in the
 * `ledger_plans` table (src/lib/server/plans.ts): upserted, no history.
 * Event sourcing does not mean "everything is an event"; slow-changing
 * reference data lives happily in a plain table, and events point at it by
 * id (SessionStarted.plan) and by name (EntryLogged.item).
 *
 * A plan row is data from outside, exactly like an event row — so it has a
 * read boundary too. `parsePlan`, at the bottom of this file, is the only
 * way a plan enters the domain: it rebuilds the shape (legacy flags become
 * `kind`, a one-line warm-up becomes a list) so nothing downstream sniffs.
 */

/**
 * What an exercise MEASURES decides everything else about it — which
 * Measure a set writes, which axis progression moves, how a number reads:
 *
 *   load — a weighted set. Progress the LOAD: hit the top of the range and
 *          that set takes the next size up — the rack's next rung, or +inc
 *          on a machine stack. `start` is the first-ever load; `each` says
 *          the number is per hand.
 *   hold — a timed hold. Progress the SECONDS: ring the bell and the next
 *          target is +inc, capped at `hi` — past the ceiling, make the pose
 *          harder, never longer.
 *   reps — a bodyweight count. Carry last time's number, capped at `hi`.
 *
 * Three kinds, a closed union: every consumer switches on `kind`, and a
 * field that only means something for one kind exists only on that kind.
 * That is the whole "escalation path" — chosen per exercise, by name, not
 * inferred from a combination of flags.
 */
type ExerciseBase = {
	name: string;
	equip: string;
	tag: string;
	sets: number;
	/** the range: reps — or seconds, for a hold */
	lo: number;
	hi: number;
	/**
	 * How a movement splits across sides. Left unsaid, "3 × 8–12" on a lunge
	 * is genuinely ambiguous — per leg, or between them?
	 *   absent  — bilateral, nothing to split
	 *   'reps'  — lo/hi are PER SIDE; one set covers both (lunges, dead bugs)
	 *   'sets'  — each set is ONE side, so `sets` already counts both (yoga
	 *             holds, side plank): sets: 2 means one left, one right
	 */
	side?: 'reps' | 'sets';
	/** short clarifier shown under the name — for what the fields can't say */
	note?: string;
	/** seconds between this exercise's sets; absent = the plan's `rest` */
	rest?: number;
};

export type Loaded = ExerciseBase & {
	kind: 'load';
	/** the load (lb) for a first-ever session */
	start: number;
	/** the smallest step a machine stack takes; ignored when `rack` is set */
	inc: number;
	/**
	 * Which rack this comes off (racks.ts). Free weights come in discrete
	 * sizes, so a level-up is "the next bell up", not "+inc" — there is no
	 * 37.5 lb kettlebell. Machines leave it absent: stacks vary too much to
	 * model, so `inc` rules.
	 */
	rack?: Rack;
	/**
	 * absent = one implement, or a machine stack: the number IS the load.
	 * true = the number is PER HAND (two dumbbells), so the total is double.
	 * A goblet squat at 35 and an RDL at 40 each are not the same 35 and 40.
	 */
	each?: boolean;
};
export type Held = ExerciseBase & {
	kind: 'hold';
	/** seconds added to the target after a hold that rang its bell */
	inc: number;
};
export type Counted = ExerciseBase & { kind: 'reps' };
export type Exercise = Loaded | Held | Counted;

export type DayInfo = {
	title: string;
	desc?: string;
	/** warm-up and cooldown are lists of STEPS, one line each — every line takes a turn on the floor */
	warmup?: string[];
	cooldown?: string[];
	/** one line shown under every prep step (the breathing cue, say) */
	cue?: string;
};

/**
 * The guided run: walk, run, walk. `minutes` is the target the clock counts
 * toward; `walk` is the easy minutes before and after (0 = none). A run
 * logged after the fact writes the same session shape with one entry.
 */
export type RunDay = {
	title: string;
	minutes: number;
	walk?: number;
	note?: string;
};

export type Plan = {
	id: string;
	name: string;
	description?: string;
	schedule: string;
	dayInfo?: Record<string, DayInfo>;
	days: Record<string, Exercise[]>;
	/** absent = true. false hides all running UI while this plan is active. */
	runs?: boolean;
	/** weekly run-minute goal for the meter/badge; absent = DEFAULT_RUN_TARGET */
	runTarget?: number;
	/** warm-up / cooldown for days whose dayInfo doesn't carry their own */
	warmup?: string[];
	cooldown?: string[];
	cue?: string;
	/** seconds between sets, unless the exercise says otherwise; absent = DEFAULT_REST */
	rest?: number;
	/** the guided run this plan offers; absent = a plain run */
	run?: RunDay;
};

/* ---------- reading a plan ---------------------------------------------
   The defaults live here, once. A screen that wants "the run target" asks
   the plan — it never writes `?? 150` itself. */

export const DEFAULT_REST = 60;
export const DEFAULT_RUN_TARGET = 150;

export const warmupFor = (plan: Plan | undefined, day: string): string[] =>
	plan?.dayInfo?.[day]?.warmup ?? plan?.warmup ?? [];
export const cooldownFor = (plan: Plan | undefined, day: string): string[] =>
	plan?.dayInfo?.[day]?.cooldown ?? plan?.cooldown ?? [];
/** The one line shown under every prep step. */
export const cueFor = (plan: Plan | undefined, day: string): string | undefined =>
	plan?.dayInfo?.[day]?.cue ?? plan?.cue;
export const restFor = (plan: Plan | undefined, ex: Exercise): number => ex.rest ?? plan?.rest ?? DEFAULT_REST;
export const runTarget = (plan: Plan): number => plan.runTarget ?? DEFAULT_RUN_TARGET;
export const hasRuns = (plan: Plan): boolean => plan.runs !== false;

/* ---------- accepting a plan --------------------------------------------- */

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** A step list: a plain string is one step (older plans wrote the warm-up as one sentence). */
function stepList(v: unknown, where: string): string[] | undefined {
	if (v === undefined) return undefined;
	if (typeof v === 'string') return [v];
	if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v;
	throw new Error(`${where} must be a string or a list of strings`);
}

function parseExercise(raw: unknown, day: string): Exercise {
	if (!isObj(raw) || typeof raw.name !== 'string' || !raw.name)
		throw new Error(`exercise in day "${day}" is missing a name`);
	const e = raw;
	const name = e.name as string;
	const num = (k: string): number => {
		if (typeof e[k] !== 'number' || !Number.isFinite(e[k])) throw new Error(`"${name}" needs numeric ${k}`);
		return e[k] as number;
	};
	// the per-hand / per-side fields exist to kill an ambiguity; a typo in
	// them would quietly reintroduce it, so they are checked, not coerced
	if (e.side !== undefined && e.side !== 'reps' && e.side !== 'sets')
		throw new Error(`"${name}" side must be "reps" (per side) or "sets" (one per side)`);
	if (e.note !== undefined && typeof e.note !== 'string') throw new Error(`"${name}" note must be a string`);
	if (e.rest !== undefined && !positive(e.rest)) throw new Error(`"${name}" rest must be a positive number of seconds`);
	const base: ExerciseBase = {
		name,
		equip: typeof e.equip === 'string' ? e.equip : '',
		tag: typeof e.tag === 'string' ? e.tag : '',
		sets: num('sets'),
		lo: num('lo'),
		hi: num('hi'),
		...(e.side !== undefined ? { side: e.side as 'reps' | 'sets' } : {}),
		...(e.note !== undefined ? { note: e.note as string } : {}),
		...(e.rest !== undefined ? { rest: e.rest as number } : {})
	};
	// the legacy encoding: before `kind`, a hold was mode: 'seconds' +
	// bodyweight: true and a bodyweight count was bodyweight: true alone
	const kind = e.kind ?? (e.bodyweight === true ? (e.mode === 'seconds' ? 'hold' : 'reps') : 'load');
	switch (kind) {
		case 'load': {
			if (e.rack !== undefined && !Object.keys(RACKS).includes(e.rack as string))
				throw new Error(`"${name}" rack must be ${Object.keys(RACKS).join(', ')} (omit it for machines)`);
			if (e.each !== undefined && typeof e.each !== 'boolean') throw new Error(`"${name}" each must be a boolean`);
			return {
				...base,
				kind: 'load',
				start: num('start'),
				inc: num('inc'),
				...(e.rack !== undefined ? { rack: e.rack as Rack } : {}),
				...(e.each !== undefined ? { each: e.each as boolean } : {})
			};
		}
		case 'hold':
			return { ...base, kind: 'hold', inc: num('inc') };
		case 'reps':
			return { ...base, kind: 'reps' };
		default:
			throw new Error(`"${name}" kind must be load, hold or reps`);
	}
}

function parseRun(v: unknown): RunDay {
	if (!isObj(v) || typeof v.title !== 'string' || !positive(v.minutes)) throw new Error('run needs a title and positive minutes');
	if (v.walk !== undefined && (typeof v.walk !== 'number' || v.walk < 0)) throw new Error('run walk must be minutes ≥ 0');
	if (v.note !== undefined && typeof v.note !== 'string') throw new Error('run note must be a string');
	return {
		title: v.title,
		minutes: v.minutes,
		...(v.walk !== undefined ? { walk: v.walk as number } : {}),
		...(v.note !== undefined ? { note: v.note as string } : {})
	};
}

function parseDayInfo(v: unknown): Record<string, DayInfo> {
	if (!isObj(v)) throw new Error('dayInfo must be an object');
	const out: Record<string, DayInfo> = {};
	for (const [d, info] of Object.entries(v)) {
		if (!isObj(info) || typeof info.title !== 'string') throw new Error(`dayInfo "${d}" needs a title`);
		if (info.desc !== undefined && typeof info.desc !== 'string') throw new Error(`dayInfo "${d}" desc must be a string`);
		if (info.cue !== undefined && typeof info.cue !== 'string') throw new Error(`dayInfo "${d}" cue must be a string`);
		const warmup = stepList(info.warmup, `dayInfo "${d}" warmup`);
		const cooldown = stepList(info.cooldown, `dayInfo "${d}" cooldown`);
		out[d] = {
			title: info.title,
			...(info.desc !== undefined ? { desc: info.desc as string } : {}),
			...(warmup ? { warmup } : {}),
			...(cooldown ? { cooldown } : {}),
			...(info.cue !== undefined ? { cue: info.cue as string } : {})
		};
	}
	return out;
}

/**
 * A plan from the outside — a pasted JSON row, or a row read back from the
 * table. Parse, don't validate: the result is rebuilt field by field, so a
 * stored row in last month's shape reads back in this month's, and a typo
 * in a pasted plan is refused with a sentence instead of becoming a step
 * nobody asked for.
 */
export function parsePlan(raw: unknown): Plan {
	const p = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
	if (!isObj(p)) throw new Error('a plan is an object with id, name and days');
	if (!p.id || !p.name || !p.days) throw new Error('needs id, name, days');
	if (typeof p.id !== 'string' || typeof p.name !== 'string') throw new Error('id and name must be strings');
	if (p.description !== undefined && typeof p.description !== 'string') throw new Error('description must be a string');
	if (p.runs !== undefined && typeof p.runs !== 'boolean') throw new Error('runs must be a boolean');
	if (p.runTarget !== undefined && !positive(p.runTarget)) throw new Error('runTarget must be a positive number of minutes');
	if (p.cue !== undefined && typeof p.cue !== 'string') throw new Error('cue must be a string');
	if (p.rest !== undefined && !positive(p.rest)) throw new Error('rest must be a positive number of seconds');
	const warmup = stepList(p.warmup, 'warmup');
	const cooldown = stepList(p.cooldown, 'cooldown');
	const run = p.run === undefined ? undefined : parseRun(p.run);
	const dayInfo = p.dayInfo === undefined ? undefined : parseDayInfo(p.dayInfo);
	if (!isObj(p.days) || !Object.keys(p.days).length) throw new Error('days must be a non-empty object');
	const days: Record<string, Exercise[]> = {};
	for (const [day, list] of Object.entries(p.days)) {
		if (!Array.isArray(list) || !list.length) throw new Error(`day "${day}" needs a non-empty exercise list`);
		days[day] = list.map((e) => parseExercise(e, day));
	}
	return {
		id: p.id,
		name: p.name,
		schedule: typeof p.schedule === 'string' ? p.schedule : '',
		...(p.description !== undefined ? { description: p.description as string } : {}),
		...(dayInfo ? { dayInfo } : {}),
		days,
		...(p.runs !== undefined ? { runs: p.runs as boolean } : {}),
		...(p.runTarget !== undefined ? { runTarget: p.runTarget as number } : {}),
		...(warmup ? { warmup } : {}),
		...(cooldown ? { cooldown } : {}),
		...(p.cue !== undefined ? { cue: p.cue as string } : {}),
		...(p.rest !== undefined ? { rest: p.rest as number } : {}),
		...(run ? { run } : {})
	};
}
