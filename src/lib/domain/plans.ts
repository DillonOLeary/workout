import type { Exercise, Plan, PrepItem } from './plan';

/**
 * The shipped plans. These are seeded into the `ledger_plans` table on every
 * boot (src/lib/server/plans.ts); custom plans are inserted alongside them
 * via the "Plans table" card on /plan/change.
 *
 * A plan is a handful of CYCLES — ordered lists of routines, each turning at
 * its own weekly cadence — over a set of ROUTINES, each with a discipline.
 * Every exercise names what a set WRITES (`kind`) and what the rule MOVES
 * (`progress`) — plan.ts. Every weighted lift declares whether its number is
 * per hand (`each`) and every one-sided movement declares how it splits
 * (`side`), because "3 × 8–12" on a lunge means nothing on its own. The
 * reasoning behind the structure — patterns covered, volume, rep ranges —
 * is written up in TRAINING.md and on /plan/why.
 */

/* ---------- the lifts ---------------------------------------------------- */

/**
 * Shared between both Open to Work lift routines: the soleus produces the highest
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
	progress: { of: 'size', start: 90, inc: 10 },
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

/* ---------- the run ------------------------------------------------------ */

/**
 * The run is a routine like any other: one exercise that measures thirty
 * minutes, in a cycle of one. The warm-up is a jog, then drills and dynamic
 * stretches — each a countdown the floor runs; the cooldown is a walk and
 * the static stretches. A run logged after the fact skips all of it: the
 * humans decided when to run, the app just keeps the minutes.
 */
const EASY_RUN: Exercise = {
	name: 'Easy run',
	equip: 'Shoes',
	tag: 'Run',
	kind: 'run',
	sets: 1,
	lo: 30,
	hi: 30,
	progress: { of: 'none' },
	note: 'Conversational — able to talk in full sentences.'
};
const RUN_WARMUP: PrepItem[] = [
	{ name: 'Easy jog', minutes: 3 },
	{ name: 'High knees', seconds: 30 },
	{ name: 'Carioca', seconds: 30, each: true },
	{ name: 'Walking lunges', seconds: 45 },
	{ name: 'Leg swings', seconds: 30, each: true },
	{ name: 'A-skips', seconds: 30 }
];
const RUN_COOLDOWN: PrepItem[] = [
	{ name: 'Walk', minutes: 3 },
	{ name: 'Calf stretch', seconds: 45, each: true },
	{ name: 'Hip flexor stretch', seconds: 45, each: true },
	{ name: 'Hamstring stretch', seconds: 45, each: true }
];

/* ---------- the stretches ------------------------------------------------ */

/**
 * A stretch is a timed hold at a fixed length — lo === hi, progress none —
 * so the rule never asks for more and the floor has nothing to dial: Start
 * 45s, the bell, the other side. Ten seconds between sides is a breath and
 * a change of position. The morning stretch is a ROUTINE of these, so the
 * floor, the ⋯ sheet, the receipt and the Ledger all work unchanged.
 */
const HOLD45 = (name: string, note?: string): Exercise => ({
	name,
	equip: 'Mat',
	tag: 'Stretch',
	kind: 'hold',
	sets: 2,
	lo: 45,
	hi: 45,
	progress: { of: 'none' },
	side: 'sets',
	rest: 10,
	...(note ? { note } : {})
});

/* ---------- yoga --------------------------------------------------------- */

/**
 * Sixteen poses, every one of them ordinary. Ten have a dose and no ambition
 * beyond it (a hold that does not progress); six are genuinely loaded
 * isometrics and climb like the planks do — to a ceiling, then harder, never
 * longer. Not strength work, and not asked to be (TRAINING.md): range of
 * motion, a back that doesn't ache, and twenty quiet minutes.
 */
