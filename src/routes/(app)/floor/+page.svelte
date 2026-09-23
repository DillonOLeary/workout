<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { Caption, Card, Note, Primary, SetTable, Slot, Stepper, Title, type SetRow } from '$lib/ui';
	import { armBell, ringBell } from '$lib/floor/bell';
	import { holdScreen } from '$lib/floor/wake-lock';
	import { CountdownClock, type Countdown } from '$lib/floor/countdown.svelte';
	import { EntryQueue, type QueueOp } from '$lib/floor/entry-queue.svelte';
	import { COOLDOWN_ITEM, WARMUP_ITEM } from '$lib/domain/events';
	import { disciplineLabel, durationLabel, firstSentence, loadHint, loadShort, plannedValue, receiptLine, sessionNoun, setValue, setsLine } from '$lib/domain/labels';
	import { countOf, isSet, loadOf, measureFor, type Measure } from '$lib/domain/measure';
	import { cueFor, progresses, restFor, routineTitle, type Exercise } from '$lib/domain/plan';
	import { historyFor, lastEntryFor, sessionEntries } from '$lib/domain/projections';
	import { anySetEarned, bumpCount, bumpLoad, nextSet, suggest, type Suggestion } from '$lib/domain/progression';
	import { estimateMinutes, loggedOutside, restUntil, runStart, sessionProgress, sessionSteps, type Step } from '$lib/domain/steps';
	import { STAND } from '$lib/design/rig';
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

	let serverEntries = $derived(sessionEntries(data.events, session.id));
	let entries = $derived(queue.overlay(serverEntries));
	let steps = $derived(sessionSteps(plan, workout, loggedOutside(plan, workout, entries)));
	let exercises = $derived.by(() => {
		const out: Exercise[] = [];
		for (const s of steps) if (s.kind === 'set' && !out.some((e) => e.name === s.ex.name)) out.push(s.ex);
		return out;
	});
	let progress = $derived(sessionProgress(steps, entries));
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
		// svelte-ignore state_referenced_locally
		const known = sessionEntries(data.events, session.id);
		const ss = sessionSteps(plan, workout, loggedOutside(plan, workout, known));
		// svelte-ignore state_referenced_locally
		const raw = page.url.searchParams.get('step');
		const n = raw === null ? NaN : Number(raw);
		if (Number.isInteger(n) && n >= 0 && n < ss.length) return n;
		return Math.min(sessionProgress(ss, known).current, Math.max(0, ss.length - 1));
	})();
	let stepI = $state(initialStep);
	let weight = $state(0);
	let reps = $state(0);
	let editing = $state<string | null>(null);
	let why = $state(false);
	let now = $state(Date.now());
	let live = $state('');

	let st = $derived<Step | undefined>(steps[stepI]);
	let ex = $derived<Exercise | undefined>(st?.kind === 'set' ? st.ex : undefined);
	let stepDone = $derived(!!st && progress.done.has(st.key));
	const entryFor = (s: Step) => entries.find((e) => e.item === s.item && e.index === s.index);
	let editStep = $derived(editing ? steps.find((s) => s.key === editing) : undefined);
	let dialEx = $derived(editStep?.kind === 'set' ? editStep.ex : ex);
	let last = $derived(ex ? lastEntryFor(data.events, ex.name, session.id) : null);

	const clock = new CountdownClock((done) => {
		ringBell();
		live = 'Done';
		enqueue(done.kind === 'hold' ? measureFor(done.ex, { load: 0, count: done.target, target: done.target }) : { of: 'step' });
	});
	let restEnd = $derived(st?.kind === 'set' && !stepDone ? restUntil(st, entries, plan) : null);
	let restLeft = $derived(restEnd !== null ? Math.max(0, Math.ceil((restEnd - now) / 1000)) : 0);
	let resting = $derived(restEnd !== null && restLeft > 0 && !clock.active);
	let restTotal = $derived(st?.kind === 'set' ? restFor(plan, st.ex) : 0);
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
		const t = setInterval(() => (now = Date.now()), 200);
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
	function goTo(i: number) {
		clock.cancel();
		editing = null;
		why = false;
		if (i < 0 || i >= steps.length) return;
		stepI = i;
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
		queue.push(op, s, measure);
		navigator.vibrate?.(12);
	}
	function enqueue(measure: Measure) {
		if (!st) return;
		const s = st;
		push('log', s, measure);
		const next = stepI + 1;
		if (next < steps.length && steps[next].section === s.section) goTo(next);
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
	async function finishNow() {
		finishing = true;
		await queue.drain();
		if (queue.anyFailed) {
			queue.error = 'An entry didn’t save — Retry it before you finish.';
			finishing = false;
			return;
		}
		finishFormEl?.requestSubmit();
	}
	async function exitToToday() {
		await queue.drain();
		await goto('/', { invalidateAll: true });
	}
	function primaryAction() {
		if (finishing || !st) return;
		armBell();
		if (editing) return saveFix();
		if (allDone) return void finishNow();
		if (stepDone) return goTo(stepI + 1);
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

	// the words on the screen
	let sets = $derived(steps.filter((s) => s.kind === 'set'));
	let holdsOnly = $derived(sets.every((s) => s.kind === 'set' && s.ex.kind === 'hold'));
	let pos = $derived.by(() => {
		if (!st || allDone) return 'done';
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
			const failed = lp?.status === 'failed', saving = !!lp && (lp.status === 'queued' || lp.status === 'inflight');
			const label = s.kind === 'set' ? `${s.ex.kind === 'hold' ? 'Hold' : 'Set'} ${s.index}${s.ex.side === 'sets' ? (s.index % 2 ? ' · L' : ' · R') : ''}` : s.kind === 'run' ? 'Run' : `Step ${s.index}`;
			const fixedNote = lp?.op === 'correct' && lp.status === 'confirmed' ? '✓ fixed' : '✓';
			if (s.kind !== 'set') {
				const text = s.kind === 'run' ? (e?.measure.of === 'duration' ? `${e.measure.minutes} min` : `${s.minutes} min`) : s.text;
				return { key: s.key, label, text, prose: s.kind !== 'run', state: failed ? 'failed' : saving ? 'saving' : e ? 'done' : cur ? 'now' : 'todo', right: failed ? undefined : saving ? 'saving…' : e ? '✓' : cur ? (clock.active ? `${clock.remaining}s` : 'now') : undefined };
			}
			if (editing === s.key) return { key: s.key, label, text: setValue(s.ex, weight, reps), state: 'fixing', right: 'editing' };
			if (e) return { key: s.key, label, text: setValue(s.ex, loadOf(e.measure), countOf(e.measure)), state: failed ? 'failed' : saving ? 'saving' : 'done', right: failed ? undefined : saving ? 'saving…' : fixedNote, fixable: !failed && !saving };
			if (cur && clock.running) return { key: s.key, label, text: `${clock.remaining ?? clock.running.target}s`, state: 'now', right: 'now' };
			if (cur && resting) return { key: s.key, label, text: setValue(s.ex, weight, reps), state: 'now', right: `rest ${restLeft}s`, bar: restTotal ? restLeft / restTotal : 0 };
			if (cur) return { key: s.key, label, text: setValue(s.ex, weight, reps), state: 'now', right: 'now' };
			return { key: s.key, label, text: plannedValue(s.ex, plannedWeight(s.ex, s.index - 1)), state: 'todo' };
		});
	});
	let thenLine = $derived.by(() => {
		if (!st) return '';
		const next = steps.slice(stepI + 1).find((s) => s.section !== st.section);
		return `then: ${next ? next.section : 'done'}`;
	});
	let exLine = $derived(ex ? `${exercises.findIndex((e) => e.name === ex.name) + 1} of ${exercises.length} exercises` : `~${estimateMinutes(steps, progress.current)} min left`);
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
	let readyLine = $derived(progress.sets === 0 && progress.current === stepI ? 'Set up, then log the first set.' : 'Ready when you are.');
	let primaryLabel = $derived.by(() => {
		if (editing) return `Save ${editStep?.kind === 'set' && editStep.ex.kind === 'hold' ? 'hold' : 'set'} ${editStep?.index ?? ''}`;
		if (!st) return `Finish ${noun}`;
		if (stepDone) {
			const n = steps[stepI + 1];
			return !n ? `Finish ${noun}` : n.section === st.section ? 'Next' : `Next: ${n.section}`;
		}
		if (st.kind === 'prep') return 'Done';
		if (st.kind === 'timed') return clock.active ? 'Done early' : `Start ${durationLabel(st.seconds)}`;
		if (st.kind === 'run') return 'Stop here';
		if (st.ex.kind === 'hold') return clock.active ? 'Done early' : `Start ${reps}s`;
		return `Log set ${st.index}`;
	});
	let showTiles = $derived(!!editing || (st?.kind === 'set' && !stepDone && (!!ex && progresses(ex))));
	let tileHold = $derived(dialEx?.kind === 'hold');
	let tileLoad = $derived(dialEx?.kind === 'load');
	let figure = $derived(!st || allDone ? STAND : st.kind === 'set' ? st.ex.name : st.kind === 'timed' ? st.name : st.kind === 'run' ? st.ex.name : STAND);
	let phase = $derived<'set' | 'ready' | 'running' | 'still'>(clock.active || st?.kind === 'run' ? 'running' : resting || stepDone ? 'ready' : 'set');

	// the receipt
	const receiptSets = (name: string): Measure[] => entries.filter((e) => e.item === name && isSet(e.measure)).sort((a, b) => a.index - b.index).map((e) => e.measure);
	let runMinutes = $derived(entries.reduce((n, e) => n + (e.measure.of === 'duration' ? e.measure.minutes : 0), 0));
	let sessionMinutes = $derived(Math.max(1, Math.round(((entries.reduce((m, e) => Math.max(m, Date.parse(e.at)), 0) || now) - Date.parse(session.at)) / 60000)));
	let doneNote = $derived.by(() => {
		const up = exercises.filter((e) => e.kind === 'load' && anySetEarned(receiptSets(e.name), e)).map((e) => e.name);
		const count = `${progress.sets} ${holdsOnly ? 'holds' : 'sets'}${runMinutes ? ` · ${runMinutes} min` : ''}.`;
		return `${count} ${up.length ? `${up.join(', ')} ${up.length === 1 ? 'goes' : 'go'} up next time.` : ''} ${receiptLine(sessionMinutes, entries.some((e) => e.item === WARMUP_ITEM), entries.some((e) => e.item === COOLDOWN_ITEM))}`;
	});

	function onKey(ev: KeyboardEvent) {
		if (ev.key === 'Escape' && editing) return cancelFix();
		if (ev.key === 'Enter') return primaryAction();
		if (allDone) return;
		if (ev.key === 'ArrowUp') (tileLoad && !tileHold ? bumpWeight : bumpReps)(1);
		else if (ev.key === 'ArrowDown') (tileLoad && !tileHold ? bumpWeight : bumpReps)(-1);
		else if (ev.key === 'ArrowRight') goTo(Math.min(steps.length - 1, stepI + 1));
		else if (ev.key === 'ArrowLeft') goTo(Math.max(0, stepI - 1));
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="fl">
	<div class="fl-inner">
		<header class="top">
			<button type="button" class="back" onclick={() => void exitToToday()}>‹ Today</button>
			<Caption tone="slate">{title} · {pos}</Caption>
		</header>
		<div class="bar"><span style="width: {steps.length ? (progress.current / steps.length) * 100 : 0}%"></span></div>

		{#if st && !allDone}
			<div class="who">
				<Slot exercise={figure} {phase} size={92} />
				<div class="words">
					<Title size="md" caps>{heading}</Title>
					{#if cue}<span class="cue">{cue}</span>{/if}
					{#if ex}
						{#if loadLine.endsWith('why?')}<Note size="sm" onclick={() => (why = !why)}>{loadLine}</Note>{:else}<Note size="sm">{loadLine}</Note>{/if}
					{/if}
				</div>
			</div>
			{#if why && whyText}<div class="why"><Note tone="ink">{whyText} Change it with −/+ if the rack disagrees.</Note></div>{/if}

			<div class="table">
				<SetTable {rows} onfix={fix} onretry={(k) => { const s = steps.find((x) => x.key === k); if (s) queue.retry(s); }} />
				<div class="under"><Note size="sm" tone="stone">{thenLine}</Note><Note size="sm" tone="stone">{exLine}</Note></div>
			</div>

			<div class="stage">
				{#if stage}
					<span class="big">{stage.value}</span>
					<Caption>{stage.note}</Caption>
					<div class="bar wide"><span style="width: {Math.max(0, Math.min(1, stage.frac)) * 100}%"></span></div>
				{:else}
					<Note size="md" tone="stone">{editing ? 'Fix it, then save.' : readyLine}</Note>
				{/if}
			</div>
			<span class="sr" aria-live="polite">{live}</span>

			<div class="bottom">
				{#if showTiles && dialEx}
					<div class="tiles">
						<div class="tile">
							<Caption>{tileHold ? (editing ? 'Held' : 'Seconds') : 'Reps'}</Caption>
							<Stepper value={reps} size="bare" disabled={clock.active} label={tileHold ? 'seconds' : 'reps'} onstep={bumpReps} />
						</div>
						<div class="tile" class:dim={!tileLoad}>
							<Caption>Load · lb</Caption>
							<Stepper value={tileLoad ? weight : '—'} size="bare" disabled={!tileLoad || clock.active} label="load" onstep={bumpWeight} />
						</div>
					</div>
				{/if}
				{#if queue.error ?? form?.message}<p class="err">{queue.error ?? form?.message}</p>{/if}
				<Primary size="lg" tone={stepDone && !editing ? 'ink' : 'volt'} disabled={finishing} onclick={primaryAction}>{primaryLabel}</Primary>
			</div>
		{:else}
			<div class="done">
				<div class="donehead">
					<Title size="lg" caps>Done</Title>
					<Slot exercise={STAND} phase="still" size={84} />
				</div>
				<Card pad={false}>
					<div class="receipt">
						{#if runMinutes}<div class="rrow"><span class="rname">{title}</span><span class="rval">{runMinutes} min</span></div>{/if}
						{#each exercises as e (e.name)}
							{@const done = receiptSets(e.name)}
							<div class="rrow"><span class="rname">{e.name}</span><span class="rval">{done.length ? setsLine(done, e) : '—'}</span></div>
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
</div>

<!-- finish goes through a real form action; its 303 makes use:enhance run invalidateAll, so Today reloads fresh events -->
<form bind:this={finishFormEl} method="POST" action="?/finish" use:enhance hidden></form>

<style>
	.fl {
		position: fixed; top: 0; left: 0; right: 0; height: 100vh; height: 100svh; z-index: 50;
		background: var(--paper); display: flex; flex-direction: column; overflow: hidden; user-select: none;
		padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
	}
	.fl-inner { width: 100%; max-width: var(--content-max); margin: 0 auto; flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 10px 16px 0; gap: 10px; }
	.top { flex: none; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
	.top :global(.caption) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.back {
		flex: none; min-height: 40px; padding: 0 14px; background: var(--white); border: var(--border-w) solid var(--ink); border-radius: var(--radius-pill);
		font-family: var(--font-body); font-weight: 700; font-size: 14px; color: var(--ink); box-shadow: 0 2px 0 var(--ink); cursor: pointer; touch-action: manipulation;
	}
	.back:active { transform: translateY(1px); box-shadow: 0 1px 0 var(--ink); }
	.bar { flex: none; height: 6px; background: var(--ash); border-radius: var(--radius-pill); overflow: hidden; }
	.bar span { display: block; height: 100%; background: var(--ink); transition: width 300ms; }
	.bar.wide { width: 100%; }
	.who { flex: none; display: flex; gap: 14px; align-items: center; }
	.words { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
	.cue { font-size: 13px; line-height: 1.4; color: var(--slate); }
	.why { flex: none; background: var(--volt-light); border-radius: 12px; padding: 10px 12px; }
	.table { flex: none; display: flex; flex-direction: column; gap: 6px; max-height: 42%; }
	.table :global(.table) { overflow-y: auto; }
	.under { display: flex; justify-content: space-between; gap: 8px; padding: 0 2px; }
	.stage { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 8px; padding: 4px 0; }
	.big { font-family: var(--font-mono); font-weight: 800; font-size: clamp(48px, 20vh, 84px); line-height: 0.9; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
	.bottom { flex: none; display: flex; flex-direction: column; gap: 10px; padding-bottom: calc(14px + env(safe-area-inset-bottom)); }
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
	@media (prefers-reduced-motion: reduce) { .bar span { transition: none; } }
</style>
