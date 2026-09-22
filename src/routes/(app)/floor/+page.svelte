<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import Athlete, { type Phase } from '$lib/components/Athlete.svelte';
	import AdjustTile from '$lib/components/floor/AdjustTile.svelte';
	import FloorPrimary from '$lib/components/floor/FloorPrimary.svelte';
	import AboutCard from '$lib/components/floor/AboutCard.svelte';
	import SessionSheet from '$lib/components/floor/SessionSheet.svelte';
	import type { SheetSection } from '$lib/components/floor/SessionSheet.svelte';
	import StepTable from '$lib/components/floor/StepTable.svelte';
	import type { Row } from '$lib/components/floor/StepTable.svelte';
	import { armBell, ringBell } from '$lib/components/floor/bell';
	import { holdScreen } from '$lib/components/floor/wake-lock';
	import { CountdownClock, type Countdown } from '$lib/components/floor/countdown.svelte';
	import { EntryQueue, type QueueOp } from '$lib/components/floor/entry-queue.svelte';
	import { glyphFor } from '$lib/design/glyphs';
	import { STAND } from '$lib/design/rig';
	import { COOLDOWN_ITEM, WARMUP_ITEM } from '$lib/domain/events';
	import { countOf, isSet, loadOf, measureFor, type Measure } from '$lib/domain/measure';
	import { historyFor, lastEntryFor, sessionEntries, weekProgress } from '$lib/domain/projections';
	import { bumpCount, bumpLoad, nextSet, suggest, type Suggestion } from '$lib/domain/progression';
	import {
		countLabel,
		disciplineLabel,
		durationLabel,
		firstSentence,
		holdLine,
		loadHint,
		plannedValue,
		rangeLabel,
		receiptLine,
		sessionNoun,
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
	import { cooldownFor, cueFor, cycleOf, isStretchLine, progresses, restFor, routineTitle, routinesOf, type Exercise } from '$lib/domain/plan';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const opened = Date.now();

	// svelte-ignore state_referenced_locally
	const session = data.activeSession!;
	// svelte-ignore state_referenced_locally
	const plan = data.plans.find((p) => p.id === session.plan) ?? data.plans[0];
	const workout = session.workout;
	const isRun = session.discipline === 'run';
	const title = routineTitle(plan, workout.routine) ?? disciplineLabel(session.discipline);
	const cue = cueFor(plan, workout.routine);
	const noun = sessionNoun(session.discipline);
	const sessionAt = session.at;
	// every stretch and yoga pose the plan knows, once each — what "add a stretch" can offer
	const stretchPool: Exercise[] = [...routinesOf(plan, 'mobility'), ...routinesOf(plan, 'yoga')]
		.flatMap((r) => plan.routines[r])
		.filter((x, i, all) => x.kind === 'hold' && all.findIndex((y) => y.name === x.name) === i);
	const coolStretches = cooldownFor(plan, workout.routine).flatMap((it) => (isStretchLine(it) ? [it.name] : []));
	const cycle = cycleOf(plan, workout.routine);

	const queue = new EntryQueue(session.id);
	let lastPress = 0;

	let serverEntries = $derived(sessionEntries(data.events, session.id));
	let entries = $derived(queue.overlay(serverEntries));

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

	const loads = new Map<string, Suggestion>();
	function suggestionFor(ex: Exercise): Suggestion {
		let s = loads.get(ex.name);
		if (!s) {
			s = suggest(historyFor(data.events, ex.name, session.id), ex, opened);
			loads.set(ex.name, s);
		}
		return s;
	}
	const plannedWeight = (x: Exercise, k: number) => {
		const s = suggestionFor(x);
		return s.kind === 'load' ? s.sets[Math.min(k, x.sets - 1)].weight : 0;
	};

	let now = $state(Date.now());
	let progress = $derived(sessionProgress(steps, entries));
	let allDone = $derived(progress.current >= steps.length);

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
	let reps = $state(0);
	/** three handles: the name opens About in place, the crumb opens the session, the row under the table adds a stretch */
	let sheet = $state<'session' | null>(null);
	let about = $state(false);
	let addOpen = $state(false);
	let editing = $state<string | null>(null);

	let st = $derived<Step | undefined>(steps[stepI]);
	let ex = $derived<Exercise | undefined>(st?.kind === 'set' ? st.ex : undefined);
	let atSet = $derived(st?.kind === 'set');
	let fixed = $derived(!!ex && !progresses(ex));
	let stepDone = $derived(!!st && progress.done.has(st.key));
	let entryFor = (s: Step) => entries.find((e) => e.item === s.item && e.index === s.index);
	let last = $derived(ex ? lastEntryFor(data.events, ex.name, session.id) : null);
	let setsDoneFor = (name: string) => entries.filter((e) => e.item === name && isSet(e.measure)).length;
	let editStep = $derived(editing ? steps.find((s) => s.key === editing) : undefined);
	let editEx = $derived(editStep?.kind === 'set' ? editStep.ex : undefined);
	let dialEx = $derived(editEx ?? ex);
	let tileHold = $derived(dialEx?.kind === 'hold');
	let tileBW = $derived(!!dialEx && dialEx.kind !== 'load');

	let live = $state('');
	const clock = new CountdownClock((done) => {
		ringBell();
		live = 'Done';
		enqueue(done.kind === 'hold' ? holdMeasure(done.ex, done.target, done.target) : { of: 'step' });
	});

	let restEnd = $derived(st?.kind === 'set' && !stepDone ? restUntil(st, entries, plan) : null);
	let restLeft = $derived(restEnd !== null ? Math.max(0, Math.ceil((restEnd - now) / 1000)) : 0);
	// a hold started early ends the rest: the bell must not ring under a running clock
	let resting = $derived(restEnd !== null && restLeft > 0 && !clock.active);
	let restTotal = $derived(st?.kind === 'set' ? restFor(plan, st.ex) : 0);
	let restFrac = $derived(resting && restTotal ? restLeft / restTotal : 0);
	let counting: number | null = null;
	$effect(() => {
		if (clock.active) counting = null;
		else if (resting) counting = restEnd;
		else if (counting !== null && restEnd === counting) {
			counting = null;
			ringBell();
			live = 'Rest over';
		} else counting = null;
	});
	$effect(() => {
		if ((resting && restLeft === 10) || clock.remaining === 10) live = '10 seconds';
	});

	let ticking = $derived(resting || clock.active || st?.kind === 'run');

	// the screen stays lit while a set is in front of you; a run is long enough to let it sleep and trust the bell
	let lit = $derived(!allDone && st?.kind !== 'run');
	$effect(() => (lit ? holdScreen() : undefined));
	$effect(() => {
		if (!ticking) return;
		const t = setInterval(() => (now = Date.now()), 200);
		return () => clearInterval(t);
	});

	let runFrom = $derived(st?.kind === 'run' ? runStart(steps, stepI, entries, sessionAt) : null);
	let runElapsed = $derived(runFrom !== null ? Math.max(0, now - runFrom) : 0);
	const mmss = (ms: number) => {
		const s = Math.floor(ms / 1000);
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	};

	const bumpReps = (dir: 1 | -1) => {
		if (!dialEx || clock.active) return;
		if (editing && dialEx.kind === 'hold') reps = Math.max(1, Math.min(dialEx.hi, reps + dir * (dialEx.progress.of === 'time' ? dialEx.progress.inc : 5)));
		else reps = bumpCount(dialEx, reps, dir);
	};
	const bumpWeight = (dir: 1 | -1) => {
		if (dialEx?.kind === 'load') weight = bumpLoad(dialEx, weight, dir);
	};

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
		const q = new URLSearchParams();
		q.set('step', String(stepI));
		if (added.length) q.set('add', added.join(','));
		replaceState(`?${q}`, {});
	}

	function goTo(i: number) {
		clock.cancel();
		editing = null;
		about = false;
		if (i < 0 || i >= steps.length) return;
		stepI = i;
		preload(i);
		syncUrl();
	}

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
				const was = last?.sets[s.index - 1];
				const lastN = was && progresses(x) ? countLabel(was) : undefined;
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

	let heading = $derived(!st ? 'Done' : st.kind === 'set' ? st.ex.name : st.section);
	// svelte-ignore state_referenced_locally
	const week = cycle ? weekProgress(data.events, plan, cycle, opened) : null;
	let meta = $derived.by(() => {
		if (!st) return '';
		if (st.kind === 'prep' || st.kind === 'timed') {
			const n = steps.filter((s) => s.section === st.section).length;
			return `${st.section.toUpperCase()} · STEP ${st.index} OF ${n}`;
		}
		if (st.kind === 'run') return `TARGET ${st.minutes} MIN${week && week.target ? ` · ${week.done} OF ${week.target} THIS WEEK` : ''}`;
		const x = st.ex;
		if (!progresses(x) && x.kind === 'hold') return holdLine(x, st.index);
		const v = suggestionFor(x);
		const rung = v.kind === 'count' && v.variant ? ` · ${v.variant.name.toUpperCase()}` : '';
		return `TARGET ${rangeLabel(x).toUpperCase()}${x.kind === 'load' && x.progress.each ? ' · PER HAND' : ''}${rung}${x.kind === 'reps' && !rung ? ` · ${x.equip.toUpperCase()}` : ''}`;
	});
	let hint = $derived.by(() => {
		if (!st || editing) return null;
		if (st.kind === 'prep' || st.kind === 'timed') return cue ?? null;
		if (st.kind === 'run') return st.ex.note ?? null;
		const x = st.ex;
		if (setsDoneFor(x.name) > 0) return null;
		return loadHint(suggestionFor(x), x);
	});
	// for a stretch the note is the instruction, so its first sentence sits where the meta was; a lift's line is the load hint
	let line = $derived(hint ?? (ex?.note ? firstSentence(ex.note) : null));
	let aboutEx = $derived(editEx ?? ex);
	let aboutText = $derived(st?.kind === 'prep' || st?.kind === 'timed' ? cue : st?.kind === 'run' ? st.ex.note : undefined);
	let partOf = $derived(
		aboutEx ? Object.keys(plan.routines).filter((r) => plan.routines[r].some((e) => e.name === aboutEx.name)).flatMap((r) => routineTitle(plan, r) ?? []) : []
	);
	// a warm-up line with no cue and no figure has nothing to say about itself
	let aboutable = $derived(!!aboutEx || !!aboutText || !!glyphFor(heading));
	let sectionNote = $derived.by(() => {
		if (!st) return '';
		const peers = steps.filter((s) => s.section === st.section);
		return `${st.section} · ${peers.findIndex((s) => s.key === st.key) + 1}/${peers.length}`;
	});


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
	/** the ten seconds before the bell: the figure gets into position first */
	const READY_S = 10;
	// the figure is the floor's state made visible — not a personality, a readout: the bell, the bar and the body agree
	let athlete = $derived.by((): { pose: string; phase: Phase } => {
		if (!st || allDone) return { pose: STAND, phase: 'still' };
		if (editing) return { pose: editEx?.name ?? STAND, phase: 'ready' };
		if (st.kind === 'run') return { pose: st.ex.name, phase: 'running' };
		if (st.kind === 'prep') return { pose: STAND, phase: 'running' };
		if (st.kind === 'timed') return { pose: st.name, phase: clock.active ? 'running' : 'ready' };
		if (stepDone) return { pose: STAND, phase: 'running' };
		if (clock.active) return { pose: st.ex.name, phase: 'running' };
		if (resting) return restLeft > READY_S ? { pose: STAND, phase: 'running' } : { pose: st.ex.name, phase: 'ready' };
		return { pose: st.ex.name, phase: 'set' };
	});

	const holdMeasure = (x: Exercise, seconds: number, target: number): Measure => measureFor(x, { load: 0, count: seconds, target });

	function push(op: QueueOp, s: Step, measure: Measure) {
		queue.push(op, s, measure);
		navigator.vibrate?.(12);
	}

	function enqueue(measure: Measure) {
		if (!st) return;
		const s = st;
		push('log', s, measure);
		const next = stepI + 1;
		if (next >= steps.length) return;
		if (steps[next].section === s.section) goTo(next);
	}

	function logSetNow(x: Exercise) {
		if (performance.now() - lastPress < 350) return;
		lastPress = performance.now();
		enqueue(measureFor(x, { load: weight, count: reps }));
	}

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

	let finishFormEl = $state<HTMLFormElement>();
	let finishing = $state(false);

	async function finishNow() {
		finishing = true;
		await queue.drain();
		if (queue.anyFailed) {
			queue.error = 'An entry didn’t save — Retry it, or finish from the crumb.';
			finishing = false;
			return;
		}
		finishFormEl?.requestSubmit();
	}

	async function finishEarly() {
		sheet = null;
		finishing = true;
		await queue.drain();
		finishFormEl?.requestSubmit();
	}

	async function exitToToday() {
		await queue.drain();
		await goto('/', { invalidateAll: true });
	}

	function addStretch(name: string) {
		addOpen = false;
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

	let nextLabel = $derived.by(() => {
		const n = steps[stepI + 1];
		if (!n) return `Finish ${noun}`;
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
					: `Finish ${noun}`
				: !st
					? `Finish ${noun}`
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
	let showTiles = $derived(!!editing || (atSet && !stepDone && !fixed));

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

	function receiptSets(name: string): Measure[] {
		return entries
			.filter((e) => e.item === name && isSet(e.measure))
			.sort((a, b) => a.index - b.index)
			.map((e) => e.measure);
	}
	let runMinutes = $derived(entries.filter((e) => e.measure.of === 'duration').reduce((n, e) => n + (e.measure.of === 'duration' ? e.measure.minutes : 0), 0));
	let sessionMinutes = $derived.by(() => {
		const end = entries.reduce((m, e) => Math.max(m, Date.parse(e.at)), 0) || now;
		return Math.max(1, Math.round((end - Date.parse(sessionAt)) / 60000));
	});
	let prepLine = $derived(
		receiptLine(sessionMinutes, entries.some((e) => e.item === WARMUP_ITEM), entries.some((e) => e.item === COOLDOWN_ITEM || coolStretches.includes(e.item)))
	);
	let minutesLeft = $derived(estimateMinutes(steps, progress.current));
	let position = $derived(positionLabel(Math.min(stepI, steps.length), steps));
	let sessionSub = $derived(`${progress.sets} of ${totalSets} ${steps.every((s) => s.kind !== 'set' || s.ex.kind === 'hold') ? 'holds' : 'sets'} · ~${minutesLeft} min left`);

	function onKey(ev: KeyboardEvent) {
		if ((ev.target as HTMLElement | null)?.tagName === 'INPUT') return;
		if (ev.key === 'Escape') {
			if (sheet) sheet = null;
			else if (about) about = false;
			else if (addOpen) addOpen = false;
			else if (editing) cancelEdit();
			ev.preventDefault();
			return;
		}
		if (sheet) return;
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
		<header class="fl-top">
			<button type="button" class="fl-back" onclick={() => void exitToToday()} aria-label="Back to Today — the session stays open">˅</button>
			<button type="button" class="fl-crumb" onclick={() => (sheet = 'session')} aria-label="The session — where you are, finish or pause">
				<span class="fl-crumbtext">{position}{allDone ? '' : ` · ~${minutesLeft} min`}</span>
				<span class="fl-tri">▾</span>
			</button>
		</header>

		{#if st && !allDone}
			<main class="fl-main">
				<div class="fl-titleblock">
					{#if aboutable}
						<button type="button" class="fl-namebtn" onclick={() => (about = !about)} aria-expanded={about} aria-label="About {heading}">
							<h1 class="fl-name">{heading}</h1>
							<span class="fl-about">{about ? 'Close ×' : 'About ›'}</span>
						</button>
					{:else}
						<h1 class="fl-name">{heading}</h1>
					{/if}
					{#if line && !about}<p class="fl-line">{line}</p>{/if}
					<p class="fl-meta">{meta}</p>
					</div>
					
					{#if about && aboutable}
					<div class="fl-aboutwrap">
						<AboutCard name={heading} ex={aboutEx} text={aboutText} rest={aboutEx ? restFor(plan, aboutEx) : 0} {partOf} {last} />
					</div>
					{/if}
					
					<StepTable {rows} onRetry={retryEntry} onTap={tapRow} />
					<div class="fl-addrow">
					{#if addable.length}
						<button type="button" class="fl-addbtn" onclick={() => (addOpen = !addOpen)} aria-expanded={addOpen}>{addOpen ? 'never mind' : '+ add a stretch'}</button>
					{:else}
						<span></span>
					{/if}
					<span class="fl-secnote">{sectionNote}</span>
					</div>
					{#if addOpen}
					<div class="fl-chips">
						{#each addable as x (x.name)}
							<button type="button" class="fl-chip" onclick={() => addStretch(x.name)}>{x.name}</button>
						{/each}
					</div>
					{/if}

				<div class="fl-stage" class:clock={!!stage}>
					<div class="fl-stagerow">
						<div class="fl-glyph"><Athlete pose={athlete.pose} phase={athlete.phase} size={240} /></div>
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
								label={editing ? 'Held' : `Hold · +${dialEx.kind === 'hold' && dialEx.progress.of === 'time' ? dialEx.progress.inc : 5}s`}
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
			<main class="fl-main">
				<div class="fl-donehead">
					<div>
						<h1 class="fl-name">Done</h1>
						<p class="fl-meta">
							<span>{isRun ? `${runMinutes} MIN` : `${progress.sets} SETS LOGGED`}{queue.syncing ? ' · SAVING…' : ''}</span>
						</p>
					</div>
					<Athlete pose={STAND} phase="still" size={88} />
				</div>
				<div class="fl-receipt">
					{#if isRun}
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
					label={finishing ? 'Saving…' : `Finish ${noun}`}
					disabled={finishing}
					onclick={() => void finishNow()}
				/>
			</div>
		{/if}
	</div>
</div>

<SessionSheet
	open={sheet === 'session'}
	{title}
	sub={sessionSub}
	{sections}
	backLabel={position}
	{noun}
	logged={progress.sets}
	total={totalSets}
	{allDone}
	onJump={(i) => {
		sheet = null;
		goTo(i);
	}}
	onFinishEarly={() => void finishEarly()}
	onExit={() => {
		sheet = null;
		void exitToToday();
	}}
	onClose={() => (sheet = null)}
/>

<!-- finish still goes through a real form action; its 303 redirect makes use:enhance run invalidateAll, so Today reloads fresh events -->
<form bind:this={finishFormEl} method="POST" action="?/finish" use:enhance hidden></form>

<style>
	.fl {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		/* not inset:0 — mobile Safari resolves that to the layout viewport, which extends behind the URL bar and toolbar */
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
		padding: 8px 16px 4px;
	}
	.fl-back {
		width: 44px; height: 44px; flex: none;
		display: inline-flex; align-items: center; justify-content: center;
		background: var(--white); border: var(--border-w) solid var(--ink); border-radius: var(--radius-md);
		box-shadow: var(--shadow-raised);
		font-family: var(--font-display); font-weight: var(--weight-black); font-size: 18px; color: var(--ink);
		cursor: pointer; touch-action: manipulation;
	}
	.fl-back:active { transform: translateY(2px); box-shadow: var(--shadow-pressed); }
	.fl-crumb {
		display: inline-flex; align-items: center; gap: 8px; max-width: 100%; min-width: 0;
		min-height: 40px; padding: 0 12px;
		background: var(--white); border: 1px solid var(--ink); border-radius: var(--radius-pill);
		font-family: var(--font-mono); font-size: 12px; font-weight: 700; letter-spacing: var(--tracking-caps);
		text-transform: uppercase; color: var(--ink); cursor: pointer; touch-action: manipulation;
		transition: background var(--dur-med) var(--ease-snap);
	}
	.fl-crumb:hover { background: var(--volt-tint); }
	.fl-crumbtext { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.fl-tri { font-size: 11px; color: var(--ink-3); }

	.fl-main {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		padding: 4px 16px 0;
	}
	.fl-titleblock { flex: none; margin-bottom: 12px; }
	.fl-namebtn {
		display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
		background: none; border: none; padding: 0; text-align: left; cursor: pointer; touch-action: manipulation;
		font: inherit; color: inherit; border-radius: var(--radius-sm);
	}
	.fl-namebtn .fl-name { text-decoration: underline; text-decoration-thickness: 3px; text-underline-offset: 5px; text-decoration-color: var(--volt-deep); }
	.fl-namebtn:hover .fl-name { text-decoration-color: var(--ink); }
	.fl-about {
		font-family: var(--font-body); font-size: 12px; font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps);
		text-transform: uppercase; color: var(--ink-3); white-space: nowrap;
	}
	.fl-line { margin: 8px 0 0; font-size: 15px; line-height: 1.4; color: var(--ink-2); }
	.fl-aboutwrap { flex: none; margin-bottom: 12px; max-height: 45%; overflow-y: auto; overscroll-behavior: contain; }
	.fl-addrow { flex: none; display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 4px 0; }
	.fl-addbtn {
		background: none; border: none; padding: 8px 0; cursor: pointer; touch-action: manipulation;
		font-family: var(--font-mono); font-size: 12px; color: var(--ink-3);
		text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--border-soft);
	}
	.fl-addbtn:hover { color: var(--ink); }
	.fl-secnote { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.fl-chips { flex: none; display: flex; flex-wrap: wrap; gap: 8px; padding: 4px 0 8px; }
	.fl-chip {
		min-height: 44px; padding: 0 18px; border-radius: var(--radius-pill);
		border: var(--border-w) solid var(--border-soft); background: var(--white);
		font-family: var(--font-body); font-weight: var(--weight-bold); font-size: 15px; color: var(--ink-2); cursor: pointer; touch-action: manipulation;
	}
	.fl-chip:hover { background: var(--volt-tint); color: var(--ink); }
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
	}

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
	.fl-donehead { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
	.fl-stage.clock { min-height: auto; }
	.fl-stage.clock .fl-stagerow { flex-basis: auto; }
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

	@media (max-height: 740px) {
		.fl-name { font-size: clamp(24px, 6vw, 30px); }
		.fl-bottom { padding-top: 6px; }
		.fl-titleblock { margin-bottom: 10px; }
		.fl-clocknum { font-size: 72px; }
	}
	@media (max-height: 640px) {
		.fl-line { margin-top: 4px; font-size: 14px; }
		.fl-stage { padding: 8px 0 2px; }
		.fl-clocknum { font-size: 56px; }
		.fl-stage.clock .fl-glyph { height: 64px; }
		.fl-stage.clock .fl-glyph :global(canvas) { width: 64px; height: 64px; }
	}
	@media (max-height: 560px) {
		.fl-line { display: none; }
		.fl-stage:not(.clock) { display: none; }
		.fl-stage.clock .fl-glyph { display: none; }
		.fl-clocknum { font-size: 44px; }
		.fl-meta { margin: 2px 0 0; font-size: 12px; }
		.fl-name { font-size: clamp(22px, 5vh, 26px); }
		.fl-tiles { gap: 8px; margin-bottom: 8px; }
	}
</style>
