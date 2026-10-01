import { COOLDOWN_ITEM, WARMUP_ITEM, entryKey, type EntryLogged, type Workout } from './events';
import { prepLabel } from './labels';
import { isSet } from './measure';
import {
	cooldownFor,
	exerciseNamed,
	isStretchLine,
	prepSeconds,
	restFor,
	warmupFor,
	type Exercise,
	type Plan,
	type PrepItem,
	type RunEx
} from './plan';

// seconds each step costs the clock; "about N min" is their sum, rests included
const PREP_SECONDS = 75;
const SET_SECONDS = 45;
const COOLDOWN_SECONDS = 60;

type StepBase = {
	/** the entry identity — item#index */
	key: string;
	/** the group the list shows it under: 'Warm-up', an exercise name, 'Cooldown' */
	section: string;
	/** EntryLogged.item */
	item: string;
	/** EntryLogged.index */
	index: number;
	/** 'STEP 1' · 'STEP 2 · L' · 'SET 2' · 'HOLD 2 · R' · 'RUN' */
	label: string;
	/** what this step costs the clock, seconds */
	estimate: number;
};

/** One step the floor walks; each kind carries only what it needs, so switch on `kind`. */
export type Step = StepBase &
	(
		| { kind: 'prep'; text: string }
		| { kind: 'timed'; text: string; name: string; seconds: number }
		| { kind: 'set'; ex: Exercise }
		| { kind: 'run'; minutes: number; ex: RunEx }
	);

/** The routine's exercises; nothing for a routine the plan doesn't have. */
export function routineExercises(plan: Plan | undefined, w: Workout): Exercise[] {
	return plan?.routines[w.routine] ?? [];
}

function prepSteps(plan: Plan, items: PrepItem[], section: string, item: string, proseSeconds: number): Step[] {
	const out: Step[] = [];
	let n = 0;
	for (const it of items) {
		if (isStretchLine(it)) {
			out.push(...exerciseSteps(plan, it));
			continue;
		}
		if (typeof it === 'string' || 'reps' in it) {
			n++;
			out.push({
				key: entryKey(item, n), kind: 'prep', section, item, index: n,
				label: `STEP ${n}`, text: prepLabel(it), estimate: proseSeconds
			});
			continue;
		}
		const seconds = prepSeconds(it);
		const sides = 'seconds' in it && it.each ? [' · L', ' · R'] : [''];
		for (const side of sides) {
			n++;
			out.push({
				key: entryKey(item, n), kind: 'timed', section, item, index: n,
				label: `STEP ${n}${side}`, text: prepLabel({ name: it.name, ...('minutes' in it ? { minutes: it.minutes } : { seconds }) }),
				name: it.name, seconds, estimate: seconds
			});
		}
	}
	return out;
}

function exerciseSteps(plan: Plan, ex: Exercise): Step[] {
	if (ex.kind === 'run')
		return [{
			key: entryKey(ex.name, 1), kind: 'run', section: ex.name, item: ex.name, index: 1,
			label: 'RUN', minutes: ex.hi, ex, estimate: ex.hi * 60
		}];
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

/** The whole workout in order — warm-up, exercises, cooldown; `extra` is exercises added on the floor by name, each a section after the plan's own, once. */
export function sessionSteps(plan: Plan | undefined, w: Workout, extra: string[] = []): Step[] {
	if (!plan || !plan.routines[w.routine]) return [];
	const out: Step[] = prepSteps(plan, warmupFor(plan, w.routine), WARMUP_ITEM, WARMUP_ITEM, PREP_SECONDS);
	for (const ex of plan.routines[w.routine]) out.push(...exerciseSteps(plan, ex));
	out.push(...prepSteps(plan, cooldownFor(plan, w.routine), COOLDOWN_ITEM, COOLDOWN_ITEM, COOLDOWN_SECONDS));
	const have = new Set(out.map((s) => s.section));
	for (const name of extra) {
		const ex = exerciseNamed(plan, name);
		if (!ex || have.has(ex.name)) continue;
		have.add(ex.name);
		out.push(...exerciseSteps(plan, ex));
	}
	return out;
}

/** "about N min" — from the steps themselves, so it is the number you'd argue with. */
export function estimateMinutes(steps: Step[], from = 0): number {
	let t = 0;
	for (let k = Math.max(0, from); k < steps.length; k++) t += steps[k].estimate;
	return Math.round(t / 60);
}

/** One logged entry's data. */
export type Entry = EntryLogged['data'];

/** Exercises this session logged that its routine and cooldown don't cover — handed back as `extra` so a reload keeps the section. */
export function loggedOutside(plan: Plan | undefined, w: Workout, entries: Entry[]): string[] {
	const planned = new Set(sessionSteps(plan, w).flatMap((s) => (s.kind === 'set' ? [s.ex.name] : [])));
	const out: string[] = [];
	for (const e of entries) {
		if (!isSet(e.measure) || planned.has(e.item) || out.includes(e.item)) continue;
		if (exerciseNamed(plan, e.item)) out.push(e.item);
	}
	return out;
}

/** Where a session stands: the step keys behind you, the index of the first step that isn't, and how many sets have landed. */
export type Progress = {
	done: Set<string>;
	current: number;
	sets: number;
};

/** When the rest before this set ends, from the previous set's local timestamp; null for set 1 or when the set before was never logged. */
export function restUntil(step: Step, entries: Entry[], plan: Plan | undefined): number | null {
	if (step.kind !== 'set' || step.index === 1) return null;
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

/** Where a session stands, from its entries. */
export function sessionProgress(steps: Step[], entries: Entry[]): Progress {
	const logged = new Set(entries.map((e) => entryKey(e.item, e.index)));
	const done = new Set<string>();
	for (const s of steps) if (logged.has(s.key)) done.add(s.key);
	let current = steps.findIndex((s) => !done.has(s.key));
	if (current < 0) current = steps.length;
	return { done, current, sets: entries.filter((e) => isSet(e.measure)).length };
}

/** "Set 4/20" · "Hold 3/9" · "Warm-up 2/3" · "Run" · "Done" — sets count across the session, a prep step within its section. */
export function positionLabel(i: number, steps: Step[]): string {
	const s = steps[i];
	if (!s) return 'Done';
	if (s.kind === 'run') return 'Run';
	if (s.kind === 'set') {
		const sets = steps.filter((x) => x.kind === 'set');
		const word = sets.every((x) => x.kind === 'set' && x.ex.kind === 'hold') ? 'Hold' : 'Set';
		return `${word} ${sets.indexOf(s) + 1}/${sets.length}`;
	}
	const peers = steps.filter((x) => x.section === s.section);
	return `${s.section} ${peers.indexOf(s) + 1}/${peers.length}`;
}
