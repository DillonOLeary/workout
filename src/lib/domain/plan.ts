import { RACKS, type Rack } from './racks';

/** What a routine IS. Required on every routine — never inferred. */
export type Discipline = 'lift' | 'yoga' | 'bodyweight' | 'mobility' | 'run';
export const DISCIPLINES: readonly Discipline[] = ['lift', 'yoga', 'bodyweight', 'mobility', 'run'];
export const isDiscipline = (v: unknown): v is Discipline => DISCIPLINES.includes(v as Discipline);

/** What the rule moves, per exercise: `kind` says which measure a set writes, `progress` what moves — size, time, count, variant, or none; legal pairings are enforced in parsePlan. */
export type Progress =
	| { of: 'size'; start: number; inc: number; rack?: Rack; each?: boolean }
	| { of: 'time'; inc: number }
	| { of: 'count' }
	| { of: 'variant'; ladder: string[] }
	| { of: 'none' };

type ExerciseBase = {
	name: string;
	equip: string;
	tag: string;
	sets: number;
	/** the range: reps — seconds for a hold, minutes for a run */
	lo: number;
	hi: number;
	/** absent = bilateral; 'reps' = lo/hi are per side, one set covers both; 'sets' = each set is one side, so `sets` counts both */
	side?: 'reps' | 'sets';
	/** short clarifier shown under the name — for what the fields can't say */
	note?: string;
	/** seconds between this exercise's sets; absent = the plan's `rest` */
	rest?: number;
};

/** The legal kind/progress pairings, and only these — anything else fails parsePlan. */
export type Loaded = ExerciseBase & { kind: 'load'; progress: Extract<Progress, { of: 'size' }> };
export type Held = ExerciseBase & { kind: 'hold'; progress: Extract<Progress, { of: 'time' | 'none' }> };
export type Counted = ExerciseBase & { kind: 'reps'; progress: Extract<Progress, { of: 'count' | 'variant' | 'none' }> };
/** The run: one exercise that measures minutes. A routine of one of these is a run. */
export type RunEx = ExerciseBase & { kind: 'run'; progress: Extract<Progress, { of: 'none' }> };
export type Exercise = Loaded | Held | Counted | RunEx;
export type Kind = Exercise['kind'];

/** One line of a warm-up or cooldown: an instruction you tick, a countdown by the second (`each` = once per side) or by the minute, or a line you tick after N reps. */
export type PrepItem =
	| string
	| { name: string; seconds: number; each?: boolean }
	| { name: string; minutes: number }
	| { name: string; reps: number; each?: boolean };

/** A thing the plan offers. Reference data; the session carries its own copy of `discipline`. */
export type Routine = {
	title: string;
	discipline: Discipline;
	desc?: string;
	/** warm-up and cooldown are lists of STEPS, one line each — every line takes a turn on the floor */
	warmup?: PrepItem[];
	cooldown?: PrepItem[];
	/** one line shown under every prep step (the breathing cue, say) */
	cue?: string;
};

/** Routines you work through, in order, at a cadence; position is never stored — it is the routine after the last one of this cycle you finished. */
export type Cycle = {
	id: string;
	title: string;
	/** ordered routine keys */
	routines: string[];
	/** sessions a week. Always sessions. 0 = never owed on its own: dealt after everything owed, or at the target of the cycle it stands in for */
	target: number;
	/** takes that cycle's target while it is ruled out (the floor stands in for the gym) */
	standsInFor?: string;
};

/** A plan: the cycles the week is made of, the routines they turn through, and the defaults. */
export type Plan = {
	id: string;
	name: string;
	description?: string;
	schedule: string;
	/** what the week is made of */
	cycles: Cycle[];
	/** key → the work */
	routines: Record<string, Exercise[]>;
	/** key → what it is */
	routineInfo: Record<string, Routine>;
	/** seconds between sets, unless the exercise says otherwise; absent = DEFAULT_REST */
	rest?: number;
	/** warm-up / cooldown for routines whose info doesn't carry their own */
	warmup?: PrepItem[];
	cooldown?: PrepItem[];
	cue?: string;
};

