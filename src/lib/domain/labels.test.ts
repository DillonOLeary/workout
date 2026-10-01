import { describe, expect, it } from 'vitest';
import {
	cellLegend, dealCaption, disciplineLetter, itemDose, paceLine, whenLabel,
	ceilingHint, disciplineLabel, disciplineNoun, doseLabel, durationLabel, fmtDate, fmtShort,
	goalHint, goalLabel, loadHint, loadLabel, loadShort, plannedValue, practiceLabel, prepLabel, rateLabel, monthLine, receiptLine, sessionNoun,
	setValue, setsLine, sessionSummary, spanLabel, standInLine, weekChangeLine, weekHead, weekLine
} from './labels';
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

const goblet: Exercise = { name: 'Goblet Squat', equip: '', tag: '', kind: 'load', sets: 3, lo: 6, hi: 12, progress: { of: 'size', start: 35, inc: 5, rack: 'dumbbell' } };
const rdl: Exercise = { ...goblet, name: 'Romanian Deadlift', progress: { of: 'size', start: 40, inc: 5, rack: 'dumbbell', each: true } };
const press: Exercise = { name: 'Chest Press', equip: '', tag: '', kind: 'load', sets: 3, lo: 8, hi: 12, progress: { of: 'size', start: 45, inc: 5 } };
const lunge: Exercise = { ...rdl, name: 'DB Reverse Lunge', side: 'reps' };
const plank: Exercise = { name: 'Long-Lever Plank', equip: '', tag: '', kind: 'hold', sets: 3, lo: 10, hi: 20, progress: { of: 'time', inc: 5 } };
const copenhagen: Exercise = { name: 'Copenhagen Plank', equip: '', tag: '', kind: 'reps', sets: 2, lo: 5, hi: 15, progress: { of: 'count' }, side: 'sets' };
const stretch: Exercise = { name: 'Calf stretch', equip: 'Mat', tag: '', kind: 'hold', sets: 2, lo: 45, hi: 45, progress: { of: 'none' }, side: 'sets' };
const pushup: Exercise = { name: 'Push-up', equip: '', tag: '', kind: 'reps', sets: 2, lo: 8, hi: 15, progress: { of: 'variant', ladder: ['Incline push-up', 'Push-up'] } };
const runEx: Exercise = { name: 'Easy run', equip: 'Shoes', tag: '', kind: 'run', sets: 1, lo: 30, hi: 30, progress: { of: 'none' } };
const run: Exercise = { name: 'Easy run', equip: '', tag: '', kind: 'run', sets: 1, lo: 30, hi: 30, progress: { of: 'none' } };

describe('one number', () => {
	it('never shows a bare number for a two-dumbbell lift', () => {
		expect(loadLabel(35, goblet)).toBe('35 lb');
		expect(loadLabel(40, rdl)).toBe('40 lb each hand');
		expect(loadLabel(40, plank)).toBe('');
		expect(loadShort(40, rdl)).toBe('40 /hand');
		expect(loadShort(35, goblet)).toBe('35 lb');
	});
	it('reads dates two ways', () => {
		expect(fmtDate('2026-08-23T18:00:00Z')).toMatch(/^Sun, Aug 23$/);
		expect(fmtShort('2026-08-23T18:00:00Z')).toBe('Aug 23');
	});
});

describe('disciplines, in words', () => {
	it('names each one for a chip and counts it in a sentence', () => {
		expect(disciplineLabel('lift')).toBe('Lift');
		expect(disciplineLabel('mobility')).toBe('Stretch');
		expect(disciplineNoun('lift', 1)).toBe('lift');
		expect(disciplineNoun('lift', 1.3)).toBe('lifts');
		expect(disciplineNoun('yoga', 2)).toBe('yoga');
		expect(disciplineNoun('run', 1.04)).toBe('run');
		expect(disciplineNoun('bodyweight', 3)).toBe('floor sessions');
	});
	it('says the week, the cadence and what stands in', () => {
		expect(weekLine(1, 3)).toBe('1 of 3 this week');
		expect(standInLine('Hinge & Haul', 3)).toBe('Stands in for Hinge & Haul · counts toward 3 lifts a week');
		expect(standInLine('Get Low', 1)).toBe('Stands in for Get Low · counts toward 1 lift a week');
	});
});

