import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, missingFor, parsePreferences, samePreferences, shorterFirst, weightedUp } from './preferences';

describe('preferences — two menus, one exact effect each', () => {
	it('parses picks from the menus, and refuses a snapshot with a name that is not on them', () => {
		expect(parsePreferences(['move-better', 'calm-down'], ['mat'])).toEqual({ intents: ['move-better', 'calm-down'], equipment: ['mat'] });
		expect(parsePreferences([], [])).toEqual({ intents: [], equipment: [] }); // shape only — the decider says one to three
		expect(parsePreferences(['be-happy'], ['mat'])).toBeNull(); // refused, not narrowed
		expect(parsePreferences(['move-better'], ['pool'])).toBeNull();
		expect(parsePreferences('move-better', ['mat'])).toBeNull();
		expect(parsePreferences(['move-better'], null)).toBeNull();
	});
	it('says what an intent weights up and what a discipline is missing', () => {
		expect([...weightedUp({ intents: ['run-better'], equipment: [] })]).toEqual(['run', 'lift']);
		expect([...weightedUp({ intents: ['show-up-more'], equipment: [] })]).toEqual([]); // names no discipline —
		expect(shorterFirst({ intents: ['show-up-more'], equipment: [] })).toBe(true); // it reorders what you owe
		expect(shorterFirst(DEFAULT_PREFERENCES)).toBe(false);
		expect(missingFor('lift', DEFAULT_PREFERENCES)).toEqual([]);
		expect(missingFor('lift', { intents: [], equipment: ['mat'] })).toEqual(['gym']);
		expect(missingFor('bodyweight', { intents: [], equipment: [] })).toEqual([]); // a floor needs nothing
	});
	it('reads two snapshots as the same whatever order the picks came in', () => {
		expect(samePreferences({ intents: ['move-better', 'calm-down'], equipment: ['gym', 'mat'] }, { intents: ['calm-down', 'move-better'], equipment: ['mat', 'gym'] })).toBe(true);
		expect(samePreferences({ intents: ['move-better'], equipment: ['gym'] }, { intents: ['move-better'], equipment: [] })).toBe(false);
	});
});