/** Seconds between sets when nothing says otherwise — asked for via restFor, never written as `?? 60` elsewhere. */
export const DEFAULT_REST = 60;

export const warmupFor = (plan: Plan | undefined, routine: string): PrepItem[] =>
	plan?.routineInfo[routine]?.warmup ?? plan?.warmup ?? [];
export const cooldownFor = (plan: Plan | undefined, routine: string): PrepItem[] =>
	plan?.routineInfo[routine]?.cooldown ?? plan?.cooldown ?? [];
/** The one line shown under every prep step. */
export const cueFor = (plan: Plan | undefined, routine: string): string | undefined =>
	plan?.routineInfo[routine]?.cue ?? plan?.cue;
export const restFor = (plan: Plan | undefined, ex: Exercise): number => ex.rest ?? plan?.rest ?? DEFAULT_REST;
/** Display title for a routine — undefined for a key the plan doesn't have. */
export const routineTitle = (plan: Plan | undefined, routine: string): string | undefined =>
	plan?.routineInfo[routine]?.title;
/** An exercise the rule moves — as opposed to a stretch, a yoga hold or the run, whose dose is the dose. */
export const progresses = (ex: Exercise): boolean => ex.progress.of !== 'none';
/** What a routine IS — undefined for a key the plan doesn't have. */
export const disciplineOf = (plan: Plan | undefined, routine: string): Discipline | undefined =>
	plan?.routineInfo[routine]?.discipline;
/** Every routine of a discipline, in plan order. */
export const routinesOf = (plan: Plan, discipline: Discipline): string[] =>
	Object.keys(plan.routines).filter((r) => disciplineOf(plan, r) === discipline);
/** The disciplines a plan's cycles cover, in cycle order, once each. */
export function disciplinesOf(plan: Plan): Discipline[] {
	const out: Discipline[] = [];
	for (const c of plan.cycles)
		for (const r of c.routines) {
			const d = disciplineOf(plan, r);
			if (d && !out.includes(d)) out.push(d);
		}
	return out;
}
/** The disciplines one cycle turns through — one, usually; the no-gym block mixes two. */
export function cycleDisciplines(plan: Plan, cycle: Cycle): Discipline[] {
	const out: Discipline[] = [];
	for (const r of cycle.routines) {
		const d = disciplineOf(plan, r);
		if (d && !out.includes(d)) out.push(d);
	}
	return out;
}
/** Every routine key, in cycle order and then the rest — what a row of chips shows. */
export function routineKeys(plan: Plan): string[] {
	const out: string[] = [];
	for (const c of plan.cycles) for (const r of c.routines) if (!out.includes(r)) out.push(r);
	for (const r of Object.keys(plan.routines)) if (!out.includes(r)) out.push(r);
	return out;
}
/** The first cycle a routine belongs to, if any. */
export const cycleOf = (plan: Plan, routine: string): Cycle | undefined =>
	plan.cycles.find((c) => c.routines.includes(routine));
/** An exercise by name, from any routine of the plan — how a one-off stretch finds its shape. */
export const exerciseNamed = (plan: Plan | undefined, name: string): Exercise | undefined =>
	plan && Object.values(plan.routines).flat().find((ex) => ex.name === name);
/** Every exercise in the plan, once each by name, in plan order. */
export function planExercises(plan: Plan): Exercise[] {
	const seen = new Set<string>();
	const out: Exercise[] = [];
	for (const list of Object.values(plan.routines))
		for (const ex of list)
			if (!seen.has(ex.name)) {
				seen.add(ex.name);
				out.push(ex);
			}
	return out;
}

/** The blocks a person can switch. A closed union: a switch is an event, and the decider must know the block exists. */
export type BlockId = 'yoga' | 'mob' | 'run' | 'bw';
export const BLOCK_IDS: readonly BlockId[] = ['yoga', 'mob', 'run', 'bw'];
export const isBlockId = (v: unknown): v is BlockId => BLOCK_IDS.includes(v as BlockId);
/** Every block on — the week before a switch says otherwise. */
export const allBlocksOn = (): Record<BlockId, boolean> =>
	Object.fromEntries(BLOCK_IDS.map((b) => [b, true])) as Record<BlockId, boolean>;

