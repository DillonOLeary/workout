<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import ExerciseGlyph from '$lib/components/ExerciseGlyph.svelte';
	import AdjustTile from '$lib/components/floor/AdjustTile.svelte';
	import FloorPrimary from '$lib/components/floor/FloorPrimary.svelte';
	import FloorSheet from '$lib/components/floor/FloorSheet.svelte';
	import type { SheetSection } from '$lib/components/floor/FloorSheet.svelte';
	import StepTable from '$lib/components/floor/StepTable.svelte';
	import type { Row } from '$lib/components/floor/StepTable.svelte';
	import { armBell, ringBell } from '$lib/components/floor/bell';
	import { CountdownClock, type Countdown } from '$lib/components/floor/countdown.svelte';
	import { EntryQueue, type QueueOp } from '$lib/components/floor/queue.svelte';
	import { COOLDOWN_ITEM, WARMUP_ITEM } from '$lib/domain/events';
	import { countOf, isSet, loadOf, measureFor, type Measure } from '$lib/domain/measure';
	import { dayTitle, historyFor, lastEntryFor, sessionEntries, weekRunMinutes } from '$lib/domain/projections';
	import { bumpCount, bumpLoad, nextSet, suggest, type Suggestion } from '$lib/domain/progression';
	import {
		countLabel,
		durationLabel,
		holdLine,
		loadHint,
		plannedValue,
		rangeLabel,
		receiptLine,
		setValue,
		setsLine,
		stepLabel
	} from '$lib/domain/labels';
	import {
		estimateMinutes,
		loggedOutside,
		positionLabel,
		restUntil,
		runStart,
		sessionProgress,
		sessionSteps,
		type Step
	} from '$lib/domain/steps';
	import { cueFor, isFixedHold, restFor, runTarget, stretchDays, type Exercise } from '$lib/domain/plan';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const opened = Date.now(); // one clock reading for the folds that need one at load

	// Snapshots, not $derived — deliberately. id/plan/day cannot change while
	// this screen is open (the load() guard guarantees a session exists), and
	// a session belongs to the plan it was started under.
	// svelte-ignore state_referenced_locally
	const session = data.activeSession!;
	// svelte-ignore state_referenced_locally
	const plan = data.plans.find((p) => p.id === session.plan) ?? data.plans[0];
	/* The session is a LIST OF STEPS — warm-up lines, every set, the cooldown;
	   or the run with its own. The plan owns the order; this screen shows
	   exactly one step at a time with one big button. Rests are not steps: a
	   rest is a clock that runs under the next set. */
	const workout = session.workout;
	const isRunDay = workout.kind === 'run';
	const title = dayTitle(plan, workout);
	const cue = workout.kind === 'lift' ? cueFor(plan, workout.day) : plan.cue;
	const sessionAt = session.at;
	/** the stretches the ⋯ sheet can add: every hold on the plan's stretch days */
	const stretchPool: Exercise[] = stretchDays(plan).flatMap((d) => plan.days[d]);

	/* ---------- the optimistic queue (queue.svelte.ts) ----------
	   The screen updates the frame you press; the server catches up in the
	   background. data.events is never refreshed mid-session, so the queue
	   laid over the server's entries is the one source of truth here. */
	const queue = new EntryQueue(session.id);
	let lastPress = 0; // double-tap cooldown; not reactive on purpose

	// the server's entries, corrections already applied (one fold, projections.ts)
	let serverEntries = $derived(sessionEntries(data.events, session.id));
	// the entries that COUNT — and what `restUntil` reads, so a set that
	// hasn't reached the server yet still starts the rest clock (that was 1j)
	let entries = $derived(queue.overlay(serverEntries));

	/* ---------- the steps ----------
	   Derived, not a snapshot: a stretch added from the ⋯ sheet appends a
	   section. The URL remembers what was added, and anything already logged
	   outside the plan's steps comes back on its own — steps.ts decides. */
	// svelte-ignore state_referenced_locally
	const initialAdd = (page.url.searchParams.get('add') ?? '').split(',').filter(Boolean);
	let added = $state<string[]>(initialAdd);
	let extra = $derived([...added, ...loggedOutside(plan, workout, entries)]);
	let steps = $derived(sessionSteps(plan, workout, extra));
	let exercises = $derived.by(() => {
		const seen = new Set<string>();
		const out: Exercise[] = [];
		for (const s of steps) if (s.kind === 'set' && !seen.has(s.ex.name)) { seen.add(s.ex.name); out.push(s.ex); }
		return out;
	});
	let totalSets = $derived(steps.filter((s) => s.kind === 'set').length);

	// the rule's answer per exercise, once each: data.events never refreshes mid-session
	const loads = new Map<string, Suggestion>();
	function suggestionFor(ex: Exercise): Suggestion {
		let s = loads.get(ex.name);
		if (!s) {
			s = suggest(historyFor(data.events, ex.name, session.id), ex, opened);
			loads.set(ex.name, s);
		}
		return s;
	}
	/** the rule's weight for set k of a loaded exercise; 0 where there is no load */
	const plannedWeight = (x: Exercise, k: number) => {
		const s = suggestionFor(x);
		return s.kind === 'load' ? s.sets[Math.min(k, x.sets - 1)].weight : 0;
	};

	/* ---------- the clock ----------
	   Time is an input to the fold: the rest and the run count from the
	   previous entry's timestamp, so a reload lands back on the same countdown. */
	let now = $state(Date.now());
	let progress = $derived(sessionProgress(steps, entries));
	let allDone = $derived(progress.current >= steps.length);

	/* ---------- screen state ---------- */
	// where a reload lands: the URL's step if it has one, else the first step
	// the ledger doesn't already show as done — set 2 with its rest running,
	// never the top of the bike
	const initialStep = (() => {
		// svelte-ignore state_referenced_locally
		const known = sessionEntries(data.events, session.id);
		const ss = sessionSteps(plan, workout, [...initialAdd, ...loggedOutside(plan, workout, known)]);
		// Number(null) is 0 — a missing param must not read as "step 0"
		// svelte-ignore state_referenced_locally
		const raw = page.url.searchParams.get('step');
		const n = raw === null ? NaN : Number(raw);
		if (Number.isInteger(n) && n >= 0 && n < ss.length) return n;
		return Math.min(sessionProgress(ss, known).current, Math.max(0, ss.length - 1));
	})();
	let stepI = $state(initialStep);
	let weight = $state(0);
	let reps = $state(0); // reps — or seconds, for a hold
	let sheetOpen = $state(false);
	/** a done set's key while its numbers are on the tiles and the primary reads Save */
	let editing = $state<string | null>(null);

	let st = $derived<Step | undefined>(steps[stepI]);
	// the step's kind says what it carries: only a set has an exercise
	let ex = $derived<Exercise | undefined>(st?.kind === 'set' ? st.ex : undefined);
	let atSet = $derived(st?.kind === 'set');
	/** a stretch: a fixed hold, nothing to dial — Start 45s, the bell, the other side */
	let fixed = $derived(!!ex && isFixedHold(ex));
	let stepDone = $derived(!!st && progress.done.has(st.key));
	let entryFor = (s: Step) => entries.find((e) => e.item === s.item && e.index === s.index);
	let last = $derived(ex ? lastEntryFor(data.events, ex.name, session.id) : null);
	let setsDoneFor = (name: string) => entries.filter((e) => e.item === name && isSet(e.measure)).length;
	let editStep = $derived(editing ? steps.find((s) => s.key === editing) : undefined);
	let editEx = $derived(editStep?.kind === 'set' ? editStep.ex : undefined);
	/** what the tiles are dialling: the set being fixed, else the current one */
	let dialEx = $derived(editEx ?? ex);
	let tileHold = $derived(dialEx?.kind === 'hold');
	let tileBW = $derived(!!dialEx && dialEx.kind !== 'load');

	/* ---------- a countdown: a hold, or a timed prep step (countdown.svelte.ts) ----------
	   Dial the target (a hold) or take the plan's (a drill), start — the
	   stage counts DOWN and the bell logs it: the full target for a hold,
	   "it happened" for a drill. Drop early and the primary logs what was
	   actually done. The clock is the module's; what the bell writes is ours. */
	let live = $state(''); // the screen reader hears ten, and the bell — nothing else
	const clock = new CountdownClock((done) => {
		ringBell();
		live = 'Done';
		enqueue(done.kind === 'hold' ? holdMeasure(done.ex, done.target, done.target) : { of: 'step' });
	});

	/* ---------- the rest: a clock under the next set ----------
	   From the previous set's LOCAL timestamp (restUntil); the row's note says
	   "rest 62s", the ink line under it drains, the stage shows the number.
	   Zero rings the bell and the row says "now" — nothing moves by itself. */
	let restEnd = $derived(st?.kind === 'set' && !stepDone ? restUntil(st, entries, plan) : null);
	let restLeft = $derived(restEnd !== null ? Math.max(0, Math.ceil((restEnd - now) / 1000)) : 0);
	let resting = $derived(restEnd !== null && restLeft > 0);
	let restTotal = $derived(st?.kind === 'set' ? restFor(plan, st.ex) : 0);
	let restFrac = $derived(resting && restTotal ? restLeft / restTotal : 0);
	let counting: number | null = null; // the rest whose bell is still owed
	$effect(() => {
		if (resting) counting = restEnd;
		else if (counting !== null && restEnd === counting) {
			counting = null;
			ringBell();
			live = 'Rest over';
		} else counting = null;
	});
	$effect(() => {
		if ((resting && restLeft === 10) || clock.remaining === 10) live = '10 seconds';
	});

	// only tick while something on screen is counting
	let ticking = $derived(resting || clock.active || st?.kind === 'run');
	$effect(() => {
		if (!ticking) return;
		const t = setInterval(() => (now = Date.now()), 200);
		return () => clearInterval(t);
	});

	/* ---------- the run: the clock is the number ---------- */
	let runFrom = $derived(st?.kind === 'run' ? runStart(steps, stepI, entries, sessionAt) : null);
	let runElapsed = $derived(runFrom !== null ? Math.max(0, now - runFrom) : 0);
	const mmss = (ms: number) => {
		const s = Math.floor(ms / 1000);
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	};

	/* ± is never a fixed nudge: it is the rule's own one-size step (D3). A
	   hold stops at the top of its range — past it the answer is a harder
	   variation (the exercise note says which), never a longer hold. Fixing a
	   hold you dropped early is the one time the count goes under the floor. */
	const bumpReps = (dir: 1 | -1) => {
		if (!dialEx || clock.active) return;
		if (editing && dialEx.kind === 'hold') reps = Math.max(1, Math.min(dialEx.hi, reps + dir * (dialEx.inc || 5)));
		else reps = bumpCount(dialEx, reps, dir);
	};
	const bumpWeight = (dir: 1 | -1) => {
		if (dialEx?.kind === 'load') weight = bumpLoad(dialEx, weight, dir);
	};

	/** What the tiles show for the set about to be logged: the rule's nextSet, from this session's own entries. */
	function preload(i: number) {
		const s = steps[i];
		if (!s || s.kind !== 'set') return;
		const e = s.ex;
		const prior = entries
			.filter((x) => x.item === e.name && x.index < s.index && isSet(x.measure))
			.sort((a, b) => a.index - b.index)
			.map((x) => ({ index: x.index, measure: x.measure }));
		const next = nextSet(suggestionFor(e), e, prior, s.index - 1);
		weight = next.weight;
		reps = next.count;
		clock.cancel();
	}
	preload(initialStep);

	function syncUrl() {
		// shallow routing: URL tracks the step (and what was added), no loads
		// run, no history spam
		const q = new URLSearchParams();
		q.set('step', String(stepI));
		if (added.length) q.set('add', added.join(','));
		replaceState(`?${q}`, {});
	}

	function goTo(i: number) {
		clock.cancel();
		editing = null;
		if (i < 0 || i >= steps.length) return;
		stepI = i;
		preload(i);
		syncUrl();
	}

	/* ---------- fixing a set: tap its row ----------
	   Any done set in the section is one tap from its numbers being on the
	   tiles; the primary reads "Save set N" and writes a CorrectEntry. The
	   row again, or the current row, cancels. The decider allows this on the
	   latest session only — which this one is, being open. */
	function tapRow(key: string) {
		if (editing === key || (st && key === st.key)) return cancelEdit();
		const s = steps.find((x) => x.key === key);
		const e = s && entryFor(s);
		if (!s || !e || s.kind !== 'set') return;
		editing = key;
		clock.cancel();
		weight = loadOf(e.measure);
		reps = countOf(e.measure);
	}
	function cancelEdit() {
		editing = null;
		preload(stepI);
	}
	function saveEdit() {
		const s = editStep;
		const e = s && entryFor(s);
		if (!s || s.kind !== 'set' || !e) return;
		const target = e.measure.of === 'hold' ? e.measure.target : undefined;
		const measure = measureFor(s.ex, { load: weight, count: reps, ...(target !== undefined ? { target } : {}) });
		if (JSON.stringify(measure) !== JSON.stringify(e.measure)) push('correct', s, measure);
		cancelEdit();
	}

	/* ---------- the step table: the current section ---------- */
	function rowFor(s: Step, i: number): Row {
		const cur = i === stepI;
		const e = entryFor(s);
		const lp = queue.latestFor(s);
		const failed = lp?.status === 'failed';
		const saving = !!lp && (lp.status === 'queued' || lp.status === 'inflight');
		const state = (done: boolean): Row['state'] =>
			failed ? 'failed' : saving ? 'saving' : done ? 'done' : cur ? 'current' : 'upcoming';
		switch (s.kind) {
			case 'prep':
				return { key: s.key, label: s.label, value: s.text, note: e ? '✓' : cur ? 'now' : undefined, state: state(!!e), prose: true };
			case 'timed':
				if (cur && clock.active && !e) return { key: s.key, label: s.label, value: s.text, note: 'now', state: 'running', prose: true };
				return { key: s.key, label: s.label, value: s.text, note: e ? '✓' : cur ? 'now' : undefined, state: state(!!e), prose: true };
			case 'run': {
				if (e && e.measure.of === 'duration')
					return { key: s.key, label: 'RUN', value: `${e.measure.minutes} min`, note: '✓', state: state(true) };
				if (cur) return { key: s.key, label: 'RUN', value: `${s.minutes} min`, note: 'now', state: 'running' };
				return { key: s.key, label: 'RUN', value: `${s.minutes} min`, state: 'upcoming' };
			}
			case 'set': {
				const x = s.ex;
				// last time's count for THIS set, muted after the value — the one
				// place the ledger speaks on the floor
				const was = last?.sets[s.index - 1];
				// a stretch has no number to beat, so it gets no number to look at
				const lastN = was && !isFixedHold(x) ? countLabel(was) : undefined;
				if (editing === s.key)
					return { key: s.key, label: s.label, value: setValue(x, weight, reps), note: 'editing', state: 'editing', tappable: true };
				if (e)
					return {
						key: s.key, label: s.label, value: setValue(x, loadOf(e.measure), countOf(e.measure)), last: lastN,
						note: failed || saving ? undefined : '✓', state: state(true), tappable: !failed && !saving
					};
				if (cur && clock.running) return { key: s.key, label: s.label, value: `${clock.running.target}s`, note: 'now', state: 'running' };
				if (cur && resting)
					return { key: s.key, label: s.label, value: setValue(x, weight, reps), last: lastN, note: `rest ${restLeft}s`, state: 'resting', bar: restFrac };
				// "now", not "logging": the write is what saving… means — this row is
				// simply the one you're on, same word the prep steps use
				if (cur) return { key: s.key, label: s.label, value: setValue(x, weight, reps), last: lastN, note: 'now', state: state(false) };
				return { key: s.key, label: s.label, value: plannedValue(x, plannedWeight(x, s.index - 1)), last: lastN, state: 'upcoming' };
			}
		}
	}
	let rows = $derived.by((): Row[] => {
		if (!st) return [];
		const out: Row[] = [];
		steps.forEach((s, i) => {
			if (s.section === st.section) out.push(rowFor(s, i));
		});
		return out;
	});

	/* ---------- the lines above the table ---------- */
	let heading = $derived(!st ? 'Done' : st.kind === 'set' ? st.ex.name : st.section);
	let weekMin = $derived(weekRunMinutes(data.events, opened));
	let meta = $derived.by(() => {
		if (!st) return '';
		if (st.kind === 'prep' || st.kind === 'timed') {
			const n = steps.filter((s) => s.section === st.section).length;
			return `${st.section.toUpperCase()} · STEP ${st.index} OF ${n}`;
		}
		if (st.kind === 'run') return `TARGET ${st.minutes} MIN · ${weekMin} OF ${runTarget(plan)} MIN THIS WEEK`;
		const x = st.ex;
		// a stretch has no target to state — it says how long, and which side
		if (isFixedHold(x)) return holdLine(x, st.index);
		return `TARGET ${rangeLabel(x).toUpperCase()}${x.kind === 'load' && x.each ? ' · PER HAND' : ''}${x.kind === 'reps' ? ` · ${x.equip.toUpperCase()}` : ''}`;
	});
	// the reasoning behind the preloaded weight, so a drop is never silent —
	// only before the first set: after that the table carries the session's
	// own numbers and the suggestion no longer describes what's on screen
	let hint = $derived.by(() => {
		if (!st || editing) return null;
		if (st.kind === 'prep' || st.kind === 'timed') return cue ?? null;
		if (st.kind === 'run') return plan.run?.note ?? null;
		const x = st.ex;
		if (setsDoneFor(x.name) > 0) return null;
		return loadHint(suggestionFor(x), x);
	});

	/* ---------- the stage: the one flexible element on the floor ----------
	   Between the table and the tiles. The rep while you log; the big
	   number, its note and a draining bar while you rest, hold or run — the
	   figure beside it, still for a rest, working through the hold. It grows
	   on a tall phone and gives first on a short one; nothing else moves. */
	type Stage = { value: string; note: string; frac: number };
	let stage = $derived.by((): Stage | null => {
		if (!st || allDone) return null;
		const r = clock.running;
		if (r) {
			const left = clock.remaining ?? r.target;
			const what = r.kind === 'hold' ? 'HOLD' : st.kind === 'timed' ? st.name.toUpperCase() : 'GO';
			return {
				value: r.target >= 60 ? mmss(left * 1000) : String(left),
				note: `${what} · OF ${durationLabel(r.target).toUpperCase()}`,
				frac: left / r.target
			};
		}
		if (resting) return { value: String(restLeft), note: `REST · OF ${restTotal}S`, frac: restFrac };
		if (st.kind === 'run') {
			const total = st.minutes * 60000;
			return { value: mmss(runElapsed), note: `RUN · OF ${st.minutes} MIN`, frac: total ? Math.max(0, 1 - runElapsed / total) : 0 };
		}
		return null;
	});
	let glyphName = $derived(editEx?.name ?? ex?.name ?? (st?.kind === 'timed' ? st.name : undefined) ?? '');
	let holdRunning = $derived(clock.active);

	/* ---------- the write path ---------- */
	// the exercise decides which variant a set writes — never the screen
	const holdMeasure = (x: Exercise, seconds: number, target: number): Measure => measureFor(x, { load: 0, count: seconds, target });

	function push(op: QueueOp, s: Step, measure: Measure) {
		queue.push(op, s, measure);
		// instant feedback: the row fills in, the phone taps back. No flash —
		// the table changing IS the confirmation.
		navigator.vibrate?.(12);
	}

	function enqueue(measure: Measure) {
		if (!st) return;
		const s = st;
		push('log', s, measure);
		const next = stepI + 1;
		if (next >= steps.length) return; // the receipt takes over
		// within a section the next step just arrives (set 2, its rest
		// running under it). A new section WAITS: the primary reads "Next:
		// Chest Press" and nothing flips under a finger.
		if (steps[next].section === s.section) goTo(next);
	}

	function logSetNow(x: Exercise) {
		if (performance.now() - lastPress < 350) return; // accidental double-tap
		lastPress = performance.now();
		enqueue(measureFor(x, { load: weight, count: reps }));
	}

	/** timed: one button — start the countdown, or log the early drop */
	function startOrDone(next: Countdown) {
		if (performance.now() - lastPress < 350) return;
		lastPress = performance.now();
		const early = clock.dropEarly();
		if (early) enqueue(early.done.kind === 'hold' ? holdMeasure(early.done.ex, early.held, early.done.target) : { of: 'step' });
		else clock.start(next);
	}

	function retryEntry(key: string) {
		const s = steps.find((x) => x.key === key);
		if (s) queue.retry(s);
	}

	/* ---------- finish / exit ---------- */
	let finishFormEl = $state<HTMLFormElement>();
	let finishing = $state(false);

	async function finishNow() {
		finishing = true;
		await queue.drain(); // queued entries must append before SessionFinished
		if (queue.anyFailed) {
			queue.error = 'An entry didn’t save — Retry it, or finish from the ⋯ menu.';
			finishing = false;
			return;
		}
		finishFormEl?.requestSubmit();
	}

	// the sheet's confirm already stated the cost — this path never blocks
	async function finishEarly() {
		sheetOpen = false;
		finishing = true;
		await queue.drain();
		finishFormEl?.requestSubmit();
	}

	async function exitToToday() {
		await queue.drain();
		// we skipped all invalidation during the session, so Today must reload
		await goto('/', { invalidateAll: true });
	}

	/** a one-off from the ⋯ sheet: the stretch becomes a section of this session, and the floor goes there */
	function addStretch(name: string) {
		sheetOpen = false;
		if (!added.includes(name)) added = [...added, name];
		const i = steps.findIndex((s) => s.section === name);
		if (i >= 0) goTo(i);
		else syncUrl();
	}

	function primaryAction() {
		if (finishing || !st) return;
		armBell(); // the gesture that lets the bell ring later
		if (editing) return saveEdit();
		if (allDone) return void finishNow();
		if (stepDone) return goTo(stepI + 1);
		if (st.kind === 'prep') return enqueue({ of: 'step' });
		if (st.kind === 'timed') return startOrDone({ kind: 'timed', target: st.seconds });
		if (st.kind === 'run') return enqueue({ of: 'duration', minutes: Math.max(1, Math.round(runElapsed / 60000)) });
		if (st.ex.kind === 'hold') return startOrDone({ kind: 'hold', target: reps, ex: st.ex });
		logSetNow(st.ex);
	}

	/* ---------- the one big button ---------- */
	let nextLabel = $derived.by(() => {
		const n = steps[stepI + 1];
		if (!n) return 'Finish workout';
		if (n.section === st?.section) return n.kind === 'set' ? 'Next set' : 'Next step';
		return `Next: ${n.section}`;
	});
	let sideNow = $derived(
		st?.kind === 'set' && st.ex.side === 'sets' && st.ex.kind !== 'hold' ? (st.index % 2 === 1 ? 'left' : 'right') : null
	);
	let primaryLabel = $derived(
		editing
			? `Save ${editEx?.kind === 'hold' ? 'hold' : 'set'} ${editStep?.index ?? ''}`
			: allDone
				? finishing
					? 'Saving…'
					: 'Finish workout'
				: !st
					? 'Finish workout'
					: stepDone
						? nextLabel
						: st.kind === 'prep'
							? 'Done'
							: st.kind === 'timed'
								? clock.active
									? 'Done early'
									: `Start ${durationLabel(st.seconds)}`
								: st.kind === 'run'
									? 'Stop here'
									: st.ex.kind === 'hold'
										? clock.active
											? 'Done early'
											: `Start ${reps}s`
										: sideNow
											? `Log ${sideNow} side`
											: 'Log set'
	);
	let primaryVariant = $derived((!editing && (allDone || !st || stepDone) ? 'advance' : 'commit') as 'advance' | 'commit');
	/** tiles: while a set is being dialled or fixed — never for a stretch (nothing to dial), never for prep */
	let showTiles = $derived(!!editing || (atSet && !stepDone && !fixed));

	/* ---------- the ⋯ sheet: the session, by section ----------
	   One row per section — never the sets: the sheet is for finding your
	   place, the floor is for the set. A row says "done" when the whole
	   section is, else how far in. */
	let sections = $derived.by((): SheetSection[] => {
		const order: string[] = [];
		const by = new Map<string, { s: Step; i: number }[]>();
		steps.forEach((s, i) => {
			if (!by.has(s.section)) {
				by.set(s.section, []);
				order.push(s.section);
			}
			by.get(s.section)!.push({ s, i });
		});
		return order.map((name) => {
			const items = by.get(name)!;
			const done = items.filter((x) => progress.done.has(x.s.key)).length;
			const complete = done === items.length;
			const next = items.find((x) => !progress.done.has(x.s.key)) ?? items[0];
			return { title: name, status: complete ? 'done' : `${done}/${items.length}`, active: st?.section === name, done: complete, jump: next.i };
		});
	});
	let addable = $derived(stretchPool.filter((x) => !steps.some((s) => s.section === x.name)));

	/** the receipt: what this session actually wrote, in ledger shape */
	function receiptSets(name: string): Measure[] {
		return entries
			.filter((e) => e.item === name && isSet(e.measure))
			.sort((a, b) => a.index - b.index)
			.map((e) => e.measure);
	}
	let runMinutes = $derived(entries.filter((e) => e.measure.of === 'duration').reduce((n, e) => n + (e.measure.of === 'duration' ? e.measure.minutes : 0), 0));
	// one line for what never reached the ledger: how long it took, and that the bookends happened
	let sessionMinutes = $derived.by(() => {
		const end = entries.reduce((m, e) => Math.max(m, Date.parse(e.at)), 0) || now;
		return Math.max(1, Math.round((end - Date.parse(sessionAt)) / 60000));
	});
	let prepLine = $derived(
		receiptLine(sessionMinutes, entries.some((e) => e.item === WARMUP_ITEM), entries.some((e) => e.item === COOLDOWN_ITEM))
	);
	let minutesLeft = $derived(estimateMinutes(steps, progress.current));
	let position = $derived(positionLabel(Math.min(stepI, steps.length), steps));

	function onKey(ev: KeyboardEvent) {
		// typed entry belongs to the tile inputs — never fight the keypad
		if ((ev.target as HTMLElement | null)?.tagName === 'INPUT') return;
		if (ev.key === 'Escape') {
			// Esc closes the sheet, or backs out of a fix — leaving is a sheet action
			if (sheetOpen) sheetOpen = false;
			else if (editing) cancelEdit();
			ev.preventDefault();
			return;
		}
		if (sheetOpen) return;
		if (ev.key === 'Enter') {
			primaryAction();
			ev.preventDefault();
			return;
		}
		if (allDone) return;
		const dialling = !!editing || atSet;
		if (ev.key === 'ArrowUp') {
			if (tileHold || tileBW) bumpReps(1);
			else if (dialling) bumpWeight(1);
			ev.preventDefault();
		} else if (ev.key === 'ArrowDown') {
			if (tileHold || tileBW) bumpReps(-1);
			else if (dialling) bumpWeight(-1);
			ev.preventDefault();
		} else if (ev.key === 'ArrowRight') {
			goTo(Math.min(steps.length - 1, stepI + 1));
			ev.preventDefault();
		} else if (ev.key === 'ArrowLeft') {
			goTo(Math.max(0, stepI - 1));
			ev.preventDefault();
		} else if (dialling && !tileHold && /^[1-9]$/.test(ev.key)) reps = parseInt(ev.key, 10);
		else if (dialling && !tileHold && ev.key === '0') reps = 10;
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="fl">
	<div class="fl-inner">
		<!-- a session owns the screen: no tab bar, no × — pausing and finishing
		     both live in the ⋯ sheet -->
		<header class="fl-top">
			<span class="fl-crumb">
				{title} · {position}{allDone ? '' : ` · ~${minutesLeft} min`}
			</span>
			<button
				type="button"
				class="fl-ghost"
				onclick={() => (sheetOpen = true)}
				aria-label="More — the whole session, technique, finish"
			>
				⋯
			</button>
		</header>

		{#if st && !allDone}
			<main class="fl-main">
				<div class="fl-titleblock">
					<h1 class="fl-name">{heading}</h1>
					<p class="fl-meta">{meta}</p>
				</div>

				<StepTable {rows} onRetry={retryEntry} onTap={tapRow} />

				{#if hint}
					<p class="fl-hint">{hint}</p>
				{/if}

				<!-- the stage: the figure while you log (one rep on arrival, press
				     for another); the clock, its bar and the figure beside it while
				     you rest, hold or run. Keyed on the name, so a new exercise
				     replays and a rest on the same one does not. -->
				<div class="fl-stage" class:clock={!!stage}>
					<div class="fl-stagerow">
						{#key glyphName}
							{#if glyphName}
								<div class="fl-glyph"><ExerciseGlyph name={glyphName} size={240} loop={holdRunning} /></div>
							{/if}
						{/key}
						{#if stage}
							<div class="fl-clock">
								<span class="fl-clocknum">{stage.value}</span>
								<span class="fl-clocknote">{stage.note}</span>
							</div>
						{/if}
					</div>
					{#if stage}
						<div class="fl-bar" aria-hidden="true"><div class="fl-barfill" style="width: {Math.max(0, Math.min(1, stage.frac)) * 100}%"></div></div>
					{/if}
				</div>
				<span class="sr" aria-live="polite">{live}</span>
			</main>

			<div class="fl-bottom">
				{#if showTiles && dialEx}
					<div class="fl-tiles" class:single={tileBW}>
						{#if tileHold}
							<AdjustTile
								label={editing ? 'Held' : `Hold · +${dialEx.kind === 'hold' ? dialEx.inc : 5}s`}
								bind:value={reps}
								min={editing ? 1 : dialEx.lo}
								max={dialEx.hi}
								disabled={clock.active}
								onStep={bumpReps}
							/>
						{:else}
							<AdjustTile label="Reps" bind:value={reps} min={1} max={100} onStep={bumpReps} />
						{/if}
						{#if !tileBW}
							<AdjustTile
								label={`Weight · ${stepLabel(dialEx)}`}
								bind:value={weight}
								decimals
								min={0}
								disabled={clock.active}
								onStep={bumpWeight}
							/>
						{/if}
					</div>
				{/if}
				{#if queue.error ?? form?.message}<p class="fl-err">{queue.error ?? form?.message}</p>{/if}
				<FloorPrimary variant={primaryVariant} label={primaryLabel} disabled={finishing} onclick={primaryAction} />
			</div>
		{:else}
			<!-- workout complete: no adjuster on screen — the table becomes a
			     receipt in the same two-column shape as the Ledger tab (D6);
			     only what reached the ledger, with the rest on one line -->
			<main class="fl-main">
				<h1 class="fl-name">Done</h1>
				<p class="fl-meta">
					<span>{isRunDay ? `${runMinutes} MIN` : `${progress.sets} SETS LOGGED`}{queue.syncing ? ' · SAVING…' : ''}</span>
				</p>
				<div class="fl-receipt">
					{#if isRunDay}
						<div class="fl-rrow">
							<span class="fl-rname">{title}</span>
							<span class="fl-rval">{runMinutes ? `${runMinutes} min` : '—'}</span>
						</div>
					{/if}
					{#each exercises as e (e.name)}
						{@const sets = receiptSets(e.name)}
						<div class="fl-rrow">
							<span class="fl-rname">{e.name}</span>
							<span class="fl-rval">{sets.length ? setsLine(sets, e) : '—'}</span>
						</div>
					{/each}
				</div>
				<p class="fl-hint">{prepLine}</p>
			</main>
			<div class="fl-bottom">
				{#if queue.anyFailed}
					<p class="fl-err">
						An entry didn’t save.
						<button type="button" class="fl-retryall" onclick={() => queue.retryAll()}>Retry</button>
					</p>
				{:else if queue.error ?? form?.message}
					<p class="fl-err">{queue.error ?? form?.message}</p>
				{/if}
				<FloorPrimary
					variant="advance"
					label={finishing ? 'Saving…' : 'Finish workout'}
					disabled={finishing}
					onclick={() => void finishNow()}
				/>
			</div>
		{/if}
	</div>
</div>

<FloorSheet
	open={sheetOpen}
	title={heading === 'Done' ? title : heading}
	ex={atSet ? ex : undefined}
	cue={st?.kind === 'prep' || st?.kind === 'timed' ? cue : st?.kind === 'run' ? plan.run?.note : undefined}
	{sections}
	stretches={addable}
	backLabel={position}
	logged={progress.sets}
	total={totalSets}
	{allDone}
	onJump={(i) => {
		sheetOpen = false;
		goTo(i);
	}}
	onAdd={addStretch}
	onFinishEarly={() => void finishEarly()}
	onExit={() => {
		sheetOpen = false;
		void exitToToday();
	}}
	onClose={() => (sheetOpen = false)}
/>

<!-- finish still goes through a real form action; its 303 redirect makes
     use:enhance run invalidateAll, so Today reloads fresh events -->
<form bind:this={finishFormEl} method="POST" action="?/finish" use:enhance hidden></form>

<style>
	.fl {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		/* NOT inset:0 — in mobile Safari that resolves to the layout viewport,
		   which extends behind the URL bar and toolbar, so the primary ends
		   up underneath the browser. This shell never scrolls the page, so the
		   bars stay expanded and svh is the honest number. */
		height: 100vh;
		height: 100svh;
		z-index: 50;
		background: var(--paper);
		display: flex;
		flex-direction: column;
		padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
		overflow: hidden;
		user-select: none;
	}
	.fl-inner {
		width: 100%;
		max-width: var(--content-max);
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	.fl-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 12px 4px 16px;
	}
	.fl-ghost {
		width: 48px;
		height: 48px;
		flex: none;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		border-radius: var(--radius-md);
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 26px;
		line-height: 1;
		color: var(--ink-2);
		cursor: pointer;
		touch-action: manipulation;
		transition: background var(--dur-med) var(--ease-snap);
	}
	.fl-ghost:hover { background: var(--volt-tint); color: var(--ink); }
	.fl-crumb {
		font-family: var(--font-mono);
		font-size: 12px;
		font-weight: 700;
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--ink-3);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* the floor never scrolls: everything above the stage is fixed height,
	   the stage takes what is left, and the tiles and the button sit below */
	.fl-main {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		padding: 4px 16px 0;
	}
	.fl-titleblock { flex: none; margin-bottom: 12px; }
	.fl-name {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 900;
		font-size: clamp(28px, 7vw, 32px);
		line-height: 1.02;
		letter-spacing: var(--tracking-tightish);
		text-transform: uppercase;
	}
	.fl-meta {
		margin: 6px 0 0;
		font-family: var(--font-mono);
		font-size: 13px;
		line-height: 1.5;
		color: var(--ink-3);
	}
	.fl-hint {
		flex: none;
		align-self: flex-start;
		font-family: var(--font-mono);
		font-size: 12px;
		line-height: 1.45;
		color: var(--ink-2);
		margin: 10px 0 0;
		background: var(--volt-tint);
		display: inline-block;
		padding: 4px 8px;
		border-radius: 4px;
	}

	/* the stage */
	.fl-stage {
		flex: 1 1 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 12px 0 4px;
	}
	.fl-stagerow {
		flex: 1 1 0;
		min-height: 0;
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 24px;
	}
	.fl-glyph {
		flex: 1 1 0;
		min-height: 0;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.fl-glyph :global(canvas) { width: auto; height: 100%; max-height: 240px; aspect-ratio: 1; }
	/* a step with no figure (a jog, a walk) leaves the clock the whole row */
	.fl-glyph:empty { display: none; }
	/* the clock keeps its room — never shorter than its content. The figure
	   alone may collapse; a long section's table gives way and scrolls
	   instead of being painted over. The row's basis must be its content
	   here: with a zero basis the stage's content minimum counts only the
	   bar, and the clock is painted over the table (seen on the run's
	   eight-step warm-up) */
	.fl-stage.clock { min-height: auto; }
	.fl-stage.clock .fl-stagerow { flex-basis: auto; }
	/* the clock: the figure steps aside, at rest, 88px */
	.fl-stage.clock .fl-glyph { flex: none; height: 88px; }
	.fl-stage.clock .fl-glyph :global(canvas) { width: 88px; height: 88px; }
	.fl-clock { display: flex; flex-direction: column; align-items: flex-start; }
	.fl-clocknum {
		font-family: var(--font-mono);
		font-weight: 800;
		font-size: 88px;
		line-height: 0.95;
		letter-spacing: -0.02em;
		font-variant-numeric: tabular-nums;
	}
	.fl-clocknote {
		margin-top: 6px;
		font-family: var(--font-mono);
		font-size: 13px;
		font-weight: 700;
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--ink-3);
	}
	/* an ink bar draining: the same mark as the line under the row */
	.fl-bar { flex: none; width: 100%; height: 6px; background: var(--paper-2); border-radius: var(--radius-pill); overflow: hidden; }
	.fl-barfill { height: 100%; background: var(--ink); transition: width 200ms linear; }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

	.fl-bottom {
		flex: none;
		padding: 8px 16px calc(14px + env(safe-area-inset-bottom));
	}
	.fl-tiles {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		margin-bottom: 10px;
	}
	.fl-tiles.single { grid-template-columns: 1fr; }
	.fl-err {
		font-family: var(--font-mono);
		font-size: 13px;
		font-weight: 700;
		color: var(--danger);
		text-align: center;
		margin: 0 0 8px;
	}
	.fl-retryall {
		min-height: 44px;
		padding: 0 14px;
		background: var(--white);
		border: 1px solid var(--danger);
		border-radius: var(--radius-pill);
		font-family: var(--font-body);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--danger);
		cursor: pointer;
	}

	/* the receipt — two columns, like the Ledger tab */
	.fl-receipt {
		flex: none;
		margin-top: 12px;
		background: var(--surface-card);
		border: var(--border-w) solid var(--ink);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-card);
		overflow: hidden auto;
		min-height: 0;
	}
	.fl-rrow {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 12px;
		min-height: 44px;
		padding: 10px 16px;
		border-top: 1px solid var(--border-soft);
	}
	.fl-rrow:first-child { border-top: none; }
	.fl-rname { font-weight: var(--weight-bold); font-size: 15px; }
	.fl-rval {
		font-family: var(--font-mono);
		font-size: 13px;
		color: var(--ink-2);
		text-align: right;
	}

	.fl :global(:focus-visible) { outline: none; box-shadow: var(--focus-shadow); }

	@media (prefers-reduced-motion: reduce) {
		.fl :global(*) { transition: none !important; animation: none !important; }
	}

	/* Short screens: the floor must not scroll mid-set. The stage gives first,
	   then the hint; nothing interactive goes below 44px, ever. */
	@media (max-height: 740px) {
		.fl-name { font-size: clamp(24px, 6vw, 30px); }
		.fl-bottom { padding-top: 6px; }
		.fl-titleblock { margin-bottom: 10px; }
		.fl-clocknum { font-size: 72px; }
	}
	@media (max-height: 640px) {
		.fl-hint { margin-top: 6px; }
		.fl-stage { padding: 8px 0 2px; }
		.fl-clocknum { font-size: 56px; }
		.fl-stage.clock .fl-glyph { height: 64px; }
		.fl-stage.clock .fl-glyph :global(canvas) { width: 64px; height: 64px; }
	}
	@media (max-height: 560px) {
		.fl-hint { display: none; }
		.fl-stage:not(.clock) { display: none; }
		.fl-stage.clock .fl-glyph { display: none; }
		.fl-clocknum { font-size: 44px; }
		.fl-meta { margin: 2px 0 0; font-size: 12px; }
		.fl-name { font-size: clamp(22px, 5vh, 26px); }
		.fl-tiles { gap: 8px; margin-bottom: 8px; }
	}
</style>
