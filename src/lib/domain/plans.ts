import type { Exercise, Plan } from './types';

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
/**
 * Shared between both Open to Work days: the soleus produces the highest
 * force of any muscle in running, and it had zero sets. Slow both ways —
 * heavy-slow calf work is also how an Achilles is kept out of trouble.
 */
const CALF_RAISE: Exercise = {
	name: 'Standing Calf Raise',
	equip: 'Calf raise machine',
	tag: 'Calves',
	sets: 3,
	lo: 10,
	hi: 15,
	start: 90,
	inc: 10,
	note: 'Full stretch at the bottom, pause; up on the balls of the feet, pause. Slow both ways — the tendon likes slow.'
};

/** One line, both days: a warm-up costs five minutes and the first set thanks you for it. */
const WARMUP = '3–5 min easy, then one bodyweight and one half-weight set of the first lift.';

export const DEFAULT_PLANS: Plan[] = [
	{
		id: 'ab-fullbody-v1',
		name: 'Open to Work',
		description:
			'Full-body A/B on dumbbells, kettlebells and machines. The calendar is empty; Mon / Wed / Fri isn’t. Currently accepting all opportunities to pick things up and put them down.',
		schedule: 'Lift Mon / Wed / Fri · Run 3×/week',
		runTarget: 90,
		dayInfo: {
			A: { title: 'Squat & Shove', desc: 'Squat · push · pull · hinge · calves · core', warmup: WARMUP },
			B: { title: 'Hinge & Haul', desc: 'Hinge · press · row · lunge · calves · core', warmup: WARMUP }
		},
		days: {
			A: [
				// 6–12, not 8–12: the dumbbell rack steps 14–20% at these sizes, and a
				// wider window is what lets a level-up land inside the range
				{ name: 'Goblet Squat', equip: 'Kettlebell / Dumbbell', tag: 'Squat', sets: 3, lo: 6, hi: 12, start: 35, inc: 5, rack: 'dumbbell', note: 'Bell at the sternum, elbows down. Sit between the knees, knees over toes, chest tall. As deep as the back stays flat. 35 is the whole load.' },
				{ name: 'Chest Press', equip: 'Chest press machine (on a multi-press: arm flat)', tag: 'Horiz. push', sets: 3, lo: 8, hi: 12, start: 45, inc: 5, note: 'Seat so the handles meet mid-chest. Shoulder blades back on the pad; press to nearly straight, lower until the handles touch the chest.' },
				// Nothing else here trains external rotation or the rear delt: the one
				// shoulder-health input with trial evidence behind it. Light, after the press.
				{ name: 'Face Pull', equip: 'Cable, rope', tag: 'Rear delt / ER', sets: 2, lo: 12, hi: 15, start: 20, inc: 5, note: 'Rope at face height. Pull to the ears, elbows high and wide, thumbs back. Light and clean — this is shoulder insurance.' },
				{ name: 'Lat Pulldown', equip: 'Pulldown machine', tag: 'Vert. pull', sets: 3, lo: 8, hi: 12, start: 65, inc: 10, note: 'Slight lean back, chest up. Drive the elbows down; bar to the upper chest, in front of the face. Control it back to a full stretch.' },
				{ name: 'Romanian Deadlift', equip: 'Dumbbells', tag: 'Hinge', sets: 3, lo: 6, hi: 12, start: 40, inc: 5, rack: 'dumbbell', each: true, note: 'Soft knees, set once. Push the hips back; bells slide down the thighs, touching. Stop when the hamstrings pull or the back would round.' },
				CALF_RAISE,
				// A hard 10–20 s hold, not a long one: past the ceiling the plank gets
				// harder (feet up), never longer. Replaced the med-ball plank, which no
				// one can load alone and which had quietly become a 60-second sit.
				{ name: 'Long-Lever Plank', equip: 'Mat', tag: 'Core', sets: 3, lo: 10, hi: 20, start: 0, inc: 5, mode: 'seconds', bodyweight: true, note: 'Elbows a palm past the shoulders. Glutes squeezed, ribs down, hard 10–20 s. At 20 s on all three: feet up on a bench.' }
			],
			B: [
				{ name: 'KB Deadlift', equip: 'Kettlebell', tag: 'Hinge', sets: 3, lo: 6, hi: 12, start: 53, inc: 9, rack: 'kettlebell', note: 'Bell under mid-foot. Hips back, chest up, shins vertical. Push the floor away; stand tall and squeeze. Steps are whole bells — 24 → 28 → 32 kg.' },
				{ name: 'Shoulder Press', equip: 'Shoulder press machine (on a multi-press: arm overhead)', tag: 'Vert. push', sets: 3, lo: 8, hi: 12, start: 30, inc: 5, note: 'Seat so the handles start at the shoulders. Ribs down, no arching. Elbows slightly forward; press up without shrugging.' },
				{ name: 'Seated Row', equip: 'Seated cable row, V-handle', tag: 'Horiz. pull', sets: 3, lo: 8, hi: 12, start: 65, inc: 10, note: 'Torso upright and still. Drive the elbows back along the ribs, squeeze the blades. Not the pulldown — that pulls from overhead.' },
				// A knee-dominant compound, not the leg-extension machine it replaces:
				// day B had no squat pattern, and nothing in the plan was single-leg
				// — which matters most for someone running three times a week.
				{ name: 'DB Reverse Lunge', equip: 'Dumbbells', tag: 'Lunge', sets: 3, lo: 8, hi: 12, start: 20, inc: 5, rack: 'dumbbell', each: true, side: 'reps', note: 'All 8–12 on one leg, then switch; weaker leg first. Long step back, front shin vertical, drive up through the front heel.' },
				{ name: 'Leg Curl', equip: 'Seated leg curl (lying is fine)', tag: 'Hamstrings', sets: 3, lo: 10, hi: 15, start: 60, inc: 10, note: 'Seated if you can — hamstrings grow more at length. Knee in line with the pivot, pad above the ankle, hips pinned. Full curl, pause, slow back.' },
				CALF_RAISE,
				// Day A resists extension; this resists the side-bend AND loads the
				// adductors, which nothing else in a front-to-back plan touches.
				// Progress by reps, then by lever — never by seconds.
				{ name: 'Copenhagen Plank', equip: 'Bench', tag: 'Core / adductors', sets: 2, lo: 5, hi: 15, start: 0, inc: 1, bodyweight: true, side: 'sets', note: 'Side plank with the top knee on a bench, bottom leg lifting to meet it. One rep = lift and lower. At 15 clean, straighten the top leg.' }
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
			'Two-day bodyweight yoga rotation, about 30 minutes on a mat. Nothing to load, nothing to rack — progress is measured in seconds. Same rule as the iron: hit the top of the range, then make the pose harder — a hold never gets longer than its range. A complement to the lifting plans, not a replacement: there is no aerobic work here and no external load.',
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