const YOGA_REST = 20; // a breath or two between holds — the flow is its own warm-up
const pose = (name: string, tag: string, seconds: number, note: string, sides = false): Exercise => ({
	name,
	equip: 'Mat',
	tag,
	kind: 'hold',
	sets: sides ? 2 : 1,
	lo: seconds,
	hi: seconds,
	progress: { of: 'none' },
	...(sides ? { side: 'sets' as const } : {}),
	rest: YOGA_REST,
	note
});
const strengthPose = (name: string, tag: string, lo: number, hi: number, note: string, sides = false, sets = sides ? 2 : 1): Exercise => ({
	name,
	equip: 'Mat',
	tag,
	kind: 'hold',
	sets,
	lo,
	hi,
	progress: { of: 'time', inc: 5 },
	...(sides ? { side: 'sets' as const } : {}),
	rest: YOGA_REST,
	note
});
const YOGA_CUE = 'Breathe out through the hard part — never hold your breath.';
const CAT_COW: PrepItem = { name: 'Cat–Cow', seconds: 60 };
const SUN_SALUTATION: PrepItem = { name: 'Sun Salutation A', reps: 3 };
const SAVASANA: PrepItem[] = [{ name: 'Savasana', minutes: 2 }];
const SUPINE_TWIST = pose('Supine Twist', 'Spine', 45, 'Rotation and a down-regulating finish before the two quiet minutes. Knees across, shoulders stay down.', true);
const SIDE_PLANK: Exercise = {
	name: 'Side Plank',
	equip: 'Mat',
	tag: 'Core',
	kind: 'hold',
	sets: 2,
	lo: 20,
	hi: 45,
	progress: { of: 'time', inc: 5 },
	side: 'sets',
	note: 'Elbow under the shoulder; knees bent and stacked to start, feet stacked once that’s easy. Hips up in a line, breathe. At 45 s: top knee onto a bench — Copenhagen.'
};

/* ---------- bodyweight --------------------------------------------------- */

/**
 * The no-gym block: push, hinge, squat and core get real progression — a
 * harder variant, then more reps — and the pull gets what a floor can offer,
 * which is not much. With no weight to add, the VARIANT is the progression:
 * every set at the top of the range and the exercise becomes a harder
 * exercise, reps back to the bottom. One figure per ladder — the dot
 * athlete does a push-up whichever version you are on.
 */
const BW_REST = 45;
const ladder = (name: string, equip: string, tag: string, sets: number, lo: number, hi: number, rungs: string[], note: string, each = false): Exercise => ({
	name,
	equip,
	tag,
	kind: 'reps',
	sets,
	lo,
	hi,
	progress: { of: 'variant', ladder: rungs },
	...(each ? { side: 'reps' as const } : {}),
	rest: BW_REST,
	note
});
const PUSHUP = ladder('Push-up', 'Floor', 'Horiz. push', 3, 8, 15, ['Incline push-up', 'Push-up', 'Decline push-up', 'Archer push-up'],
	'Hands under the shoulders, body one line from ear to heel, chest to a fist off the floor. Start on a step or a counter; the floor is the second rung.');
const SPLIT_SQUAT = ladder('Split Squat', 'Floor', 'Squat', 3, 8, 12, ['Split squat', 'Rear-foot-elevated split squat', 'Paused split squat', '1½-rep split squat'],
	'Long stance, front shin upright, rear knee to a fist off the floor. All reps on one leg, weaker leg first.', true);
const BW_SQUAT = ladder('Bodyweight Squat', 'Floor', 'Squat', 3, 12, 20, ['Bodyweight squat', 'Paused squat', '3-0-3 tempo squat'],
	'Hands at the chest like the goblet. Sit between the knees, chest tall, as deep as the back stays flat.');
const REVERSE_LUNGE = ladder('Reverse Lunge', 'Floor', 'Lunge', 3, 10, 12, ['Reverse lunge', 'Deficit reverse lunge', 'Walking lunge'],
	'Same as the dumbbell version without the bell: long step back, front shin vertical, drive up through the front heel.', true);
const STEP_UP = ladder('Step-up', 'A stair or a chair', 'Lunge', 3, 8, 12, ['Step-up', 'Higher step-up', 'Slow-lower step-up'],
	'Whole foot on the step; drive through the heel, no push off the back leg. Lower under control.', true);
