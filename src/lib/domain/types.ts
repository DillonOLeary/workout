import type { Rack } from './racks';

/**
 * Reference-data shapes. Plans are NOT events — they are rows in the
 * `ledger_plans` table (see src/lib/server/plans.ts). Event sourcing does not
 * mean "everything is an event": slow-changing reference data lives happily
 * in a plain table, and events point at it by id.
 */
export type Exercise = {
	name: string;
	equip: string;
	tag: string;
	sets: number;
	/** lo/hi are reps — or seconds, when mode is 'seconds' (timed holds) */
	lo: number;
	hi: number;
	/** starting weight (lb) for a first-ever session */
	start: number;
	/** smallest increment to add on a level-up */
	inc: number;
	/** absent = 'reps'. 'seconds' = timed hold (plank): log seconds, not reps */
	mode?: 'reps' | 'seconds';
	/**
	 * absent = weighted. Bodyweight exercises (yoga poses) have no weight
	 * axis: progression moves the COUNT instead — `inc` means "+inc seconds"
	 * (or reps), and `start` should be 0.
	 */
	bodyweight?: boolean;
	/**
	 * absent = one implement, or a machine stack: the number IS the load.
	 * true = the number is PER HAND (two dumbbells), so the total is double.
	 * A goblet squat at 35 and an RDL at 40 each are not the same 35 and 40.
	 */
	each?: boolean;
	/**
	 * How a movement splits across sides. Left unsaid, "3 × 8–12" on a lunge
	 * is genuinely ambiguous — per leg, or between them?
	 *   absent  — bilateral, nothing to split
	 *   'reps'  — lo/hi are PER SIDE; one set covers both (lunges, dead bugs)
	 *   'sets'  — each set is ONE side, so `sets` already counts both (yoga
	 *             holds, side plank): sets: 2 means one left, one right
	 */
	side?: 'reps' | 'sets';
	/**
	 * Which rack this comes off (src/lib/domain/racks.ts). Free weights come in
	 * discrete sizes, so a level-up is "the next bell up", not "+inc" — there is
	 * no 37.5 lb kettlebell. When set, `rack` overrides `inc` for progression.
	 * Machines leave it absent: stacks vary too much to model, so `inc` rules.
	 */
	rack?: Rack;
	/** short clarifier shown under the name — for what the fields can't say */
	note?: string;
	/** seconds between this exercise's sets; absent = the plan's `rest` */
	rest?: number;
};

/**
 * Warm-up and cooldown are lists of STEPS, one line each — every line takes
 * a turn on the floor exactly like a set does. A plain string is one step
 * (older custom plans wrote the warm-up as one sentence).
 */
export type Steps = string | string[];

export type DayInfo = {
	title: string;
	desc?: string;
	warmup?: Steps;
	cooldown?: Steps;
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
	/** weekly run-minute goal for the meter/badge; absent = 150 */
	runTarget?: number;
	/** warm-up / cooldown for days whose dayInfo doesn't carry their own */
	warmup?: Steps;
	cooldown?: Steps;
	cue?: string;
	/** seconds between sets, unless the exercise says otherwise; absent = 60 */
	rest?: number;
	/** the guided run this plan offers; absent = a plain run */
	run?: RunDay;
};
