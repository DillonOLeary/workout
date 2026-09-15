import type { Discipline } from './plan';

/**
 * What a person can tell the app about themselves — two menus, nothing
 * free-text, because the app cannot act on a sentence. Each pick has one
 * exact effect on the queue (projections.queue):
 *
 *   an intent    weights a discipline UP — one more session of shortfall
 *   equipment    rules a discipline OUT — a lift with no gym is not offered
 *
 * One intent names no discipline: "just show up more" puts the SHORTER owed
 * session ahead of the staler one — the easiest thing to say yes to, first.
 *
 * Anything that cannot name its effect does not belong here. The picks are
 * recorded as a PreferencesSet event (events.ts) and folded by
 * `preferences(events)`; untouched, the app behaves exactly as it did.
 */
export type Intent = 'get-stronger' | 'move-better' | 'run-better' | 'show-up-more' | 'calm-down';
export type Equipment = 'gym' | 'mat' | 'shoes' | 'bands';
export type Preferences = { intents: Intent[]; equipment: Equipment[] };

/** The whole mapping, no inference. show-up-more raises no cycle: it reorders what you owe (`shorterFirst`). */
export const INTENTS: readonly { id: Intent; label: string; up: Discipline[] }[] = [
	{ id: 'get-stronger', label: 'Get stronger', up: ['lift', 'bodyweight'] },
	{ id: 'move-better', label: 'Move better', up: ['yoga', 'mobility'] },
	{ id: 'run-better', label: 'Run better', up: ['run', 'lift'] },
	{ id: 'calm-down', label: 'Calm down', up: ['yoga'] },
	{ id: 'show-up-more', label: 'Just show up more', up: [] }
];
export const EQUIPMENT: readonly { id: Equipment; label: string; needed: string }[] = [
	{ id: 'gym', label: 'A gym', needed: 'a gym' },
	{ id: 'mat', label: 'A mat', needed: 'a mat' },
	{ id: 'shoes', label: 'Running shoes', needed: 'running shoes' },
	{ id: 'bands', label: 'Bands', needed: 'bands' }
];
/** Pick up to three: the fourth tap is refused. Three is already a lot to weight. */
export const MAX_INTENTS = 3;

/** What each discipline needs before it can be offered. A floor needs nothing. */
export const NEEDS: Record<Discipline, Equipment[]> = {
	lift: ['gym'],
	yoga: ['mat'],
	bodyweight: [],
	mobility: [],
	run: ['shoes']
};

/** Untouched: nothing weighted, everything available. */
export const DEFAULT_PREFERENCES: Preferences = { intents: [], equipment: ['gym', 'mat', 'shoes', 'bands'] };

export const isIntent = (v: unknown): v is Intent => INTENTS.some((i) => i.id === v);
export const isEquipment = (v: unknown): v is Equipment => EQUIPMENT.some((e) => e.id === v);

/**
 * Picks from the outside — a form's JSON. Parse, don't validate: the edge
 * checks the shape (two lists of names from the menus), the decider judges
 * the meaning (one to three intents, each once). A name that is not on the
 * menu fails the whole snapshot rather than being dropped — a tampered form
 * is refused, never quietly narrowed.
 */
export function parsePreferences(intents: unknown, equipment: unknown): Preferences | null {
	if (!Array.isArray(intents) || !Array.isArray(equipment)) return null;
	if (!intents.every(isIntent) || !equipment.every(isEquipment)) return null;
	return { intents: [...intents], equipment: [...equipment] };
}

/** The disciplines the intents weight up. */
export function weightedUp(prefs: Preferences): Set<Discipline> {
	const out = new Set<Discipline>();
	for (const i of INTENTS) if (prefs.intents.includes(i.id)) for (const d of i.up) out.add(d);
	return out;
}

/** "Just show up more": among what is owed, minutes outrank staleness. */
export const shorterFirst = (prefs: Preferences): boolean => prefs.intents.includes('show-up-more');

/** What this discipline needs that the person hasn't got — empty when it can be offered. */
export const missingFor = (discipline: Discipline, prefs: Preferences): Equipment[] =>
	NEEDS[discipline].filter((e) => !prefs.equipment.includes(e));

/** True when two snapshots say the same thing, whatever order the picks came in. */
export const samePreferences = (a: Preferences, b: Preferences): boolean =>
	a.intents.length === b.intents.length &&
	a.intents.every((i) => b.intents.includes(i)) &&
	a.equipment.length === b.equipment.length &&
	a.equipment.every((e) => b.equipment.includes(e));
