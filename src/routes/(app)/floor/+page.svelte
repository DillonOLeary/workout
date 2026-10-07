<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { Caption, Card, Note, Primary, Row, SetTable, Sheet, Slot, Stepper, Title, type SetRow, type SetRowPill } from '$lib/ui';
	import { armBell, ringBell } from '$lib/floor/bell';
	import { holdScreen } from '$lib/floor/wake-lock';
	import { CountdownClock, type Countdown } from '$lib/floor/countdown.svelte';
	import { EntryQueue, type QueueOp } from '$lib/floor/entry-queue.svelte';
	import { loadSkips, saveSkips } from '$lib/floor/skips';
	import { watchOnline } from '$lib/net';
	import { COOLDOWN_ITEM, WARMUP_ITEM } from '$lib/domain/events';
	import { disciplineLabel, durationLabel, firstSentence, itemDose, levelNote, loadHint, loadShort, plannedValue, receiptLine, sessionNoun, setValue, setsLine } from '$lib/domain/labels';
	import { countOf, isSet, loadOf, measureFor, type Measure } from '$lib/domain/measure';
	import { cueFor, levelsOf, progresses, routineTitle, type Exercise } from '$lib/domain/plan';
	import { historyFor, lastEntryFor, sessionEntries } from '$lib/domain/projections';
	import { anySetEarned, bumpCount, bumpLoad, nextSet, roundsDone, suggest, type Suggestion } from '$lib/domain/progression';
	import { loggedOutside, restUntil, roundsOf, routineExercises, runStart, sessionProgress, sessionSections, sessionSteps, stepName, type Section, type Step } from '$lib/domain/steps';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const opened = Date.now();

	// a session's identity can't change while you're on the floor
	// svelte-ignore state_referenced_locally
	const session = data.activeSession!;
	// svelte-ignore state_referenced_locally
	const plan = data.plans.find((p) => p.id === session.plan) ?? data.plans[0];
	const workout = session.workout;
	const title = routineTitle(plan, workout.routine) ?? disciplineLabel(session.discipline);
	const noun = sessionNoun(session.discipline);
	const queue = new EntryQueue(session.id);
	$effect(() => () => queue.dispose());

	let serverEntries = $derived(sessionEntries(data.events, session.id));
	let entries = $derived(queue.overlay(serverEntries));
	let steps = $derived(sessionSteps(plan, workout, loggedOutside(plan, workout, entries)));
	// the steps you passed over: nothing is written for them, the order walks on
	const keptSkips = loadSkips(session.id);
	let skipList = $state(keptSkips);
	let skipped = $derived(new Set(skipList));
	let exercises = $derived.by(() => {
		const out: Exercise[] = [];
		for (const s of steps) if (s.kind === 'set' && !out.some((e) => e.name === s.ex.name)) out.push(s.ex);
		return out;
	});
	let progress = $derived(sessionProgress(steps, entries, skipped));
	let allDone = $derived(progress.current >= steps.length);

	const loads = new Map<string, Suggestion>();
	function suggestionFor(ex: Exercise): Suggestion {
		let s = loads.get(ex.name);
		if (!s) loads.set(ex.name, (s = suggest(historyFor(data.events, ex.name, session.id), ex, opened)));
		return s;
	}
	const plannedWeight = (x: Exercise, k: number) => {
		const s = suggestionFor(x);
		return s.kind === 'load' ? s.sets[Math.min(k, x.sets - 1)].weight : 0;
	};

	// where you are: the URL keeps the step, so a reload lands back on it
	const initialStep = (() => {
		// what the server has, and what this phone kept when the link dropped
		// svelte-ignore state_referenced_locally
		const known = queue.overlay(sessionEntries(data.events, session.id));
		const ss = sessionSteps(plan, workout, loggedOutside(plan, workout, known));
		// svelte-ignore state_referenced_locally
		const raw = page.url.searchParams.get('step');
		const n = raw === null ? NaN : Number(raw);
		if (Number.isInteger(n) && n >= 0 && n < ss.length) return n;
		return Math.min(sessionProgress(ss, known, new Set(keptSkips)).current, Math.max(0, ss.length - 1));
	})();
	let stepI = $state(initialStep);
	let weight = $state(0);
	let reps = $state(0);
	let editing = $state<string | null>(null);
	let why = $state(false);
	// a look somewhere other than the next open step — the map, ‹ / ›, the arrow keys; the order waits where you left it
	let peek = $state(false);
	let mapOpen = $state(false);
	let now = $state(Date.now());
	let live = $state('');

	let st = $derived<Step | undefined>(steps[stepI]);
	let ex = $derived<Exercise | undefined>(st?.kind === 'set' ? st.ex : undefined);
	let stepDone = $derived(!!st && progress.done.has(st.key));
	let stepSkipped = $derived(!!st && !stepDone && skipped.has(st.key));
	const entryFor = (s: Step) => entries.find((e) => e.item === s.item && e.index === s.index);
	let editStep = $derived(editing ? steps.find((s) => s.key === editing) : undefined);
	let dialEx = $derived(editStep?.kind === 'set' ? editStep.ex : ex);
	let last = $derived(ex ? lastEntryFor(data.events, ex.name, session.id) : null);

	const clock = new CountdownClock((done) => {
		ringBell();
		live = 'Done';
		enqueue(done.kind === 'hold' ? measureFor(done.ex, { load: 0, count: done.target, target: done.target }) : { of: 'step' });
	});
	let restEnd = $derived(st?.kind === 'set' && !stepDone && !stepSkipped ? restUntil(st, entries) : null);
	let restLeft = $derived(restEnd !== null ? Math.max(0, Math.ceil((restEnd - now) / 1000)) : 0);
	let resting = $derived(restEnd !== null && restLeft > 0 && !clock.active);
	let restTotal = $derived(st?.kind === 'set' ? (st.rest?.seconds ?? 0) : 0);
	// the clock's ring: 56px at the least, with 16px around it once a short stage puts the caption beside it; with less room the row says the rest
	const RING_ROOM = 56 + 16;
	let stageH = $state(0);
	let ringFits = $derived(stageH >= RING_ROOM);
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
	let ticking = $derived(resting || clock.active || st?.kind === 'run');
	$effect(() => {
		if (!ticking) return;
		// the rest bar and a hold move by the fifth of a second; the run's clock shows whole seconds
		const t = setInterval(() => (now = Date.now()), resting || clock.active ? 200 : 1000);
		return () => clearInterval(t);
	});
	let lit = $derived(!allDone && st?.kind !== 'run');
	$effect(() => (lit ? holdScreen() : undefined));
	let runFrom = $derived(st?.kind === 'run' ? runStart(steps, stepI, entries, session.at) : null);
	let runElapsed = $derived(runFrom !== null ? Math.max(0, now - runFrom) : 0);
	const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

	function preload(i: number) {
		const s = steps[i];
		if (!s || s.kind !== 'set') return;
		const prior = entries.filter((x) => x.item === s.ex.name && x.index < s.index && isSet(x.measure)).sort((a, b) => a.index - b.index).map((x) => ({ index: x.index, measure: x.measure }));
		const next = nextSet(suggestionFor(s.ex), s.ex, prior, s.index - 1);
		weight = next.weight;
		reps = next.count;
		clock.cancel();
	}
	preload(initialStep);
	function goTo(i: number, look = false) {
		clock.cancel();
		editing = null;
		why = false;
		if (i < 0 || i >= steps.length) return;
		stepI = i;
		peek = look;
		preload(i);
		replaceState(`?step=${i}`, {});
	}
	function fix(key: string) {
		const s = steps.find((x) => x.key === key);
		const e = s && entryFor(s);
		if (!s || !e || s.kind !== 'set') return;
		editing = key;
		clock.cancel();
		weight = loadOf(e.measure);
		reps = countOf(e.measure);
	}
	function cancelFix() {
		editing = null;
		preload(stepI);
	}
	function saveFix() {
		const s = editStep;
		const e = s && entryFor(s);
		if (s?.kind === 'set' && e) {
			const target = e.measure.of === 'hold' ? e.measure.target : undefined;
			const m = measureFor(s.ex, { load: weight, count: reps, ...(target !== undefined ? { target } : {}) });
			if (JSON.stringify(m) !== JSON.stringify(e.measure)) push('correct', s, m);
		}
		cancelFix();
	}
	function push(op: QueueOp, s: Step, measure: Measure) {
		now = Date.now(); // the rest clock starts from this tap, not from the last tick
		queue.push(op, s, measure);
		navigator.vibrate?.(12);
	}
	function enqueue(measure: Measure) {
		if (!st) return;
		const s = st;
		push('log', s, measure);
		const next = stepI + 1;
		if (next < steps.length && steps[next].section === s.section && !progress.done.has(steps[next].key) && !skipped.has(steps[next].key)) goTo(next);
	}
	function setSkips(keys: string[]) {
		skipList = [...new Set(keys)];
		saveSkips(session.id, skipList);
	}
	// skip = what's left of this part from the step you're on; undo = that step and the rest of its part, back in the order
	function skipFrom(i: number) {
		const s = steps[i];
		if (!s || clock.active) return;
		setSkips([...skipList, ...steps.filter((x, k) => k >= i && x.section === s.section && !progress.done.has(x.key)).map((x) => x.key)]);
		live = 'Skipped';
	}
	function unskipFrom(i: number) {
		const s = steps[i];
		if (!s) return;
		const back = new Set(steps.filter((x, k) => k >= i && x.section === s.section).map((x) => x.key));
		setSkips(skipList.filter((k) => !back.has(k)));
		if (i !== stepI) goTo(i, true);
	}
	function onpill(key: string, pill: SetRowPill) {
		const i = steps.findIndex((x) => x.key === key);
		if (pill === 'fix') fix(key);
		else if (pill === 'skip') skipFrom(i);
		else unskipFrom(i);
	}
	let lastPress = 0;
	const debounced = () => {
		if (performance.now() - lastPress < 350) return false;
		lastPress = performance.now();
		return true;
	};
	function startOrDone(next: Countdown) {
		if (!debounced()) return;
		const early = clock.dropEarly();
		if (early) enqueue(early.done.kind === 'hold' ? measureFor(early.done.ex, { load: 0, count: early.held, target: early.done.target }) : { of: 'step' });
		else clock.start(next);
	}
	let finishFormEl = $state<HTMLFormElement>();
	let finishing = $state(false);
	// the connection, as the browser and the queue see it: what the strip under the bar says
	let online = $state(true);
	$effect(() => watchOnline((on) => {
		online = on;
		if (on) queue.wake();
	}));
	const entriesWord = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`;
	let backOnline = $state(false);
	let wasOff = false;
	$effect(() => {
		const off = !online || queue.offline, left = queue.unsent;
		if (off) wasOff = true;
		else if (wasOff && left === 0) {
			wasOff = false;
			backOnline = true;
			const t = setTimeout(() => (backOnline = false), 3000);
			return () => clearTimeout(t);
		}
	});
	let netLine = $derived.by(() => {
		const n = queue.unsent;
		if (!online || queue.offline) return n ? `No connection · ${entriesWord(n)} kept on this phone — they send when you're back` : 'No connection · what you log stays on this phone until you’re back';
		if (queue.slow) return `Slow connection · sending ${entriesWord(n)}…`;
		return backOnline ? 'Back online · everything’s saved' : '';
	});
	// leaving waits for the queue: a refusal needs Retry; a dead link keeps the entries here until they send
	function unsaved(leaving: string): boolean {
		if (queue.anyFailed) queue.error = `An entry didn’t save — Retry it before you ${leaving}.`;
		else if (queue.unsent) queue.error = `No connection · ${entriesWord(queue.unsent)} still on this phone. They send on their own — ${leaving} once they have.`;
		else return false;
		return true;
	}
	async function finishNow() {
		finishing = true;
		await queue.drain();
		if (unsaved('finish')) {
			finishing = false;
			return;
		}
		finishFormEl?.requestSubmit();
	}
	async function exitToToday() {
		await queue.drain();
		if (unsaved('leave')) return;
		await goto('/', { invalidateAll: true });
	}
	function primaryAction() {
		if (finishing || !st) return;
		armBell();
		if (editing) return saveFix();
		if (allDone) return void finishNow();
		if (stepDone || stepSkipped) return goTo(progress.current);
		if (st.kind === 'prep') return enqueue({ of: 'step' });
		if (st.kind === 'timed') return startOrDone({ kind: 'timed', target: st.seconds });
		if (st.kind === 'run') return enqueue({ of: 'duration', minutes: Math.max(1, Math.round(runElapsed / 60000)) });
		if (st.ex.kind === 'hold') return startOrDone({ kind: 'hold', target: reps, ex: st.ex });
		if (debounced()) enqueue(measureFor(st.ex, { load: weight, count: reps }));
	}
	const bumpReps = (dir: 1 | -1) => {
		if (!dialEx || clock.active) return;
		reps = editing && dialEx.kind === 'hold' ? Math.max(1, Math.min(dialEx.hi, reps + dir * (dialEx.progress.of === 'time' ? dialEx.progress.inc : 5))) : bumpCount(dialEx, reps, dir);
	};
	const bumpWeight = (dir: 1 | -1) => {
		if (dialEx?.kind === 'load') weight = bumpLoad(dialEx, weight, dir);
	};

	// the map: every part of the session, the one on screen, and the next open step it waits on
	let sections = $derived(sessionSections(steps, progress.done, skipped));
	let secI = $derived(st ? sections.findIndex((x) => x.name === st.section) : -1);
	let nowStep = $derived<Step | undefined>(steps[progress.current]);
	let peeking = $derived(peek && !!nowStep && stepI !== progress.current);
	function jump(sec: Section) {
		mapOpen = false;
		goTo(sec.land, true);
	}
	const subOf = (sec: Section) => {
		const s = steps[sec.first];
		if (s.kind === 'set' && s.round) return `${sec.steps} exercises`;
		if (s.kind === 'set' || s.kind === 'run') return itemDose(s.ex, s.kind === 'set' ? plannedWeight(s.ex, 0) : 0);
		return sec.steps === 1 ? s.text : `${sec.steps} steps`;
	};
	const rightOf = (sec: Section) => {
		const n = `${sec.done} of ${sec.steps}`;
		if (sec.done + sec.skipped === sec.steps) return sec.done ? `✓ ${n}` : 'skipped';
		if (sec.name === nowStep?.section) return `now · ${n}`;
		if (sec.name === st?.section) return 'looking ›';
		return sec.done ? `${n} ›` : '›';
	};

	// the words on the screen
	let sets = $derived(steps.filter((s) => s.kind === 'set'));
	const rounds = roundsOf(plan, workout);
	let holdsOnly = $derived(sets.every((s) => s.kind === 'set' && s.ex.kind === 'hold'));
	let pos = $derived.by(() => {
		if (!st || allDone) return 'done';
		if (st.kind === 'set' && st.round) return `round ${st.round} of ${rounds}`;
		if (st.kind === 'set') return `${holdsOnly ? 'hold' : 'set'} ${sets.indexOf(st) + 1} of ${sets.length}`;
		if (st.kind === 'run') return 'run';
		const peers = steps.filter((s) => s.section === st.section);
		return `${st.section.toLowerCase()} ${peers.indexOf(st) + 1} of ${peers.length}`;
	});
	let heading = $derived(!st ? 'Done' : st.kind === 'set' ? st.ex.name : st.section);
	let cue = $derived(st?.kind === 'set' ? (st.ex.note ? firstSentence(st.ex.note) : '') : st?.kind === 'run' ? (st.ex.note ?? '') : (cueFor(plan, workout.routine) ?? ''));
	let loadLine = $derived.by(() => {
		if (!ex) return '';
		if (ex.kind === 'load') {
			const s = suggestionFor(ex);
			const was = last ? loadOf(last.sets[0]) : null;
			const move = was === null ? 'first time' : weight > was ? `up from ${was}` : weight < was ? `down from ${was}` : 'same as last time';
			return `${loadShort(weight, ex)} · ${move}${s.kind === 'load' && s.reason !== 'start' ? ' · why?' : ''}`;
		}
		if (ex.kind === 'hold') return `${reps}s · hold`;
		return 'bodyweight';
	});
	let whyText = $derived.by(() => {
		if (!ex) return '';
		const s = suggestionFor(ex);
		return loadHint(s, ex) ?? (last ? `Last time set 1 was ${countOf(last.sets[0])}, under the top of ${ex.hi}. Hit ${ex.hi} today and next time goes up.` : '');
	});
	let rows = $derived.by((): SetRow[] => {
		if (!st) return [];
		return steps.filter((s) => s.section === st.section).map((s): SetRow => {
			const cur = s.key === st.key, e = entryFor(s), lp = queue.latestFor(s);
			const failed = lp?.status === 'failed', saving = !!lp && (lp.status === 'queued' || lp.status === 'inflight' || lp.status === 'waiting');
			const pending = online && !queue.offline ? 'saving…' : 'waiting';
			const label = s.label;
			const fixedNote = lp?.op === 'correct' && lp.status === 'confirmed' ? '✓ fixed' : '✓';
			const passed = !e && skipped.has(s.key);
			const skip: SetRowPill | undefined = cur && !e && !passed && !clock.active && s.kind !== 'run' ? 'skip' : undefined;
			if (s.kind !== 'set') {
				const text = s.kind === 'run' ? (e?.measure.of === 'duration' ? `${e.measure.minutes} min` : `${s.minutes} min`) : s.text;
				if (passed) return { key: s.key, label, text, prose: true, state: 'skipped', right: 'skipped', pill: 'undo' };
				return { key: s.key, label, text, prose: s.kind !== 'run', state: failed ? 'failed' : saving ? 'saving' : e ? 'done' : cur ? 'now' : 'todo', right: failed ? undefined : saving ? pending : e ? '✓' : cur && clock.active ? `${clock.remaining}s` : undefined, pill: skip };
			}
			if (editing === s.key) return { key: s.key, label, text: setValue(s.ex, weight, reps), state: 'fixing', right: 'editing' };
			if (e) return { key: s.key, label, text: setValue(s.ex, loadOf(e.measure), countOf(e.measure)), state: failed ? 'failed' : saving ? 'saving' : 'done', right: failed ? undefined : saving ? pending : fixedNote, pill: !failed && !saving ? 'fix' : undefined };
			if (passed) return { key: s.key, label, text: plannedValue(s.ex, plannedWeight(s.ex, s.index - 1)), state: 'skipped', right: 'skipped', pill: 'undo' };
			if (cur && clock.running) return { key: s.key, label, text: `${clock.remaining ?? clock.running.target}s`, state: 'now' };
			// the ring is the rest; the row says it only when the ring has no room
			if (cur && resting) return { key: s.key, label, text: setValue(s.ex, weight, reps), state: 'now', right: ringFits ? undefined : `rest ${restLeft}s`, pill: skip };
			if (cur) return { key: s.key, label, text: setValue(s.ex, weight, reps), state: 'now', pill: skip };
			return { key: s.key, label, text: plannedValue(s.ex, plannedWeight(s.ex, s.index - 1)), state: 'todo' };
		});
	});
	let stage = $derived.by((): { value: string; note: string; frac: number } | null => {
		if (!st || allDone) return null;
		const r = clock.running;
		if (r) {
			const left = clock.remaining ?? r.target;
			return { value: r.target >= 60 ? mmss(left * 1000) : String(left), note: `${r.kind === 'hold' ? 'Hold' : st.kind === 'timed' ? st.name : 'Go'} · of ${durationLabel(r.target)}`, frac: left / r.target };
		}
		if (resting) return { value: String(restLeft), note: `Rest · of ${restTotal}s`, frac: restTotal ? restLeft / restTotal : 0 };
		if (st.kind === 'run') return { value: mmss(runElapsed), note: `Run · of ${st.minutes} min`, frac: Math.max(0, 1 - runElapsed / (st.minutes * 60000)) };
		return null;
	});
	let readyLine = $derived(stepSkipped ? 'Skipped — nothing goes in the ledger for it.' : peeking && !stepDone ? 'Log it here, or head back — the order waits.' : progress.sets === 0 && progress.current === stepI ? 'Set up, then log the first set.' : 'Ready when you are.');
	let primaryLabel = $derived.by(() => {
		if (editing) return `Save ${editStep?.kind === 'set' && editStep.ex.kind === 'hold' ? 'hold' : 'set'} ${editStep?.index ?? ''}`;
		if (!st) return `Finish ${noun}`;
		if (stepDone || stepSkipped) return !nowStep ? `Finish ${noun}` : nowStep.section === st.section ? 'Next' : `Next: ${nowStep.section}`;
		if (st.kind === 'prep') return 'Done';
		if (st.kind === 'timed') return clock.active ? 'Done early' : `Start ${durationLabel(st.seconds)}`;
		if (st.kind === 'run') return 'Stop here';
		if (st.ex.kind === 'hold') return clock.active ? 'Done early' : `Start ${reps}s`;
		return st.round ? `Log ${st.ex.name.toLowerCase()}` : `Log set ${st.index}`;
	});
	let showTiles = $derived(!!editing || (st?.kind === 'set' && !stepDone && !stepSkipped && !!ex && (progresses(ex) || ex.kind === 'reps')));
	let tileHold = $derived(dialEx?.kind === 'hold');
	let tileLoad = $derived(dialEx?.kind === 'load');
	// no name: the figure stands
	let figure = $derived(!st || allDone ? undefined : st.kind === 'set' || st.kind === 'run' ? st.ex.name : st.name);

	// the receipt
	const receiptSets = (name: string): Measure[] => entries.filter((e) => e.item === name && isSet(e.measure)).sort((a, b) => a.index - b.index).map((e) => e.measure);
	const passedOver = (name: string) => steps.some((s) => s.section === name && skipped.has(s.key));
	let runMinutes = $derived(entries.reduce((n, e) => n + (e.measure.of === 'duration' ? e.measure.minutes : 0), 0));
	let sessionMinutes = $derived(Math.max(1, Math.round(((entries.reduce((m, e) => Math.max(m, Date.parse(e.at)), 0) || now) - Date.parse(session.at)) / 60000)));
	let doneNote = $derived.by(() => {
		const up = exercises.filter((e) => e.kind === 'load' && anySetEarned(receiptSets(e.name), e)).map((e) => e.name);
		const count = `${progress.sets} ${holdsOnly ? 'hold' : 'set'}${progress.sets === 1 ? '' : 's'}${runMinutes ? ` · ${runMinutes} min` : ''}.`;
		const levels = levelsOf(plan, workout.routine);
		const level = levels && rounds ? `${levelNote(levels, rounds, roundsDone(routineExercises(plan, workout), rounds, entries))} ` : '';
		return `${count} ${level}${up.length ? `${up.join(', ')} ${up.length === 1 ? 'goes' : 'go'} up next time.` : ''} ${receiptLine(sessionMinutes, entries.some((e) => e.item === WARMUP_ITEM), entries.some((e) => e.item === COOLDOWN_ITEM))}`;
	});

	function onKey(ev: KeyboardEvent) {
		if (mapOpen) return;
		if (ev.key === 'Escape' && editing) return cancelFix();
		if (ev.key === 'Enter') return primaryAction();
		if (allDone) return;
		if (ev.key === 'ArrowUp') (tileLoad && !tileHold ? bumpWeight : bumpReps)(1);
		else if (ev.key === 'ArrowDown') (tileLoad && !tileHold ? bumpWeight : bumpReps)(-1);
		else if (ev.key === 'ArrowRight') goTo(Math.min(steps.length - 1, stepI + 1), true);
		else if (ev.key === 'ArrowLeft') goTo(Math.max(0, stepI - 1), true);
	}
