import { describe, expect, it } from 'vitest';
import { ceilingHint, doseLabel, fmtDate, fmtShort, loadHint, loadLabel, loadShort, plannedValue, rangeLabel, setValue, setsLabel, setsLine, stepLabel, unitLabel, unitOf } from './labels';
import type { Measure } from './measure';
import type { Exercise } from './plan';
import { suggest, type History } from './progression';

const DAY = 86400000;
const NOW = Date.parse('2026-08-23T18:00:00Z');
const load = (w: number, r: number): Measure => ({ of: 'load', load: w, reps: r });
const hold = (s: number, target?: number, weight?: number): Measure => ({ of: 'hold', seconds: s, ...(target !== undefined ? { target } : {}), ...(weight !== undefined ? { load: weight } : {}) });
const reps = (r: number): Measure => ({ of: 'reps', reps: r });
const hist = (entries: { daysAgo: number; sets: Measure[] }[]): History =>
	entries.map((e) => {
		const at = new Date(NOW - e.daysAgo * DAY).toISOString();
		return { at, dateLabel: fmtDate(at), sets: e.sets };
	});

const goblet: Exercise = { name: 'Goblet Squat', equip: '', tag: '', kind: 'load', sets: 3, lo: 6, hi: 12, start: 35, inc: 5, rack: 'dumbbell' };
const rdl: Exercise = { ...goblet, name: 'Romanian Deadlift', start: 40, each: true };
const press: Exercise = { name: 'Chest Press', equip: '', tag: '', kind: 'load', sets: 3, lo: 8, hi: 12, start: 45, inc: 5 };
const lunge: Exercise = { ...goblet, name: 'DB Reverse Lunge', each: true, side: 'reps' };
const plank: Exercise = { name: 'Long-Lever Plank', equip: '', tag: '', kind: 'hold', sets: 3, lo: 10, hi: 20, inc: 5 };
const copenhagen: Exercise = { name: 'Copenhagen Plank', equip: '', tag: '', kind: 'reps', sets: 2, lo: 5, hi: 15, side: 'sets' };

describe('one number', () => {
	it('never shows a bare number for a two-dumbbell lift', () => {
		expect(loadLabel(35, goblet)).toBe('35 lb');
		expect(loadLabel(40, rdl)).toBe('40 lb each hand');
		expect(loadLabel(40, plank)).toBe('');
		expect(loadShort(40, rdl)).toBe('40 /hand');
		expect(loadShort(35, goblet)).toBe('35 lb');
	});
	it('speaks each exercise’s own unit', () => {
		expect(unitLabel(35, goblet)).toBe('35 lb');
		expect(unitLabel(40, rdl)).toBe('40 lb each hand');
		expect(unitLabel(15, plank)).toBe('15s');
		expect(unitLabel(8, copenhagen)).toBe('8 reps');
		expect([goblet, plank, copenhagen].map(unitOf)).toEqual(['lb', 's', '']);
	});
	it('reads dates two ways', () => {
		expect(fmtDate('2026-08-23T18:00:00Z')).toMatch(/^Sun, Aug 23$/);
		expect(fmtShort('2026-08-23T18:00:00Z')).toBe('Aug 23');
	});
});

describe('the plan’s numbers', () => {
	it('phrases the range with its side rule', () => {
		expect(rangeLabel(goblet)).toBe('6–12 reps');
		expect(rangeLabel(lunge)).toBe('6–12 reps per side');
		expect(rangeLabel(plank)).toBe('10–20 sec');
	});
	it('phrases the dose the way the plan row does', () => {
		expect(doseLabel(goblet)).toBe('3 × 6–12');
		expect(doseLabel(plank)).toBe('3 × 10–20s');
		expect(doseLabel(copenhagen)).toBe('2 × 5–15 · L/R');
		expect(doseLabel(lunge)).toBe('3 × 6–12 · per side');
	});
	it('says what a set counts and what a level-up costs', () => {
		expect(setsLabel(goblet)).toBe('3 sets');
		expect(setsLabel(copenhagen)).toBe('2 sets, one per side');
		expect(stepLabel(goblet)).toBe('next dumbbell up');
		expect(stepLabel(press)).toBe('+5 lb');
		expect(stepLabel(plank)).toBe('+5s');
		expect(stepLabel(copenhagen)).toBe('+1 rep');
	});
});

