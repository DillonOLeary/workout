import { MAX_REPS, PRACTICES, composePlan, type Block, type Exercise, type Plan, type PrepItem, type Routines } from './plan';

/** One sentence per exercise on why it is in the plan — the floor-level cousin of The Plan › why; shown on the About sheet. */
const WHY: Record<string, string> = {
	'Goblet Squat': 'The squat pattern with the load held in front, which keeps the torso honest and the knees free — the one lower-body lift every week needs.',
	'Romanian Deadlift': 'The hinge: hamstrings and glutes at length, the pattern a run leans on and a squat doesn\'t train.',
	'KB Deadlift': 'The hinge learned from the floor, the bell between the feet — the same pattern as the RDL, easier to feel.',
	'Shoulder Press': 'The vertical push: shoulders and triceps, the one press the chest press doesn\'t cover.',
	'Seated Row': 'The horizontal pull that balances the press — upper back and biceps, the posture muscles.',
	'Long-Lever Plank': 'Core as a hold against extension; the long lever roughly doubles the abdominal work of a plank at the same length.',
	'DB Reverse Lunge': 'The squat on one leg at a time — balance and the front leg\'s glute, without the knee stress of stepping forward.',
	'Chest Press': 'The horizontal push: chest, shoulders and triceps, at the plan\'s maintenance dose.',
	'Lat Pulldown': 'The vertical pull that pairs with the press overhead; lats and grip.',
	'DB Glute Bridge': 'Hip extension with the knees bent, which isolates the glutes the way a hinge can\'t.',
	'Standing Calf Raise': 'Calves absorb more force in running than any other muscle, and calf strength tracks running economy in trials.',
	'Deep Goblet Squat': 'The squat through its whole range — loaded full-range work improves how far a joint moves about as much as stretching does.',
	'Band Face Pull': 'The one shoulder-health input with a trial behind it: rear delts and the external rotators, the muscles pressing forgets.',
	'Leg Curl': 'Hamstrings at length, seated — trained long they grew about half again more in a direct trial.',
	'Copenhagen Plank': 'The adductor exercise with an injury-prevention trial behind it; the top of the side plank\'s ladder.',
	'Dead Bug': 'Core against extension while the limbs move — the low back learns to stay down while the legs work.',
	'Side Plank': 'The core from the side, one side at a time; its ladder ends at the Copenhagen plank.',
	'Band Row': 'The floor\'s horizontal pull, wherever a band goes — the cable row\'s job, done seated with the band round the feet.',
	'Single-leg RDL Reach': 'The hinge on one leg: hamstrings, balance and the foot\'s small muscles at once.',
	'Single-leg Hip Bridge': 'Glutes one side at a time; the floor\'s version of the dumbbell bridge.',
	'Hollow Hold': 'Core against extension with the legs long — the position every other hold borrows.',
	'Calf stretch': 'The run and the calf raise both shorten the calves; this is the length back.',
	'Hip flexor stretch': 'Sitting and running both keep the hip flexors short; a long one is what lets the glute finish a stride.',
	'Hamstring stretch': 'The hinge and the run both load the hamstrings; the stretch keeps the bottom of the hinge honest.',
	'Figure-4 stretch': 'The deep hip rotators tighten under running and sitting alike; this is the stretch that reaches them.',
	'Doorway chest stretch': 'Pressing and a desk both round the shoulders forward; the doorway opens the chest so the pull has somewhere to go.',
	'Low Lunge': 'Hip flexors at length with the back knee down — the reach the run and the chair both take away.',
	'Half Splits': 'Hamstrings at length from the kneel, one leg at a time.',
	'Chair Pose': 'A squat you hold: quads and glutes under time, the strength pose of the hips routine.',
	'Warrior II': 'Hips open, the front knee working, the arms held — strength and balance in one shape.',
	'Pigeon': 'The deep hip rotators — the one shape that reaches under the glute.',
	'Bridge': 'Hip extension with the spine long: the glutes and the front of the hip both.',
	'Seated Forward Fold': 'Hamstrings and the whole back line, breathed.',
	'Supine Twist': 'Rotation, and a quiet finish before the two minutes of savasana.',
	'Downward Dog': 'Shoulders loaded overhead, hamstrings and calves long — the whole back line at once.',
	'Puppy Pose': 'The mid-back in extension and the lats at length — the desk\'s opposite.',
	'Thread the Needle': 'Rotation through the mid-back, one side at a time — where a stiff neck and a stiff low back both start.',
	'Sphinx': 'Gentle extension for the low back, which a day of sitting never asks of it.',
	'Cow-Face Arms': 'Shoulder rotation both ways at once — one arm reaching over, the other behind.',
	'Child’s Pose, side reach': 'The lats and the side body at length; a rest that still stretches.'
};
const why = (name: string): { why?: string } => (WHY[name] ? { why: WHY[name] } : {});

