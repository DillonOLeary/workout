import type { Plan } from './types';

/**
 * The three shipped plans. These are seeded into the `ledger_plans` table on
 * first boot (src/lib/server/plans.ts); custom plans are inserted alongside
 * them via the "Plans table" card on The Plan screen.
 *
 * Every weighted lift declares whether its number is per hand (`each`) and
 * every one-sided movement declares how it splits (`side`), because "3 × 8–12"
 * on a lunge means nothing on its own. The reasoning behind the structure —
 * patterns covered, volume, rep ranges — is written up in TRAINING.md and on
 * the /why screen.
 */
export const DEFAULT_PLANS: Plan[] = [
	{
		id: 'ab-fullbody-v1',
		name: 'Open to Work',
		description:
			'Full-body A/B on dumbbells, kettlebells and machines. The calendar is empty; Mon / Wed / Fri isn’t. Currently accepting all opportunities to pick things up and put them down.',
		schedule: 'Lift Mon / Wed / Fri · Run 3×/week',
		runTarget: 90,
		dayInfo: {
			A: { title: 'Squat & Shove', desc: 'Squat · push · pull · hinge · core' },
			B: { title: 'Hinge & Haul', desc: 'Hinge · press · row · lunge · core' }
		},
		days: {
			A: [
				{ name: 'Goblet Squat', equip: 'Kettlebell / Dumbbell', tag: 'Squat', sets: 3, lo: 8, hi: 12, start: 35, inc: 5, rack: 'dumbbell', note: 'One bell, held at the chest — 35 is the whole load.' },
				{ name: 'Chest Press', equip: 'Multi-press machine', tag: 'Horiz. push', sets: 3, lo: 8, hi: 12, start: 30, inc: 5 },
				{ name: 'Lat Pulldown', equip: 'Pulldown machine', tag: 'Vert. pull', sets: 3, lo: 8, hi: 12, start: 90, inc: 10 },
				{ name: 'Romanian Deadlift', equip: 'Dumbbells', tag: 'Hinge', sets: 3, lo: 8, hi: 12, start: 40, inc: 5, rack: 'dumbbell', each: true },
				// A hold that outgrows 45s gets a heavier ball, not a longer minute —
				// the time ceiling keeps the set hard instead of long.
				{ name: 'Weighted Plank', equip: 'Mat + med ball', tag: 'Core', sets: 3, lo: 20, hi: 45, start: 10, inc: 5, rack: 'medball', mode: 'seconds', note: 'Med ball resting on your back — the weight is the ball.' }
			],
			B: [
				{ name: 'KB Deadlift', equip: 'Kettlebell', tag: 'Hinge', sets: 3, lo: 8, hi: 12, start: 53, inc: 9, rack: 'kettlebell', note: 'One bell between the feet. Steps are whole bell sizes — 24 → 28 → 32 kg.' },
				{ name: 'Shoulder Press', equip: 'Multi-press machine', tag: 'Vert. push', sets: 3, lo: 8, hi: 12, start: 25, inc: 5 },
				{ name: 'Seated Row', equip: 'Seated cable row', tag: 'Horiz. pull', sets: 3, lo: 8, hi: 12, start: 80, inc: 10, note: 'Pulling toward you, sitting down — not the lat pulldown, which pulls from overhead.' },
				// A knee-dominant compound, not the leg-extension machine it replaces:
				// day B had no squat pattern, and nothing in the plan was single-leg
				// — which matters most for someone running three times a week.
				{ name: 'DB Reverse Lunge', equip: 'Dumbbells', tag: 'Lunge', sets: 3, lo: 8, hi: 12, start: 20, inc: 5, rack: 'dumbbell', each: true, side: 'reps', note: 'One rep = one step back and drive up. Count 8–12 on each leg.' },
				{ name: 'Leg Curl', equip: 'Leg curl machine (seated or lying)', tag: 'Hamstrings', sets: 3, lo: 10, hi: 15, start: 60, inc: 10 },
				// Day A's plank resists extension; this resists lateral flexion, so the
				// two days cover different core vectors instead of B covering none.
				{ name: 'Side Plank', equip: 'Mat', tag: 'Core', sets: 2, lo: 20, hi: 45, start: 0, inc: 5, mode: 'seconds', bodyweight: true, side: 'sets' }
			]
		}
	},
	{
		id: 'her-12-v1',
		name: 'Full Range of Motion',
		description:
			'Deep-ROM lifts at 8–15 reps. Strength through the full range of motion — mobility you can load. Runs stay with Coach Bennett — log the minutes after.',
		schedule: 'Lift 2–3×/week · NRC guided runs 1–2×/week',
		runTarget: 60,
		dayInfo: {
			'1': { title: 'Get Low', desc: 'Deep squat · push · pull · hinge · core' },
			'2': { title: 'Bridge Club', desc: 'Lunge · press · row · curl · bridge · core — squeeze and pause at the top' }
		},
		days: {
			'1': [
				{ name: 'Deep Goblet Squat', equip: 'Dumbbell', tag: 'Squat', sets: 3, lo: 8, hi: 15, start: 20, inc: 5, rack: 'dumbbell', note: 'One dumbbell at the chest — 20 is the whole load.' },
				{ name: 'Chest Press', equip: 'Multi-press machine', tag: 'Horiz. push', sets: 3, lo: 8, hi: 15, start: 20, inc: 5 },
				{ name: 'Lat Pulldown', equip: 'Pulldown machine', tag: 'Vert. pull', sets: 3, lo: 8, hi: 15, start: 50, inc: 10 },
				{ name: 'Romanian Deadlift', equip: 'Dumbbells', tag: 'Hinge', sets: 3, lo: 8, hi: 15, start: 25, inc: 5, rack: 'dumbbell', each: true },
				// This plan had no core work on either day. Dead bug is the deep-ROM
				// plan's kind of core: resist the arch, move the limbs, stay braced.
				{ name: 'Dead Bug', equip: 'Mat', tag: 'Core', sets: 3, lo: 8, hi: 15, start: 0, inc: 1, bodyweight: true, side: 'reps', note: 'One rep = opposite arm and leg lowered and returned. Count 8–15 each side.' }
			],
			'2': [
				{ name: 'DB Reverse Lunge', equip: 'Dumbbells', tag: 'Lunge', sets: 3, lo: 8, hi: 15, start: 15, inc: 5, rack: 'dumbbell', each: true, side: 'reps', note: 'One rep = one step back and drive up. Count 8–15 on each leg.' },
				{ name: 'Shoulder Press', equip: 'Multi-press machine', tag: 'Vert. push', sets: 3, lo: 8, hi: 15, start: 15, inc: 5 },
				{ name: 'Seated Row', equip: 'Seated cable row', tag: 'Horiz. pull', sets: 3, lo: 8, hi: 15, start: 40, inc: 10, note: 'Pulling toward you, sitting down — not the lat pulldown, which pulls from overhead.' },
				{ name: 'Leg Curl', equip: 'Leg curl machine (seated or lying)', tag: 'Hamstrings', sets: 3, lo: 10, hi: 15, start: 40, inc: 10 },
				{ name: 'DB Glute Bridge', equip: 'Dumbbell', tag: 'Hip ext.', sets: 3, lo: 10, hi: 15, start: 25, inc: 5, rack: 'dumbbell', note: 'One dumbbell across the hips — 25 is the whole load.' },
				// Day 1 resists the arch; this resists the side-bend. Two vectors, one
				// per day, mirroring how Open to Work splits its core work.
				{ name: 'Side Plank', equip: 'Mat', tag: 'Core', sets: 2, lo: 20, hi: 45, start: 0, inc: 5, mode: 'seconds', bodyweight: true, side: 'sets' }
			]
		}
	},
	{
		id: 'yoga-2day-v1',
		name: 'Hold Steady',
		description:
			'Two-day bodyweight yoga rotation, about 30 minutes on a mat. Nothing to load, nothing to rack — progress is measured in seconds. Same rule as the iron: top of the range on every set → hold it longer next time. A complement to the lifting plans, not a replacement: there is no aerobic work here and no external load.',
		schedule: 'Flow 2–3×/week · mat only',
		runs: false,
		dayInfo: {
			'1': { title: 'Flow & Hold', desc: 'Sun salutations · chair · warrior II · plank · boat · bridge' },
			'2': { title: 'Balance & Bend', desc: 'Tree · warrior III · low lunge · pigeon · fold · twist' }
		},
		days: {
			'1': [
				{ name: 'Sun Salutation A', equip: 'Mat', tag: 'Flow', sets: 2, lo: 3, hi: 5, start: 0, inc: 1, bodyweight: true, note: 'One full round through the sequence = 1 rep.' },
				{ name: 'Chair Pose', equip: 'Mat', tag: 'Squat', sets: 3, lo: 20, hi: 45, start: 0, inc: 5, mode: 'seconds', bodyweight: true },
				{ name: 'Warrior II', equip: 'Mat', tag: 'Lunge', sets: 2, lo: 20, hi: 45, start: 0, inc: 5, mode: 'seconds', bodyweight: true, side: 'sets' },
				{ name: 'Forearm Plank', equip: 'Mat', tag: 'Core', sets: 3, lo: 20, hi: 60, start: 0, inc: 5, mode: 'seconds', bodyweight: true },
				{ name: 'Boat Pose', equip: 'Mat', tag: 'Core', sets: 3, lo: 15, hi: 30, start: 0, inc: 5, mode: 'seconds', bodyweight: true },
				{ name: 'Bridge Pose', equip: 'Mat', tag: 'Hip ext.', sets: 2, lo: 20, hi: 45, start: 0, inc: 5, mode: 'seconds', bodyweight: true }
			],
			'2': [
				{ name: 'Tree Pose', equip: 'Mat', tag: 'Balance', sets: 2, lo: 20, hi: 60, start: 0, inc: 5, mode: 'seconds', bodyweight: true, side: 'sets' },
				{ name: 'Warrior III', equip: 'Mat', tag: 'Balance', sets: 2, lo: 15, hi: 30, start: 0, inc: 5, mode: 'seconds', bodyweight: true, side: 'sets' },
				{ name: 'Low Lunge', equip: 'Mat', tag: 'Hip flexor', sets: 2, lo: 30, hi: 60, start: 0, inc: 10, mode: 'seconds', bodyweight: true, side: 'sets' },
				{ name: 'Pigeon Pose', equip: 'Mat', tag: 'Hip', sets: 2, lo: 30, hi: 60, start: 0, inc: 10, mode: 'seconds', bodyweight: true, side: 'sets' },
				{ name: 'Seated Forward Fold', equip: 'Mat', tag: 'Hamstrings', sets: 2, lo: 30, hi: 60, start: 0, inc: 10, mode: 'seconds', bodyweight: true },
				{ name: 'Supine Twist', equip: 'Mat', tag: 'Spine', sets: 2, lo: 30, hi: 60, start: 0, inc: 10, mode: 'seconds', bodyweight: true, side: 'sets' }
			]
		}
	}
];