</script>

<svelte:window onkeydown={onKey} />

<main class="fl">
	<div class="fl-inner">
		<header class="top">
			<button type="button" class="back" onclick={() => void exitToToday()}>‹ Today</button>
			{#if st && !allDone}
				<button type="button" class="where" aria-haspopup="dialog" onclick={() => (mapOpen = true)}><Caption tone="slate">{title} · {pos}</Caption><span class="caret" aria-hidden="true">▾</span></button>
			{:else}
				<Caption tone="slate">{title} · {pos}</Caption>
			{/if}
		</header>
		<div class="bar"><span style="width: {steps.length ? (progress.current / steps.length) * 100 : 0}%"></span></div>
		{#if netLine}<div class="net" class:off={!online || queue.offline} role="status">{netLine}</div>{/if}

		{#if st && !allDone}
			{#if peeking && nowStep}
				<div class="peek">
					<span class="peeklbl">{stepI > progress.current ? 'Looking ahead' : 'Looking back'}</span>
					<button type="button" class="return" onclick={() => goTo(progress.current)}>Back to {stepName(nowStep)} ›</button>
				</div>
			{/if}

			<div class="who">
				<Slot exercise={figure} size={92} />
				<div class="words">
					<Title size="md" caps as="h1">{heading}</Title>
					{#if cue}<span class="cue">{cue}</span>{/if}
					{#if ex}
						{#if loadLine.endsWith('why?')}<Note size="sm" onclick={() => (why = !why)}>{loadLine}</Note>{:else}<Note size="sm">{loadLine}</Note>{/if}
					{/if}
				</div>
			</div>
			{#if why && whyText}<div class="why"><Note tone="ink">{whyText} Change it with −/+ if the rack disagrees.</Note></div>{/if}

			<div class="table">
				<SetTable {rows} {onpill} onretry={(k) => { const s = steps.find((x) => x.key === k); if (s) queue.retry(s); }} />
				<div class="under">
					{#if secI > 0}<Note size="sm" onclick={() => jump(sections[secI - 1])}>‹ {sections[secI - 1].name}</Note>{:else}<span></span>{/if}
					{#if secI >= 0 && secI < sections.length - 1}<Note size="sm" onclick={() => jump(sections[secI + 1])}>then: {sections[secI + 1].name} ›</Note>{:else}<Note size="sm" tone="stone">then: done</Note>{/if}
				</div>
			</div>

			<div class="stage" bind:clientHeight={stageH}>
				{#if stage}
					{#if ringFits}
						<div class="clock" role="timer" aria-label="{stage.value} · {stage.note}">
							<div class="ring">
								<svg viewBox="0 0 100 100" aria-hidden="true">
									<circle class="track" cx="50" cy="50" r="46" />
									<circle class="left" cx="50" cy="50" r="46" pathLength="100" stroke-dasharray="100" stroke-dashoffset={100 - Math.max(0, Math.min(1, stage.frac)) * 100} />
								</svg>
								<span class="big" class:long={stage.value.length > 3}>{stage.value}</span>
							</div>
							<Caption>{stage.note}</Caption>
						</div>
					{/if}
				{:else}
					<Note size="md" tone="stone">{editing ? 'Fix it, then save.' : readyLine}</Note>
				{/if}
			</div>
			<span class="sr" aria-live="polite">{live}</span>

			<div class="bottom">
				{#if showTiles && dialEx}
					<div class="tiles">
						<div class="tile">
							<Caption>{tileHold ? (editing ? 'Held' : 'Seconds') : dialEx.side === 'reps' ? 'Reps · per side' : 'Reps'}</Caption>
							<Stepper value={reps} size="bare" disabled={clock.active} label={tileHold ? 'seconds' : 'reps'} onstep={bumpReps} />
						</div>
						<div class="tile" class:dim={!tileLoad}>
							<Caption>Load · lb</Caption>
							<Stepper value={tileLoad ? weight : '—'} size="bare" disabled={!tileLoad || clock.active} label="load" onstep={bumpWeight} />
						</div>
					</div>
				{/if}
				{#if queue.error ?? form?.message}<p class="err">{queue.error ?? form?.message}</p>{/if}
				<Primary size="lg" tone={(stepDone || stepSkipped) && !editing ? 'ink' : 'volt'} disabled={finishing} onclick={primaryAction}>{primaryLabel}</Primary>
			</div>
		{:else}
			<div class="done">
				<div class="donehead">
					<Title size="lg" caps as="h1">Done</Title>
					<Slot size={84} />
				</div>
				<Card pad={false}>
					<div class="receipt">
						{#if runMinutes}<div class="rrow"><span class="rname">{title}</span><span class="rval">{runMinutes} min</span></div>{/if}
						{#each exercises as e (e.name)}
							{@const done = receiptSets(e.name)}
							<div class="rrow"><span class="rname">{e.name}</span><span class="rval">{done.length ? setsLine(done, e) : passedOver(e.name) ? 'skipped' : '—'}</span></div>
						{/each}
					</div>
				</Card>
				<Note size="sm">{doneNote}{queue.syncing ? ' Saving…' : ''}</Note>
			</div>
			<div class="bottom">
				{#if queue.anyFailed}
					<p class="err">An entry didn’t save. <button type="button" class="retry" onclick={() => queue.retryAll()}>Retry</button></p>
				{:else if queue.error ?? form?.message}<p class="err">{queue.error ?? form?.message}</p>{/if}
				<Primary size="lg" tone="ink" disabled={finishing} onclick={() => void finishNow()}>{finishing ? 'Saving…' : 'Finish · write it to the ledger'}</Primary>
			</div>
		{/if}
	</div>
</main>

<Sheet open={mapOpen} {title} onclose={() => (mapOpen = false)}>
	<Note>The floor walks it in order. Tap any part to look ahead or fix one you did — the next set waits where you left it.</Note>
	<div class="map">
		{#each sections as sec (sec.name)}
			<Row label={sec.name} sub={subOf(sec)} right={rightOf(sec)} tone={sec.name === nowStep?.section ? 'now' : 'plain'} onclick={() => jump(sec)} />
		{/each}
	</div>
</Sheet>

<!-- finish goes through a real form action; its 303 makes use:enhance run invalidateAll, so Today reloads fresh events; a refusal frees the button -->
<form bind:this={finishFormEl} method="POST" action="?/finish" use:enhance={() => async ({ result, update }) => { await update(); if (result.type !== 'redirect') finishing = false; }} hidden></form>

<style>
	.fl {
		position: fixed; top: 0; left: 0; right: 0; height: 100vh; height: 100svh; z-index: 50;
		background: var(--paper); display: flex; flex-direction: column; overflow: hidden; user-select: none;
		padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
	}
	/* a short screen (an SE, landscape, both banners up) scrolls the floor rather than cutting it off; the primary stays pinned at the foot */
	.fl-inner { width: 100%; max-width: var(--content-max); margin: 0 auto; flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; display: flex; flex-direction: column; padding: 10px 16px 0; gap: 10px; }
	.top { flex: none; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
	.top :global(.caption) { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.where {
		min-width: 0; min-height: 40px; display: flex; align-items: center; gap: 6px; padding: 0 4px 0 10px; background: none; border: 0; cursor: pointer; touch-action: manipulation;
		text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--paper-3);
	}
	.where:hover { text-decoration-color: var(--ink); }
	.caret { flex: none; font-size: 12px; color: var(--ink); }
	.peek { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 6px 6px 12px; background: var(--white); border: 1.5px dashed var(--ink); border-radius: 12px; }
	.peeklbl { flex: none; font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink); }
	.return {
		min-width: 0; min-height: 36px; padding: 0 12px; border: 1.5px solid var(--ink); border-radius: var(--radius-pill); background: var(--volt);
		font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; touch-action: manipulation;
	}
	.return:hover { background: var(--volt-deep); }
	.back {
		flex: none; min-height: 40px; padding: 0 14px; background: var(--white); border: var(--border-w) solid var(--ink); border-radius: var(--radius-pill);
		font-family: var(--font-body); font-weight: 700; font-size: 14px; color: var(--ink); box-shadow: 0 2px 0 var(--ink); cursor: pointer; touch-action: manipulation;
	}
	.back:active { transform: translateY(1px); box-shadow: 0 1px 0 var(--ink); }
	.bar { flex: none; height: 6px; background: var(--ash); border-radius: var(--radius-pill); overflow: hidden; }
	.bar span { display: block; height: 100%; background: var(--ink); transition: width 300ms; }
	.net { flex: none; padding: 8px 12px; border-radius: 12px; background: var(--volt-light); font-family: var(--font-mono); font-size: 12px; line-height: 1.4; color: var(--ink); }
	.net.off { background: var(--ash); border: 1.5px dashed var(--stone); }
	.who { flex: none; display: flex; gap: 14px; align-items: center; }
	.words { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
	.cue { font-size: 13px; line-height: 1.4; color: var(--slate); }
	.why { flex: none; background: var(--volt-light); border-radius: 12px; padding: 10px 12px; }
	.table { flex: none; display: flex; flex-direction: column; gap: 6px; max-height: 42%; }
	.table :global(.table) { overflow-y: auto; }
	.under { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 0 2px; }
	.under :global(.note:last-child) { text-align: right; }
	.map { display: flex; flex-direction: column; }
	/* the stage takes the room the rest leaves, and the ring is sized from it (cqh), so a long table shrinks the ring instead of overrunning it */
	.stage { flex: 1 1 0; min-height: 0; container-type: size; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 8px; padding: 4px 0; }
	.clock { display: flex; flex-direction: column; align-items: center; gap: 8px; }
	.ring { position: relative; flex: none; width: min(200px, calc(100cqh - 24px), 100cqw); aspect-ratio: 1; container-type: inline-size; display: grid; place-items: center; }
	@container (max-height: 150px) {
		.clock { flex-direction: row; gap: 14px; }
		.ring { width: calc(100cqh - 8px); }
	}
	.ring svg { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
	.ring circle { fill: none; stroke-width: 5; }
	.track { stroke: var(--ash); }
	.left { stroke: var(--ink); transition: stroke-dashoffset 200ms linear; }
	.big { font-family: var(--font-mono); font-weight: 800; font-size: 38cqw; line-height: 1; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
	.big.long { font-size: 24cqw; }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
	.bottom { flex: none; position: sticky; bottom: 0; z-index: 1; background: var(--paper); display: flex; flex-direction: column; gap: 10px; padding-bottom: calc(14px + env(safe-area-inset-bottom)); }
	.tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
	.tile { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 6px; background: var(--white); border: 1px solid var(--paper-3); border-radius: 14px; }
	.tile.dim { opacity: 0.35; }
	.err { margin: 0; font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--signal); text-align: center; }
	.retry { min-height: 40px; padding: 0 14px; background: var(--white); border: 1px solid var(--signal); border-radius: var(--radius-pill); font: inherit; color: var(--signal); cursor: pointer; }
	.done { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; overflow: auto; }
	.donehead { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
	.donehead :global(.title) { font-size: 40px; }
	.receipt { padding: 0 14px; }
	.rrow { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; border-top: 1px solid var(--paper-2); padding: 10px 0; font-size: 14px; }
	.rrow:first-child { border-top: none; }
	.rname { font-weight: 700; }
	.rval { font-family: var(--font-mono); font-size: 12px; color: var(--slate); text-align: right; }
	@media (max-height: 640px) {
		.who :global(.slot) { --s: 72px; }
		.table { max-height: 38%; }
	}
	@media (prefers-reduced-motion: reduce) { .bar span, .left { transition: none; } }
</style>