const SL_RDL = ladder('Single-leg RDL Reach', 'Floor', 'Hinge', 3, 8, 12, ['Single-leg RDL reach', 'Eyes-closed single-leg RDL', 'Paused single-leg RDL'],
	'Soft knee, hips back, the free leg reaching behind and the hand toward the floor. Stop when the hamstring pulls.', true);
const SL_BRIDGE = ladder('Single-leg Hip Bridge', 'Floor', 'Hip ext.', 3, 10, 15, ['Single-leg hip bridge', 'Paused single-leg bridge', 'Feet-up single-leg bridge'],
	'One foot flat, the other leg long; drive to level hips, squeeze, lower. The floor version of the dumbbell bridge.', true);
const SL_CALF = ladder('Single-leg Calf Raise', 'A stair', 'Calves', 3, 12, 20, ['Single-leg calf raise', 'Paused single-leg calf raise', 'Slow-lower single-leg calf raise'],
	'Ball of the foot on the edge, heel below the step at the bottom; up, pause, slow down. Same movement as the gym.', true);
const BEAR_CRAWL: Exercise = {
	name: 'Bear Crawl',
	equip: 'Floor',
	tag: 'Carry',
	kind: 'hold',
	sets: 3,
	lo: 40,
	hi: 40,
	progress: { of: 'none' },
	rest: BW_REST,
	note: 'Hands under the shoulders, knees an inch off the floor, opposite hand and foot together — shoulders and core under movement, the closest thing a floor has to a carry. Easy at 40 s? Slower, then backwards.'
};
const SUPERMAN: Exercise = {
	name: 'Superman Hold',
	equip: 'Floor',
	tag: 'Back',
	kind: 'hold',
	sets: 3,
	lo: 20,
	hi: 40,
	progress: { of: 'time', inc: 5 },
	rest: BW_REST,
	note: 'Prone, arms and legs lifted, chin down. The only posterior-chain "pull" a floor allows — honest about being weak. At 40 s: arms overhead, then alternating.'
};
const HOLLOW: Exercise = {
	name: 'Hollow Hold',
	equip: 'Floor',
	tag: 'Core',
	kind: 'hold',
	sets: 3,
	lo: 20,
	hi: 40,
	progress: { of: 'time', inc: 5 },
	rest: BW_REST,
	note: 'Low back pressed into the floor, shoulders and legs off it. Knees bent if the back lifts. At 40 s: arms overhead, then rocking.'
};
const REVERSE_CRUNCH = ladder('Reverse Crunch', 'Floor', 'Core', 3, 10, 15, ['Reverse crunch', 'Slow-lower reverse crunch', 'Straight-leg reverse crunch'],
	'Knees at 90°, hips curl up off the floor, low back kept down. Lower slowly.');
const PLANK: Exercise = {
	name: 'Plank',
	equip: 'Floor',
	tag: 'Core',
	kind: 'hold',
	sets: 3,
	lo: 30,
	hi: 60,
	progress: { of: 'time', inc: 5 },
	rest: BW_REST,
	note: 'Elbows under the shoulders, glutes squeezed, ribs down. At 60 s: elbows a palm forward (long-lever), then one foot up.'
};
const DEAD_BUG: Exercise = {
	name: 'Dead Bug',
	equip: 'Mat',
	tag: 'Core',
	kind: 'reps',
	sets: 3,
	lo: 8,
	hi: 12,
	progress: { of: 'count' },
	side: 'reps',
	note: 'Low back and ribs pressed down; exhale as the opposite arm and leg lower slowly. Too hard? Tap the heels. Easy at 12? Take 3 seconds to lower.'
};
const BW_WARMUP: PrepItem[] = [
	{ name: 'March in place', seconds: 60 },
	{ name: 'Leg swings', reps: 10, each: true },
	{ name: 'Arm circles', reps: 10, each: true },
	{ name: 'Bodyweight squats', reps: 10 }
];
const BW_COOLDOWN: PrepItem[] = [
	{ name: 'Hip flexor stretch', seconds: 45, each: true },
	{ name: 'Hamstring stretch', seconds: 45, each: true }
];