/** A shared cycle with its routines — on or off per person. */
export type Block = {
	id: BlockId;
	cycle: Cycle;
	routines: Record<string, Exercise[]>;
	routineInfo: Record<string, Routine>;
};

/** The week as one Plan: every block's routines are known whether or not it is on, but only an on block's cycle is in the week. */
export function composePlan(programme: Plan, blocks: readonly Block[], on: readonly BlockId[]): Plan {
	const routines: Record<string, Exercise[]> = { ...programme.routines };
	const routineInfo: Record<string, Routine> = { ...programme.routineInfo };
	for (const b of blocks) {
		Object.assign(routines, b.routines);
		Object.assign(routineInfo, b.routineInfo);
	}
	const cycles = [...programme.cycles, ...blocks.filter((b) => on.includes(b.id)).map((b) => b.cycle)];
	return { ...programme, cycles, routines, routineInfo };
}

/** A timed prep item's countdown, in seconds; 0 for a line you tick. */
export const prepSeconds = (item: PrepItem): number =>
	typeof item === 'string' || 'reps' in item ? 0 : 'seconds' in item ? item.seconds : item.minutes * 60;

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const count = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

function parsePrepItem(v: unknown, where: string): PrepItem {
	if (typeof v === 'string') return v;
	if (isObj(v) && typeof v.name === 'string' && v.name) {
		const keys = ['seconds', 'minutes', 'reps'].filter((k) => v[k] !== undefined);
		if (v.each !== undefined && typeof v.each !== 'boolean') throw new Error(`${where} "${v.name}" each must be a boolean`);
		if (keys.length === 1) {
			const each = v.each !== undefined ? { each: v.each as boolean } : {};
			if (positive(v.seconds)) return { name: v.name, seconds: v.seconds, ...each };
			if (positive(v.minutes) && v.each === undefined) return { name: v.name, minutes: v.minutes };
			if (positive(v.reps) && Number.isInteger(v.reps)) return { name: v.name, reps: v.reps, ...each };
		}
	}
	throw new Error(`${where} must be a string or a list of strings and timed or counted items`);
}

function stepList(v: unknown, where: string): PrepItem[] | undefined {
	if (v === undefined) return undefined;
	if (Array.isArray(v)) return v.map((x) => parsePrepItem(x, where));
	throw new Error(`${where} must be a list of strings and timed items`);
}

function parseProgress(e: Raw, name: string): Progress {
	const p = e.progress;
	if (!isObj(p)) throw new Error(`"${name}" needs a progress: size, time, count, variant or none`);
	const num = (k: string): number => {
		if (typeof p[k] !== 'number' || !Number.isFinite(p[k])) throw new Error(`"${name}" progress needs numeric ${k}`);
		return p[k] as number;
	};
	switch (p.of) {
		case 'size': {
			if (p.rack !== undefined && !Object.keys(RACKS).includes(p.rack as string))
				throw new Error(`"${name}" rack must be ${Object.keys(RACKS).join(', ')} (omit it for machines)`);
			if (p.each !== undefined && typeof p.each !== 'boolean') throw new Error(`"${name}" each must be a boolean`);
			return {
				of: 'size',
				start: num('start'),
				inc: num('inc'),
				...(p.rack !== undefined ? { rack: p.rack as Rack } : {}),
				...(p.each !== undefined ? { each: p.each as boolean } : {})
			};
		}
		case 'time': {
			const inc = num('inc');
			if (inc <= 0) throw new Error(`"${name}" needs a positive inc to progress`);
			return { of: 'time', inc };
		}
		case 'count':
			return { of: 'count' };
		case 'variant': {
			const ladder = p.ladder;
			if (!Array.isArray(ladder) || !ladder.length || !ladder.every((s) => typeof s === 'string' && s))
				throw new Error(`"${name}" variant progress needs a ladder of names`);
			return { of: 'variant', ladder: ladder as string[] };
		}
		case 'none':
			return { of: 'none' };
		default:
			throw new Error(`"${name}" progress must be size, time, count, variant or none`);
	}
}

