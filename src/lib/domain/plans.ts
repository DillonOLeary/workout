import type { Exercise, Plan } from './plan';

/**
 * The three shipped plans. These are seeded into the `ledger_plans` table on
 * first boot (src/lib/server/plans.ts); custom plans are inserted alongside
 * them via the "Plans table" card on The Plan screen.
 *
 * Every exercise names its KIND — load, hold or reps — which is what decides
 * how it is logged and how it progresses (plan.ts). Every weighted lift
 * declares whether its number is per hand (`each`) and every one-sided
 * movement declares how it splits (`side`), because "3 × 8–12" on a lunge
 * means nothing on its own. The reasoning behind the structure —
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
	kind: 'load',
	sets: 3,
	lo: 10,
	hi: 15,
	start: 90,
	inc: 10,
	note: 'Full stretch at the bottom, pause; up on the balls of the feet, pause. Slow both ways — the tendon likes slow.'
};

/**
 * Warm-up and cooldown are STEPS: each line takes its turn on the floor
 * like a set does, and the session's length is honest about them. A warm-up
 * costs five minutes and the first set thanks you for it.
 */
const WARMUP = [
	'3–5 min easy — bike, row or a brisk walk',
	'One bodyweight set of the first lift',
	'One half-weight set of the first lift'
];
const COOLDOWN = ['Calf stretch · 45s each', 'Hip flexor stretch · 45s each', 'Doorway chest stretch · 45s'];

/**
 * Full Range of Motion's warm-up carries the breathing cue too: exhale-on-
 * exertion is the pelvic-floor-safe default for a beginner — hard breath-holds
 * are a later, optional skill, not a day-one requirement.
 */
const HER_WARMUP = ['5 min easy bike', '10 bodyweight squats', '10 hip hinges', '1 light set of the first lift'];
const HER_COOLDOWN = ['Hip flexor stretch · 60s each', 'Hamstring stretch · 60s each', 'Doorway chest stretch · 60s'];
const HER_CUE = 'Exhale through the hard part — never hold your breath.';

/** The guided run both lifting plans offer: walk, run, walk. */
const EASY_RUN = {
	title: 'Easy run',
	minutes: 30,
	walk: 5,
	note: 'Conversational — able to talk in full sentences.'
};