describe('rates — the running average in words', () => {
	it('prints an average at the precision it deserves', () => {
		expect(rateLabel(2.25)).toBe('2.3');
		expect(rateLabel(3)).toBe('3');
		expect(rateLabel(0)).toBe('0');
		expect(rateLabel(67.5)).toBe('67.5');
	});
	it('says the window a strip covers', () => {
		expect(spanLabel('2026-07-20T12:00:00Z', '2026-08-23T12:00:00Z')).toBe('Jul 20 – Aug 23');
	});
	it('folds a session to one line for a collapsed card', () => {
		expect(sessionSummary({ sets: 20, minutes: 48 })).toBe('20 sets · 48 min');
		expect(sessionSummary({ sets: 1, minutes: 0 })).toBe('1 set');
		expect(sessionSummary({ sets: 9, holds: true, minutes: 11 })).toBe('9 holds · 11 min');
		expect(sessionSummary({ sets: 0, minutes: 32 })).toBe('32 min');
		expect(sessionSummary({ sets: 0, minutes: 0 })).toBe('nothing logged');
	});
	it('names the week’s changes and its head', () => {
		const name = (id: string) => (id === 'ab-fullbody-v1' ? 'Open to Work' : id);
		expect(weekChangeLine({ programme: 'ab-fullbody-v1', blocks: [{ block: 'yoga', on: true }, { block: 'mob', on: true }, { block: 'run', on: true }] }, name)).toBe(
			'switched to Open to Work · yoga, stretch, run on'
		);
		expect(weekChangeLine({ blocks: [{ block: 'run', on: false }] }, name)).toBe('run off');
		expect(weekChangeLine({ blocks: [{ block: 'lift', on: false }] }, name)).toBe('lift off');
		expect(weekChangeLine({ blocks: [{ block: 'run', on: true }, { block: 'lift', on: true }] }, name)).toBe('run, lift on');
		expect(weekChangeLine({ blocks: [], goals: [{ practice: 'lift', sessions: 4 }, { practice: 'run', sessions: 3, minutes: 35 }] }, name)).toBe('lift 4 a week · run 3 a week · 35 min');
		expect(weekChangeLine({ blocks: [{ block: 'yoga', on: false }], goals: [{ practice: 'mob', sessions: 5 }] }, name)).toBe('yoga off · stretch 5 a week');
		expect(goalLabel({ sessions: 2 })).toBe('2 a week');
		expect(goalHint(3, 3)).toBe('The programme’s cadence. Change it and Today follows your number.');
		expect(goalHint(3, 4)).toBe('The programme says 3 a week — your goal is 4.');
		expect(['lift', 'yoga', 'mob', 'run'].map((p) => practiceLabel(p as never))).toEqual(['lift', 'yoga', 'stretch', 'run']);
		expect(weekChangeLine({ programme: 'her-12-v1', blocks: [{ block: 'yoga', on: false }, { block: 'run', on: true }] }, name)).toBe('switched to her-12-v1 · run on · yoga off');
		expect(weekHead(11, 340)).toBe('11 sessions a week · about 5.5 h');
		expect(weekHead(2, 80)).toBe('2 sessions a week · about 80 min');
	});
});

describe('the plan’s numbers', () => {
	it('phrases the dose the way the plan row does', () => {
		expect(doseLabel(goblet)).toBe('3 × 6–12');
		expect(doseLabel(plank)).toBe('3 × 10–20s');
		expect(doseLabel(copenhagen)).toBe('2 × 5–15 · L/R');
		expect(doseLabel(lunge)).toBe('3 × 6–12 · per side');
		expect(doseLabel(stretch)).toBe('2 × 45s · L/R');
		expect(doseLabel(run)).toBe('30 min');
	});
	it('phrases a stretch’s hold, a prep item, and a countdown', () => {
		expect(prepLabel('5 min easy bike')).toBe('5 min easy bike');
		expect(prepLabel({ name: 'Easy jog', minutes: 3 })).toBe('Easy jog · 3 min');
		expect(prepLabel({ name: 'Calf stretch', equip: 'Mat', tag: '', kind: 'hold', sets: 2, lo: 45, hi: 45, progress: { of: 'none' }, side: 'sets' })).toBe('Calf stretch · 45s each');
		expect(prepLabel({ name: 'Doorway chest stretch', equip: 'Mat', tag: '', kind: 'hold', sets: 1, lo: 60, hi: 60, progress: { of: 'none' } })).toBe('Doorway chest stretch · 60s');
		expect(prepLabel({ name: 'Carioca', seconds: 30, each: true })).toBe('Carioca · 30s each');
		expect(prepLabel({ name: 'A-skips', seconds: 30 })).toBe('A-skips · 30s');
		expect(prepLabel({ name: 'Sun Salutation A', reps: 3 })).toBe('Sun Salutation A × 3');
		expect(prepLabel({ name: 'Leg swings', reps: 10, each: true })).toBe('Leg swings × 10 each');
		expect([30, 60, 180, 90].map(durationLabel)).toEqual(['30s', '1 min', '3 min', '90s']);
	});
	it('closes the receipt in one line', () => {
		expect(receiptLine(41, true, true)).toBe('41 min · warm-up and cooldown done.');
		expect(receiptLine(38, true, false)).toBe('38 min · warm-up done.');
		expect(receiptLine(12, false, false)).toBe('12 min.');
	});
});