const CALF_RAISE: Exercise = {
	name: 'Standing Calf Raise',
	...why('Standing Calf Raise'),
	equip: 'Calf raise machine',
	tag: 'Calves',
	kind: 'load',
	sets: 3,
	lo: 10,
	hi: 15,
	progress: { of: 'size', start: 90, inc: 10 },
	note: 'Heels all the way down, pause; all the way up, pause. Slow both ways — the tendon likes slow.'
};

const WARMUP = [
	'3–5 min easy — bike, row or a brisk walk',
	'One bodyweight set of the first lift',
	'One half-weight set of the first lift'
];

const HER_WARMUP = ['5 min easy bike', '10 bodyweight squats', '10 hip hinges', '1 light set of the first lift'];
const HER_CUE = 'Exhale through the hard part — never hold your breath.';

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

/** A stretch: a 45 s hold at a fixed length (lo === hi, progress none), one set per side with ten seconds between — or one set, both sides at once. */
const HOLD45 = (name: string, note?: string, sides = true): Exercise => ({
	name,
	...why(name),
	equip: 'Mat',
	tag: 'Stretch',
	kind: 'hold',
	sets: sides ? 2 : 1,
	lo: 45,
	hi: 45,
	progress: { of: 'none' },
	...(sides ? { side: 'sets' as const } : {}),
	rest: 10,
	...(note ? { note } : {})
});

/** The stretch catalogue: every stretch declared once, and referenced by name from the morning stretch and every cooldown. */
export const STRETCHES: Record<string, Exercise> = {
	'Calf stretch': HOLD45('Calf stretch', 'Back heel down, back knee straight, lean into the wall.'),
	'Hip flexor stretch': HOLD45('Hip flexor stretch', 'Back knee down, tuck the tailbone, lean until the front of the hip pulls.'),
	'Hamstring stretch': HOLD45('Hamstring stretch', 'Heel up on a step, hinge from the hips, back flat.'),
	'Figure-4 stretch': HOLD45('Figure-4 stretch', 'Ankle over the knee, sit back until the glute pulls.'),
	'Doorway chest stretch': HOLD45('Doorway chest stretch', 'Forearms on the frame at shoulder height; step through until the chest opens.', false)
};
/** a stretch as a cooldown line: the catalogue's entry, held this long — it walks as holds and logs like one */
const stretch = (name: string, seconds = 45): Exercise => {
	const s = STRETCHES[name];
	if (!s) throw new Error(`no stretch called "${name}" in the catalogue`);
	return seconds === s.lo ? s : { ...s, lo: seconds, hi: seconds };
};
const COOLDOWN: PrepItem[] = [stretch('Calf stretch'), stretch('Hip flexor stretch'), stretch('Doorway chest stretch')];
const HER_COOLDOWN: PrepItem[] = [stretch('Hip flexor stretch', 60), stretch('Hamstring stretch', 60), stretch('Doorway chest stretch', 60)];
const RUN_COOLDOWN: PrepItem[] = [{ name: 'Walk', minutes: 3 }, stretch('Calf stretch'), stretch('Hip flexor stretch'), stretch('Hamstring stretch')];
const BW_COOLDOWN: PrepItem[] = [stretch('Hip flexor stretch'), stretch('Hamstring stretch')];

