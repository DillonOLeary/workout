import { COOLDOWN_ITEM, RUN_ITEM, WARMUP_ITEM, entryKey, type EntryLogged, type Workout } from './events';
import { isSet } from './measure';
import {
	cooldownFor,
	exerciseNamed,
	prepSeconds,
	restFor,
	warmupFor,
	type Exercise,
	type Plan,
	type PrepItem
} from './plan';

/**
 * A session, as a list of STEPS the floor walks one at a time: warm-up lines,
 * every set, the cooldown — or, for a run, its warm-up, the run, its
 * cooldown. The plan owns the order; you own the numbers.
 *
 * Steps are derived from the plan, never stored. Which ones are DONE is read
 * from the session's entries. A rest is not a step: it is a clock that runs
 * under the next set, from the previous set's timestamp (restUntil), and it
 * is never written to the ledger. This file is the only place that knows
 * what a session IS; the floor renders steps, it never invents one.
 */
export type StepKind = 'prep' | 'timed' | 'set' | 'run';

/* what each step costs the clock, seconds — the honest "about N min" is the
   sum of these, rests included, not a guess per session */
const PREP_SECONDS = 75;
const SET_SECONDS = 45;
const COOLDOWN_SECONDS = 60;

export type Step = {
	/** the entry identity — item#index */
	key: string;
	kind: StepKind;
	/** the group the list shows it under: 'Warm-up', an exercise name, 'Cooldown', the run's title */
	section: string;
	/** EntryLogged.item */
	item: string;
	/** EntryLogged.index */
	index: number;
	/** 'STEP 1' · 'STEP 2 · L' · 'SET 2' · 'HOLD 2 · R' · 'RUN' */
	label: string;
	/** prep / timed: what the row says */
	text?: string;
	/** timed: the drill's name, for a glyph */
	name?: string;
	/** timed: the countdown */
	seconds?: number;
	/** set: the exercise */
	ex?: Exercise;
	/** run: the target minutes */
	minutes?: number;
	/** what this step costs the clock, seconds — for "about N min" */
	estimate: number;
};

export type SessionOptions = {
	/** the subset of the day's exercises this session set out to do (SessionStarted.pick) */
	pick?: string[];
	/** exercises added on the floor, by name — each becomes a section after the plan's */
	extra?: string[];
};

/** The day's exercises, narrowed to the pick when there is one. */
export function dayExercises(plan: Plan | undefined, w: Workout, pick?: string[]): Exercise[] {
	if (!plan || w.kind !== 'lift') return [];
	const exercises = plan.days[w.day] ?? [];
	return pick ? exercises.filter((ex) => pick.includes(ex.name)) : exercises;
}

/** Prep items as steps: a string is a line you tick, a timed item counts down — twice when it is per side. */
function prepSteps(items: PrepItem[], section: string, item: string, proseSeconds: number): Step[] {
	const out: Step[] = [];
	let n = 0;
	for (const it of items) {
		if (typeof it === 'string') {
			n++;
			out.push({
				key: entryKey(item, n), kind: 'prep', section, item, index: n,
				label: `STEP ${n}`, text: it, estimate: proseSeconds
			});
			continue;
		}
		const seconds = prepSeconds(it);
		const sides = 'seconds' in it && it.each ? [' · L', ' · R'] : [''];
		for (const side of sides) {
			n++;
			out.push({
				key: entryKey(item, n), kind: 'timed', section, item, index: n,
				label: `STEP ${n}${side}`, text: `${it.name} · ${seconds % 60 === 0 && seconds >= 60 ? `${seconds / 60} min` : `${seconds}s`}`,
				name: it.name, seconds, estimate: seconds
			});
		}
	}
	return out;
}

/** One exercise's sets, with the rest before each set folded into its estimate. */
function setSteps(plan: Plan, ex: Exercise): Step[] {
	const hold = ex.kind === 'hold';
	const rest = restFor(plan, ex);
	const out: Step[] = [];
	for (let s = 1; s <= ex.sets; s++)
		out.push({
			key: entryKey(ex.name, s), kind: 'set', section: ex.name, item: ex.name, index: s,
			label: `${hold ? 'HOLD' : 'SET'} ${s}${ex.side === 'sets' ? (s % 2 === 1 ? ' · L' : ' · R') : ''}`,
			ex, estimate: (hold ? ex.hi : SET_SECONDS) + (s > 1 ? rest : 0)
		});
	return out;
}

/** The whole workout, in order. A lift day the plan doesn't have → no steps. */
export function sessionSteps(plan: Plan | undefined, w: Workout, opts: SessionOptions = {}): Step[] {
	if (!plan) return [];
	const out: Step[] = w.kind === 'run' ? runSteps(plan) : liftSteps(plan, w.day, opts.pick);
	if (w.kind === 'lift' && !plan.days[w.day]) return [];
	// anything added on the floor comes after the plan's own sections, once
	const have = new Set(out.map((s) => s.section));
	for (const name of opts.extra ?? []) {
		const ex = exerciseNamed(plan, name);
		if (!ex || have.has(ex.name)) continue;
		have.add(ex.name);
		out.push(...setSteps(plan, ex));
	}
	return out;
}