describe('a set', () => {
	it('fills a tile or a table cell', () => {
		expect(setValue(press, 45, 12)).toBe('45 lb × 12');
		expect(setValue(rdl, 50, 10)).toBe('50 /hand × 10');
		expect(setValue(plank, 0, 30)).toBe('30s');
		expect(setValue(copenhagen, 0, 12)).toBe('12 reps');
		expect(setValue(press, 45, null)).toBe('45 lb × —');
		expect(setValue(copenhagen, 0, null)).toBe('—');
	});
	it('describes a set that hasn’t happened yet', () => {
		expect(plannedValue(goblet, 35)).toBe('35 lb × 6–12');
		expect(plannedValue(rdl, 40)).toBe('40 /hand × 6–12');
		expect(plannedValue(plank, 0)).toBe('10–20s');
		expect(plannedValue(copenhagen, 0)).toBe('5–15');
	});
	it('puts a whole entry on one line', () => {
		expect(setsLine([load(35, 12), load(35, 9), load(35, 5)], goblet)).toBe('35 lb · 12 · 9 · 5');
		expect(setsLine([load(40, 12), load(40, 12)], rdl)).toBe('40 lb each hand · 12 · 12');
		expect(setsLine([load(45, 5), load(35, 12)], goblet)).toBe('45×5 · 35×12');
		expect(setsLine([load(45, 5), load(35, 12)], rdl)).toBe('45×5 · 35×12 each hand');
		expect(setsLine([hold(20, 20), hold(19, 20)], plank)).toBe('20s · 19s');
		expect(setsLine([reps(8), reps(8)], copenhagen)).toBe('8 L · 8 R');
	});
	it('still reads a retired exercise from its measures alone', () => {
		expect(setsLine([hold(45, undefined, 14), hold(45, undefined, 14)])).toBe('14 lb · 45s · 45s');
		expect(setsLine([hold(60), hold(60)])).toBe('60s · 60s');
		expect(setsLine([load(65, 10), load(65, 10)])).toBe('65 lb · 10 · 10');
		expect(setsLine([reps(3), reps(3)])).toBe('3 · 3');
	});
});

describe('the rule, explained', () => {
	const at = (h: History, ex: Exercise) => loadHint(suggest(h, ex, NOW), ex);
	it('says nothing the first time, or when nothing moves', () => {
		expect(at([], goblet)).toBeNull();
		expect(at(hist([{ daysAgo: 2, sets: [load(35, 10), load(35, 9), load(35, 8)] }]), goblet)).toBeNull();
	});
	it('says which set moved and where the rest stay', () => {
		expect(at(hist([{ daysAgo: 3, sets: [load(35, 12), load(35, 9), load(35, 5)] }]), goblet)).toBe('Set 1 goes up to 40 lb — sets 2–3 stay at 35.');
		expect(at(hist([{ daysAgo: 2, sets: [load(40, 12), load(40, 12), load(40, 12)] }]), rdl)).toBe('Every set goes up to 45 lb each hand.');
		expect(at(hist([{ daysAgo: 2, sets: [load(45, 12), load(45, 12), load(45, 10)] }]), press)).toBe('Sets 1–2 go up to 50 lb — set 3 stays at 45.');
	});
	it('warns after a miss, explains an adjustment and a re-entry', () => {
		expect(at(hist([{ daysAgo: 2, sets: [load(35, 8), load(35, 8), load(35, 5)] }]), goblet)).toBe('Set 3 missed last time — miss again and it backs off a size.');
		expect(at(hist([
			{ daysAgo: 3, sets: [load(35, 8), load(35, 8), load(35, 5)] },
			{ daysAgo: 10, sets: [load(35, 8), load(35, 8), load(35, 4)] }
		]), goblet)).toBe('Set 3 back one size after 2 misses — 30 lb.');
		expect(at(hist([{ daysAgo: 15, sets: [load(45, 10), load(45, 10), load(45, 10)] }]), goblet)).toBe('Re-entry after 15 days — one size down, build it back.');
	});
	it('gives a hold one line only: its ceiling', () => {
		expect(at(hist([{ daysAgo: 2, sets: [hold(20, 20), hold(20, 20), hold(20, 20)] }]), plank)).toBe('At the ceiling (20s) — make it harder, not longer.');
		expect(at(hist([{ daysAgo: 2, sets: [hold(10, 10), hold(10, 10), hold(10, 10)] }]), plank)).toBeNull();
		expect(at(hist([{ daysAgo: 2, sets: [reps(15), reps(15)] }]), copenhagen)).toBeNull();
		expect(ceilingHint(plank)).toBe('At the ceiling (20s) — make it harder, not longer.');
	});
});
