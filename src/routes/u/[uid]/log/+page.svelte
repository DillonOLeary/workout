<script lang="ts">
	import { deserialize, enhance } from '$app/forms';
	import { goto, invalidateAll, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { dayTitle, lastEntryFor, suggestedCount, suggestedWeight } from '$lib/domain/projections';
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
	let repChoices = $derived([ex.lo, ex.lo + 1, ex.lo + 2, ex.lo + 3, ex.lo + 4]);
	let fmtW = $derived(Number.isInteger(weight) ? String(weight) : weight.toFixed(1));

	/* ---------- clocks: rest count-up + hold timer ---------- */
	let now = $state(Date.now());
	$effect(() => {
		const t = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(t);
	});
	let lastLoggedAt = $derived(
		loggedThis.length ? Math.max(...loggedThis.map((e) => new Date(e.data.at).getTime())) : 0
	);
	let restSec = $derived(lastLoggedAt ? Math.max(0, Math.floor((now - lastLoggedAt) / 1000)) : null);
	const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

	let holdStartedAt = $state<number | null>(null);
	let holdNow = $state(0);
	$effect(() => {
		if (holdStartedAt == null) return;
		const t = setInterval(() => (holdNow = Date.now()), 250);
		return () => clearInterval(t);
	});
	let holdSec = $derived(
		holdStartedAt != null ? Math.max(0, Math.floor((holdNow - holdStartedAt) / 1000)) : null
	);
	function toggleHold() {
		if (holdStartedAt == null) {
			holdNow = Date.now();
			holdStartedAt = Date.now();
		} else {
			reps = Math.max(1, Math.floor((Date.now() - holdStartedAt) / 1000));
			holdStartedAt = null;
		}
	}

	function initFor(i: number) {
		const e = exercises[i];
		if (!e) return;
		const prior = loggedThis.filter((s) => s.data.exercise === e.name);
		if (e.bodyweight) {
			// no weight axis — the count itself is what progresses
			weight = 0;
			reps = prior.length
				? prior[prior.length - 1].data.reps
				: suggestedCount(data.events, e, session.id);
		} else {
			weight = prior.length
				? prior[prior.length - 1].data.weight
				: suggestedWeight(data.events, e, session.id);
			reps = e.mode === 'seconds' ? e.lo : Math.min(e.lo + 2, e.hi);
		}
		holdStartedAt = null;
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

	/* ---------- the write path ---------- */
	function logSetNow() {
		if (performance.now() - lastPress < 350) return; // accidental double-tap
		lastPress = performance.now();
		if (holdStartedAt != null) toggleHold(); // stop the hold and capture it
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
				reps,
				set: done + 1,
				at: new Date().toISOString(),
				...(isHold ? { unit: 's' as const } : {})
			}
		});
		// instant feedback — the network is not invited to this part
		flash = true;
		setTimeout(() => (flash = false), 160);
		navigator.vibrate?.(12);
		if (done >= ex.sets && exI < exercises.length - 1) setTimeout(() => goTo(exI + 1), 280);
		void pump();
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
		await goto(`/u/${data.uid}`, { invalidateAll: true });
	}

	function primaryAction() {
		if (allDone) return void finishNow();
		if (exDone) return goTo(exI + 1);
		logSetNow();
	}

	function onKey(ev: KeyboardEvent) {
		if (ev.key === 'ArrowUp') {
			if (isBW) reps = reps + (isHold ? 5 : 1);
			else bump(inc);
			ev.preventDefault();
		} else if (ev.key === 'ArrowDown') {
			if (isBW) reps = Math.max(1, reps - (isHold ? 5 : 1));
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
					<div class="lg-setline">
						{#if exDone}
							<span><b>All {ex.sets} sets logged</b> · target {ex.lo}–{ex.hi}{isHold ? 's' : ' reps'}</span>
						{:else}
							<span>Set <b>{done + 1}</b> of {ex.sets} · target {ex.lo}–{ex.hi}{isHold ? 's' : ' reps'}</span>
						{/if}
					</div>
					<div class="lg-last">
						{last
							? `LAST  ${isBW ? '' : `${last.weight} lb · `}${last.reps.map((r) => (isHold ? `${r}s` : r)).join(' · ')} — ${last.dateLabel}`
							: isBW
								? `First time — start at ${ex.lo}${isHold ? 's' : ' reps'}`
								: 'First time — starting weight'}
					</div>
					{#if loggedThis.length === 0}
						<div class="lg-hint">Warm up — 5 easy minutes + one light set.</div>
					{:else if allDone}
						<div class="lg-hint">Done — stretch 5 min while you're warm.</div>
					{:else if restSec !== null && restSec < 900 && holdStartedAt == null}
						<!-- rest ends the moment work starts: hidden while a hold runs -->
						<div class="lg-rest">REST {fmtClock(restSec)}</div>
					{/if}
				</div>

				<div class="lg-block">
					{#if !isBW}
						<p class="lg-lbl">Weight</p>
						<div class="lg-stepper">
							<button type="button" class="lg-step" onclick={() => bump(-inc)} aria-label="Decrease weight">−</button>
							<div class="lg-readout" aria-live="polite">
								<span class="v">{fmtW}</span>
								<span class="u">lb</span>
							</div>
							<button type="button" class="lg-step" onclick={() => bump(inc)} aria-label="Increase weight">+</button>
						</div>
						<div class="lg-inc" role="group" aria-label="Weight step size">
							{#each [2.5, 5, 10] as v (v)}
								<button type="button" aria-pressed={inc === v} onclick={() => (inc = v)}>{v}</button>
							{/each}
						</div>
					{/if}

					{#if isHold}
						<!-- one control, same grammar as the weight stepper: nudge or time -->
						<div class="lg-reps">
							<p class="lg-lbl">Hold</p>
							<div class="lg-stepper">
								<button type="button" class="lg-step sm" onclick={() => (reps = Math.max(1, reps - 5))} disabled={holdStartedAt != null} aria-label="Shorten hold">−5</button>
								<button type="button" class="lg-hold" class:running={holdStartedAt != null} onclick={toggleHold}>
									{holdStartedAt != null ? fmtClock(holdSec ?? 0) : `${reps}s`}
									<span class="off">{holdStartedAt != null ? 'tap to stop' : 'tap to time the hold'}</span>
								</button>
								<button type="button" class="lg-step sm" onclick={() => (reps = reps + 5)} disabled={holdStartedAt != null} aria-label="Lengthen hold">+5</button>
							</div>
						</div>
					{:else if isBW}
						<!-- rounds/reps without a barbell: a stepper, not a grid -->
						<div class="lg-reps">
							<p class="lg-lbl">Reps</p>
							<div class="lg-stepper">
								<button type="button" class="lg-step" onclick={() => (reps = Math.max(1, reps - 1))} aria-label="Decrease reps">−</button>
								<div class="lg-readout" aria-live="polite">
									<span class="v">{reps}</span>
									<span class="u">reps</span>
								</div>
								<button type="button" class="lg-step" onclick={() => (reps = reps + 1)} aria-label="Increase reps">+</button>
							</div>
						</div>
					{:else}
						<div class="lg-reps">
							<p class="lg-lbl">Reps{repChoices.indexOf(reps) === -1 ? ` — set to ${reps}` : ''}</p>
							<div class="lg-repgrid" role="group" aria-label="Reps">
								{#each repChoices as n (n)}
									<button type="button" class="lg-rep" aria-pressed={reps === n} onclick={() => (reps = n)}>
										{n}<span class="off">{n === ex.lo ? 'min' : n === ex.hi ? 'max' : ' '}</span>
									</button>
								{/each}
							</div>
							<div class="lg-repextra">
								<button type="button" onclick={() => (reps = Math.max(1, reps - 1))}>− below {ex.lo}</button>
								<button type="button" onclick={() => (reps = reps + 1)}>above {ex.lo + 4} +</button>
							</div>
						</div>
					{/if}
				</div>
			</main>

			<p class="lg-khint">
				<kbd>↑</kbd><kbd>↓</kbd> {isBW ? (isHold ? 'hold' : 'reps') : 'weight'} ·
				<kbd>1</kbd>–<kbd>9</kbd> reps · <kbd>←</kbd><kbd>→</kbd>
				exercise · <kbd>Enter</kbd> log set
			</p>
			{#if errMsg ?? form?.message}<p class="lg-err">{errMsg ?? form?.message}</p>{/if}
			<div class="lg-actions">
				<button type="button" class="lg-nav" onclick={() => goTo(exI - 1)} disabled={exI === 0} aria-label="Previous exercise">‹</button>
				<button type="button" class="lg-log" class:done={exDone && !allDone} onclick={primaryAction}>
					{allDone ? 'Finish workout' : exDone ? 'Next exercise' : 'Log set'}
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
		inset: 0;
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
	.lg-setline { font-family: var(--font-mono); font-size: 13px; color: var(--ink-2); margin-top: 10px; }
	.lg-setline b { color: var(--ink); background: var(--volt); padding: 0 5px; border-radius: 4px; }
	.lg-last { font-family: var(--font-mono); font-size: 12px; color: var(--ink-3); margin-top: 4px; }
	.lg-hint { font-family: var(--font-mono); font-size: 12px; color: var(--ink-2); margin-top: 8px; background: var(--volt-tint); display: inline-block; padding: 2px 8px; border-radius: 4px; }
	.lg-rest { font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--ink); margin-top: 8px; }

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
	.lg-hold {
		width: 100%; min-height: var(--hit-xl);
		font-family: var(--font-mono); font-weight: 800; font-size: 40px; color: var(--ink);
		background: var(--white); border: 2px solid var(--ink); border-radius: var(--radius-lg);
		box-shadow: var(--shadow-raised); cursor: pointer; touch-action: manipulation;
	}
	.lg-step.sm { font-size: 24px; }
	.lg-step:disabled { opacity: 0.3; cursor: default; }
	.lg-step:disabled:active { transform: none; box-shadow: var(--shadow-raised); }
	.lg-hold.running { background: var(--volt); box-shadow: var(--shadow-pressed); transform: translateY(2px); }
	.lg-hold .off { display: block; font-family: var(--font-body); font-weight: 700; font-size: 10px; letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-3); margin-top: 4px; }
	.lg-repextra { display: flex; gap: 8px; margin-top: 8px; }
	.lg-repextra button {
		flex: 1; font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--ink-2);
		background: var(--white); border: 2px solid var(--paper-3); border-radius: var(--radius-md); min-height: 44px; cursor: pointer;
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

	@media (max-height: 640px) {
		.lg-stepper { grid-template-columns: 72px 1fr 72px; }
		.lg-step { min-height: var(--hit-lg); font-size: 32px; }
		.lg-readout .v { font-size: clamp(36px, 9vh, 52px); }
		.lg-rep { min-height: var(--hit-min); font-size: 24px; }
		.lg-hold { min-height: var(--hit-lg); font-size: 32px; }
		.lg-inc button, .lg-repextra button { min-height: 38px; }
		.lg-khint { display: none; }
		.lg-actions { grid-template-columns: 64px 1fr 64px; }
		.lg-nav, .lg-log { min-height: var(--hit-min); }
		.lg-exname { font-size: clamp(24px, 5vh, 36px); }
	}
</style>