const YOGA_REST = 20; // a breath or two between holds — the flow is its own warm-up
/** A yoga hold at a fixed length — one set, or one per side. */
const pose = (name: string, tag: string, seconds: number, note: string, sides = false): Exercise => ({
	name,
	...why(name),
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
/** A loaded yoga hold that climbs by 5 s to `hi` — then harder, never longer. */
const strengthPose = (name: string, tag: string, lo: number, hi: number, note: string, sides = false, sets = sides ? 2 : 1): Exercise => ({
	name,
	...why(name),
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
const SUPINE_TWIST = pose('Supine Twist', 'Spine', 45, 'On your back, drop both knees to one side; the shoulders stay on the floor. Look the other way if the neck likes it.', true);
const SIDE_PLANK: Exercise = {
	name: 'Side Plank',
	...why('Side Plank'),
	equip: 'Mat',
	tag: 'Core',
	kind: 'hold',
	sets: 2,
	lo: 20,
	hi: 45,
	progress: { of: 'time', inc: 5 },
	side: 'sets',
	note: 'Elbow under the shoulder, hips lifted in one straight line. Knees bent and stacked to start, feet stacked once that’s easy; breathe. At 45 s: top knee onto a bench or a chair — the Copenhagen.'
};

const BW_REST = 45;
/** A bodyweight movement that progresses by variant: every set at `hi` → the next rung, reps back to `lo`. */
const ladder = (name: string, equip: string, tag: string, sets: number, lo: number, hi: number, rungs: string[], note: string, each = false): Exercise => ({
	name,
	...why(name),
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
const SL_RDL = ladder('Single-leg RDL Reach', 'Floor', 'Hinge', 3, 8, 12, ['Single-leg RDL reach', 'Eyes-closed single-leg RDL', 'Paused single-leg RDL'],
	'Soft knee, hips back, free leg reaching behind, hand toward the floor. Stop when the hamstring pulls. All the reps on one leg, then the other — weaker leg first, and log its count.', true);
const SL_BRIDGE = ladder('Single-leg Hip Bridge', 'Floor', 'Hip ext.', 3, 10, 15, ['Single-leg hip bridge', 'Paused single-leg bridge', 'Feet-up single-leg bridge'],
	'One foot flat, the other leg long; drive to level hips, squeeze, lower. All the reps on one leg, then the other — weaker leg first, and log its count.', true);
const HOLLOW: Exercise = {
	name: 'Hollow Hold',
	...why('Hollow Hold'),
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
const DEAD_BUG: Exercise = {
	name: 'Dead Bug',
	...why('Dead Bug'),
	equip: 'Mat',
	tag: 'Core',
	kind: 'reps',
	sets: 3,
	lo: 8,
	hi: 12,
	progress: { of: 'count' },
	side: 'reps',
	note: 'Low back pressed down; lower the opposite arm and leg slowly, breathing out. Alternate sides — the count is each side’s. Too hard? Tap the heels down. Easy at 12? Take 3 seconds to lower.'
};
const BAND_FACE_PULL: Exercise = {
	name: 'Band Face Pull',
	...why('Band Face Pull'),
	equip: 'Tube band, anchored',
	tag: 'Rear delt / ER',
	kind: 'reps',
	sets: 2,
	lo: 12,
	hi: 20,
	progress: { of: 'count' },
	note: 'Pull the band to your ears, elbows high and wide, thumbs back. Anchor the tube at face height (a post, or the door anchor) and step back until it’s taut with the arms straight. At 20 clean: a step back, or a heavier tube.'
};
const BAND_ROW: Exercise = {
	name: 'Band Row',
	...why('Band Row'),
	equip: 'Tube band',
	tag: 'Horiz. pull',
	kind: 'reps',
	sets: 3,
	lo: 12,
	hi: 20,
	progress: { of: 'count' },
	rest: BW_REST,
	note: 'Sit tall, legs long, the band round the soles; row the handles to the ribs, elbows close, and squeeze. No band today? Skip it — the rest of the session stands without it. At 20 clean: hold the band shorter, or a heavier one.'
};

// Invicta, Orc, Back in Action and The Giant are DAREBEE workouts (darebee.com/workouts/<name>-workout.html, CC BY-NC-ND 4.0),
// written down as the cards have them — stations, counts, order, levels and rest — and credited on the Plan tab. The cues are ours.
const CARD_REST = 120;
/** One station of a card at its count as written: reps, a hold's seconds, or max — `sets` is Level I; a circuit deals its own. */
const station = (name: string, equip: string, tag: string, count: number | 'max', note: string, kind: 'reps' | 'hold' = 'reps'): Exercise =>
	count === 'max'
		? { name, equip, tag, kind: 'reps', sets: 3, lo: 1, hi: MAX_REPS, max: true, progress: { of: 'count' }, note }
		: { name, equip, tag, kind, sets: 3, lo: count, hi: count, progress: { of: 'none' }, note };
const SQUATS = station('Squats', 'Floor', 'Squat', 20, 'To parallel, chest up, weight in the heels; the arms reach forward as you sit.');
const LUNGES = station('Lunges', 'Floor', 'Lunge', 20, 'Alternate legs, 10 each; the back knee drops close to the floor, the front knee stays over the foot.');
const PUSH_UPS = station('Push-ups', 'Floor', 'Horiz. push', 10, 'Full range, the body one line from head to heels.');
const INVICTA = [
	SQUATS,
	LUNGES,
	PUSH_UPS,
	station('Pike Push-ups', 'Floor', 'Vert. push', 10, 'Hips high in an upside-down V; bend the elbows and lower the top of the head toward the floor between the hands.'),
	station('Superman', 'Floor', 'Back', 10, 'Face down; lift the arms and the legs together, then lower them with control.'),
	station('Bridges', 'Floor', 'Hip ext.', 20, 'On the back, feet flat; drive the hips up and squeeze at the top.'),
	station('V Hold', 'Floor', 'Core', 20, 'Sit back on the tailbone, legs raised, arms out to the sides; hold for a slow count of 20 and breathe.', 'hold')
];
const ORC = [
	station('Split Squats', 'Two chairs', 'Squat', 20, 'Rear foot up on a chair, 10 a leg; the front knee stays over the foot. Chairs against a wall, tested first.'),
	station('Pike Shoulder Presses', 'A chair', 'Vert. push', 6, 'Feet up on a chair, hips high; lower the head toward the floor between the hands, elbows back, and press up.'),
	PUSH_UPS,
	station('Wide Grip Push-ups', 'Floor', 'Horiz. push', 4, 'Hands wider than the shoulders — the chest takes more of it.'),
	station('Close Grip Push-ups', 'Floor', 'Horiz. push', 4, 'Hands under the chest, elbows along the ribs — the arms take more of it.'),
	station('Leg Hold', 'Two chairs', 'Core', 20, 'Sit between two chairs, hands on the seats, arms locked; lift the feet and hold, shoulders away from the ears.', 'hold'),
	station('Towel Bicep Curls', 'A towel and a door', 'Pull', 20, 'A towel knotted round the handle of a closed, latched door; feet against the door, lean back on straight arms and curl yourself up. No towel? A sheet folded lengthways.')
];
const BACK_IN_ACTION = [
	station('Body Rows', 'A broom and two chairs', 'Horiz. pull', 'max', 'Under a broom handle laid across two sturdy chairs, heels down, body straight; pull the chest to the pole. No chairs? Under a sturdy table. Stop at the last clean rep.'),
	station('Twists', 'Standing', 'Spine', 10, 'Hands on the hips; turn the upper body side to side.'),
	station('Chest Expansions', 'Standing', 'Chest', 10, 'Arms open wide, then cross in front of the chest.'),
	station('Shoulder Stretch', 'Standing', 'Shoulders', 10, 'Hands on the hips, then both arms overhead, fingers laced, palms pushed up.'),
	station('Shoulder Presses', 'A chair', 'Vert. push', 'max', 'Feet on a chair seat, hands on the floor, hips high; lower the head toward the floor and press back. Stop at the last clean rep.'),
	station('Back Rotations', 'Floor', 'Spine', 10, 'On all fours, one hand behind the head; turn the elbow down under the body, then up to the ceiling. Half each side.')
];
const GIANT_SET_REST = 20;
const GIANT = [
	LUNGES,
	SQUATS,
	station('Push-ups to Failure', 'Floor', 'Horiz. push', 'max', 'The last rep is the last one with the body in one line — when the hips sag, the set is over.'),
	station('Elbow Plank', 'Floor', 'Core', 30, 'Elbows under the shoulders, one line from ear to heel; breathe.', 'hold'),
	station('Reverse Angels', 'Floor', 'Back', 10, 'Face down, arms and chest off the floor; sweep the arms from overhead to the hips and back.'),
	station('Leg Raises', 'Floor', 'Core', 20, 'On the back, the low back pressed down; straight legs from the floor to vertical and back.')
].map((ex) => ({ ...ex, rest: GIANT_SET_REST }));

const BW_WARMUP: PrepItem[] = [
	{ name: 'March in place', seconds: 60 },
	{ name: 'Leg swings', reps: 10, each: true },
	{ name: 'Arm circles', reps: 10, each: true },
	{ name: 'Bodyweight squats', reps: 10 }
];

/** Lift-only programmes, upserted into ledger_plans on boot; new ones are added at the table. */
export const DEFAULT_PROGRAMMES: Plan[] = [
	{
		id: 'ab-fullbody-v1',
		name: 'Open to Work',
		description:
			'Full-body A/B on dumbbells, kettlebells and machines. Squat & Shove · Hinge & Haul. The calendar is empty; Mon / Wed / Fri isn’t. Currently accepting all opportunities to pick things up and put them down.',
		schedule: 'Lift Mon / Wed / Fri',
		rest: 90,
		cooldown: COOLDOWN,
		cycles: [{ id: 'lift', title: 'Lift', routines: ['A', 'B'], target: 3 }],
		routineInfo: {
			A: { title: 'Squat & Shove', discipline: 'lift', desc: 'Squat · push · pull · hinge · calves · core', warmup: WARMUP },
			B: { title: 'Hinge & Haul', discipline: 'lift', desc: 'Hinge · press · row · lunge · calves · core', warmup: WARMUP }
		},
		routines: {
			A: [
				{ name: 'Goblet Squat', ...why('Goblet Squat'), equip: 'Kettlebell / Dumbbell', tag: 'Squat', kind: 'load', sets: 3, lo: 6, hi: 12, progress: { of: 'size', start: 35, inc: 5, rack: 'dumbbell' }, note: 'Bell at the chest, elbows down; sit between the knees, chest tall. As deep as the back stays flat, knees out over the toes. Stand by pushing the floor away.' },
				{ name: 'Chest Press', ...why('Chest Press'), equip: 'Chest press machine (on a multi-press: arm flat)', tag: 'Horiz. push', kind: 'load', sets: 3, lo: 8, hi: 12, progress: { of: 'size', start: 45, inc: 5 }, note: 'Handles at mid-chest, shoulder blades back; press to nearly straight. Lower until the handles reach the chest, blades on the pad. Set the seat so they start level with mid-chest.' },
				BAND_FACE_PULL,
				{ name: 'Lat Pulldown', ...why('Lat Pulldown'), equip: 'Pulldown machine', tag: 'Vert. pull', kind: 'load', sets: 3, lo: 8, hi: 12, progress: { of: 'size', start: 65, inc: 10 }, note: 'Chest up, drive the elbows down, bar to the upper chest. A slight lean back; the bar passes in front of the face. Let it rise slowly to a full stretch.' },
				{ name: 'Romanian Deadlift', ...why('Romanian Deadlift'), equip: 'Dumbbells', tag: 'Hinge', kind: 'load', sets: 3, lo: 6, hi: 12, progress: { of: 'size', start: 40, inc: 5, rack: 'dumbbell', each: true }, note: 'Push the hips back with soft knees; the bells slide down the thighs. Bend the knees once at the start and keep them there. Stop when the hamstrings pull or the back would round.' },
				CALF_RAISE,
				{ name: 'Long-Lever Plank', ...why('Long-Lever Plank'), equip: 'Mat', tag: 'Core', kind: 'hold', sets: 3, lo: 10, hi: 20, progress: { of: 'time', inc: 5 }, note: 'Plank with the elbows a palm past the shoulders; glutes tight, ribs down. Hard and short — 10–20 s. At 20 s on all three: feet up on a bench.' }
			],
			B: [
				{ name: 'KB Deadlift', ...why('KB Deadlift'), equip: 'Kettlebell', tag: 'Hinge', kind: 'load', sets: 3, lo: 6, hi: 12, progress: { of: 'size', start: 53, inc: 9, rack: 'kettlebell' }, note: 'Bell between the feet; hips back, chest up, push the floor away. Shins stay nearly vertical; stand tall and squeeze at the top. Steps are whole bells — 24 → 28 → 32 kg.' },
				{ name: 'Shoulder Press', ...why('Shoulder Press'), equip: 'Shoulder press machine (on a multi-press: arm overhead)', tag: 'Vert. push', kind: 'load', sets: 3, lo: 8, hi: 12, progress: { of: 'size', start: 30, inc: 5 }, note: 'Press up from the shoulders without shrugging; ribs down, no arching. Set the seat so the handles start at shoulder height, elbows slightly forward.' },
				{ name: 'Seated Row', ...why('Seated Row'), equip: 'Seated cable row, V-handle', tag: 'Horiz. pull', kind: 'load', sets: 3, lo: 8, hi: 12, progress: { of: 'size', start: 65, inc: 10 }, note: 'Sit tall, elbows back along the ribs, squeeze the shoulder blades. Stay still — no rocking — and let the arms straighten fully between reps.' },
				{ name: 'DB Reverse Lunge', ...why('DB Reverse Lunge'), equip: 'Dumbbells', tag: 'Lunge', kind: 'load', sets: 3, lo: 8, hi: 12, progress: { of: 'size', start: 20, inc: 5, rack: 'dumbbell', each: true }, side: 'reps', note: 'Long step back, front shin upright, drive up through the front heel. All the reps on one leg, then the other — weaker leg first, and log its count.' },
				{ name: 'Leg Curl', ...why('Leg Curl'), equip: 'Seated leg curl (lying is fine)', tag: 'Hamstrings', kind: 'load', sets: 3, lo: 10, hi: 15, progress: { of: 'size', start: 60, inc: 10 }, note: 'Full curl, pause, then slowly back; hips stay pinned. Knee in line with the machine’s pivot, pad just above the ankle. Seated if there’s a choice — hamstrings grow more trained long.' },
				CALF_RAISE,
				{ name: 'Copenhagen Plank', ...why('Copenhagen Plank'), equip: 'Bench', tag: 'Core / adductors', kind: 'reps', sets: 2, lo: 5, hi: 15, progress: { of: 'count' }, side: 'sets', note: 'Side plank with the top knee on a bench, bottom leg lifting to meet it. One rep is a lift and a lower. At 15 clean, straighten the top leg.' }
			]
		}
	},
	{
		id: 'her-12-v1',
		name: 'Full Range of Motion',
		description:
			'Deep-ROM lifts at moderate reps — strength through the whole range, mobility you can load. Get Low · Bridge Club. Dosed for visible change at three days a week.',
		schedule: 'Lift Mon / Thu (+ Sat when it fits)',
		rest: 60,
		cooldown: HER_COOLDOWN,
		cue: HER_CUE,
		cycles: [{ id: 'lift', title: 'Lift', routines: ['1', '2'], target: 2 }],
		routineInfo: {
			'1': { title: 'Get Low', discipline: 'lift', desc: 'Deep squat · hinge · push · pull · rear delt · core', warmup: HER_WARMUP },
			'2': { title: 'Bridge Club', discipline: 'lift', desc: 'Lunge · curl · press · row · bridge · calves · core', warmup: HER_WARMUP }
		},
		routines: {
			'1': [
				{ name: 'Deep Goblet Squat', ...why('Deep Goblet Squat'), equip: 'One dumbbell (plate under heels optional)', tag: 'Squat', kind: 'load', sets: 3, lo: 8, hi: 15, progress: { of: 'size', start: 20, inc: 5, rack: 'dumbbell' }, note: 'Bell at the chest; sit deep until the elbows brush the knees. Stop if the heels rise or the tailbone tucks — a plate under the heels helps.' },
				{ name: 'Romanian Deadlift', ...why('Romanian Deadlift'), equip: 'Two dumbbells', tag: 'Hinge', kind: 'load', sets: 3, lo: 8, hi: 15, progress: { of: 'size', start: 15, inc: 5, rack: 'dumbbell', each: true }, note: 'Push the hips back with soft knees; the bells slide down the thighs. Bend the knees once at the start and keep them there. Stop when the hamstrings pull or the back would round.' },
				{ name: 'Chest Press', ...why('Chest Press'), equip: 'Chest press machine (on a multi-press: arm flat)', tag: 'Horiz. push', kind: 'load', sets: 3, lo: 6, hi: 15, progress: { of: 'size', start: 20, inc: 5 }, note: 'Handles at mid-chest, shoulder blades back; press to nearly straight. Lower until the handles reach the chest. Feet flat — on a step if they don’t reach the floor.' },
				{ name: 'Lat Pulldown', ...why('Lat Pulldown'), equip: 'Pulldown machine', tag: 'Vert. pull', kind: 'load', sets: 3, lo: 8, hi: 15, progress: { of: 'size', start: 40, inc: 5 }, note: 'Chest up, drive the elbows down, bar to the upper chest. Thigh pad snug so the hips can’t lift; the bar passes in front of the face. Let it rise slowly to a full stretch.' },
				BAND_FACE_PULL,
				DEAD_BUG
			],
			'2': [
				{ name: 'DB Reverse Lunge', ...why('DB Reverse Lunge'), equip: 'Two dumbbells (bodyweight first session)', tag: 'Lunge', kind: 'load', sets: 3, lo: 8, hi: 15, progress: { of: 'size', start: 10, inc: 5, rack: 'dumbbell', each: true }, side: 'reps', note: 'Long step back, front shin upright, drive up through the front heel. All the reps on one leg, then the other — weaker leg first, and log its count. First session: no bells.' },
				{ name: 'Leg Curl', ...why('Leg Curl'), equip: 'Seated leg curl (lying is fine)', tag: 'Hamstrings', kind: 'load', sets: 3, lo: 10, hi: 15, progress: { of: 'size', start: 40, inc: 5 }, note: 'Full curl, pause, then slowly back; hips stay pinned. Knee in line with the machine’s pivot, pad just above the ankle. Seated if there’s a choice — hamstrings grow more trained long.' },
				{ name: 'Shoulder Press', ...why('Shoulder Press'), equip: 'Shoulder press machine (on a multi-press: arm overhead)', tag: 'Vert. push', kind: 'load', sets: 3, lo: 6, hi: 15, progress: { of: 'size', start: 15, inc: 5 }, note: 'Press up from the shoulders without shrugging; ribs down, no arching. If you have to shrug to reach the handles, raise the seat.' },
				{ name: 'Seated Row', ...why('Seated Row'), equip: 'Seated cable row, V-handle', tag: 'Horiz. pull', kind: 'load', sets: 3, lo: 8, hi: 15, progress: { of: 'size', start: 40, inc: 5 }, note: 'Sit tall, elbows back along the ribs, squeeze the shoulder blades. Feet on the plates; let the arms straighten fully between reps without rocking.' },
				{ name: 'DB Glute Bridge', ...why('DB Glute Bridge'), equip: 'One dumbbell + folded mat as a pad', tag: 'Hip ext.', kind: 'load', sets: 3, lo: 10, hi: 15, progress: { of: 'size', start: 25, inc: 5, rack: 'dumbbell' }, note: 'Bell across the hips; drive them up level, squeeze, pause, lower. Pad the bell with a folded mat; chin tucked, ribs down. Easy at 35? Shoulders up on a bench.' },
				{ ...CALF_RAISE, progress: { of: 'size', start: 50, inc: 10 } },
				SIDE_PLANK
			]
		}
	}
];

/** Shared cycles with their routines, on or off per person. */
export const BLOCKS: Block[] = [
	{
		id: 'yoga',		cycle: { id: 'yoga', title: 'Yoga', routines: ['hips', 'spine'], target: 2 },
		routineInfo: {
			hips: { title: 'Hips & Hamstrings', discipline: 'yoga', desc: 'Hip flexors · hamstrings · glutes · a twist', warmup: [CAT_COW, { name: 'Downward Dog', seconds: 45 }, SUN_SALUTATION], cooldown: SAVASANA, cue: YOGA_CUE },
			spine: { title: 'Shoulders & Spine', discipline: 'yoga', desc: 'Shoulders · thoracic spine · core · a twist', warmup: [CAT_COW, SUN_SALUTATION], cooldown: SAVASANA, cue: YOGA_CUE },
			studio: { title: 'Yoga class', discipline: 'yoga', desc: 'A class at the studio — just the time' }
		},
		routines: {
			hips: [
				pose('Low Lunge', 'Hip flexor', 45, 'Back knee down, front knee over the ankle; sink the hips forward, torso tall. Tuck the tailbone a little to feel the front of the back hip.', true),
				pose('Half Splits', 'Hamstrings', 45, 'From the low lunge, hips back over the back knee; front leg straight. Toes up; fold forward with a flat back, hands on the floor or blocks.', true),
				strengthPose('Chair Pose', 'Squat', 20, 45, 'Sit back as if into a chair, arms up in line with the torso. Knees over the ankles, weight in the heels; breathe.', false, 2),
				strengthPose('Warrior II', 'Lunge', 30, 45, 'Front knee bent over the ankle, back leg straight, arms out in a T. Hips open to the side; the front thigh works toward level.', true),
				pose('Pigeon', 'Hip', 60, 'Front shin across the mat, back leg long behind; sink the hips square. If the front knee complains, lie back and cross the ankle over the other knee instead.', true),
				strengthPose('Bridge', 'Hip ext.', 20, 45, 'On your back, feet flat and close; lift the hips in line with the knees. Squeeze the glutes, ribs down; breathe.', false, 2),
				pose('Seated Forward Fold', 'Hamstrings', 60, 'Legs long, fold forward from the hips, knees bent as much as you need. This is not a contest.'),
				SUPINE_TWIST
			],
			spine: [
				strengthPose('Downward Dog', 'Shoulders', 30, 60, 'Hips up and back, head between the arms, heels reaching for the floor. Bend the knees to keep the back long; hold it, don’t pass through it.'),
				pose('Puppy Pose', 'Thoracic', 45, 'Hips over the knees, walk the hands forward and let the chest sink. Arms long, forehead down.'),
				pose('Thread the Needle', 'Thoracic', 45, 'From all fours, thread one arm under until that shoulder rests on the mat. Hips stay over the knees.', true),
				pose('Sphinx', 'Low back', 60, 'Face down, propped on the forearms, elbows under the shoulders. Let the low back relax; the forearms keep the bend gentle.'),
				pose('Cow-Face Arms', 'Shoulders', 45, 'One hand down the back from above, the other up the back from below. Hands meet if they can — a strap or a towel bridges the gap.', true),
				strengthPose('Forearm Plank', 'Core', 20, 60, 'Forearms down, elbows under the shoulders, one line from ear to heel. Ribs pulled down, glutes tight; breathe.'),
				SIDE_PLANK,
				pose('Child’s Pose, side reach', 'Lats', 45, 'Hips on the heels, both hands walked to one side of the mat. Feel the other side lengthen; breathe into it.', true),
				SUPINE_TWIST
			]
		}
	},
	{
		id: 'mob',		cycle: { id: 'mob', title: 'Stretch', routines: ['S'], target: 3 },
		routineInfo: {
			S: { title: 'Morning stretch', discipline: 'mobility', desc: 'Calves · hips · hamstrings · glutes · chest', warmup: [], cooldown: [] }
		},
		routines: {
			S: Object.values(STRETCHES)
		}
	},
	{
		id: 'run',		cycle: { id: 'run', title: 'Run', routines: ['run'], target: 3 },
		routineInfo: {
			run: { title: 'Easy run', discipline: 'run', desc: 'Drills · 30 easy · a walk down', warmup: RUN_WARMUP, cooldown: RUN_COOLDOWN }
		},
		routines: { run: [EASY_RUN] }
	}
];

/** The lift's fallback, at target 0 — always one "Something else" away, each session counting as a lift: four Darebee cards and a band day, and any other card logged by its length. Never switched — it goes wherever the lift goes. */
export const FLOOR: Routines = {
	cycle: { id: 'floor', title: 'Floor', routines: ['invicta', 'back-in-action', 'giant', 'bands', 'orc'], target: 0, standsInFor: 'lift' },
	routineInfo: {
		invicta: { title: 'Invicta', discipline: 'bodyweight', desc: 'Squats · lunges · push-ups · pike push-ups · superman · bridges · V hold', levels: [3, 5, 7], rest: CARD_REST, warmup: BW_WARMUP, cooldown: BW_COOLDOWN },
		'back-in-action': { title: 'Back in Action', discipline: 'bodyweight', desc: 'Body rows · twists · chest · shoulders · pike presses · rotations', levels: [3, 5, 7], rest: CARD_REST, warmup: BW_WARMUP, cooldown: BW_COOLDOWN },
		giant: { title: 'The Giant', discipline: 'bodyweight', desc: 'Lunges · squats · push-ups · plank · reverse angels · leg raises', rest: CARD_REST, warmup: BW_WARMUP, cooldown: BW_COOLDOWN },
		bands: { title: 'Band & Hinge', discipline: 'bodyweight', desc: 'Band row · face pull · single-leg hinge · bridge · hollow', warmup: BW_WARMUP, cooldown: BW_COOLDOWN },
		orc: { title: 'Orc', discipline: 'bodyweight', desc: 'Split squats · pike presses · three push-ups · leg hold · towel curls', levels: [3, 5, 7], rest: CARD_REST, warmup: BW_WARMUP, cooldown: BW_COOLDOWN },
		darebee: { title: 'Darebee workout', discipline: 'bodyweight', desc: 'Any other card from darebee.com, logged by its length' }
	},
	routines: {
		invicta: INVICTA,
		'back-in-action': BACK_IN_ACTION,
		giant: GIANT,
		bands: [BAND_ROW, { ...BAND_FACE_PULL, rest: BW_REST }, SL_RDL, SL_BRIDGE, HOLLOW],
		orc: ORC
	}
};

/** A programme with every practice on — for reading what a routine IS, whatever this person has switched. */
export const wholePlan = (programme: Plan): Plan => composePlan(programme, BLOCKS, FLOOR, PRACTICES);

/** Every programme, whole — the catalogue, for tests and for anything that needs every exercise. */
export const SHIPPED_PLANS: Plan[] = DEFAULT_PROGRAMMES.map(wholePlan);