export const DEFAULT_PLANS: Plan[] = [
	{
		id: 'ab-fullbody-v1',
		name: 'Open to Work',
		description:
			'Full-body A/B on dumbbells, kettlebells and machines. The calendar is empty; Mon / Wed / Fri isn’t. Currently accepting all opportunities to pick things up and put them down.',
		schedule: 'Lift Mon / Wed / Fri · Run 3×/week',
		runTarget: 90,
		// 90s between sets: these are compounds first, machines second
		rest: 90,
		cooldown: COOLDOWN,
		run: EASY_RUN,
		dayInfo: {
			A: { title: 'Squat & Shove', desc: 'Squat · push · pull · hinge · calves · core', warmup: WARMUP },
			B: { title: 'Hinge & Haul', desc: 'Hinge · press · row · lunge · calves · core', warmup: WARMUP }
		},
		days: {
			A: [
				// 6–12, not 8–12: the dumbbell rack steps 14–20% at these sizes, and a
				// wider window is what lets a level-up land inside the range
				{ name: 'Goblet Squat', equip: 'Kettlebell / Dumbbell', tag: 'Squat', kind: 'load', sets: 3, lo: 6, hi: 12, start: 35, inc: 5, rack: 'dumbbell', note: 'Bell at the sternum, elbows down. Sit between the knees, knees over toes, chest tall. As deep as the back stays flat. 35 is the whole load.' },
				{ name: 'Chest Press', equip: 'Chest press machine (on a multi-press: arm flat)', tag: 'Horiz. push', kind: 'load', sets: 3, lo: 8, hi: 12, start: 45, inc: 5, note: 'Seat so the handles meet mid-chest. Shoulder blades back on the pad; press to nearly straight, lower until the handles touch the chest.' },
				// Nothing else here trains external rotation or the rear delt: the one
				// shoulder-health input with trial evidence behind it. Light, after the press.
				{ name: 'Face Pull', equip: 'Cable, rope', tag: 'Rear delt / ER', kind: 'load', sets: 2, lo: 12, hi: 15, start: 20, inc: 5, note: 'Rope at face height. Pull to the ears, elbows high and wide, thumbs back. Light and clean — this is shoulder insurance.' },
				{ name: 'Lat Pulldown', equip: 'Pulldown machine', tag: 'Vert. pull', kind: 'load', sets: 3, lo: 8, hi: 12, start: 65, inc: 10, note: 'Slight lean back, chest up. Drive the elbows down; bar to the upper chest, in front of the face. Control it back to a full stretch.' },
				{ name: 'Romanian Deadlift', equip: 'Dumbbells', tag: 'Hinge', kind: 'load', sets: 3, lo: 6, hi: 12, start: 40, inc: 5, rack: 'dumbbell', each: true, note: 'Soft knees, set once. Push the hips back; bells slide down the thighs, touching. Stop when the hamstrings pull or the back would round.' },
				CALF_RAISE,
				// A hard 10–20 s hold, not a long one: past the ceiling the plank gets
				// harder (feet up), never longer. Replaced the med-ball plank, which no
				// one can load alone and which had quietly become a 60-second sit.
				{ name: 'Long-Lever Plank', equip: 'Mat', tag: 'Core', kind: 'hold', sets: 3, lo: 10, hi: 20, inc: 5, note: 'Elbows a palm past the shoulders. Glutes squeezed, ribs down, hard 10–20 s. At 20 s on all three: feet up on a bench.' }
			],
			B: [
				{ name: 'KB Deadlift', equip: 'Kettlebell', tag: 'Hinge', kind: 'load', sets: 3, lo: 6, hi: 12, start: 53, inc: 9, rack: 'kettlebell', note: 'Bell under mid-foot. Hips back, chest up, shins vertical. Push the floor away; stand tall and squeeze. Steps are whole bells — 24 → 28 → 32 kg.' },
				{ name: 'Shoulder Press', equip: 'Shoulder press machine (on a multi-press: arm overhead)', tag: 'Vert. push', kind: 'load', sets: 3, lo: 8, hi: 12, start: 30, inc: 5, note: 'Seat so the handles start at the shoulders. Ribs down, no arching. Elbows slightly forward; press up without shrugging.' },
				{ name: 'Seated Row', equip: 'Seated cable row, V-handle', tag: 'Horiz. pull', kind: 'load', sets: 3, lo: 8, hi: 12, start: 65, inc: 10, note: 'Torso upright and still. Drive the elbows back along the ribs, squeeze the blades. Not the pulldown — that pulls from overhead.' },
				// A knee-dominant compound, not the leg-extension machine it replaces:
				// day B had no squat pattern, and nothing in the plan was single-leg
				// — which matters most for someone running three times a week.
				{ name: 'DB Reverse Lunge', equip: 'Dumbbells', tag: 'Lunge', kind: 'load', sets: 3, lo: 8, hi: 12, start: 20, inc: 5, rack: 'dumbbell', each: true, side: 'reps', note: 'All 8–12 on one leg, then switch; weaker leg first. Long step back, front shin vertical, drive up through the front heel.' },
				{ name: 'Leg Curl', equip: 'Seated leg curl (lying is fine)', tag: 'Hamstrings', kind: 'load', sets: 3, lo: 10, hi: 15, start: 60, inc: 10, note: 'Seated if you can — hamstrings grow more at length. Knee in line with the pivot, pad above the ankle, hips pinned. Full curl, pause, slow back.' },
				CALF_RAISE,
				// Day A resists extension; this resists the side-bend AND loads the
				// adductors, which nothing else in a front-to-back plan touches.
				// Progress by reps, then by lever — never by seconds.
				{ name: 'Copenhagen Plank', equip: 'Bench', tag: 'Core / adductors', kind: 'reps', sets: 2, lo: 5, hi: 15, side: 'sets', note: 'Side plank with the top knee on a bench, bottom leg lifting to meet it. One rep = lift and lower. At 15 clean, straighten the top leg.' }
			]
		}
	},
	{
		id: 'her-12-v1',
		name: 'Full Range of Motion',
		description:
			'Deep-ROM lifts at moderate reps. Strength through the full range of motion — mobility you can load, dosed for visible change at three days a week. Runs stay with Coach Bennett — log the minutes after.',
		// She asked for regimented, so the schedule names days instead of counts.
		schedule: 'Lift Mon / Thu (+ Sat when it fits) · Run Wed / Sat with NRC',
		runTarget: 60,
		rest: 60,
		cooldown: HER_COOLDOWN,
		cue: HER_CUE,
		run: EASY_RUN,
		dayInfo: {
			'1': {
				title: 'Get Low',
				desc: 'Deep squat · hinge · push · pull · rear delt · core',
				warmup: HER_WARMUP
			},
			'2': {
				title: 'Bridge Club',
				desc: 'Lunge · curl · press · row · bridge · calves · core',
				warmup: HER_WARMUP
			}
		},
		days: {
			'1': [
				{ name: 'Deep Goblet Squat', equip: 'One dumbbell (plate under heels optional)', tag: 'Squat', kind: 'load', sets: 3, lo: 8, hi: 15, start: 20, inc: 5, rack: 'dumbbell', note: 'One bell at the chest — 20 is the whole load. Sit deep until the elbows brush the knees; stop if the heels rise or the tailbone tucks.' },
				// Hinge while fresh, ahead of the machines. 15s to learn the pattern —
				// the old 25/hand start was ~100% of a typical beginner max, and the
				// ledger shows it got quietly corrected on day one.
				{ name: 'Romanian Deadlift', equip: 'Two dumbbells', tag: 'Hinge', kind: 'load', sets: 3, lo: 8, hi: 15, start: 15, inc: 5, rack: 'dumbbell', each: true, note: 'Soft knees, set once. Push the hips back; bells slide down the thighs, touching. Stop when the hamstrings pull or the back would round.' },
				// 6–15, not 8–15: the smallest stack step on a press is a 25–33% jump
				// at these loads, and the wider floor is what keeps a post-jump set
				// inside the range instead of reading as a miss.
				{ name: 'Chest Press', equip: 'Chest press machine (on a multi-press: arm flat)', tag: 'Horiz. push', kind: 'load', sets: 3, lo: 6, hi: 15, start: 20, inc: 5, note: 'Seat so the handles meet mid-chest; feet flat, on a step if they don’t reach. Shoulder blades back; press to nearly straight, lower to the chest.' },
				{ name: 'Lat Pulldown', equip: 'Pulldown machine', tag: 'Vert. pull', kind: 'load', sets: 3, lo: 8, hi: 15, start: 40, inc: 5, note: 'Thigh pad snug so the hips can’t lift. Slight lean back, chest up; bar to the upper chest, in front of the face. Control back to a full stretch.' },
				{ name: 'Face Pull', equip: 'Cable, rope', tag: 'Rear delt / ER', kind: 'load', sets: 2, lo: 12, hi: 15, start: 15, inc: 5, note: 'Rope at face height. Pull to the ears, elbows high and wide, thumbs back. Light and clean — this is shoulder insurance.' },
				{ name: 'Dead Bug', equip: 'Mat', tag: 'Core', kind: 'reps', sets: 3, lo: 8, hi: 12, side: 'reps', note: 'Low back and ribs pressed down; exhale as the opposite arm and leg lower slowly. Too hard? Tap the heels. Easy at 12? Take 3 seconds to lower.' }
			],
			'2': [
				{ name: 'DB Reverse Lunge', equip: 'Two dumbbells (bodyweight first session)', tag: 'Lunge', kind: 'load', sets: 3, lo: 8, hi: 15, start: 10, inc: 5, rack: 'dumbbell', each: true, side: 'reps', note: 'First session: no bells. All reps on one leg, weaker leg first. Long step back, front shin upright, drive up through the front heel.' },
				{ name: 'Leg Curl', equip: 'Seated leg curl (lying is fine)', tag: 'Hamstrings', kind: 'load', sets: 3, lo: 10, hi: 15, start: 40, inc: 5, note: 'Seated if you can — hamstrings grow more at length. Knee in line with the pivot, pad above the ankle, hips pinned. Full curl, pause, slow back.' },
				{ name: 'Shoulder Press', equip: 'Shoulder press machine (on a multi-press: arm overhead)', tag: 'Vert. push', kind: 'load', sets: 3, lo: 6, hi: 15, start: 15, inc: 5, note: 'Handles start at shoulder height — if you must shrug to reach them, raise the seat. Ribs down, no arching; press up without shrugging.' },
				{ name: 'Seated Row', equip: 'Seated cable row, V-handle', tag: 'Horiz. pull', kind: 'load', sets: 3, lo: 8, hi: 15, start: 40, inc: 5, note: 'Feet on the plates, torso upright and still. Drive the elbows back along the ribs, squeeze the blades, then let the arms straighten fully.' },
				{ name: 'DB Glute Bridge', equip: 'One dumbbell + folded mat as a pad', tag: 'Hip ext.', kind: 'load', sets: 3, lo: 10, hi: 15, start: 25, inc: 5, rack: 'dumbbell', note: 'Bell on the pad across the hips — 25 is the load. Chin tucked, ribs down; drive to level hips, squeeze, pause, lower. Easy at 35? Shoulders up on a bench.' },
				{ ...CALF_RAISE, start: 50 },
				{ name: 'Side Plank', equip: 'Mat', tag: 'Core', kind: 'hold', sets: 2, lo: 20, hi: 45, inc: 5, side: 'sets', note: 'Elbow under the shoulder; knees bent and stacked to start, feet stacked once that’s easy. Hips up in a line, breathe. At 45 s: top knee onto a bench — Copenhagen.' }
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
		// a breath or two between holds — the flow is its own warm-up
		rest: 20,
		dayInfo: {
			'1': { title: 'Flow & Hold', desc: 'Sun salutations · chair · warrior II · plank · boat · bridge' },
			'2': { title: 'Balance & Bend', desc: 'Tree · warrior III · low lunge · pigeon · fold · twist' }
		},
		days: {
			'1': [
				{ name: 'Sun Salutation A', equip: 'Mat', tag: 'Flow', kind: 'reps', sets: 2, lo: 3, hi: 5, note: 'One full round through the sequence = 1 rep.' },
				{ name: 'Chair Pose', equip: 'Mat', tag: 'Squat', kind: 'hold', sets: 3, lo: 20, hi: 45, inc: 5 },
				{ name: 'Warrior II', equip: 'Mat', tag: 'Lunge', kind: 'hold', sets: 2, lo: 20, hi: 45, inc: 5, side: 'sets' },
				{ name: 'Forearm Plank', equip: 'Mat', tag: 'Core', kind: 'hold', sets: 3, lo: 20, hi: 60, inc: 5 },
				{ name: 'Boat Pose', equip: 'Mat', tag: 'Core', kind: 'hold', sets: 3, lo: 15, hi: 30, inc: 5 },
				{ name: 'Bridge Pose', equip: 'Mat', tag: 'Hip ext.', kind: 'hold', sets: 2, lo: 20, hi: 45, inc: 5 }
			],
			'2': [
				{ name: 'Tree Pose', equip: 'Mat', tag: 'Balance', kind: 'hold', sets: 2, lo: 20, hi: 60, inc: 5, side: 'sets' },
				{ name: 'Warrior III', equip: 'Mat', tag: 'Balance', kind: 'hold', sets: 2, lo: 15, hi: 30, inc: 5, side: 'sets' },
				{ name: 'Low Lunge', equip: 'Mat', tag: 'Hip flexor', kind: 'hold', sets: 2, lo: 30, hi: 60, inc: 10, side: 'sets' },
				{ name: 'Pigeon Pose', equip: 'Mat', tag: 'Hip', kind: 'hold', sets: 2, lo: 30, hi: 60, inc: 10, side: 'sets' },
				{ name: 'Seated Forward Fold', equip: 'Mat', tag: 'Hamstrings', kind: 'hold', sets: 2, lo: 30, hi: 60, inc: 10 },
				{ name: 'Supine Twist', equip: 'Mat', tag: 'Spine', kind: 'hold', sets: 2, lo: 30, hi: 60, inc: 10, side: 'sets' }
			]
		}
	}
];