function liftSteps(plan: Plan, day: string, pick?: string[]): Step[] {
	if (!plan.days[day]) return [];
	const out: Step[] = prepSteps(warmupFor(plan, day), WARMUP_ITEM, WARMUP_ITEM, PREP_SECONDS);
	for (const ex of dayExercises(plan, { kind: 'lift', day }, pick)) out.push(...setSteps(plan, ex));
	out.push(...prepSteps(cooldownFor(plan, day), COOLDOWN_ITEM, COOLDOWN_ITEM, COOLDOWN_SECONDS));
	return out;
}

/** Warm-up · run · cooldown. A plan without a run day still gets the bare run. */
function runSteps(plan: Plan): Step[] {
	const run = plan.run ?? { title: 'Run', minutes: 30 };
	return [
		...prepSteps(run.warmup ?? [], WARMUP_ITEM, WARMUP_ITEM, PREP_SECONDS),
		{
			key: entryKey(RUN_ITEM, 1), kind: 'run', section: run.title, item: RUN_ITEM, index: 1,
			label: 'RUN', minutes: run.minutes, estimate: run.minutes * 60
		},
		...prepSteps(run.cooldown ?? [], COOLDOWN_ITEM, COOLDOWN_ITEM, COOLDOWN_SECONDS)
	];
}

/** "about N min" — from the steps themselves, so it is the number you'd argue with. */
export function estimateMinutes(steps: Step[], from = 0): number {
	let t = 0;
	for (let k = Math.max(0, from); k < steps.length; k++) t += steps[k].estimate;
	return Math.round(t / 60);
}

export type Entry = EntryLogged['data'];

/**
 * Exercises this session logged that its steps don't cover — a stretch added
 * from the ⋯ sheet, say. Handed back as `extra` so a reload keeps the section.
 */
export function loggedOutside(plan: Plan | undefined, w: Workout, pick: string[] | undefined, entries: Entry[]): string[] {
	const planned = new Set(dayExercises(plan, w, pick).map((ex) => ex.name));
	const out: string[] = [];
	for (const e of entries) {
		if (!isSet(e.measure) || planned.has(e.item) || out.includes(e.item)) continue;
		if (exerciseNamed(plan, e.item)) out.push(e.item);
	}
	return out;
}

/**
 * Where a session stands, from its entries.
 *   done     — step keys that are behind you
 *   current  — the first step that isn't
 */
export type Progress = {
	done: Set<string>;
	current: number;
	sets: number;
	prep: number;
};

/**
 * When the rest before this set ends — from the previous set's LOCAL
 * timestamp, so a set that hasn't reached the server yet still starts the
 * clock. Set 1 has no rest before it; a set whose predecessor was never
 * logged has nothing to wait for.
 */
export function restUntil(step: Step, entries: Entry[], plan: Plan | undefined): number | null {
	if (step.kind !== 'set' || step.index === 1 || !step.ex) return null;
	const prev = entries.find((e) => e.item === step.item && e.index === step.index - 1);
	return prev ? Date.parse(prev.at) + restFor(plan, step.ex) * 1000 : null;
}

/** When a run's clock started: the previous step's entry, else the session itself. */
export function runStart(steps: Step[], i: number, entries: Entry[], sessionAt: string): number {
	for (let k = i - 1; k >= 0; k--) {
		const s = steps[k];
		const e = entries.find((x) => x.item === s.item && x.index === s.index);
		if (e) return Date.parse(e.at);
	}
	return Date.parse(sessionAt);
}

export function sessionProgress(steps: Step[], entries: Entry[]): Progress {
	const logged = new Set(entries.map((e) => entryKey(e.item, e.index)));
	const done = new Set<string>();
	for (const s of steps) if (logged.has(s.key)) done.add(s.key);
	let current = steps.findIndex((s) => !done.has(s.key));
	if (current < 0) current = steps.length;
	return {
		done,
		current,
		sets: entries.filter((e) => isSet(e.measure)).length,
		prep: entries.filter((e) => e.measure.of === 'step').length
	};
}

/**
 * "Set 4/20" · "Hold 3/9" · "Warm-up 2/3" · "Run" · "Done" — where you are,
 * the way the crumb and Today both say it. Sets count across the whole
 * session; a prep step counts within its section.
 */
export function positionLabel(i: number, steps: Step[]): string {
	const s = steps[i];
	if (!s) return 'Done';
	if (s.kind === 'run') return 'Run';
	if (s.kind === 'set') {
		const sets = steps.filter((x) => x.kind === 'set');
		const word = sets.every((x) => x.ex?.kind === 'hold') ? 'Hold' : 'Set';
		return `${word} ${sets.indexOf(s) + 1}/${sets.length}`;
	}
	const peers = steps.filter((x) => x.section === s.section);
	return `${s.section} ${peers.indexOf(s) + 1}/${peers.length}`;
}
