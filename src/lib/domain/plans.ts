import type { Plan } from './types';

/**
 * The two shipped plans. These are seeded into the `ledger_plans` table on
 * first boot (src/lib/server/plans.ts); custom plans are inserted alongside
 * them via the "Plans table" card on The Plan screen.
 */
export const DEFAULT_PLANS: Plan[] = [
	{
		id: 'ab-fullbody-v1',
		name: 'Open to Work',
		description:
			'Full-body A/B on dumbbells, kettlebells and machines. The calendar is empty; Mon / Wed / Fri isn’t. Currently accepting all opportunities to pick things up and put them down.',
		schedule: 'Lift Mon / Wed / Fri · Run 3×/week',
		dayInfo: {
			A: { title: 'Squat & Shove', desc: 'Squat · push · pull · hinge · core' },
			B: { title: 'Hinge & Haul', desc: 'Hinge · press · row · legs' }
		},
		days: {
			A: [
				{ name: 'Goblet Squat', equip: 'Kettlebell / Dumbbell', tag: 'Squat', sets: 3, lo: 8, hi: 12, start: 35, inc: 5 },
				{ name: 'Chest Press', equip: 'Multi-press machine', tag: 'Horiz. push', sets: 3, lo: 8, hi: 12, start: 30, inc: 5 },
				{ name: 'Lat Pulldown', equip: 'Pulldown machine', tag: 'Vert. pull', sets: 3, lo: 8, hi: 12, start: 90, inc: 10 },
				{ name: 'DB Romanian Deadlift', equip: 'Dumbbells', tag: 'Hinge', sets: 3, lo: 8, hi: 12, start: 40, inc: 5 },
				{ name: 'Plank + Med-ball Core', equip: 'Mat / Med ball', tag: 'Core', sets: 3, lo: 8, hi: 12, start: 10, inc: 5 }
			],
			B: [
				{ name: 'KB Deadlift', equip: 'Kettlebell', tag: 'Hinge', sets: 3, lo: 8, hi: 12, start: 53, inc: 9 },
				{ name: 'Shoulder Press', equip: 'Multi-press machine', tag: 'Vert. push', sets: 3, lo: 8, hi: 12, start: 25, inc: 5 },
				{ name: 'Seated Row', equip: 'Row machine', tag: 'Horiz. pull', sets: 3, lo: 8, hi: 12, start: 80, inc: 10 },
				{ name: 'Leg Extension', equip: 'Leg ext. machine', tag: 'Quads', sets: 3, lo: 10, hi: 15, start: 70, inc: 10 },
				{ name: 'Leg Curl', equip: 'Leg curl machine', tag: 'Hamstrings', sets: 3, lo: 10, hi: 15, start: 60, inc: 10 }
			]
		}
	},
	{
		id: 'her-12-v1',
		name: 'Full Range of Motion',
		description:
			'Deep-ROM lifts at 8–15 reps. Strength and flexibility, for performance in all positions. Runs stay with Coach Bennett — log the minutes after.',
		schedule: 'Lift 2–3×/week · NRC guided runs 1–2×/week',
		dayInfo: {
			'1': { title: 'Get Low', desc: 'Deep squat · push · pull · hinge' },
			'2': { title: 'Bridge Club', desc: 'Lunge · press · row · curl · bridge — squeeze and pause at the top' }
		},
		days: {
			'1': [
				{ name: 'Deep Goblet Squat', equip: 'Dumbbell', tag: 'Squat', sets: 3, lo: 8, hi: 15, start: 20, inc: 5 },
				{ name: 'Chest Press', equip: 'Multi-press machine', tag: 'Horiz. push', sets: 3, lo: 8, hi: 15, start: 20, inc: 5 },
				{ name: 'Lat Pulldown', equip: 'Pulldown machine', tag: 'Vert. pull', sets: 3, lo: 8, hi: 15, start: 50, inc: 10 },
				{ name: 'Romanian Deadlift', equip: 'Dumbbells', tag: 'Hinge', sets: 3, lo: 8, hi: 15, start: 25, inc: 5 }
			],
			'2': [
				{ name: 'DB Reverse Lunge', equip: 'Dumbbells', tag: 'Lunge', sets: 3, lo: 8, hi: 15, start: 15, inc: 5 },
				{ name: 'Shoulder Press', equip: 'Multi-press machine', tag: 'Vert. push', sets: 3, lo: 8, hi: 15, start: 15, inc: 5 },
				{ name: 'Seated Row', equip: 'Row machine', tag: 'Horiz. pull', sets: 3, lo: 8, hi: 15, start: 40, inc: 10 },
				{ name: 'Leg Curl', equip: 'Leg curl machine', tag: 'Hamstrings', sets: 3, lo: 10, hi: 15, start: 40, inc: 10 },
				{ name: 'DB Glute Bridge', equip: 'Dumbbell', tag: 'Hip ext.', sets: 3, lo: 10, hi: 15, start: 25, inc: 5 }
			]
		}
	}
];