function parseExercise(raw: unknown, routine: string): Exercise {
	if (!isObj(raw) || typeof raw.name !== 'string' || !raw.name)
		throw new Error(`exercise in routine "${routine}" is missing a name`);
	const e = raw;
	const name = e.name as string;
	const num = (k: string): number => {
		if (typeof e[k] !== 'number' || !Number.isFinite(e[k])) throw new Error(`"${name}" needs numeric ${k}`);
		return e[k] as number;
	};
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
	if (base.lo > base.hi) throw new Error(`"${name}" lo must not exceed hi`);
	if (base.side === 'sets' && base.sets % 2 !== 0)
		throw new Error(`"${name}" side "sets" needs an even number of sets — one per side`);
	const progress = parseProgress(e, name);
	const pairing = `${String(e.kind)} + ${progress.of}`;
	switch (e.kind) {
		case 'load':
			if (progress.of !== 'size') throw new Error(`"${name}": ${pairing} is not a legal pairing — a load progresses by size`);
			return { ...base, kind: 'load', progress };
		case 'hold':
			if (progress.of === 'time') {
				if (base.lo === base.hi) throw new Error(`"${name}" is a fixed hold: its progress is none`);
				return { ...base, kind: 'hold', progress };
			}
			if (progress.of === 'none') {
				if (base.lo !== base.hi) throw new Error(`"${name}" does not progress, so it has one length: lo must equal hi`);
				return { ...base, kind: 'hold', progress };
			}
			throw new Error(`"${name}": ${pairing} is not a legal pairing — a hold progresses by time, or not at all`);
		case 'reps':
			if (progress.of === 'count' || progress.of === 'variant' || progress.of === 'none')
				return { ...base, kind: 'reps', progress };
			throw new Error(`"${name}": ${pairing} is not a legal pairing — reps progress by count, by variant, or not at all`);
		case 'run':
			if (progress.of !== 'none') throw new Error(`"${name}": ${pairing} is not a legal pairing — a run does not progress`);
			return { ...base, kind: 'run', progress };
		default:
			throw new Error(`"${name}" kind must be load, hold, reps or run`);
	}
}

function parseRoutineInfo(v: unknown, keys: string[]): Record<string, Routine> {
	if (!isObj(v)) throw new Error('routineInfo must be an object with an entry per routine');
	const out: Record<string, Routine> = {};
	for (const r of keys) {
		const info = v[r];
		if (!isObj(info) || typeof info.title !== 'string' || !info.title) throw new Error(`routineInfo "${r}" needs a title`);
		if (!isDiscipline(info.discipline))
			throw new Error(`routineInfo "${r}" needs a discipline: ${DISCIPLINES.join(', ')}`);
		if (info.desc !== undefined && typeof info.desc !== 'string') throw new Error(`routineInfo "${r}" desc must be a string`);
		if (info.cue !== undefined && typeof info.cue !== 'string') throw new Error(`routineInfo "${r}" cue must be a string`);
		const warmup = stepList(info.warmup, `routineInfo "${r}" warmup`);
		const cooldown = stepList(info.cooldown, `routineInfo "${r}" cooldown`);
		out[r] = {
			title: info.title,
			discipline: info.discipline,
			...(info.desc !== undefined ? { desc: info.desc as string } : {}),
			...(warmup ? { warmup } : {}),
			...(cooldown ? { cooldown } : {}),
			...(info.cue !== undefined ? { cue: info.cue as string } : {})
		};
	}
	return out;
}

