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
};
