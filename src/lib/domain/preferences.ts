import type { Discipline } from './plan';

/**
 * What a person can tell the app, from two menus: an intent weights a discipline up, equipment rules one out,
 * and "just show up more" puts the shorter owed session first. Recorded as PreferencesSet, folded by `preferences(events)`.
 */

/** What you're after, from the menu. */
export type Intent = 'get-stronger' | 'move-better' | 'run-better' | 'show-up-more' | 'calm-down';
/** What you have, from the menu. */
export type Equipment = 'gym' | 'mat' | 'shoes' | 'bands';
/** One snapshot of both picks. */
export type Preferences = { intents: Intent[]; equipment: Equipment[] };

/** The intents menu and what each weights up; show-up-more raises nothing, it reorders (`shorterFirst`). */
export const INTENTS: readonly { id: Intent; label: string; up: Discipline[] }[] = [
	{ id: 'get-stronger', label: 'Get stronger', up: ['lift', 'bodyweight'] },
	{ id: 'move-better', label: 'Move better', up: ['yoga', 'mobility'] },
	{ id: 'run-better', label: 'Run better', up: ['run', 'lift'] },
	{ id: 'calm-down', label: 'Calm down', up: ['yoga'] },
	{ id: 'show-up-more', label: 'Just show up more', up: [] }
];
/** The equipment menu, with the words a "needs …" line uses. */
export const EQUIPMENT: readonly { id: Equipment; label: string; needed: string }[] = [
	{ id: 'gym', label: 'A gym', needed: 'a gym' },
	{ id: 'mat', label: 'A mat', needed: 'a mat' },
	{ id: 'shoes', label: 'Running shoes', needed: 'running shoes' },
	{ id: 'bands', label: 'Bands', needed: 'bands' }
];
/** The fourth intent is refused. */
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

/** On the intents menu. */
export const isIntent = (v: unknown): v is Intent => INTENTS.some((i) => i.id === v);
/** On the equipment menu. */
export const isEquipment = (v: unknown): v is Equipment => EQUIPMENT.some((e) => e.id === v);

/** Picks from the outside — a form's JSON: shape only; a name not on a menu fails the whole snapshot. */
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
