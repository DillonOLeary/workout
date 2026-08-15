<script lang="ts">
	import { deserialize, enhance } from '$app/forms';
	import { goto, invalidateAll, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { nextRung, prevRung } from '$lib/domain/racks';
	import {
		STALL_LIMIT,
		dayTitle,
		lastEntryFor,
		setsLine,
		nextLoad,
		rangeLabel,
		suggestedCount,
		suggestedWeight
	} from '$lib/domain/projections';
	import type { SetLogged } from '$lib/domain/events';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Snapshots, not $derived — deliberately. id/plan/day cannot change while
	// this screen is open (the load() guard guarantees a session exists), and
	// a session belongs to the plan it was started under.
	// svelte-ignore state_referenced_locally
	const session = data.activeSession!;
	// svelte-ignore state_referenced_locally
	const plan = data.plans.find((p) => p.id === session.plan) ?? data.plans[0];
	const exercises = plan.days[session.day] ?? [];
	const totalSets = exercises.reduce((n, e) => n + e.sets, 0);

	/* ---------- optimistic queue ----------------------------------------
	   Pressing "Log set" appends to `local` and the UI updates in the same
	   frame; a single-flight pump() POSTs queued sets to the server strictly
	   in order in the background. data.events is never refreshed mid-session
	   (no update()/invalidation), so confirmed sets stay in `local` and the
	   merge below stays the one source of truth for this screen. */
	type LocalSet = {
		key: string;
		status: 'queued' | 'inflight' | 'confirmed';
		data: SetLogged['data'];
	};
	let local = $state<LocalSet[]>([]);
	let errMsg = $state<string | null>(null);
	let lastPress = 0; // double-tap cooldown; not reactive on purpose
	let pumpPromise: Promise<void> | null = null;

	let serverSets = $derived(
		data.events.filter(
			(e): e is SetLogged => e.type === 'SetLogged' && e.data.session === session.id
		)
	);
	// deduped by (exercise, set) so a surprise invalidation can't double-count
	let optimistic = $derived(
		local.filter(
			(p) =>
				!serverSets.some(
					(s) => s.data.exercise === p.data.exercise && s.data.set === p.data.set
				)
		)
	);
	let loggedThis = $derived([
		...serverSets,
		...optimistic.map((p) => ({ type: 'SetLogged', data: p.data }) as SetLogged)
	]);

	/* ---------- screen state ---------- */
	const initialEx = (() => {
		const n = Number(page.url.searchParams.get('ex'));
		return Number.isInteger(n) && n >= 0 && n < exercises.length ? n : 0;
	})();
	let exI = $state(initialEx);
	let inc = $state(5);
	let flash = $state(false);
	let weight = $state(0);
	let reps = $state(0); // reps — or seconds held, for mode: 'seconds'

	let ex = $derived(exercises[exI]);
	let isHold = $derived(ex?.mode === 'seconds');
	// bodyweight ≠ seconds: the med-ball plank is a WEIGHTED hold. Weight UI
	// keys off bodyweight; the hold timer keys off mode.
	let isBW = $derived(!!ex?.bodyweight);
	let done = $derived(loggedThis.filter((e) => e.data.exercise === ex.name).length);
	// honest optimism: these sets are drawn, but the server hasn't confirmed yet
	let pendingForEx = $derived(
		optimistic.filter((p) => p.status !== 'confirmed' && p.data.exercise === ex.name).length
	);
	let syncing = $derived(local.some((p) => p.status !== 'confirmed'));
	let allDone = $derived(loggedThis.length >= totalSets);
	let exDone = $derived(done >= ex.sets);
	let last = $derived(lastEntryFor(data.events, ex.name, session.id));
	// the reasoning behind the preloaded weight, so a drop is never silent —
	// an unexplained lighter bar reads as a bug, which is worse than no deload
	let load = $derived(ex && !ex.bodyweight ? nextLoad(data.events, ex, session.id) : null);
	let repChoices = $derived([ex.lo, ex.lo + 1, ex.lo + 2, ex.lo + 3, ex.lo + 4]);
	let fmtW = $derived(Number.isInteger(weight) ? String(weight) : weight.toFixed(1));

	/* ---------- the hold timer ---------- */
	// Timed holds (the Claude Design model): dial the TARGET on the stepper,
	// start — the readout counts DOWN and logs itself at the bell. Drop early
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
				enqueue(h.target, h.target);
			} else {
				remaining = r;
			}
		}, 200);
		return () => clearInterval(t);
	});
	const bumpTarget = (d: number) => {
		if (!hold) reps = Math.max(10, reps + d);
	};

	function initFor(i: number) {
		const e = exercises[i];
		if (!e) return;
		const prior = loggedThis.filter((s) => s.data.exercise === e.name);
		const priorLast = prior[prior.length - 1];
		const timed = e.mode === 'seconds';
		// weight: 0 for bodyweight; timed-weighted (med-ball plank) carries it
		// silently — the hold stepper replaces the weight stepper on screen
		weight = e.bodyweight
			? 0
			: priorLast
				? priorLast.data.weight
				: suggestedWeight(data.events, e, session.id);
		if (timed) {
			// target seconds: this session's last TARGET (a dropped hold
			// shouldn't lower the next bell), else history, else the floor
			if (priorLast) {
				reps = priorLast.data.target ?? priorLast.data.reps;
			} else if (e.bodyweight) {
				reps = suggestedCount(data.events, e, session.id);
			} else if (nextLoad(data.events, e, session.id).reason === 'increase') {
				// double progression applies to holds too: the next ball up starts
				// back at the bottom of the range, like reps after a level-up —
				// without this the heavier ball would still ask for last week's max
				reps = e.lo;
			} else {
				const entry = lastEntryFor(data.events, e.name, session.id);
				reps = entry ? Math.max(...entry.sets.map((st) => st.reps)) : e.lo;
			}
		} else if (e.bodyweight) {
			reps = priorLast ? priorLast.data.reps : suggestedCount(data.events, e, session.id);
		} else {
			reps = Math.min(e.lo + 2, e.hi);
		}
		inc = timed ? 15 : 5;
		hold = null;
		remaining = null;
	}
	initFor(initialEx);

	function goTo(i: number) {
		if (i < 0 || i >= exercises.length || i === exI) return;
		exI = i;
		initFor(i);
		// shallow routing: URL tracks the exercise, no loads run, no history spam
		replaceState(`?ex=${i}`, {});
	}

	const bump = (d: number) => (weight = Math.max(0, Math.round((weight + d) * 2) / 2));
	/* the compact load control carries no step-size chips, so ± walks the rack
	   itself — a med ball steps 10 → 12 → 14, the sizes that exist */
	function bumpLoad(dir: 1 | -1) {
		if (ex.rack) weight = dir > 0 ? nextRung(weight, ex.rack) : prevRung(weight, ex.rack);
		else bump(dir * ex.inc);
	}

	/* Typed entry. The steppers are the fast path, but a stack that jumps in
	   15s or a machine at 47.5 needs an exact number, and tapping + eleven
	   times is not it. The readout IS the input — no extra control on screen.
	   Each commit clamps, then writes the clean value back so a rejected
	   keystroke can't leave the field showing something we didn't store. */
	function commitWeight(el: HTMLInputElement) {
		const n = Number(el.value);
		if (Number.isFinite(n)) weight = Math.max(0, Math.min(2000, Math.round(n * 2) / 2));
		el.value = Number.isInteger(weight) ? String(weight) : weight.toFixed(1);
	}
	function commitCount(el: HTMLInputElement, max: number) {
		const n = Math.round(Number(el.value));
		if (Number.isFinite(n)) reps = Math.max(1, Math.min(max, n));
		el.value = String(reps);
	}

	/* ---------- the write path ---------- */
	function enqueue(count: number, target?: number) {
		errMsg = null;
		local.push({
			key: crypto.randomUUID(),
			status: 'queued',
			data: {
				session: session.id,
				plan: plan.id,
				day: session.day,
				exercise: ex.name,
				weight,
				reps: count,
				set: done + 1,
				at: new Date().toISOString(),
				...(isHold ? { unit: 's' as const, ...(target !== undefined ? { target } : {}) } : {})
			}
		});
		// instant feedback — the network is not invited to this part
		flash = true;
		setTimeout(() => (flash = false), 160);
		navigator.vibrate?.(12);
		if (done >= ex.sets && exI < exercises.length - 1) setTimeout(() => goTo(exI + 1), 280);
		void pump();
	}

	function logSetNow() {
		if (performance.now() - lastPress < 350) return; // accidental double-tap
		lastPress = performance.now();
		enqueue(reps);
	}

	/** timed: one button — ring in the hold, or log the early drop */
	function startOrDone() {
		if (performance.now() - lastPress < 350) return;
		lastPress = performance.now();
		if (hold) {
			const held = Math.max(5, hold.target - Math.ceil((hold.end - Date.now()) / 1000));
			const t = hold.target;
			hold = null;
			remaining = null;
			enqueue(held, t);
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
				const res = await postLogSet(next);
				if (res.ok) next.status = 'confirmed';
				else await rollback(next, res.message);
			}
			pumpPromise = null;
		})();
		return pumpPromise;
	}

	async function postLogSet(
		p: LocalSet
	): Promise<{ ok: true } | { ok: false; message: string }> {
		const body = new FormData();
		for (const [k, v] of Object.entries(p.data)) if (v !== undefined) body.set(k, String(v));
		for (let attempt = 0; ; attempt++) {
			try {
				const res = await fetch('?/logSet', {
					method: 'POST',
					body,
					headers: { 'x-sveltekit-action': 'true' }
				});
				const result = deserialize(await res.text());
				if (result.type === 'success' || result.type === 'redirect') return { ok: true };
				if (result.type === 'failure')
					return {
						ok: false,
						message: String((result.data as { message?: string })?.message ?? 'Rejected.')
					};
				throw new Error('action error');
			} catch {
				// ambiguous network failures are safe to retry: the decider treats
				// a duplicate (exercise, set) as a no-op
				if (attempt >= 2) return { ok: false, message: 'Could not save — check connection.' };
				await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
			}
		}
	}

	async function rollback(p: LocalSet, message: string) {
		local = local.filter((x) => x.key !== p.key);
		for (const q of local) {
			if (q.status === 'queued' && q.data.exercise === p.data.exercise && q.data.set > p.data.set)
				q.data = { ...q.data, set: q.data.set - 1 };
		}
		if (message.includes('No session in progress')) {
			// finished on another device — resync; the load guard redirects
			local = [];
			await invalidateAll();
			return;
		}
		errMsg = message;
	}

	const drain = () => pumpPromise ?? Promise.resolve();

	/* ---------- finish / exit ---------- */
	let finishFormEl = $state<HTMLFormElement>();
	let finishArmed = $state(false);
	let finishing = $state(false);
	let exiting = $state(false);
	let finishTimer: ReturnType<typeof setTimeout> | undefined;

	async function finishNow() {
		if (!allDone && !finishArmed) {
			finishArmed = true;
			clearTimeout(finishTimer);
			finishTimer = setTimeout(() => (finishArmed = false), 3000);
			return;
		}
		finishArmed = false;
		finishing = true;
		await drain(); // queued sets must append before SessionFinished
		if (errMsg) {
			finishing = false;
			return;
		}
		finishFormEl?.requestSubmit();
	}

	async function exitToToday() {
		exiting = true;
		await drain();
		// we skipped all invalidation during the session, so Today must reload
		await goto('/', { invalidateAll: true });
	}

	function primaryAction() {
		if (allDone) return void finishNow();
		if (exDone) return goTo(exI + 1);
		if (isHold) return startOrDone();
		logSetNow();
	}

	function onKey(ev: KeyboardEvent) {
		if (ev.key === 'ArrowUp') {
			if (isHold) bumpTarget(inc);
			else if (isBW) reps = reps + 1;
			else bump(inc);
			ev.preventDefault();
		} else if (ev.key === 'ArrowDown') {
			if (isHold) bumpTarget(-inc);
			else if (isBW) reps = Math.max(1, reps - 1);
			else bump(-inc);
			ev.preventDefault();
		}
		else if (ev.key === 'ArrowRight') { goTo(Math.min(exercises.length - 1, exI + 1)); ev.preventDefault(); }
		else if (ev.key === 'ArrowLeft') { goTo(Math.max(0, exI - 1)); ev.preventDefault(); }
		else if (ev.key === 'Enter') { primaryAction(); ev.preventDefault(); }
		else if (ev.key === 'Escape') { void exitToToday(); }
		else if (!isHold && /^[1-9]$/.test(ev.key)) reps = parseInt(ev.key, 10);
		else if (!isHold && ev.key === '0') reps = 10;
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="lg-floor">
	<div class="lg-flash" class:on={flash}></div>
	<div class="lg-inner">
		<div class="lg-top">
			<button type="button" class="lg-exit" onclick={exitToToday} disabled={exiting} aria-label="Pause and go back">
				{exiting ? '…' : '×'}
			</button>
			<span class="lg-day">{dayTitle(plan, session.day)}</span>
			<button type="button" class="lg-finish" class:armed={finishArmed} onclick={finishNow} disabled={finishing}>
				{finishing ? 'Saving…' : finishArmed ? 'Finish?' : 'Finish'}
			</button>
			<span class="lg-where">{syncing ? 'saving · ' : ''}Ex {exI + 1} / {exercises.length}</span>
		</div>

		{#if ex}
			<div class="lg-rail" aria-hidden="true">
				{#each Array.from({ length: ex.sets }), i}
					<div
						class="seg"
						class:done={i < done - pendingForEx}
						class:pending={i >= done - pendingForEx && i < done}
						class:now={i === done}
					></div>
				{/each}
			</div>

			<main class="lg-main">
				<div>
					<div class="lg-exname">{ex.name}</div>
					<div class="lg-exmeta">
						<span class="lg-tag">{ex.tag}</span>
						<span class="lg-equip">{ex.equip}</span>
					</div>
					{#if ex.note && done === 0}<div class="lg-note">{ex.note}</div>{/if}
					<div class="lg-setline">
						{#if exDone}
							<span><b>All {ex.sets} {isHold ? 'holds' : 'sets'} logged</b>{isHold ? '' : ` · target ${rangeLabel(ex)}`}</span>
						{:else if isHold}
							<span>
								Hold <b>{done + 1}</b> of {ex.sets} · {reps}s{ex.side === 'sets'
									? ` · ${done % 2 === 0 ? 'left' : 'right'} side`
									: ''}
							</span>
						{:else}
							<span>Set <b>{done + 1}</b> of {ex.sets} · target {rangeLabel(ex)}</span>
						{/if}
					</div>
					<!-- a weighted lift with no history has nothing to report here; the
					     hold and bodyweight variants are instructions, so they stay -->
					{#if last || isHold || isBW}
						<div class="lg-last">
						{last
							? `LAST  ${setsLine(last.sets, ex)} — ${last.dateLabel}`
							: isHold
								? 'First time — hold to the bell'
								: isBW
									? `First time — start at ${ex.lo} reps`
									: ''}
						</div>
					{/if}
					<!-- only before this exercise's first set: after that the stepper carries
					     the session's own weight and the suggestion no longer describes it -->
					{#if load && done === 0 && load.reason === 'deload'}
						<div class="lg-hint">
							Stalled {load.stalls}× here — backed off to {load.weight} lb. Build it back.
						</div>
					{:else if load && done === 0 && load.stalls >= STALL_LIMIT}
						<!-- stalled past the limit but reason is still 'hold' — already at the floor -->
						<div class="lg-hint">Stalled {load.stalls}× at the starting weight.</div>
					{:else if load && done === 0 && load.stalls === STALL_LIMIT - 1}
						<div class="lg-hint">Stalled {load.stalls}× here — miss again and it backs off.</div>
					{/if}
					{#if allDone}
						<div class="lg-hint">Done — stretch 5 min while you're warm.</div>
					{/if}
				</div>

				<div class="lg-block">
					{#if isHold}
						<!-- the stepper IS the hold control: dial the bell, start, breathe -->
						<p class="lg-lbl">{hold ? 'Holding' : 'Hold for'}</p>
						<div class="lg-stepper">
							<button type="button" class="lg-step" onclick={() => bumpTarget(-inc)} disabled={!!hold} aria-label="Shorter hold">−</button>
							<div class="lg-readout" class:run={!!hold} aria-live="polite">
								{#if hold}
									<span class="v">{remaining}</span>
								{:else}
									<input
										class="v" type="number" inputmode="numeric" min="1" max="600"
										value={reps} onchange={(e) => commitCount(e.currentTarget, 600)}
										aria-label="Hold seconds — type an exact number"
									/>
								{/if}
								<span class="u">sec</span>
							</div>
							<button type="button" class="lg-step" onclick={() => bumpTarget(inc)} disabled={!!hold} aria-label="Longer hold">+</button>
						</div>
						<div class="lg-inc" role="group" aria-label="Seconds step size">
							{#each [5, 15, 30] as v (v)}
								<button type="button" aria-pressed={inc === v} onclick={() => (inc = v)}>{v}</button>
							{/each}
						</div>
						{#if !isBW}
							<!-- A weighted hold still has a load, and the hold stepper took the
							     weight stepper's place — without this the plank never says which
							     ball to pick up, and could never move off the starting one. -->
							<div class="lg-load">
								<span class="lg-loadlbl">Weight</span>
								<button type="button" onclick={() => bumpLoad(-1)} disabled={!!hold} aria-label="Lighter">−</button>
								<!-- number and unit share one bordered box, like the big readout, so the
								     row reads as − [ value ] + instead of four loose things -->
								<div class="lg-loadval">
									<input
										type="number" inputmode="decimal" step="0.5" min="0" max="2000"
										value={fmtW} onchange={(e) => commitWeight(e.currentTarget)} disabled={!!hold}
										aria-label="Weight — type an exact number"
									/>
									<span class="lg-loadunit">lb</span>
								</div>
								<button type="button" onclick={() => bumpLoad(1)} disabled={!!hold} aria-label="Heavier">+</button>
							</div>
						{/if}
						<div class="lg-help">
							{hold
								? 'Logs itself at zero. Drop early — tap Done, the seconds count.'
								: 'Tap start, get in position, breathe.'}
						</div>
					{:else if !isBW}
						<div class="lg-stepper">
							<button type="button" class="lg-step" onclick={() => bump(-inc)} aria-label="Decrease weight">−</button>
							<div class="lg-readout">
								<input
									class="v" type="number" inputmode="decimal" step="0.5" min="0" max="2000"
									value={fmtW} onchange={(e) => commitWeight(e.currentTarget)}
									aria-label="Weight — type an exact number"
								/>
								<!-- "each hand" belongs on the number, not a label above it -->
								<span class="u">{ex.each ? 'lb each hand' : 'lb'}</span>
							</div>
							<button type="button" class="lg-step" onclick={() => bump(inc)} aria-label="Increase weight">+</button>
						</div>
						<div class="lg-inc" role="group" aria-label="Weight step size">
							{#each [2.5, 5, 10] as v (v)}
								<button type="button" aria-pressed={inc === v} onclick={() => (inc = v)}>{v}</button>
							{/each}
						</div>
					{/if}

					{#if !isHold && isBW}
						<!-- rounds/reps without a barbell: a stepper, not a grid -->
						<div class="lg-reps">
							<p class="lg-lbl">Reps</p>
							<div class="lg-stepper">
								<button type="button" class="lg-step" onclick={() => (reps = Math.max(1, reps - 1))} aria-label="Decrease reps">−</button>
								<div class="lg-readout">
									<input
										class="v" type="number" inputmode="numeric" min="1" max="100"
										value={reps} onchange={(e) => commitCount(e.currentTarget, 100)}
										aria-label="Reps — type an exact number"
									/>
									<span class="u">reps</span>
								</div>
								<button type="button" class="lg-step" onclick={() => (reps = reps + 1)} aria-label="Increase reps">+</button>
							</div>
						</div>
					{:else if !isHold}
						<div class="lg-reps">
							<p class="lg-lbl">Reps</p>
							<div class="lg-repgrid" role="group" aria-label="Reps">
								{#each repChoices as n (n)}
									<button type="button" class="lg-rep" aria-pressed={reps === n} onclick={() => (reps = n)}>
										{n}<span class="off">{n === ex.lo ? 'min' : n === ex.hi ? 'max' : ' '}</span>
									</button>
								{/each}
							</div>
							<!-- one exact field replaces the two nudge buttons: it reaches any rep in
							     a single entry instead of N taps, and takes no more room -->
							<div class="lg-repexact">
								<button type="button" onclick={() => (reps = Math.max(1, reps - 1))} aria-label="One fewer rep">−</button>
								<input
									type="number" inputmode="numeric" min="1" max="100"
									value={reps} onchange={(e) => commitCount(e.currentTarget, 100)}
									aria-label="Reps — type an exact number"
								/>
								<button type="button" onclick={() => (reps = reps + 1)} aria-label="One more rep">+</button>
							</div>
						</div>
					{/if}
				</div>
			</main>

			<p class="lg-khint">
				{#if isHold}
					<kbd>↑</kbd><kbd>↓</kbd> hold length · <kbd>←</kbd><kbd>→</kbd> pose ·
					<kbd>Enter</kbd> start / done
				{:else}
					<kbd>↑</kbd><kbd>↓</kbd> {isBW ? 'reps' : 'weight'} · <kbd>1</kbd>–<kbd>9</kbd> reps ·
					<kbd>←</kbd><kbd>→</kbd> exercise · <kbd>Enter</kbd> log set
				{/if}
			</p>
			{#if errMsg ?? form?.message}<p class="lg-err">{errMsg ?? form?.message}</p>{/if}
			<div class="lg-actions">
				<button type="button" class="lg-nav" onclick={() => goTo(exI - 1)} disabled={exI === 0} aria-label="Previous exercise">‹</button>
				<button type="button" class="lg-log" class:done={exDone && !allDone} onclick={primaryAction}>
					{allDone
						? 'Finish workout'
						: exDone
							? isHold
								? 'Next pose'
								: 'Next exercise'
							: isHold
								? hold
									? 'Done early'
									: `Start ${reps}s hold`
								: 'Log set'}
				</button>
				<button type="button" class="lg-nav" onclick={() => goTo(exI + 1)} disabled={exI === exercises.length - 1} aria-label="Next exercise">›</button>
			</div>
		{/if}
	</div>
</div>

<!-- finish still goes through a real form action; its 303 redirect makes
     use:enhance run invalidateAll, so Today reloads fresh events -->
<form bind:this={finishFormEl} method="POST" action="?/finish" use:enhance hidden></form>

<style>
	/* Ported from the design project's log-screen.css */
	.lg-floor {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		/* NOT inset:0 — in mobile Safari that resolves to the layout viewport,
		   which extends behind the URL bar and toolbar, so the log button ends
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
	.lg-inner { width: 100%; max-width: var(--content-max); margin: 0 auto; display: flex; flex-direction: column; flex: 1; min-height: 0; }

	.lg-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 16px 8px; }
	.lg-exit {
		width: var(--hit-min); height: var(--hit-min);
		display: flex; align-items: center; justify-content: center;
		background: var(--white); border: 2px solid var(--ink); border-radius: var(--radius-md);
		box-shadow: var(--shadow-raised); cursor: pointer;
		font-family: var(--font-display); font-weight: 700; font-size: 26px; line-height: 1; color: var(--ink);
	}
	.lg-day { font-family: var(--font-body); font-weight: 700; font-size: 13px; letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-2); }
	.lg-finish {
		min-height: 44px; padding: 0 16px;
		background: var(--white); border: 2px solid var(--paper-3); border-radius: var(--radius-pill);
		font-family: var(--font-body); font-weight: 700; font-size: 13px; color: var(--ink-2);
		cursor: pointer; touch-action: manipulation;
	}
	.lg-finish.armed { border-color: var(--ink); background: var(--volt); color: var(--ink); }
	.lg-finish:disabled { opacity: 0.6; }
	.lg-where { font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--ink-3); white-space: nowrap; }

	.lg-rail { display: flex; gap: 4px; padding: 4px 16px 10px; }
	.lg-rail .seg { height: 8px; flex: 1; border-radius: 4px; background: var(--paper-3); border: 1px solid var(--paper-3); transition: background var(--dur-med) var(--ease-snap); }
	.lg-rail .seg.done { background: var(--volt); border-color: var(--ink); }
	/* logged locally, not yet confirmed by the server — tinted, not solid */
	.lg-rail .seg.pending { background: var(--volt-tint); border-color: var(--volt-deep); }
	.lg-rail .seg.now { background: var(--white); border-color: var(--ink); }

	.lg-main { flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 0 16px; overflow-y: auto; }
	.lg-exname { font-family: var(--font-display); font-weight: 900; font-size: clamp(30px, 7vw, 44px); line-height: 1; letter-spacing: var(--tracking-tightish); text-transform: uppercase; }
	.lg-exmeta { display: flex; gap: 10px; align-items: center; margin-top: 6px; flex-wrap: wrap; }
	.lg-tag { font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--ink); background: var(--volt-tint); border: 1px solid var(--ink); border-radius: var(--radius-pill); padding: 3px 10px; }
	.lg-equip { font-size: 13px; color: var(--ink-3); }
	.lg-note { font-size: 13px; color: var(--ink-2); margin-top: 8px; }
	.lg-setline { font-family: var(--font-mono); font-size: 13px; color: var(--ink-2); margin-top: 10px; }
	.lg-setline b { color: var(--ink); background: var(--volt); padding: 0 5px; border-radius: 4px; }
	.lg-last { font-family: var(--font-mono); font-size: 12px; color: var(--ink-3); margin-top: 4px; }
	.lg-hint { font-family: var(--font-mono); font-size: 12px; color: var(--ink-2); margin-top: 8px; background: var(--volt-tint); display: inline-block; padding: 2px 8px; border-radius: 4px; }

	.lg-block { margin-top: auto; padding-bottom: 4px; }
	.lg-lbl { font-family: var(--font-body); font-weight: 700; font-size: 11px; letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-3); margin: 0 0 6px 2px; }

	.lg-stepper { display: grid; grid-template-columns: 88px 1fr 88px; gap: 10px; align-items: stretch; }
	.lg-step {
		background: var(--white); border: 2px solid var(--ink); border-radius: var(--radius-lg);
		box-shadow: var(--shadow-raised); cursor: pointer; min-height: var(--hit-xl); touch-action: manipulation;
		font-family: var(--font-mono); font-weight: 700; font-size: 40px; line-height: 1; color: var(--ink);
		display: flex; align-items: center; justify-content: center;
	}
	.lg-readout {
		background: var(--white); border: 2px solid var(--ink); border-radius: var(--radius-lg); box-shadow: var(--shadow-card);
		display: flex; flex-direction: column; align-items: center; justify-content: center;
	}
	.lg-readout .v { font-family: var(--font-mono); font-weight: 800; font-size: clamp(44px, 13vw, 64px); line-height: 0.95; color: var(--ink); }
	.lg-readout .u { font-family: var(--font-mono); font-size: 13px; color: var(--ink-3); margin-top: 2px; }

	.lg-inc { display: flex; gap: 8px; justify-content: center; margin-top: 10px; }
	.lg-inc button {
		font-family: var(--font-mono); font-size: 14px; font-weight: 700; color: var(--ink-2);
		background: var(--white); border: 2px solid var(--paper-3); border-radius: var(--radius-pill);
		padding: 0 18px; cursor: pointer; min-height: 44px;
	}
	.lg-inc button[aria-pressed='true'] { color: var(--ink); border-color: var(--ink); background: var(--volt-tint); }

	.lg-reps { margin-top: 16px; }
	/* bodyweight: no weight block above, so the count UI sits flush */
	.lg-reps:first-child { margin-top: 0; }
	.lg-repgrid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
	.lg-rep {
		font-family: var(--font-mono); font-weight: 800; font-size: 30px; color: var(--ink);
		background: var(--white); border: 2px solid var(--ink); border-radius: var(--radius-lg);
		box-shadow: var(--shadow-raised); min-height: 78px; cursor: pointer; touch-action: manipulation;
	}
	.lg-rep[aria-pressed='true'] { background: var(--volt); box-shadow: var(--shadow-pressed); transform: translateY(2px); }
	.lg-rep .off { display: block; font-family: var(--font-body); font-weight: 700; font-size: 9px; letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-3); margin-top: 2px; }
	/* countdown running: the readout itself goes volt (design: log-screen.css) */
	.lg-readout.run { background: var(--volt); }
	.lg-step:disabled { opacity: 0.3; cursor: default; }
	.lg-step:disabled:active { transform: none; box-shadow: var(--shadow-raised); }
	.lg-help { font-family: var(--font-mono); font-size: 12px; color: var(--ink-3); text-align: center; margin-top: 14px; }
	/* one row: what to pick up, and how to change it */
	.lg-load { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
	.lg-loadlbl {
		flex: 1; font-family: var(--font-body); font-weight: 700; font-size: 11px;
		letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-3);
	}
	.lg-load button {
		width: 56px; min-height: 48px; background: var(--white); border: 2px solid var(--ink);
		border-radius: var(--radius-md); box-shadow: var(--shadow-raised); cursor: pointer;
		font-family: var(--font-mono); font-weight: 700; font-size: 24px; color: var(--ink);
		touch-action: manipulation;
	}
	.lg-load button:disabled { opacity: 0.3; cursor: default; }
	.lg-loadval {
		display: flex; align-items: baseline; justify-content: center; gap: 4px;
		min-width: 104px; min-height: 48px; padding: 0 10px;
		background: var(--white); border: 2px solid var(--ink); border-radius: var(--radius-md);
		box-shadow: var(--shadow-card);
	}
	.lg-load input {
		width: 56px; text-align: right; background: transparent; border: none; padding: 0;
		align-self: center;
		font-family: var(--font-mono); font-weight: 800; font-size: 24px; color: var(--ink);
		-moz-appearance: textfield; appearance: textfield;
	}
	.lg-load input::-webkit-outer-spin-button,
	.lg-load input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
	.lg-loadunit { font-family: var(--font-mono); font-size: 13px; color: var(--ink-3); align-self: center; }
	/* the same five columns as the rep grid above, so − and + sit exactly under
	   the 8 and the 12 rather than nearly under them */
	.lg-repexact { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-top: 8px; }
	.lg-repexact input { grid-column: 2 / 5; }
	.lg-repexact button {
		font-family: var(--font-mono); font-size: 22px; font-weight: 700; color: var(--ink-2);
		background: var(--white); border: 2px solid var(--paper-3); border-radius: var(--radius-md); min-height: 44px; cursor: pointer;
	}
	.lg-repexact input {
		width: 100%; min-height: 44px; text-align: center;
		font-family: var(--font-mono); font-size: 20px; font-weight: 700; color: var(--ink);
		background: var(--white); border: 2px solid var(--paper-3); border-radius: var(--radius-md);
	}
	.lg-readout input.v {
		width: 100%; text-align: center; background: transparent; border: none; padding: 0;
		font-family: var(--font-mono); font-weight: 800; font-size: clamp(44px, 13vw, 64px);
		line-height: 0.95; color: var(--ink);
	}
	.lg-readout input.v, .lg-repexact input { -moz-appearance: textfield; appearance: textfield; }
	.lg-readout input.v::-webkit-outer-spin-button, .lg-readout input.v::-webkit-inner-spin-button,
	.lg-repexact input::-webkit-outer-spin-button, .lg-repexact input::-webkit-inner-spin-button {
		-webkit-appearance: none; margin: 0;
	}

	.lg-khint { font-family: var(--font-mono); font-size: 10.5px; color: var(--ink-3); text-align: center; padding: 8px 16px 6px; line-height: 1.7; margin: 0; }
	.lg-khint kbd { background: var(--white); border: 1px solid var(--paper-3); border-radius: 5px; padding: 1px 6px; color: var(--ink); }
	/* keyboard hints are noise on touch devices */
	@media (hover: none) {
		.lg-khint { display: none; }
	}
	.lg-err { font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--danger); text-align: center; margin: 0; padding: 0 16px; }

	.lg-actions { display: grid; grid-template-columns: 76px 1fr 76px; gap: 10px; padding: 8px 16px calc(14px + env(safe-area-inset-bottom)); }
	.lg-nav {
		background: var(--white); border: 2px solid var(--ink); border-radius: var(--radius-lg);
		box-shadow: var(--shadow-raised); color: var(--ink); cursor: pointer; min-height: var(--hit-lg);
		font-family: var(--font-display); font-weight: 900; font-size: 30px;
		display: flex; align-items: center; justify-content: center; touch-action: manipulation;
	}
	.lg-nav:disabled { opacity: 0.3; cursor: default; }
	.lg-log {
		background: var(--volt); color: var(--ink); border: 2px solid var(--ink); border-radius: var(--radius-lg);
		box-shadow: var(--shadow-raised-lg); cursor: pointer; min-height: var(--hit-lg); touch-action: manipulation;
		font-family: var(--font-display); font-weight: 900; font-size: 24px; letter-spacing: 0.02em; text-transform: uppercase;
	}
	.lg-log.done { background: var(--ink); color: var(--volt); }
	.lg-step:active, .lg-nav:active, .lg-log:active, .lg-exit:active { transform: translateY(2px); box-shadow: var(--shadow-pressed); }

	.lg-floor :focus-visible { outline: none; box-shadow: var(--focus-shadow); }

	.lg-flash { position: fixed; inset: 0; background: var(--volt); opacity: 0; pointer-events: none; transition: opacity 180ms var(--ease-snap); z-index: 60; }
	.lg-flash.on { opacity: 0.25; }

	@media (prefers-reduced-motion: reduce) {
		.lg-floor *, .lg-flash { transition: none !important; }
	}

	/* Short screens: the gym floor must not scroll mid-set — thumbing a page
	   down to find the log button between sets is exactly the wrong moment.
	   Raised from 640 to 740 because a phone reporting 700-odd px of
	   viewport still loses a chunk to browser chrome. */
	@media (max-height: 740px) {
		/* reclaim the vertical margins first — they cost nothing to lose */
		.lg-setline { margin-top: 6px; }
		.lg-note { margin-top: 4px; font-size: 12px; }
		.lg-exmeta { margin-top: 4px; }
		.lg-inc { margin-top: 6px; }
		.lg-reps { margin-top: 10px; }
		.lg-repexact { margin-top: 6px; }
		.lg-rail { padding-bottom: 6px; }
		/* the controls carry the remaining height — every one stays past the
		   44px touch floor */
		.lg-step { min-height: 80px; }
		.lg-rep { min-height: 64px; font-size: 26px; }
		.lg-inc button { min-height: 34px; }
		.lg-repexact button, .lg-repexact input { min-height: 40px; }
		.lg-exname { font-size: clamp(26px, 6vw, 38px); }
	}

	@media (max-height: 640px) {
		.lg-stepper { grid-template-columns: 72px 1fr 72px; }
		.lg-step { min-height: var(--hit-lg); font-size: 32px; }
		.lg-readout .v, .lg-readout input.v { font-size: clamp(36px, 9vh, 52px); }
		.lg-rep { min-height: var(--hit-min); font-size: 24px; }
		.lg-inc button, .lg-repexact button, .lg-repexact input { min-height: 38px; }
		.lg-khint { display: none; }
		.lg-actions { grid-template-columns: 64px 1fr 64px; }
		.lg-nav, .lg-log { min-height: var(--hit-min); }
		.lg-exname { font-size: clamp(24px, 5vh, 36px); }
		.lg-step { min-height: 72px; }
		.lg-rep { min-height: 56px; }
	}

	/* Shortest screens: the 2.5 / 5 / 10 step chips go. They only change how
	   far ± jumps, and the readout itself is typable, so an exact weight is
	   still one tap away — whereas a log button below the fold is not. */
	@media (max-height: 560px) {
		.lg-inc { display: none; }
		.lg-readout .v, .lg-readout input.v { font-size: clamp(32px, 8vh, 44px); }
		/* the note stays — it is what answers "what counts as one rep" — but it
		   gets the tightest setting that is still readable */
		.lg-note { font-size: 11.5px; margin-top: 2px; line-height: 1.35; }
		.lg-exmeta { margin-top: 2px; }
		.lg-setline { margin-top: 4px; }
		.lg-last { margin-top: 2px; }
		.lg-actions { padding-top: 4px; }
	}
</style>