describe('a set', () => {
	it('fills a tile or a table cell', () => {
		expect(setValue(press, 45, 12)).toBe('45 lb × 12');
		expect(setValue(rdl, 50, 10)).toBe('50 /hand × 10');
		expect(setValue(plank, 0, 30)).toBe('30s');
		expect(setValue(copenhagen, 0, 12)).toBe('12 reps');
		expect(setValue(run, 0, 32)).toBe('32 min');
		expect(setValue(press, 45, null)).toBe('45 lb × —');
		expect(setValue(copenhagen, 0, null)).toBe('—');
	});
	it('describes a set that hasn’t happened yet', () => {
		expect(plannedValue(goblet, 35)).toBe('35 lb × 6–12');
		expect(plannedValue(rdl, 40)).toBe('40 /hand × 6–12');
		expect(plannedValue(plank, 0)).toBe('10–20s');
		expect(plannedValue(copenhagen, 0)).toBe('5–15');
		expect(plannedValue(stretch, 0)).toBe('45s');
		expect(plannedValue(run, 0)).toBe('30 min');
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
		expect(at(hist([{ daysAgo: 2, sets: [hold(45, 45), hold(45, 45)] }]), stretch)).toBeNull();
		expect(ceilingHint(plank)).toBe('At the ceiling (20s) — make it harder, not longer.');
	});
	it('says when a ladder moved, and when it has run out', () => {
		expect(at(hist([{ daysAgo: 2, sets: [reps(15), reps(15)] }]), pushup)).toBe('Up a rung — Push-up from here, reps from 8.');
		expect(at(hist([{ daysAgo: 2, sets: [reps(15), reps(15)] }, { daysAgo: 6, sets: [reps(15), reps(15)] }]), pushup)).toBe('Top of the ladder (Push-up) — make it harder.');
		expect(at(hist([{ daysAgo: 2, sets: [reps(12), reps(12)] }]), pushup)).toBeNull();
	});
});

describe('sessionNoun — what Finish finishes', () => {
	it('is a workout for the lifts and the floor, a practice, a stretch, a run', () => {
		expect((['lift', 'bodyweight', 'yoga', 'mobility', 'run'] as const).map(sessionNoun)).toEqual(['workout', 'workout', 'practice', 'stretch', 'run']);
	});
});

describe('monthLine — a month of the Ledger, folded to one line', () => {
	it('names the month, counts the sessions by discipline, and adds the year only when it isn’t this one', () => {
		const now = Date.parse('2026-09-19T12:00:00');
		const counts = [{ discipline: 'lift' as const, n: 5 }, { discipline: 'yoga' as const, n: 0 }, { discipline: 'run' as const, n: 3 }, { discipline: 'mobility' as const, n: 3 }];
		expect(monthLine('2026-09-02T10:00:00', 11, counts, now)).toBe('SEPTEMBER · 11 sessions · 5 lift · 3 run · 3 stretch');
		expect(monthLine('2025-12-02T10:00:00', 1, [{ discipline: 'lift', n: 1 }], now)).toBe('DECEMBER 2025 · 1 session · 1 lift');
	});
});

describe('v3 — the cell, the card, the pace, the when', () => {
	it('gives each discipline a letter and a legend', () => {
		expect((['lift', 'yoga', 'mobility', 'run', 'bodyweight'] as const).map(disciplineLetter).join('')).toBe('LYSRF');
		expect(cellLegend(['lift', 'yoga', 'mobility', 'run', 'bodyweight'])).toBe('L lift · Y yoga · S stretch · R run · F floor · today outlined');
		expect(cellLegend(['lift'])).toBe('L lift · today outlined');
	});
	it('captions the card by what is owed, and the floor by what it counts as', () => {
		expect(dealCaption({ due: true }, 'Lift', 1, 3)).toBe('Due · Lift · 1 of 3 this week');
		expect(dealCaption({ due: false }, 'Run', 3, 3)).toBe('Extra · Run · 3 of 3 this week');
		expect(dealCaption({ due: false, standsInFor: 'lift' }, 'Floor', 0, 0)).toBe('Floor · counts as the lift');
	});
	it('says the pace of the week in one line', () => {
		expect(paceLine(6, 9, ['lift', 'run'])).toBe('6 of 9 this week — lift, run still owed.');
		expect(paceLine(9, 9, [])).toBe('9 of 9 this week — all square.');
	});
	it('says when, relative until it stops being useful', () => {
		const now = Date.parse('2026-09-22T12:00:00');
		expect(whenLabel('2026-09-22T07:00:00', now)).toBe('today');
		expect(whenLabel('2026-09-21T23:00:00', now)).toBe('yesterday');
		expect(whenLabel('2026-09-16T07:00:00', now)).toBe('6 days ago');
		expect(whenLabel('2026-08-23T07:00:00', now)).toBe('Aug 23');
	});
	it('doses an item on the card with the load the rule queued', () => {
		expect(itemDose(goblet, 45)).toBe('45 lb · 3 × 6–12');
		expect(itemDose(rdl, 40)).toBe('40 /hand · 3 × 6–12');
		expect(itemDose(plank, 0)).toBe('3 × 10–20s');
		expect(itemDose(run, 0)).toBe('30 min');
	});
});