export const DEFAULT_PLANS: Plan[] = [
	{
		id: 'ab-fullbody-v1',
		name: 'Open to Work',
		description:
			'Full-body A/B on dumbbells, kettlebells and machines, with yoga, a morning stretch and an easy run turning alongside it — and a no-equipment block for the weeks without a gym. Currently accepting all opportunities to pick things up and put them down.',
		schedule: 'Lift Mon / Wed / Fri · Yoga twice · Run 3×/week',
		// 90s between sets: these are compounds first, machines second
		rest: 90,
		cooldown: COOLDOWN,
		/**
		 * The week, stated. Each cycle turns at its own cadence and the target
		 * is written by the plan, never the user: cadence is a training
		 * decision, and a dial would be a second source of truth. The no-gym
		 * block is off (target 0) until the gym is ruled out, when it takes
		 * the lift's target.
		 */
		cycles: [
			{ id: 'lift', title: 'Lift', routines: ['A', 'B'], target: 3 },
			{ id: 'yoga', title: 'Yoga', routines: ['hips', 'spine'], target: 2 },
			{ id: 'mob', title: 'Stretch', routines: ['S'], target: 3 },
			{ id: 'run', title: 'Run', routines: ['run'], target: 3 },
			{ id: 'bw', title: 'No gym', routines: ['bw1', 'bw2', 'hips', 'bw4', 'bw5', 'bw6', 'spine'], target: 0, standsInFor: 'lift' }
		],
		routineInfo: {
			A: { title: 'Squat & Shove', discipline: 'lift', desc: 'Squat · push · pull · hinge · calves · core', warmup: WARMUP },
			B: { title: 'Hinge & Haul', discipline: 'lift', desc: 'Hinge · press · row · lunge · calves · core', warmup: WARMUP },
			S: { title: 'Morning stretch', discipline: 'mobility', desc: 'Calves · hips · hamstrings · glutes · chest', warmup: [], cooldown: [] },
			run: { title: 'Easy run', discipline: 'run', desc: 'Drills · 30 easy · a walk down', warmup: RUN_WARMUP, cooldown: RUN_COOLDOWN },
			// the body you actually have: hip flexors shortened by a chair,
			// hamstrings and calves shortened by running
			hips: { title: 'Hips & Hamstrings', discipline: 'yoga', desc: 'Hip flexors · hamstrings · glutes · a twist', warmup: [CAT_COW, { name: 'Downward Dog', seconds: 45 }, SUN_SALUTATION], cooldown: SAVASANA, cue: YOGA_CUE },
			// the other half of the desk problem: a mid-back that has forgotten
			// how to extend and rotate, and shoulders that live rolled forward
			spine: { title: 'Shoulders & Spine', discipline: 'yoga', desc: 'Shoulders · thoracic spine · core · a twist', warmup: [CAT_COW, SUN_SALUTATION], cooldown: SAVASANA, cue: YOGA_CUE },
			bw1: { title: 'Push & Squat', discipline: 'bodyweight', desc: 'Push · split squat · bridge · hollow', warmup: BW_WARMUP, cooldown: BW_COOLDOWN },
			bw2: { title: 'Hinge & Carry', discipline: 'bodyweight', desc: 'Hinge · lunge · crawl · side plank', warmup: BW_WARMUP, cooldown: BW_COOLDOWN },
			bw4: { title: 'Push & Squat II', discipline: 'bodyweight', desc: 'Tempo push · squat · step-up · dead bug', warmup: BW_WARMUP, cooldown: BW_COOLDOWN },
			bw5: { title: 'Back & Core', discipline: 'bodyweight', desc: 'Superman · reverse crunch · plank · bridge', warmup: BW_WARMUP, cooldown: BW_COOLDOWN },
			bw6: { title: 'Legs', discipline: 'bodyweight', desc: 'Split squat · hinge · lunge · calves', warmup: BW_WARMUP, cooldown: BW_COOLDOWN }
		},
		routines: {
			A: [
				// 6–12, not 8–12: the dumbbell rack steps 14–20% at these sizes, and a
				// wider window is what lets a level-up land inside the range
				{ name: 'Goblet Squat', equip: 'Kettlebell / Dumbbell', tag: 'Squat', kind: 'load', sets: 3, lo: 6, hi: 12, progress: { of: 'size', start: 35, inc: 5, rack: 'dumbbell' }, note: 'Bell at the sternum, elbows down. Sit between the knees, knees over toes, chest tall. As deep as the back stays flat. 35 is the whole load.' },
				{ name: 'Chest Press', equip: 'Chest press machine (on a multi-press: arm flat)', tag: 'Horiz. push', kind: 'load', sets: 3, lo: 8, hi: 12, progress: { of: 'size', start: 45, inc: 5 }, note: 'Seat so the handles meet mid-chest. Shoulder blades back on the pad; press to nearly straight, lower until the handles touch the chest.' },
				// Nothing else here trains external rotation or the rear delt: the one
				// shoulder-health input with trial evidence behind it. A tube band anchored
				// at face height stands in for the cable — no rope station at this gym.
				// Light, after the press.
				{ name: 'Band Face Pull', equip: 'Tube band, anchored', tag: 'Rear delt / ER', kind: 'reps', sets: 2, lo: 12, hi: 20, progress: { of: 'count' }, note: 'Anchor the tube at face height (a post, or the door anchor); step back till it’s taut with arms straight. Pull to the ears, elbows high and wide, thumbs back. At 20 clean: a step back, or a heavier tube.' },
				{ name: 'Lat Pulldown', equip: 'Pulldown machine', tag: 'Vert. pull', kind: 'load', sets: 3, lo: 8, hi: 12, progress: { of: 'size', start: 65, inc: 10 }, note: 'Slight lean back, chest up. Drive the elbows down; bar to the upper chest, in front of the face. Control it back to a full stretch.' },
				{ name: 'Romanian Deadlift', equip: 'Dumbbells', tag: 'Hinge', kind: 'load', sets: 3, lo: 6, hi: 12, progress: { of: 'size', start: 40, inc: 5, rack: 'dumbbell', each: true }, note: 'Soft knees, set once. Push the hips back; bells slide down the thighs, touching. Stop when the hamstrings pull or the back would round.' },
				CALF_RAISE,
				// A hard 10–20 s hold, not a long one: past the ceiling the plank gets
				// harder (feet up), never longer. Replaced the med-ball plank, which no
				// one can load alone and which had quietly become a 60-second sit.
				{ name: 'Long-Lever Plank', equip: 'Mat', tag: 'Core', kind: 'hold', sets: 3, lo: 10, hi: 20, progress: { of: 'time', inc: 5 }, note: 'Elbows a palm past the shoulders. Glutes squeezed, ribs down, hard 10–20 s. At 20 s on all three: feet up on a bench.' }
			],
			B: [
				{ name: 'KB Deadlift', equip: 'Kettlebell', tag: 'Hinge', kind: 'load', sets: 3, lo: 6, hi: 12, progress: { of: 'size', start: 53, inc: 9, rack: 'kettlebell' }, note: 'Bell under mid-foot. Hips back, chest up, shins vertical. Push the floor away; stand tall and squeeze. Steps are whole bells — 24 → 28 → 32 kg.' },
				{ name: 'Shoulder Press', equip: 'Shoulder press machine (on a multi-press: arm overhead)', tag: 'Vert. push', kind: 'load', sets: 3, lo: 8, hi: 12, progress: { of: 'size', start: 30, inc: 5 }, note: 'Seat so the handles start at the shoulders. Ribs down, no arching. Elbows slightly forward; press up without shrugging.' },
				{ name: 'Seated Row', equip: 'Seated cable row, V-handle', tag: 'Horiz. pull', kind: 'load', sets: 3, lo: 8, hi: 12, progress: { of: 'size', start: 65, inc: 10 }, note: 'Torso upright and still. Drive the elbows back along the ribs, squeeze the blades. Not the pulldown — that pulls from overhead.' },
				// A knee-dominant compound, not the leg-extension machine it replaces:
				// Hinge & Haul had no squat pattern, and nothing in the plan was single-leg
				// — which matters most for someone running three times a week.
				{ name: 'DB Reverse Lunge', equip: 'Dumbbells', tag: 'Lunge', kind: 'load', sets: 3, lo: 8, hi: 12, progress: { of: 'size', start: 20, inc: 5, rack: 'dumbbell', each: true }, side: 'reps', note: 'All 8–12 on one leg, then switch; weaker leg first. Long step back, front shin vertical, drive up through the front heel.' },
				{ name: 'Leg Curl', equip: 'Seated leg curl (lying is fine)', tag: 'Hamstrings', kind: 'load', sets: 3, lo: 10, hi: 15, progress: { of: 'size', start: 60, inc: 10 }, note: 'Seated if you can — hamstrings grow more at length. Knee in line with the pivot, pad above the ankle, hips pinned. Full curl, pause, slow back.' },
				CALF_RAISE,
				// Squat & Shove resists extension; this resists the side-bend AND loads the
				// adductors, which nothing else in a front-to-back plan touches.
				// Progress by reps, then by lever — never by seconds.
				{ name: 'Copenhagen Plank', equip: 'Bench', tag: 'Core / adductors', kind: 'reps', sets: 2, lo: 5, hi: 15, progress: { of: 'count' }, side: 'sets', note: 'Side plank with the top knee on a bench, bottom leg lifting to meet it. One rep = lift and lower. At 15 clean, straighten the top leg.' }
			],
			// Not strength work — static holds at realistic doses build none
			// (TRAINING.md [23]). This is the runner's five, held long enough to
			// feel, on a morning that isn't a lift.
			S: [
				HOLD45('Calf stretch', 'Heel down, knee straight, lean into the wall.'),
				HOLD45('Hip flexor stretch', 'Back knee down, tuck the tailbone, lean until the front of the hip pulls.'),
				HOLD45('Hamstring stretch', 'Heel up on a step, hinge from the hips, back flat.'),
				HOLD45('Figure-4 stretch', 'Ankle over the knee, sit back until the glute pulls.'),
				{ ...HOLD45('Doorway chest stretch', 'Forearms on the frame, elbows at shoulder height, step through until the chest opens.'), sets: 1, side: undefined }
			],
			run: [EASY_RUN],
			hips: [
				pose('Low Lunge', 'Hip flexor', 45, 'The front of the hip, shortened all day by a chair and all run by a stride. Back knee down, front knee over the ankle, torso tall.', true),
				pose('Half Splits', 'Hamstrings', 45, 'Hamstring at length with the back kept flat — the safe version of a forward fold. Hips back over the rear knee, front toes up.', true),
				strengthPose('Chair Pose', 'Squat', 20, 45, 'Quads and spinal erectors under real isometric load — a squat you hold. Knees over the ankles, arms in line with the torso.', false, 2),
				strengthPose('Warrior II', 'Lunge', 30, 45, 'Front thigh loaded, back hip open; the only adductor length in the routine. Front knee to 90°, arms in a T.', true),
				pose('Pigeon', 'Hip', 60, 'Glute and the deep hip rotators. Reclined figure-4 if the front knee complains.', true),
				strengthPose('Bridge', 'Hip ext.', 20, 45, 'Hip extension against gravity, the direct antidote to sitting. Feet flat and close, hips up until hip and knee are in line.', false, 2),
				pose('Seated Forward Fold', 'Hamstrings', 60, 'Whole posterior chain, calves included. Bend the knees; this is not a contest.'),
				SUPINE_TWIST
			],
			spine: [
				strengthPose('Downward Dog', 'Shoulders', 30, 60, 'Shoulder flexion and calf length in one shape. Held, not passed through: hips the apex, head between the arms, heels reaching.'),
				pose('Puppy Pose', 'Thoracic', 45, 'Thoracic extension with the hips stacked over the knees — the bit of the spine a desk locks. Chest and arms down the mat.'),
				pose('Thread the Needle', 'Thoracic', 45, 'Thoracic rotation, which nothing else in the week asks for. One shoulder to the mat, the arm threaded under.', true),
				pose('Sphinx', 'Low back', 60, 'Gentle low-back extension. The forearms keep it out of the range that aggravates.'),
				pose('Cow-Face Arms', 'Shoulders', 45, 'Shoulder external rotation and lats — the unloaded cousin of the face pull. One arm overhead and bent behind the head, the other behind the low back.', true),
				strengthPose('Forearm Plank', 'Core', 20, 60, 'Anti-extension core, held against gravity with the ribs pulled down. One line from ear to heel.'),
				SIDE_PLANK,
				pose('Child’s Pose, side reach', 'Lats', 45, 'Lat length, one side at a time, and a breath back to neutral. Hips on the heels, both arms walked to one side.', true),
				SUPINE_TWIST
			],
			bw1: [PUSHUP, SPLIT_SQUAT, SL_BRIDGE, HOLLOW],
			bw2: [SL_RDL, REVERSE_LUNGE, BEAR_CRAWL, { ...SIDE_PLANK, equip: 'Floor', sets: 6, rest: BW_REST }],
			bw4: [{ ...PUSHUP, note: 'Tempo: three seconds down, a pause at the bottom, up. Same ladder as Push & Squat — the tempo is this routine’s extra.' }, BW_SQUAT, STEP_UP, DEAD_BUG],
			bw5: [SUPERMAN, REVERSE_CRUNCH, PLANK, SL_BRIDGE],
			bw6: [SPLIT_SQUAT, SL_RDL, REVERSE_LUNGE, SL_CALF]
		}
	},
	{
		id: 'her-12-v1',
		name: 'Full Range of Motion',
		description:
			'Deep-ROM lifts at moderate reps. Strength through the full range of motion — mobility you can load, dosed for visible change at three days a week. Runs stay with Coach Bennett — log the minutes after.',
		// She asked for regimented, so the schedule names days instead of counts.
		schedule: 'Lift Mon / Thu (+ Sat when it fits) · Run Wed / Sat with NRC',
		rest: 60,
		cooldown: HER_COOLDOWN,
		cue: HER_CUE,
		cycles: [
			// Mon and Thu are the promise; Saturday is the bonus
			{ id: 'lift', title: 'Lift', routines: ['1', '2'], target: 2 },
			{ id: 'run', title: 'Run', routines: ['run'], target: 2 }
		],
		routineInfo: {
			'1': { title: 'Get Low', discipline: 'lift', desc: 'Deep squat · hinge · push · pull · rear delt · core', warmup: HER_WARMUP },
			'2': { title: 'Bridge Club', discipline: 'lift', desc: 'Lunge · curl · press · row · bridge · calves · core', warmup: HER_WARMUP },
			run: { title: 'Easy run', discipline: 'run', desc: 'Drills · 30 easy · a walk down', warmup: RUN_WARMUP, cooldown: RUN_COOLDOWN }
		},
		routines: {
			'1': [
				{ name: 'Deep Goblet Squat', equip: 'One dumbbell (plate under heels optional)', tag: 'Squat', kind: 'load', sets: 3, lo: 8, hi: 15, progress: { of: 'size', start: 20, inc: 5, rack: 'dumbbell' }, note: 'One bell at the chest — 20 is the whole load. Sit deep until the elbows brush the knees; stop if the heels rise or the tailbone tucks.' },
				// Hinge while fresh, ahead of the machines. 15s to learn the pattern —
				// the old 25/hand start was ~100% of a typical beginner max, and the
				// ledger shows it got quietly corrected on day one.
				{ name: 'Romanian Deadlift', equip: 'Two dumbbells', tag: 'Hinge', kind: 'load', sets: 3, lo: 8, hi: 15, progress: { of: 'size', start: 15, inc: 5, rack: 'dumbbell', each: true }, note: 'Soft knees, set once. Push the hips back; bells slide down the thighs, touching. Stop when the hamstrings pull or the back would round.' },
				// 6–15, not 8–15: the smallest stack step on a press is a 25–33% jump
				// at these loads, and the wider floor is what keeps a post-jump set
				// inside the range instead of reading as a miss.
				{ name: 'Chest Press', equip: 'Chest press machine (on a multi-press: arm flat)', tag: 'Horiz. push', kind: 'load', sets: 3, lo: 6, hi: 15, progress: { of: 'size', start: 20, inc: 5 }, note: 'Seat so the handles meet mid-chest; feet flat, on a step if they don’t reach. Shoulder blades back; press to nearly straight, lower to the chest.' },
				{ name: 'Lat Pulldown', equip: 'Pulldown machine', tag: 'Vert. pull', kind: 'load', sets: 3, lo: 8, hi: 15, progress: { of: 'size', start: 40, inc: 5 }, note: 'Thigh pad snug so the hips can’t lift. Slight lean back, chest up; bar to the upper chest, in front of the face. Control back to a full stretch.' },
				{ name: 'Band Face Pull', equip: 'Tube band, anchored', tag: 'Rear delt / ER', kind: 'reps', sets: 2, lo: 12, hi: 20, progress: { of: 'count' }, note: 'Anchor the tube at face height (a post, or the door anchor); step back till it’s taut with arms straight. Pull to the ears, elbows high and wide, thumbs back. At 20 clean: a step back, or a heavier tube.' },
				DEAD_BUG
			],
			'2': [
				{ name: 'DB Reverse Lunge', equip: 'Two dumbbells (bodyweight first session)', tag: 'Lunge', kind: 'load', sets: 3, lo: 8, hi: 15, progress: { of: 'size', start: 10, inc: 5, rack: 'dumbbell', each: true }, side: 'reps', note: 'First session: no bells. All reps on one leg, weaker leg first. Long step back, front shin upright, drive up through the front heel.' },
				{ name: 'Leg Curl', equip: 'Seated leg curl (lying is fine)', tag: 'Hamstrings', kind: 'load', sets: 3, lo: 10, hi: 15, progress: { of: 'size', start: 40, inc: 5 }, note: 'Seated if you can — hamstrings grow more at length. Knee in line with the pivot, pad above the ankle, hips pinned. Full curl, pause, slow back.' },
				{ name: 'Shoulder Press', equip: 'Shoulder press machine (on a multi-press: arm overhead)', tag: 'Vert. push', kind: 'load', sets: 3, lo: 6, hi: 15, progress: { of: 'size', start: 15, inc: 5 }, note: 'Handles start at shoulder height — if you must shrug to reach them, raise the seat. Ribs down, no arching; press up without shrugging.' },
				{ name: 'Seated Row', equip: 'Seated cable row, V-handle', tag: 'Horiz. pull', kind: 'load', sets: 3, lo: 8, hi: 15, progress: { of: 'size', start: 40, inc: 5 }, note: 'Feet on the plates, torso upright and still. Drive the elbows back along the ribs, squeeze the blades, then let the arms straighten fully.' },
				{ name: 'DB Glute Bridge', equip: 'One dumbbell + folded mat as a pad', tag: 'Hip ext.', kind: 'load', sets: 3, lo: 10, hi: 15, progress: { of: 'size', start: 25, inc: 5, rack: 'dumbbell' }, note: 'Bell on the pad across the hips — 25 is the load. Chin tucked, ribs down; drive to level hips, squeeze, pause, lower. Easy at 35? Shoulders up on a bench.' },
				{ ...CALF_RAISE, progress: { of: 'size', start: 50, inc: 10 } },
				SIDE_PLANK
			],
			run: [EASY_RUN]
		}
	}
];
