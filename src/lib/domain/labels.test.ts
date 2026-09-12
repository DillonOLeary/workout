import { describe, expect, it } from 'vitest';
import { ceilingHint, countLabel, doseLabel, durationLabel, fmtDate, fmtShort, holdDose, holdLine, loadHint, loadLabel, loadShort, paceLabel, paceSentence, plannedValue, prepLabel, rangeLabel, rateLabel, receiptLine, setValue, setsLine, sessionSummary, spanLabel, stepLabel, stretchDose, trendTally, unitLabel, unitOf } from './labels';
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
const stretch: Exercise = { name: 'Calf stretch', equip: 'Mat', tag: '', kind: 'hold', sets: 2, lo: 45, hi: 45, inc: 0, side: 'sets' };

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

describe('rates — the running average in words', () => {
	it('prints an average at the precision it deserves', () => {
		expect(rateLabel(2.25)).toBe('2.3');
		expect(rateLabel(3)).toBe('3');
		expect(rateLabel(0)).toBe('0');
		expect(rateLabel(67.5)).toBe('67.5');
	});
	it('says which way it is going, and when there is nothing to compare to', () => {
		expect(paceLabel(2.3, 1.5)).toBe('↑ from 1.5');
		expect(paceLabel(1, 3)).toBe('↓ from 3');
		expect(paceLabel(2, 2)).toBe('same as before');
		// a rounding-level difference is not a direction
		expect(paceLabel(2.01, 2)).toBe('same as before');
		expect(paceLabel(1.5, 0)).toBe('nothing before that');
		expect(paceLabel(0, 0)).toBe('nothing logged');
	});
	it('says the window a strip covers', () => {
		expect(spanLabel('2026-07-20T12:00:00Z', '2026-08-23T12:00:00Z')).toBe('Jul 20 – Aug 23');
	});
	it('answers "am I doing enough" in one line, against the plan', () => {
		expect(paceSentence({ weeks: 4, lifts: 1.3, liftGoal: 3, runMinutes: 36.4, runGoal: 90 })).toBe(
			'1.3 lifts and 36 run min a week — the plan asks 3 and 90'
		);
		// one lift a week is a lift, not lifts
		expect(paceSentence({ weeks: 4, lifts: 1, liftGoal: 3, runMinutes: 0, runGoal: 90 })).toBe(
			'1 lift and 0 run min a week — the plan asks 3 and 90'
		);
		// a plan with no running says nothing about running
		expect(paceSentence({ weeks: 4, lifts: 2.5, liftGoal: 2, runMinutes: null, runGoal: null })).toBe(
			'2.5 lifts a week — the plan asks 2'
		);
		expect(paceSentence({ weeks: 4, lifts: 0, liftGoal: 3, runMinutes: 0, runGoal: 90 })).toBe('Nothing logged in the last 4 weeks');
		expect(paceSentence({ weeks: 4, lifts: 0, liftGoal: 2, runMinutes: null, runGoal: null })).toBe('Nothing logged in the last 4 weeks');
	});
	it('folds a session to one line for a collapsed card', () => {
		expect(sessionSummary({ exercises: 4, sets: 12, minutes: 0 })).toBe('4 exercises · 12 sets');
		expect(sessionSummary({ exercises: 1, sets: 1, minutes: 0 })).toBe('1 exercise · 1 set');
		expect(sessionSummary({ exercises: 1, sets: 3, minutes: 25 })).toBe('1 exercise · 3 sets · 25 min');
		expect(sessionSummary({ exercises: 0, sets: 0, minutes: 0 })).toBe('nothing logged');
	});
	it('tallies the trend list by what the rule will do, zeroes left out', () => {
		expect(trendTally(['up', 'flat', 'up', 'down', 'flat', 'flat'])).toBe('2 going up · 1 backing off · 3 flat');
		expect(trendTally(['warn', 'start'])).toBe('1 warned · 1 not started');
		expect(trendTally([])).toBe('');
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
		expect(doseLabel(stretch)).toBe('2 × 45s · L/R');
	});
	it('phrases a stretch’s hold, a prep item, and a countdown', () => {
		expect(holdLine(stretch, 2)).toBe('HOLD 2 OF 2 · 45S EACH SIDE');
		expect(holdLine({ ...stretch, sets: 1, side: undefined }, 1)).toBe('HOLD 1 OF 1 · 45S');
		expect(holdDose(stretch)).toBe('45s each side');
		expect(holdDose({ ...stretch, sets: 1, side: undefined })).toBe('45s');
		expect(prepLabel('5 min easy bike')).toBe('5 min easy bike');
		expect(prepLabel({ name: 'Easy jog', minutes: 3 })).toBe('Easy jog · 3 min');
		expect(prepLabel({ name: 'Carioca', seconds: 30, each: true })).toBe('Carioca · 30s each');
		expect(prepLabel({ name: 'A-skips', seconds: 30 })).toBe('A-skips · 30s');
		expect([30, 60, 180, 90].map(durationLabel)).toEqual(['30s', '1 min', '3 min', '90s']);
		expect(stretchDose(7, 5, 9)).toBe('7 min · 5 areas · 9 holds');
		expect(stretchDose(1, 1, 1)).toBe('1 min · 1 area · 1 hold');
	});
	it('closes the receipt in one line', () => {
		expect(receiptLine(41, true, true)).toBe('41 min · warm-up and cooldown done.');
		expect(receiptLine(38, true, false)).toBe('38 min · warm-up done.');
		expect(receiptLine(12, false, false)).toBe('12 min.');
	});
	it('says what a level-up costs', () => {
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
		expect(plannedValue(stretch, 0)).toBe('45s');
	});
	it('says last time’s count in its own unit', () => {
		expect(countLabel(load(35, 12))).toBe('12');
		expect(countLabel(hold(15, 15))).toBe('15s');
		expect(countLabel(reps(8))).toBe('8');
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
