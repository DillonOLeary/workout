import { COOLDOWN_ITEM, RUN_ITEM, WARMUP_ITEM, entryKey, type EntryLogged, type Workout } from './events';
import { isSet } from './measure';
import { cooldownFor, restFor, warmupFor, type Exercise, type Plan } from './plan';

/**
 * A session, as a list of STEPS the floor walks one at a time: warm-up lines,
 * then every set with a rest before the next, then the cooldown — or, for a
 * run, walk · run · walk. The plan owns the order; you own the numbers.
 *
 * Steps are derived from the plan, never stored. Which ones are DONE is read
 * from the session's entries; a rest is done when the set after it is, or
 * when its clock has simply run out — rests are never written to the ledger.
 */
export type StepKind = 'prep' | 'set' | 'rest' | 'run';

/* what each step costs the clock, seconds — the honest "about N min" is the
   sum of these plus the rests, not a guess per session */
const PREP_SECONDS = 75;
const SET_SECONDS = 45;
const COOLDOWN_SECONDS = 60;

export type Step = {
	/** entry identity for prep/set/run; `rest:<item>#<set>` for a rest */
	key: string;
	kind: StepKind;
	/** the group the list shows it under: 'Warm-up', an exercise name, 'Cooldown', the run's title */
	section: string;
	/** EntryLogged.item — for a rest, the exercise it sits inside */
	item: string;
	/** EntryLogged.index — for a rest, the set it precedes */
	index: number;
	/** 'STEP 1' · 'SET 2' · 'HOLD 2' · 'REST' · 'WALK' · 'RUN' */
	label: string;
	/** prep: the instruction */
	text?: string;
	/** set / rest: the exercise */
	ex?: Exercise;
	/** rest: the seconds to wait */
	seconds?: number;
	/** run: the target minutes; prep walk: its minutes */
	minutes?: number;
	/** what this step costs the clock, seconds — for "about N min" */
	estimate: number;
};

const restKey = (item: string, set: number) => `rest:${entryKey(item, set)}`;

/** The whole workout, in order. A lift day the plan doesn't have → no steps. */
export function sessionSteps(plan: Plan | undefined, w: Workout): Step[] {
	if (!plan) return [];
	if (w.kind === 'run') return runSteps(plan);
	const day = w.day;
	const exercises = plan.days[day];
	if (!exercises) return [];
	const out: Step[] = [];
	warmupFor(plan, day).forEach((text, n) =>
		out.push({
			key: entryKey(WARMUP_ITEM, n + 1), kind: 'prep', section: WARMUP_ITEM, item: WARMUP_ITEM, index: n + 1,
			label: `STEP ${n + 1}`, text, estimate: PREP_SECONDS
		})
	);
	for (const ex of exercises) {
		const hold = ex.kind === 'hold';
		const rest = restFor(plan, ex);
		for (let s = 1; s <= ex.sets; s++) {
			out.push({
				key: entryKey(ex.name, s), kind: 'set', section: ex.name, item: ex.name, index: s,
				label: `${hold ? 'HOLD' : 'SET'} ${s}${ex.side === 'sets' ? (s % 2 === 1 ? ' · L' : ' · R') : ''}`,
				ex, estimate: SET_SECONDS
			});
			if (s < ex.sets)
				out.push({
					key: restKey(ex.name, s + 1), kind: 'rest', section: ex.name, item: ex.name, index: s + 1,
					label: 'REST', ex, seconds: rest, estimate: rest
				});
		}
	}
	cooldownFor(plan, day).forEach((text, n) =>
		out.push({
			key: entryKey(COOLDOWN_ITEM, n + 1), kind: 'prep', section: COOLDOWN_ITEM, item: COOLDOWN_ITEM, index: n + 1,
			label: `STEP ${n + 1}`, text, estimate: COOLDOWN_SECONDS
		})
	);
	return out;
}

/** Walk · run · walk. A plan without a run day still gets the bare run. */
function runSteps(plan: Plan): Step[] {
	const run = plan.run ?? { title: 'Run', minutes: 30 };
	const walk = run.walk ?? 0;
	const out: Step[] = [];
	if (walk > 0)
		out.push({
			key: entryKey(WARMUP_ITEM, 1), kind: 'prep', section: run.title, item: WARMUP_ITEM, index: 1,
			label: 'WALK', text: `Walk · ${walk} min`, minutes: walk, estimate: walk * 60
		});
	out.push({
		key: entryKey(RUN_ITEM, 1), kind: 'run', section: run.title, item: RUN_ITEM, index: 1,
		label: 'RUN', minutes: run.minutes, estimate: run.minutes * 60
	});
	if (walk > 0)
		out.push({
			key: entryKey(COOLDOWN_ITEM, 1), kind: 'prep', section: run.title, item: COOLDOWN_ITEM, index: 1,
			label: 'WALK', text: `Walk · ${walk} min`, minutes: walk, estimate: walk * 60
		});
	return out;
}

/** "about N min" — from the steps themselves, so it is the number you'd argue with. */
export function estimateMinutes(steps: Step[], from = 0): number {
	let t = 0;
	for (let k = Math.max(0, from); k < steps.length; k++) t += steps[k].estimate;
	return Math.round(t / 60);
}

export type Entry = EntryLogged['data'];

/**
 * Where a session stands, from its entries and the clock.
 *   done     — step keys that are behind you (rests included, by the clock)
 *   current  — the first step that isn't
 *   restStart / runStart — when the clock for that step began (the previous
 *              entry's timestamp), so a reload lands back on the timer
 */
export type Progress = {
	done: Set<string>;
	current: number;
	sets: number;
	prep: number;
};

/** When a rest's clock started: the moment the set before it landed. */
export function restStart(step: Step, entries: Entry[]): number | null {
	if (step.kind !== 'rest') return null;
	const prev = entries.find((e) => e.item === step.item && e.index === step.index - 1);
	return prev ? Date.parse(prev.at) : null;
}

/** When a run's clock started: the previous step's entry, else the session itself. */
export function runStart(steps: Step[], i: number, entries: Entry[], sessionAt: string): number {
	for (let k = i - 1; k >= 0; k--) {
		const s = steps[k];
		if (s.kind === 'rest') continue;
		const e = entries.find((x) => x.item === s.item && x.index === s.index);
		if (e) return Date.parse(e.at);
	}
	return Date.parse(sessionAt);
}

export function sessionProgress(steps: Step[], entries: Entry[], now: number): Progress {
	const logged = new Set(entries.map((e) => entryKey(e.item, e.index)));
	const done = new Set<string>();
	for (const s of steps) {
		if (s.kind === 'rest') {
			const next = logged.has(entryKey(s.item, s.index));
			const start = restStart(s, entries);
			const elapsed = start !== null && now >= start + (s.seconds ?? 0) * 1000;
			if (next || elapsed) done.add(s.key);
		} else if (logged.has(s.key)) done.add(s.key);
	}
	let current = steps.findIndex((s) => !done.has(s.key));
	if (current < 0) current = steps.length;
	return {
		done,
		current,
		sets: entries.filter((e) => isSet(e.measure)).length,
		prep: entries.filter((e) => e.measure.of === 'step').length
	};
}

/** "Step 6 of 24" — the crumb, the card, the list all say the same thing. */
export const stepOf = (i: number, steps: Step[]) => `Step ${Math.min(i + 1, steps.length)} of ${steps.length}`;
