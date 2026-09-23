import { describe, expect, it } from 'vitest';
import { currentState, latestSessionOf } from './decider';
import type { StoredEvent } from './events';
import { composePlan, planExercises, progresses } from './plan';
import { BLOCKS, DEFAULT_PROGRAMMES, FLOOR } from './plans';
import { suggest } from './progression';
import {
	activeProgramme, goals, historyFor, monthGrid, nextInCycle, practicesOn, projectSessions, queue, restSeconds, sessionEntries, staleness,
	weekChanges, weekProgress, weekStrip, weekTally
} from './projections';
import { upcastAll } from './upcast';

/**
 * The freeze: a full stream in every stored shape the upcaster reads, folded through every rule at one fixed moment.
 * The committed JSON under __snapshots__/ is the domain's contract for the UI rebuild — a rule that changes fails here first.
 * Meant it? `pnpm test -- -u` rewrites the files and the diff is the review.
 */
process.env.TZ = 'UTC';
const NOW = Date.parse('2026-09-22T12:00:00Z');
const DAY = 86400000;
const at = (daysAgo: number, hour = 7) => new Date(NOW - daysAgo * DAY + (hour - 12) * 3600000).toISOString();

/** the stream as Postgres holds it — old rows first, the current vocabulary after, one session left open at the end */
function fullStream(): StoredEvent[] {
	const out: StoredEvent[] = [];
	const row = (type: string, data: unknown) => out.push({ type, data });
	let n = 0;
	const id = () => `s${String(++n).padStart(3, '0')}`;

	// 1. the first vocabulary: PlanSelected, SessionStarted keyed by `day` with no mode, SetLogged (a hold as unit 's', bodyweight as weight 0), SessionStruck
	row('PlanSelected', { plan: 'ab-fullbody-v1', at: at(60) });
	for (const [days, day, sets] of [
		[58, 'A', [['Goblet Squat', 35, [10, 9, 8]], ['Chest Press', 45, [12, 12, 12]], ['Lat Pulldown', 65, [10, 10, 9]]]],
		[56, 'B', [['KB Deadlift', 53, [12, 12, 12]], ['Shoulder Press', 30, [10, 9, 8]], ['Seated Row', 65, [10, 10, 10]]]],
		[54, 'A', [['Goblet Squat', 35, [12, 10, 8]], ['Chest Press', 50, [8, 8, 8]], ['Lat Pulldown', 65, [12, 10, 9]]]]
	] as const) {
		const session = id();
		row('SessionStarted', { session, plan: 'ab-fullbody-v1', day, at: at(days) });
		for (const [exercise, weight, reps] of sets)
			reps.forEach((r, k) => row('SetLogged', { session, plan: 'ab-fullbody-v1', day, exercise, weight, reps: r, set: k + 1, at: at(days, 7 + k) }));
		row('SetLogged', { session, plan: 'ab-fullbody-v1', day, exercise: 'Long-Lever Plank', weight: 0, reps: 20, set: 1, at: at(days, 8), unit: 's', target: 20 });
		row('SetLogged', { session, plan: 'ab-fullbody-v1', day, exercise: 'Dead Bug', weight: 0, reps: 10, set: 1, at: at(days, 8) });
		row('SessionFinished', { session, plan: 'ab-fullbody-v1', day, at: at(days, 8) });
	}
	const struck = id();
	row('SessionStarted', { session: struck, plan: 'ab-fullbody-v1', day: 'A', at: at(53) });
	row('SetLogged', { session: struck, plan: 'ab-fullbody-v1', day: 'A', exercise: 'Goblet Squat', weight: 200, reps: 1, set: 1, at: at(53) });
	row('SessionStruck', { session: struck, at: at(53, 9) });
	// runs before a run was a session, one of them struck
	row('RunLogged', { minutes: 30, at: at(57) });
	row('RunLogged', { minutes: 25, at: at(55) });
	row('RunRemoved', { run: at(55), at: at(55, 9) });
	// the run spelled as day: 'run', then kind: 'run'; a session keyed by `day` under the yoga plan; mode present but no discipline
	row('SessionStarted', { session: id(), plan: 'ab-fullbody-v1', day: 'run', at: at(50) });
	row('SessionFinished', { session: `s${String(n).padStart(3, '0')}`, at: at(50, 8) });
	const kindRun = id();
	row('SessionStarted', { session: kindRun, plan: 'ab-fullbody-v1', kind: 'run', mode: 'live', at: at(48) });
	row('EntryLogged', { session: kindRun, plan: 'ab-fullbody-v1', day: 'run', item: 'Easy run', index: 1, at: at(48, 8), measure: { of: 'duration', minutes: 32 } });
	row('SessionFinished', { session: kindRun, plan: 'ab-fullbody-v1', day: 'run', at: at(48, 8) });
	row('PlanSelected', { plan: 'yoga-2day-v1', at: at(47) });
	const yoga = id();
	row('SessionStarted', { session: yoga, plan: 'yoga-2day-v1', day: '1', at: at(46) });
	row('SetLogged', { session: yoga, plan: 'yoga-2day-v1', day: '1', exercise: 'Pigeon', weight: 0, reps: 60, set: 1, at: at(46), unit: 's', target: 60 });
	row('SessionFinished', { session: yoga, at: at(46, 8) });
	row('PlanSelected', { plan: 'her-12-v1', at: at(45) });
	const her = id();
	row('SessionStarted', { session: her, plan: 'her-12-v1', day: '1', mode: 'live', at: at(44) });
	row('EntryLogged', { session: her, item: 'Deep Goblet Squat', index: 1, at: at(44, 8), measure: { of: 'load', load: 20, reps: 12 } });
	row('EntryLogged', { session: her, item: 'Dead Bug', index: 1, at: at(44, 8), measure: { of: 'load', load: 0, reps: 8 } }); // four days wrote bodyweight as load 0
	row('SessionFinished', { session: her, at: at(44, 8) });
	row('PlanSelected', { plan: 'ab-fullbody-v1', at: at(43) });
	// preferences and the no-gym block: read as nothing
	row('PreferencesSet', { intents: ['run'], gear: { gym: false }, at: at(42) });
	row('BlockToggled', { block: 'bw', on: true, at: at(42) });
	row('BlockToggled', { block: 'bw', on: false, at: at(30) });

	// 2. the current vocabulary: discipline stamped, entries with measures, a correction, a goal, a switch, a floor session, log-after
	const live = (days: number, routine: string, discipline: string, entries: [string, number, unknown][], mode: 'live' | 'after' = 'live', hour = 7) => {
		const session = id();
		row('SessionStarted', { session, plan: 'ab-fullbody-v1', routine, discipline, mode, at: at(days, hour) });
		entries.forEach(([item, index, measure], k) => row('EntryLogged', { session, item, index, at: at(days, hour + (mode === 'live' ? k * 0.1 : 0.5)), measure }));
		row('SessionFinished', { session, at: at(days, hour + 0.9) });
		return session;
	};
	const L = (load: number, reps: number) => ({ of: 'load', load, reps });
	const H = (seconds: number, target = seconds) => ({ of: 'hold', seconds, target });
	const R = (reps: number) => ({ of: 'reps', reps });
	live(20, 'B', 'lift', [['Warm-up', 1, { of: 'step' }], ['KB Deadlift', 1, L(62, 8)], ['KB Deadlift', 2, L(62, 7)], ['KB Deadlift', 3, L(62, 6)], ['Shoulder Press', 1, L(30, 12)], ['Shoulder Press', 2, L(30, 11)], ['Shoulder Press', 3, L(30, 9)], ['Copenhagen Plank', 1, R(8)], ['Copenhagen Plank', 2, R(8)], ['Calf stretch', 1, H(45)], ['Calf stretch', 2, H(45)]]);
	row('BlockToggled', { block: 'yoga', on: false, at: at(19) });
	row('GoalSet', { practice: 'run', sessions: 2, minutes: 35, at: at(19) });
	const fixed = live(9, 'A', 'lift', [['Goblet Squat', 1, L(40, 12)], ['Goblet Squat', 2, L(40, 12)], ['Goblet Squat', 3, L(40, 12)], ['Chest Press', 1, L(50, 5)], ['Chest Press', 2, L(50, 8)], ['Chest Press', 3, L(50, 8)], ['Band Face Pull', 1, R(20)], ['Band Face Pull', 2, R(18)], ['Long-Lever Plank', 1, H(20)], ['Long-Lever Plank', 2, H(20)], ['Long-Lever Plank', 3, H(15, 20)]]);
	row('EntryCorrected', { session: fixed, item: 'Chest Press', index: 1, at: at(9, 9), measure: L(50, 7) });
	live(8, 'run', 'run', [['Warm-up', 1, { of: 'step' }], ['Easy run', 1, { of: 'duration', minutes: 35 }], ['Cooldown', 1, { of: 'step' }]]);
	live(6, 'S', 'mobility', [['Calf stretch', 1, H(45)], ['Calf stretch', 2, H(45)], ['Hip flexor stretch', 1, H(45)], ['Hip flexor stretch', 2, H(45)]], 'after');
	live(5, 'bw1', 'bodyweight', [['Push-up', 1, R(15)], ['Push-up', 2, R(15)], ['Push-up', 3, R(15)], ['Split Squat', 1, R(10)], ['Split Squat', 2, R(9)], ['Split Squat', 3, R(8)], ['Hollow Hold', 1, H(25)], ['Hollow Hold', 2, H(25)], ['Hollow Hold', 3, H(20, 25)]]);
	const binned = live(4, 'B', 'lift', [['KB Deadlift', 1, L(70, 3)]]);
	row('SessionRemoved', { session: binned, at: at(4, 8) });
	row('GoalSet', { practice: 'lift', sessions: 4, at: at(3) });
	row('RestSet', { seconds: 120, at: at(3, 8) });
	live(3, 'B', 'lift', [['KB Deadlift', 1, L(62, 12)], ['KB Deadlift', 2, L(62, 10)], ['KB Deadlift', 3, L(62, 5)], ['Shoulder Press', 1, L(35, 8)], ['Shoulder Press', 2, L(30, 12)], ['Shoulder Press', 3, L(30, 12)], ['Leg Curl', 1, L(60, 15)], ['Leg Curl', 2, L(60, 15)], ['Leg Curl', 3, L(60, 15)]]);
	live(2, 'run', 'run', [['Easy run', 1, { of: 'duration', minutes: 40 }]], 'after');
	live(1, 'S', 'mobility', [['Calf stretch', 1, H(45)], ['Calf stretch', 2, H(45)]]);
	// today: a session in progress, two sets in
	const open = id();
	row('SessionStarted', { session: open, plan: 'ab-fullbody-v1', routine: 'A', discipline: 'lift', mode: 'live', at: at(0, 11) });
	row('EntryLogged', { session: open, item: 'Warm-up', index: 1, at: at(0, 11.1), measure: { of: 'step' } });
	row('EntryLogged', { session: open, item: 'Goblet Squat', index: 1, at: at(0, 11.3), measure: L(45, 8) });
	row('EntryLogged', { session: open, item: 'Goblet Squat', index: 2, at: at(0, 11.4), measure: L(45, 7) });
	return out;
}

