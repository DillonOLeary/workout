<script lang="ts">
	import { deserialize, enhance } from '$app/forms';
	import { goto, invalidateAll, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import ExerciseGlyph from '$lib/components/ExerciseGlyph.svelte';
	import AdjustTile from '$lib/components/floor/AdjustTile.svelte';
	import FloorPrimary from '$lib/components/floor/FloorPrimary.svelte';
	import FloorSheet from '$lib/components/floor/FloorSheet.svelte';
	import type { SheetSection } from '$lib/components/floor/FloorSheet.svelte';
	import StepTable from '$lib/components/floor/StepTable.svelte';
	import type { Row } from '$lib/components/floor/StepTable.svelte';
	import { nextRung, prevRung } from '$lib/domain/racks';
	import { COOLDOWN_ITEM, RUN_DAY, WARMUP_ITEM, type EntryLogged } from '$lib/domain/events';
	import { countOf, isSet, loadOf, type Measure } from '$lib/domain/measure';
	import {
		dayTitle,
		holdMaxed,
		lastEntryFor,
		loadHint,
		nextLoad,
		rangeLabel,
		setsLine,
		stepLabel,
		suggestedCount,
		weekRunMinutes
	} from '$lib/domain/projections';
	import type { LoadSuggestion } from '$lib/domain/projections';
	import {
		estimateMinutes,
		restStart,
		runStart,
		sessionProgress,
		sessionSteps,
		type Entry,
		type Step
	} from '$lib/domain/steps';
	import { cueFor, runTarget, type Exercise } from '$lib/domain/plan';
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
	/* The session is a LIST OF STEPS — warm-up lines, every set with the rest
	   before the next, the cooldown; or walk · run · walk. The plan owns the
	   order; this screen shows exactly one step at a time with one big button. */
	const steps = sessionSteps(plan, session.day);
	const isRunDay = session.day === RUN_DAY;
	const title = dayTitle(plan, session.day);
	const cue = cueFor(plan, session.day);
	const exercises = isRunDay ? [] : (plan.days[session.day] ?? []);
	const totalSets = steps.filter((s) => s.kind === 'set').length;
	const sessionAt = session.at;
	// the rule's answer per exercise, once: data.events never refreshes mid-session
	// svelte-ignore state_referenced_locally
	const loads = new Map<string, LoadSuggestion>(
		exercises.filter((e) => e.kind === 'load').map((e) => [e.name, nextLoad(data.events, e, session.id, opened)])
	);

	/* ---------- optimistic queue ----------------------------------------
	   Pressing the primary appends to `local` and the UI updates in the same
	   frame; a single-flight pump() POSTs queued entries to the server strictly
	   in order in the background. data.events is never refreshed mid-session
	   (no update()/invalidation), so confirmed entries stay in `local` and the
	   merge below stays the one source of truth for this screen. An entry the
	   server rejects goes to 'failed' — it keeps its row and its numbers with
	   a Retry in place; nothing disappears silently (D4). */
	type LocalEntry = { key: string; status: 'queued' | 'inflight' | 'confirmed' | 'failed'; data: Entry };
	let local = $state<LocalEntry[]>([]);
	let errMsg = $state<string | null>(null);
	let lastPress = 0; // double-tap cooldown; not reactive on purpose
	let pumpPromise: Promise<void> | null = null;

	let serverEntries = $derived(
		data.events
			.filter((e): e is EntryLogged => e.type === 'EntryLogged' && e.data.session === session.id)
			.map((e) => e.data)
	);
	const same = (a: Entry, b: Entry) => a.item === b.item && a.index === b.index;
	// deduped by identity so a surprise invalidation can't double-count
	let optimistic = $derived(local.filter((p) => !serverEntries.some((s) => same(s, p.data))));
	// the entries that COUNT: confirmed or on their way. A failed one stays
	// visible in the table but never inflates progress.
	let entries = $derived<Entry[]>([
		...serverEntries,
		...optimistic.filter((p) => p.status !== 'failed').map((p) => p.data)
	]);
	let anyFailed = $derived(local.some((p) => p.status === 'failed'));
	let syncing = $derived(local.some((p) => p.status === 'queued' || p.status === 'inflight'));

	/* ---------- the clock ----------
	   Time is an input to the fold: rests and the run count from the previous
	   entry's timestamp, so a reload lands back on the same countdown. */
	let now = $state(Date.now());
	let progress = $derived(sessionProgress(steps, entries, now));
	let allDone = $derived(progress.current >= steps.length);

	/* ---------- screen state ---------- */
	// where a reload lands: the URL's step if it has one, else the first step
	// the ledger doesn't already show as done — a rest still counting, set 2,
	// never the top of the bike
	const initialStep = (() => {
		// Number(null) is 0 — a missing param must not read as "step 0"
		const raw = page.url.searchParams.get('step');
		const n = raw === null ? NaN : Number(raw);
		if (Number.isInteger(n) && n >= 0 && n < steps.length) return n;
		// svelte-ignore state_referenced_locally
		const known = data.events
			.filter((e): e is EntryLogged => e.type === 'EntryLogged' && e.data.session === session.id)
			.map((e) => e.data);
		return Math.min(sessionProgress(steps, known, Date.now()).current, Math.max(0, steps.length - 1));
	})();
	let stepI = $state(initialStep);
	let weight = $state(0);
	let reps = $state(0); // reps — or seconds held, for mode: 'seconds'
	let sheetOpen = $state(false);

	let st = $derived<Step | undefined>(steps[stepI]);
	let ex = $derived<Exercise | undefined>(st?.ex);
	let atSet = $derived(st?.kind === 'set');
	let isHold = $derived(atSet && ex?.kind === 'hold');
	// no weight tile for a hold or a count: the kind says what there is to dial
	let isBW = $derived(!!ex && ex.kind !== 'load');
	let holdInc = $derived(ex?.kind === 'hold' ? ex.inc : 5);
	let stepDone = $derived(!!st && progress.done.has(st.key));
	let entryFor = (s: Step) => entries.find((e) => e.item === s.item && e.index === s.index);
	let last = $derived(ex ? lastEntryFor(data.events, ex.name, session.id) : null);
	let load = $derived(ex && ex.kind === 'load' ? (loads.get(ex.name) ?? null) : null);
	let setsDoneFor = (name: string) => entries.filter((e) => e.item === name && isSet(e.measure)).length;

	// only tick while something on screen is counting
	let timed = $derived(st?.kind === 'rest' || st?.kind === 'run');
	$effect(() => {
		if (!timed) return;
		const t = setInterval(() => (now = Date.now()), 200);
		return () => clearInterval(t);
	});

	/* ---------- rests: the bell moves you on ---------- */
	let restFrom = $derived(st?.kind === 'rest' ? restStart(st, entries) : null);
	let restLeft = $derived(
		st?.kind === 'rest' && restFrom !== null
			? Math.max(0, Math.ceil((restFrom + (st.seconds ?? 0) * 1000 - now) / 1000))
			: null
	);
	$effect(() => {
		// zero on the countdown = the next set, by itself; a rest with no set
		// before it has nothing to wait for and just sits at its full length
		if (st?.kind === 'rest' && restLeft === 0 && !progress.done.has(st.key) === false) goTo(stepI + 1);
	});

	/* ---------- the run: the clock is the number ---------- */
	let runFrom = $derived(st?.kind === 'run' ? runStart(steps, stepI, entries, sessionAt) : null);
	let runElapsed = $derived(runFrom !== null ? Math.max(0, now - runFrom) : 0);
	const mmss = (ms: number) => {
		const s = Math.floor(ms / 1000);
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	};

	/* ---------- the hold timer ---------- */
	// Timed holds (the Claude Design model): dial the TARGET on the tile,
	// start — the row counts DOWN and logs itself at the bell. Drop early
	// and "Done early" logs the seconds actually held.
	let hold = $state<{ end: number; target: number } | null>(null);
	let remaining = $state<number | null>(null);
	$effect(() => {
		if (!hold) return;
		const h = hold;
		const t = setInterval(() => {
			const r = Math.ceil((h.end - Date.now()) / 1000);
			if (r <= 0) {
				// the bell: the full target logs itself
				hold = null;
				remaining = null;
				enqueue(holdMeasure(h.target, h.target));
			} else {
				remaining = r;
			}
		}, 200);
		return () => clearInterval(t);
	});
	// the ceiling is the top of the range: past it the answer is a harder
	// variation (the exercise note says which), never a longer hold
	const bumpTarget = (d: number) => {
		if (!hold && ex) reps = Math.min(ex.hi, Math.max(ex.lo, reps + d));
	};
	const bumpReps = (d: number) => (reps = Math.max(1, Math.min(100, reps + d)));
	/* ± is never a fixed nudge: anything you pick up walks the rack's ladder
	   (there is no 37.5 lb dumbbell), machines step their per-exercise inc.
	   One gesture, one behaviour, on every layout (D3). */
	function bumpLoad(dir: 1 | -1) {
		if (!ex || ex.kind !== 'load') return;
		if (ex.rack) weight = dir > 0 ? nextRung(weight, ex.rack) : prevRung(weight, ex.rack);
		else weight = Math.max(0, weight + dir * ex.inc);
	}

	/**
	 * What the tiles show for the set about to be logged. Per-set progression
	 * means set 2 can legitimately ask for LESS than set 1, so the preload
	 * follows the ledger's suggestion for THIS set number — unless you
	 * overrode the ledger on the previous set (a different machine, a sore
	 * shoulder). Then the override sticks for the rest of the exercise, because
	 * "the ledger is wrong today" is true of every remaining set.
	 */
	function preload(i: number) {
		const s = steps[i];
		if (!s || s.kind !== 'set' || !s.ex) return;
		const e = s.ex;
		const k = Math.min(s.index - 1, e.sets - 1);
		const prior = entries
			.filter((x) => x.item === e.name && x.index < s.index && isSet(x.measure))
			.sort((a, b) => a.index - b.index);
		const priorLast = prior[prior.length - 1];
		const timed = e.kind === 'hold';
		const sugg = e.kind !== 'load' ? null : (loads.get(e.name) ?? null);
		let overridden = false;
		if (sugg && priorLast) {
			const suggestedPrev = sugg.sets[Math.min(priorLast.index - 1, e.sets - 1)].weight;
			overridden = loadOf(priorLast.measure) !== suggestedPrev;
		}
		// weight: 0 for bodyweight; a timed-weighted hold (custom plans) carries
		// its load in the second tile
		weight = !sugg ? 0 : overridden ? loadOf(priorLast!.measure) : sugg.sets[k].weight;
		if (timed) {
			// target seconds: this session's last TARGET (a dropped hold shouldn't
			// lower the next bell), else the ledger's per-set suggestion. A level-up
			// on a weighted hold restarts at the bottom of the range, like reps do.
			if (priorLast) reps = (priorLast.measure.of === 'hold' ? priorLast.measure.target : undefined) ?? countOf(priorLast.measure);
			else if (sugg && sugg.sets[k].reason === 'increase') reps = e.lo;
			else reps = suggestedCount(data.events, e, session.id, k);
			reps = Math.min(e.hi, reps);
		} else if (e.kind === 'reps') {
			reps = priorLast ? countOf(priorLast.measure) : suggestedCount(data.events, e, session.id, k);
		} else {
			// what you did last set if you're off-plan, else what this set asks for
			reps = overridden ? countOf(priorLast!.measure) : sugg!.sets[k].reps;
		}
		hold = null;
		remaining = null;
	}
	preload(initialStep);

	/* ---------- section complete: a visible pause, then on ----------------
	   Within a section the next step just arrives (a rest after a set, the
	   run after its walk). Between sections the primary turns to "Next
	   exercise" with a ring that drains for two seconds: tap it to go now,
	   open the ⋯ sheet to stay. */
	const ADVANCE_MS = 2000;
	let advance = $state<{ end: number } | null>(null);
	let advanceLeft = $state(1); // fraction of the ring still full
	$effect(() => {
		if (!advance) return;
		const a = advance;
		const t = setInterval(() => {
			const left = (a.end - Date.now()) / ADVANCE_MS;
			if (left <= 0) {
				advance = null;
				goTo(stepI + 1);
			} else advanceLeft = left;
		}, 40);
		return () => clearInterval(t);
	});
	function armAdvance() {
		advanceLeft = 1;
		advance = { end: Date.now() + ADVANCE_MS };
	}

	function goTo(i: number) {
		advance = null; // any navigation, by hand or by the ring, settles it
		hold = null;
		remaining = null;
		if (i < 0 || i >= steps.length) return;
		stepI = i;
		preload(i);
		// shallow routing: URL tracks the step, no loads run, no history spam
		replaceState(`?step=${i}`, {});
	}

	/* ---------- the step table: the current section ---------- */
	function setValue(e: Exercise, w: number, count: number | null): string {
		const hold = e.kind === 'hold';
		const c = count === null ? '—' : hold ? `${count}s` : String(count);
		if (e.kind !== 'load') return hold || count === null ? c : `${c} reps`;
		return `${e.each ? `${w} /hand` : `${w} lb`} × ${c}`;
	}
	function localFor(s: Step) {
		return local.find((p) => same(p.data, { item: s.item, index: s.index } as Entry));
	}
	function rowFor(s: Step, i: number): Row {
		const cur = i === stepI;
		const e = entryFor(s);
		const lp = localFor(s);
		const failed = lp?.status === 'failed' && !serverEntries.some((x) => same(x, lp.data));
		const saving = !!lp && (lp.status === 'queued' || lp.status === 'inflight');
		const state = (done: boolean): Row['state'] =>
			failed ? 'failed' : saving ? 'saving' : done ? 'done' : cur ? 'current' : 'upcoming';
		switch (s.kind) {
			case 'prep':
				return { key: s.key, label: s.label, value: s.text ?? '', note: e ? '✓' : cur ? 'now' : undefined, state: state(!!e), prose: true };
			case 'rest': {
				const secs = s.seconds ?? 0;
				const done = progress.done.has(s.key);
				if (cur && restLeft !== null && !done)
					return { key: s.key, label: 'REST', value: String(restLeft), note: `of ${secs}s left`, state: 'running', big: true };
				return { key: s.key, label: 'REST', value: `${secs}s`, note: done ? '✓' : undefined, state: done ? 'done' : cur ? 'current' : 'upcoming' };
			}
			case 'run': {
				if (e && e.measure.of === 'duration')
					return { key: s.key, label: 'RUN', value: `${e.measure.minutes} min`, note: '✓', state: state(true) };
				if (cur) return { key: s.key, label: 'RUN', value: mmss(runElapsed), note: `of ${s.minutes} min`, state: 'running', big: true };
				return { key: s.key, label: 'RUN', value: `${s.minutes} min`, state: 'upcoming' };
			}
			case 'set': {
				const x = s.ex!;
				if (e) return { key: s.key, label: s.label, value: setValue(x, loadOf(e.measure), countOf(e.measure)), note: e ? undefined : undefined, state: state(true) };
				if (cur && hold) return { key: s.key, label: s.label, value: String(remaining ?? hold.target), note: `of ${hold.target}s left`, state: 'running', big: true };
				// "now", not "logging": the write is what saving… means — this row is
				// simply the one you're on, same word the prep steps use
				if (cur) return { key: s.key, label: s.label, value: setValue(x, weight, reps), note: 'now', state: state(false) };
				const ld = loads.get(x.name);
				return { key: s.key, label: s.label, value: setValue(x, ld ? ld.sets[Math.min(s.index - 1, x.sets - 1)].weight : 0, null), state: 'upcoming' };
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
	let heading = $derived(!st ? 'Done' : st.kind === 'rest' ? 'Rest' : st.kind === 'set' ? st.ex!.name : st.section);
	let weekMin = $derived(weekRunMinutes(data.events, opened));
	let meta = $derived.by(() => {
		if (!st) return '';
		if (st.kind === 'prep') {
			if (isRunDay) return `WALK · ${st.minutes} MIN · TRACKED, NOT LOGGED`;
			const n = steps.filter((s) => s.section === st.section && s.kind === 'prep').length;
			return `${st.section.toUpperCase()} · STEP ${st.index} OF ${n} · TRACKED, NOT LOGGED`;
		}
		if (st.kind === 'rest') return `${st.ex!.name.toUpperCase()} · BEFORE SET ${st.index}`;
		if (st.kind === 'run') return `TARGET ${st.minutes} MIN · ${weekMin} OF ${runTarget(plan)} MIN THIS WEEK`;
		const x = st.ex!;
		const planLine = `TARGET ${rangeLabel(x).toUpperCase()}${x.kind === 'load' && x.each ? ' · PER HAND' : ''}${x.kind !== 'load' ? ' · BODYWEIGHT' : ''}`;
		return planLine;
	});
	let ledgerLine = $derived(atSet ? (last ? `LAST ${setsLine(last.sets, ex!)}` : 'FIRST TIME') : '');
	// the reasoning behind the preloaded weight, so a drop is never silent —
	// only before the first set: after that the table carries the session's
	// own numbers and the suggestion no longer describes what's on screen
	let hint = $derived.by(() => {
		if (!st) return null;
		if (st.kind === 'prep') return cue ?? null;
		if (st.kind === 'rest') return 'The bell moves you on — or go now.';
		if (st.kind === 'run') return plan.run?.note ?? null;
		const x = st.ex!;
		if (setsDoneFor(x.name) > 0) return null;
		if (load) return loadHint(load, x);
		if (x.kind === 'hold' && holdMaxed(last, x)) return `At the ceiling (${x.hi}s) — make it harder, not longer.`;
		return null;
	});
	let quietLabel = $derived(
		st?.kind === 'rest' ? 'Counting down — nothing to dial' : st?.kind === 'run' ? 'The clock is the number — nothing to dial' : 'Nothing to dial — the step is the instruction'
	);

	/* ---------- the write path ---------- */
	const holdMeasure = (seconds: number, target: number): Measure => ({
		of: 'hold',
		seconds,
		target,
		...(weight > 0 ? { load: weight } : {})
	});

	function enqueue(measure: Measure) {
		if (!st || st.kind === 'rest') return;
		errMsg = null;
		const s = st;
		local.push({
			key: crypto.randomUUID(),
			status: 'queued',
			data: { session: session.id, item: s.item, index: s.index, at: new Date().toISOString(), measure }
		});
		// instant feedback: the row fills in, the phone taps back. No flash —
		// the table changing IS the confirmation.
		navigator.vibrate?.(12);
		void pump();
		const next = stepI + 1;
		if (next >= steps.length) return; // the receipt takes over
		// a rest after a set, the run after its walk: just arrives. A new
		// section: the ring, so the screen never flips under a finger.
		if (steps[next].section !== s.section) armAdvance();
		else goTo(next);
	}

	function logSetNow() {
		if (performance.now() - lastPress < 350) return; // accidental double-tap
		lastPress = performance.now();
		// a bodyweight set is a count, never a load of 0
		enqueue(isBW ? { of: 'reps', reps } : { of: 'load', load: weight, reps });
	}

	/** timed: one button — ring in the hold, or log the early drop */
	function startOrDone() {
		if (performance.now() - lastPress < 350) return;
		lastPress = performance.now();
		if (hold) {
			const held = Math.max(1, hold.target - Math.ceil((hold.end - Date.now()) / 1000));
			const t = hold.target;
			hold = null;
			remaining = null;
			enqueue(holdMeasure(held, t));
		} else {
			remaining = reps;
			hold = { end: Date.now() + reps * 1000, target: reps };
		}
	}

	function pump(): Promise<void> {
		pumpPromise ??= (async () => {
			for (;;) {
				const next = local.find((p) => p.status === 'queued');
				if (!next) break;
				next.status = 'inflight';
				const res = await postEntry(next);
				if (res.ok) next.status = 'confirmed';
				else await markFailed(next, res.message);
			}
			pumpPromise = null;
		})();
		return pumpPromise;
	}

	async function postEntry(p: LocalEntry): Promise<{ ok: true } | { ok: false; message: string }> {
		const body = new FormData();
		body.set('session', p.data.session);
		body.set('item', p.data.item);
		body.set('index', String(p.data.index));
		body.set('measure', JSON.stringify(p.data.measure));
		for (let attempt = 0; ; attempt++) {
			try {
				const res = await fetch('?/logEntry', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
				const result = deserialize(await res.text());
				if (result.type === 'success' || result.type === 'redirect') return { ok: true };
				if (result.type === 'failure')
					return { ok: false, message: String((result.data as { message?: string })?.message ?? 'Rejected.') };
				throw new Error('action error');
			} catch {
				// ambiguous network failures are safe to retry: the decider treats
				// a repeated identity as a no-op
				if (attempt >= 2) return { ok: false, message: 'Could not save — check connection.' };
				await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
			}
		}
	}

	/** a failed entry keeps its row, its numbers and a Retry — never removed (D4) */
	async function markFailed(p: LocalEntry, message: string) {
		if (message.includes('No session in progress')) {
			// finished on another device — resync; the load guard redirects
			local = [];
			await invalidateAll();
			return;
		}
		p.status = 'failed';
		errMsg = message;
	}

	function retryEntry(key: string) {
		const s = steps.find((x) => x.key === key);
		const p = s && local.find((x) => x.status === 'failed' && same(x.data, { item: s.item, index: s.index } as Entry));
		if (!p) return;
		p.status = 'queued';
		errMsg = null;
		void pump();
	}
	function retryAllFailed() {
		for (const p of local) if (p.status === 'failed') p.status = 'queued';
		errMsg = null;
		void pump();
	}

	const drain = () => pumpPromise ?? Promise.resolve();

	/* ---------- finish / exit ---------- */
	let finishFormEl = $state<HTMLFormElement>();
	let finishing = $state(false);

	async function finishNow() {
		finishing = true;
		await drain(); // queued entries must append before SessionFinished
		if (local.some((p) => p.status === 'failed')) {
			errMsg = 'An entry didn’t save — Retry it, or finish from the ⋯ menu.';
			finishing = false;
			return;
		}
		finishFormEl?.requestSubmit();
	}

	// the sheet's confirm already stated the cost — this path never blocks
	async function finishEarly() {
		sheetOpen = false;
		finishing = true;
		await drain();
		finishFormEl?.requestSubmit();
	}

	async function exitToToday() {
		await drain();
		// we skipped all invalidation during the session, so Today must reload
		await goto('/', { invalidateAll: true });
	}

	function primaryAction() {
		if (finishing || !st) return;
		if (allDone) return void finishNow();
		if (stepDone || st.kind === 'rest') return goTo(stepI + 1);
		if (st.kind === 'prep') return enqueue({ of: 'step' });
		if (st.kind === 'run') return enqueue({ of: 'duration', minutes: Math.max(1, Math.round(runElapsed / 60000)) });
		if (isHold) return startOrDone();
		logSetNow();
	}

	/* ---------- the one big button ---------- */
	let nextLabel = $derived.by(() => {
		const n = steps[stepI + 1];
		if (!n) return 'Finish workout';
		if (n.kind === 'set') return n.section === st?.section ? 'Next set' : 'Next exercise';
		if (n.kind === 'prep') return n.section === COOLDOWN_ITEM ? 'Cooldown' : n.section === WARMUP_ITEM ? 'Warm-up' : 'Next step';
		if (n.kind === 'run') return 'Run';
		return 'Next';
	});
	let sideNow = $derived(atSet && ex?.side === 'sets' && !isHold ? (st!.index % 2 === 1 ? 'left' : 'right') : null);
	let primaryLabel = $derived(
		allDone
			? finishing
				? 'Saving…'
				: 'Finish workout'
			: !st
				? 'Finish workout'
				: st.kind === 'rest'
					? 'Go now'
					: stepDone
						? nextLabel
						: st.kind === 'prep'
							? 'Done'
							: st.kind === 'run'
								? 'Stop here'
								: isHold
									? hold
										? 'Done early'
										: `Start ${reps}s hold`
									: sideNow
										? `Log ${sideNow} side`
										: 'Log set'
	);
	let primaryVariant = $derived(
		(allDone || !st || st.kind === 'rest' || stepDone ? 'advance' : 'commit') as 'advance' | 'commit'
	);

	/* ---------- the ⋯ sheet: the session, sectioned ---------- */
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
			const isPrep = items.every((x) => x.s.kind === 'prep');
			const work = items.filter((x) => x.s.kind === 'set' || x.s.kind === 'run');
			const doneWork = work.filter((x) => progress.done.has(x.s.key)).length;
			const doneAll = items.filter((x) => progress.done.has(x.s.key)).length;
			const x0 = items[0].s.ex;
			const ld = x0 ? loads.get(x0.name) : undefined;
			const meta = isPrep
				? `${doneAll}/${items.length} · PREP`
				: `${doneWork}/${work.length}${ld ? ` · ${ld.sets[0].weight} ${x0!.kind === 'load' && x0!.each ? '/HAND' : 'LB'}` : ''}`;
			return {
				title: name,
				meta,
				active: st?.section === name,
				rows: items.map(({ s, i }) => {
					const done = progress.done.has(s.key);
					const e = entryFor(s);
					let value = '';
					if (s.kind === 'prep') value = done ? 'done' : 'prep';
					else if (s.kind === 'rest') value = i === stepI && restLeft !== null && !done ? `${restLeft}s left` : done ? 'rested' : `${s.seconds}s`;
					else if (s.kind === 'run') value = e && e.measure.of === 'duration' ? `${e.measure.minutes} min` : `${s.minutes} min`;
					else if (e) value = setValue(s.ex!, loadOf(e.measure), countOf(e.measure));
					else {
						const x = s.ex!;
						const w = ld ? ld.sets[Math.min(s.index - 1, x.sets - 1)].weight : 0;
						value = x.kind !== 'load' ? `${x.lo}–${x.hi}${x.kind === 'hold' ? 's' : ''}` : `${w} ${x.each ? '/hand' : 'lb'} × ${x.lo}–${x.hi}`;
					}
					const name =
						s.kind === 'prep' ? (s.text ?? s.label) : s.kind === 'rest' ? 'Rest' : s.kind === 'run' ? 'Run' : `${s.ex!.kind === 'hold' ? 'Hold' : 'Set'} ${s.index}`;
					return { i, name, value, done, current: i === stepI };
				})
			};
		});
	});

	/** the receipt: what this session actually wrote, in ledger shape */
	function receiptSets(name: string): Measure[] {
		return entries
			.filter((e) => e.item === name && isSet(e.measure))
			.sort((a, b) => a.index - b.index)
			.map((e) => e.measure);
	}
	let runMinutes = $derived(entries.filter((e) => e.measure.of === 'duration').reduce((n, e) => n + (e.measure.of === 'duration' ? e.measure.minutes : 0), 0));
	let prepLine = $derived.by(() => {
		const warm = entries.filter((e) => e.item === WARMUP_ITEM).length;
		const cool = entries.filter((e) => e.item === COOLDOWN_ITEM).length;
		const rests = steps.filter((s) => s.kind === 'rest' && progress.done.has(s.key)).length;
		const parts: string[] = [];
		if (isRunDay) {
			const walks = warm + cool;
			if (walks) parts.push(`${walks} ${walks === 1 ? 'walk' : 'walks'}`);
		} else {
			if (warm) parts.push(`${warm} warm-up ${warm === 1 ? 'step' : 'steps'}`);
			if (rests) parts.push(`${rests} ${rests === 1 ? 'rest' : 'rests'}`);
			if (cool) parts.push(`${cool} cooldown ${cool === 1 ? 'stretch' : 'stretches'}`);
		}
		return parts.length ? `+ ${parts.join(', ')} — tracked, kept out of the ledger.` : '';
	});
	let minutesLeft = $derived(estimateMinutes(steps, progress.current));

	function onKey(ev: KeyboardEvent) {
		// typed entry belongs to the tile inputs — never fight the keypad
		if ((ev.target as HTMLElement | null)?.tagName === 'INPUT') return;
		if (ev.key === 'Escape') {
			// Esc only ever closes the sheet — leaving is a sheet action
			sheetOpen = false;
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
		if (ev.key === 'ArrowUp') {
			if (isHold) bumpTarget(holdInc);
			else if (isBW) bumpReps(1);
			else if (atSet) bumpLoad(1);
			ev.preventDefault();
		} else if (ev.key === 'ArrowDown') {
			if (isHold) bumpTarget(-holdInc);
			else if (isBW) bumpReps(-1);
			else if (atSet) bumpLoad(-1);
			ev.preventDefault();
		} else if (ev.key === 'ArrowRight') {
			goTo(Math.min(steps.length - 1, stepI + 1));
			ev.preventDefault();
		} else if (ev.key === 'ArrowLeft') {
			goTo(Math.max(0, stepI - 1));
			ev.preventDefault();
		} else if (atSet && !isHold && /^[1-9]$/.test(ev.key)) reps = parseInt(ev.key, 10);
		else if (atSet && !isHold && ev.key === '0') reps = 10;
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="fl">
	<div class="fl-inner">
		<!-- a session owns the screen: no tab bar, no × — pausing and finishing
		     both live in the ⋯ sheet -->
		<header class="fl-top">
			<span class="fl-crumb">
				{title} · Step {Math.min(stepI + 1, steps.length)}/{steps.length}{allDone ? '' : ` · ~${minutesLeft} min`}
			</span>
			<button
				type="button"
				class="fl-ghost"
				onclick={() => {
					advance = null;
					sheetOpen = true;
				}}
				aria-label="More — the whole session, technique, finish"
			>
				⋯
			</button>
		</header>

		{#if st && !allDone}
			<main class="fl-main">
				<!-- the glyph is Plan-tier content, right of the title block: one
				     rep when the exercise arrives (keyed, so advancing replays),
				     then still. Press it to see the rep again. -->
				<div class="fl-titlerow">
					<div class="fl-titleblock">
						<h1 class="fl-name">{heading}</h1>
						<p class="fl-meta">
							<span>{meta}</span>
							{#if ledgerLine}<span class="fl-ledgerline"> · {ledgerLine}</span>{/if}
						</p>
					</div>
					<div class="fl-glyph">
						{#key ex?.name}
							{#if ex}<ExerciseGlyph name={ex.name} size={104} />{/if}
						{/key}
					</div>
				</div>

				<StepTable {rows} onRetry={retryEntry} />

				{#if hint}
					<p class="fl-hint">{hint}</p>
				{/if}
			</main>

			<div class="fl-bottom">
				{#if atSet && !stepDone}
					<div class="fl-tiles" class:single={isBW}>
						{#if isHold}
							<AdjustTile
								label={`Hold · +${holdInc}s`}
								bind:value={reps}
								min={ex!.lo}
								max={ex!.hi}
								disabled={!!hold}
								onStep={(d) => bumpTarget(d * holdInc)}
							/>
							{#if !isBW}
								<AdjustTile
									label={`Weight · ${stepLabel(ex!)}`}
									bind:value={weight}
									decimals
									min={0}
									disabled={!!hold}
									onStep={bumpLoad}
								/>
							{/if}
						{:else}
							<AdjustTile label="Reps" bind:value={reps} min={1} max={100} onStep={bumpReps} />
							{#if !isBW}
								<AdjustTile
									label={`Weight · ${stepLabel(ex!)}`}
									bind:value={weight}
									decimals
									min={0}
									onStep={bumpLoad}
								/>
							{/if}
						{/if}
					</div>
				{:else if !stepDone}
					<!-- nothing to dial: the step is the instruction, the clock is the number -->
					<div class="fl-quiet">{quietLabel}</div>
				{/if}
				{#if errMsg ?? form?.message}<p class="fl-err">{errMsg ?? form?.message}</p>{/if}
				<FloorPrimary
					variant={primaryVariant}
					label={primaryLabel}
					disabled={finishing}
					ring={advance ? advanceLeft : null}
					onclick={primaryAction}
				/>
			</div>
		{:else}
			<!-- workout complete: no adjuster on screen — the table becomes a
			     receipt in the same two-column shape as the Ledger tab (D6);
			     only what reached the ledger, with prep counted on one line -->
			<main class="fl-main">
				<h1 class="fl-name">Done</h1>
				<p class="fl-meta">
					<span>{isRunDay ? `${runMinutes} MIN` : `${progress.sets} SETS LOGGED`}{syncing ? ' · SAVING…' : ''}</span>
				</p>
				<div class="fl-receipt">
					{#if isRunDay}
						<div class="fl-rrow">
							<span class="fl-rname">{title}</span>
							<span class="fl-rval">{runMinutes ? `${runMinutes} min` : '—'}</span>
						</div>
					{:else}
						{#each exercises as e (e.name)}
							{@const sets = receiptSets(e.name)}
							<div class="fl-rrow">
								<span class="fl-rname">{e.name}</span>
								<span class="fl-rval">{sets.length ? setsLine(sets, e) : '—'}</span>
							</div>
						{/each}
					{/if}
				</div>
				{#if prepLine}<p class="fl-hint">{prepLine}</p>{/if}
			</main>
			<div class="fl-bottom">
				{#if anyFailed}
					<p class="fl-err">
						An entry didn’t save.
						<button type="button" class="fl-retryall" onclick={retryAllFailed}>Retry</button>
					</p>
				{:else if errMsg ?? form?.message}
					<p class="fl-err">{errMsg ?? form?.message}</p>
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
	title={heading === 'Rest' || heading === 'Done' ? title : heading}
	ex={atSet || st?.kind === 'rest' ? ex : undefined}
	cue={st?.kind === 'prep' ? cue : st?.kind === 'run' ? plan.run?.note : undefined}
	{sections}
	current={Math.min(stepI, steps.length - 1)}
	logged={progress.sets}
	total={totalSets}
	{allDone}
	onJump={(i) => {
		sheetOpen = false;
		goTo(i);
	}}
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

	.fl-main {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 4px 16px 0;
	}
	/* the title block and the glyph are one pair: centred on each other, the
	   glyph heavy enough to answer a 32px black title, and the row keeps a
	   clear 16px before the step table so the figure never stands on it */
	.fl-titlerow {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 16px;
	}
	.fl-titleblock { min-width: 0; flex: 1 1 auto; }
	.fl-titleblock .fl-meta { margin-bottom: 0; }
	.fl-glyph { flex: none; }
	.fl-glyph:empty { display: none; }
	@media (min-width: 640px) {
		.fl-glyph { --glyph-size: 128px; }
	}
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
		margin: 6px 0 12px;
		font-family: var(--font-mono);
		font-size: 13px;
		line-height: 1.5;
		color: var(--ink-3);
	}
	.fl-hint {
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
	/* the quiet tile: where the adjusters would be, saying why there are none */
	.fl-quiet {
		min-height: 68px;
		margin-bottom: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 0 14px;
		background: var(--paper);
		border: 1px dashed var(--border-soft);
		border-radius: 14px;
		font-size: 9.5px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
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
		background: var(--surface-card);
		border: var(--border-w) solid var(--ink);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-card);
		overflow: hidden;
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
		.fl :global(*) { transition: none !important; }
	}

	/* Short screens: the floor must not scroll mid-set. The ledger and hint
	   lines drop before anything interactive does; nothing interactive goes
	   below 44px, ever. */
	@media (max-height: 740px) {
		.fl-meta { margin: 4px 0 8px; }
		.fl-name { font-size: clamp(24px, 6vw, 30px); }
		.fl-bottom { padding-top: 6px; }
		.fl-titlerow { margin-bottom: 12px; }
		.fl-glyph { --glyph-size: 88px; }
	}
	@media (max-height: 640px) {
		.fl-ledgerline { display: none; }
		.fl-hint { margin-top: 6px; }
		.fl-glyph { --glyph-size: 64px; }
	}
	@media (max-height: 560px) {
		.fl-hint { display: none; }
		.fl-glyph { display: none; }
		.fl-meta { margin: 2px 0 6px; font-size: 12px; }
		.fl-name { font-size: clamp(22px, 5vh, 26px); }
		.fl-tiles { gap: 8px; margin-bottom: 8px; }
		.fl-quiet { min-height: 52px; }
	}
</style>
