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
	/** short clarifier shown under the name — for what the fields can't say */
	note?: string;
};

export type DayInfo = { title: string; desc?: string };

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
};