describe('the freeze — the whole stream through every rule, at one moment', () => {
	const stored = fullStream();
	const events = upcastAll(stored);
	const programme = DEFAULT_PROGRAMMES.find((p) => p.id === (activeProgramme(events) ?? ''))!;
	const on = practicesOn(events);
	const asked = goals(events);
	const rest = restSeconds(events);
	const plan = composePlan(programme, BLOCKS, FLOOR, on, asked, rest);
	const state = currentState(events);

	it('the stream itself is what this test built — the input is frozen with the output', async () => {
		await expect(JSON.stringify(stored, null, '\t')).toMatchFileSnapshot('./__snapshots__/stream.json');
	});

	it('reads every retired shape and lands on the current vocabulary', () => {
		expect(new Set(stored.map((e) => e.type))).toEqual(new Set([
			'PlanSelected', 'SessionStarted', 'SetLogged', 'SessionFinished', 'SessionStruck', 'RunLogged', 'RunRemoved', 'EntryLogged',
			'PreferencesSet', 'BlockToggled', 'EntryCorrected', 'GoalSet', 'SessionRemoved', 'RestSet'
		]));
		expect(new Set(events.map((e) => e.type))).toEqual(new Set([
			'SessionStarted', 'EntryLogged', 'EntryCorrected', 'SessionFinished', 'SessionRemoved', 'ProgrammeSelected', 'BlockToggled', 'GoalSet', 'RestSet'
		]));
		expect(programme.id).toBe('ab-fullbody-v1');
	});

	it('owed · deal · next · load · stand-in — the projections, as JSON', async () => {
		const sessions = projectSessions(events);
		const exercises = planExercises(plan).filter(progresses);
		const out = {
			now: new Date(NOW).toISOString(),
			state: { activeSession: state.activeSession, latestSession: latestSessionOf(state), activeProgramme: state.activeProgramme, practices: state.practices, goals: state.goals, rest: state.rest },
			week: { programme: programme.id, practicesOn: on, goals: asked, rest: plan.rest ?? null, cycles: plan.cycles },
			owed: plan.cycles.map((c) => ({ cycle: c.id, ...weekProgress(events, plan, c, NOW) })),
			next: plan.cycles.map((c) => ({ cycle: c.id, routine: nextInCycle(events, plan, c) })),
			staleness: staleness(events, plan, NOW).map((s) => ({ ...s, daysSince: s.daysSince === null ? null : Math.round(s.daysSince * 100) / 100 })),
			deal: queue(events, plan, NOW),
			tally: weekTally(events, plan, NOW),
			load: exercises.map((ex) => ({ exercise: ex.name, suggestion: suggest(historyFor(events, ex.name, state.activeSession ?? undefined), ex, NOW) })),
			sessions,
			openSession: state.activeSession ? sessionEntries(events, state.activeSession) : [],
			weekChanges: weekChanges(events),
			strip: weekStrip(events, NOW),
			month: monthGrid(events, NOW)
		};
		await expect(JSON.stringify(out, null, '\t')).toMatchFileSnapshot('./__snapshots__/projections.json');
	});
});