function parseCycles(v: unknown, keys: string[]): Cycle[] {
	if (!Array.isArray(v) || !v.length) throw new Error('cycles must be a non-empty list');
	const out: Cycle[] = [];
	for (const c of v) {
		if (!isObj(c) || typeof c.id !== 'string' || !c.id || typeof c.title !== 'string' || !c.title)
			throw new Error('every cycle needs an id and a title');
		if (out.some((x) => x.id === c.id)) throw new Error(`cycle "${c.id}" is listed twice`);
		if (!Array.isArray(c.routines) || !c.routines.length || !c.routines.every((r) => typeof r === 'string'))
			throw new Error(`cycle "${c.id}" needs a non-empty list of routines`);
		for (const r of c.routines as string[]) if (!keys.includes(r)) throw new Error(`cycle "${c.id}" names a routine the plan doesn't have: "${r}"`);
		if (!count(c.target)) throw new Error(`cycle "${c.id}" target must be a whole number of sessions a week`);
		if (c.standsInFor !== undefined && typeof c.standsInFor !== 'string') throw new Error(`cycle "${c.id}" standsInFor must name a cycle`);
		out.push({
			id: c.id,
			title: c.title,
			routines: [...(c.routines as string[])],
			target: c.target,
			...(c.standsInFor !== undefined ? { standsInFor: c.standsInFor as string } : {})
		});
	}
	for (const c of out)
		if (c.standsInFor !== undefined && (c.standsInFor === c.id || !out.some((x) => x.id === c.standsInFor)))
			throw new Error(`cycle "${c.id}" stands in for a cycle the plan doesn't have: "${c.standsInFor}"`);
	return out;
}

/** The only way a plan enters the domain — parse, don't validate: rebuilt field by field, and anything the fields can't say about each other is refused with a sentence. No legacy readers: shipped programmes are rewritten on boot. */
export function parsePlan(raw: unknown): Plan {
	const p = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
	if (!isObj(p)) throw new Error('a plan is an object with id, name, routines, routineInfo and cycles');
	if (!p.id || !p.name || !p.routines || !p.routineInfo || !p.cycles)
		throw new Error('needs id, name, routines, routineInfo, cycles');
	if (typeof p.id !== 'string' || typeof p.name !== 'string') throw new Error('id and name must be strings');
	if (p.description !== undefined && typeof p.description !== 'string') throw new Error('description must be a string');
	if (p.cue !== undefined && typeof p.cue !== 'string') throw new Error('cue must be a string');
	if (p.rest !== undefined && !positive(p.rest)) throw new Error('rest must be a positive number of seconds');
	const warmup = stepList(p.warmup, 'warmup');
	const cooldown = stepList(p.cooldown, 'cooldown');
	if (!isObj(p.routines) || !Object.keys(p.routines).length) throw new Error('routines must be a non-empty object');
	const keys = Object.keys(p.routines);
	const routineInfo = parseRoutineInfo(p.routineInfo, keys);
	const cycles = parseCycles(p.cycles, keys);
	const routines: Record<string, Exercise[]> = {};
	for (const [r, list] of Object.entries(p.routines)) {
		if (!Array.isArray(list) || !list.length) throw new Error(`routine "${r}" needs a non-empty exercise list`);
		routines[r] = list.map((e) => parseExercise(e, r));
		const discipline = routineInfo[r].discipline;
		if (discipline === 'mobility' && routines[r].some((ex) => ex.kind !== 'hold'))
			throw new Error(`routine "${r}" is mobility: every exercise must be a hold`);
		const runs = routines[r].filter((ex) => ex.kind === 'run').length;
		if (discipline === 'run' && runs !== 1) throw new Error(`routine "${r}" is a run: it needs exactly one run exercise`);
		if (discipline !== 'run' && runs) throw new Error(`routine "${r}" has a run in it but is not a run`);
	}
	return {
		id: p.id,
		name: p.name,
		schedule: typeof p.schedule === 'string' ? p.schedule : '',
		...(p.description !== undefined ? { description: p.description as string } : {}),
		cycles,
		routines,
		routineInfo,
		...(p.rest !== undefined ? { rest: p.rest as number } : {}),
		...(warmup ? { warmup } : {}),
		...(cooldown ? { cooldown } : {}),
		...(p.cue !== undefined ? { cue: p.cue as string } : {})
	};
}
