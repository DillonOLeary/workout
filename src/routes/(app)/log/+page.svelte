<script lang="ts">
	import { deserialize, enhance } from '$app/forms';
	import { goto, invalidateAll, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import AdjustTile from '$lib/components/floor/AdjustTile.svelte';
	import FloorPrimary from '$lib/components/floor/FloorPrimary.svelte';
	import FloorSheet from '$lib/components/floor/FloorSheet.svelte';
	import SetTable from '$lib/components/floor/SetTable.svelte';
	import type { Row } from '$lib/components/floor/SetTable.svelte';
	import { nextRung, prevRung } from '$lib/domain/racks';
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
		warmupFor
	} from '$lib/domain/projections';
	import type { SessionSet } from '$lib/domain/projections';
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
	const warmup = warmupFor(plan, session.day);

	/* ---------- optimistic queue ----------------------------------------
	   Pressing the primary appends to `local` and the UI updates in the same
	   frame; a single-flight pump() POSTs queued sets to the server strictly
	   in order in the background. data.events is never refreshed mid-session
	   (no update()/invalidation), so confirmed sets stay in `local` and the
	   merge below stays the one source of truth for this screen. A set the
	   server rejects goes to 'failed' — it keeps its row and its numbers with
	   a Retry in place; nothing disappears silently (D4). */
	type LocalSet = {
		key: string;
		status: 'queued' | 'inflight' | 'confirmed' | 'failed';
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
	// the sets that COUNT: confirmed or on their way. A failed set stays
	// visible in the table but never inflates progress.
	let loggedThis = $derived([
		...serverSets,
		...optimistic
			.filter((p) => p.status !== 'failed')
			.map((p) => ({ type: 'SetLogged', data: p.data }) as SetLogged)
	]);
	let anyFailed = $derived(local.some((p) => p.status === 'failed'));

	/* ---------- screen state ---------- */
	const initialEx = (() => {
		const n = Number(page.url.searchParams.get('ex'));
		return Number.isInteger(n) && n >= 0 && n < exercises.length ? n : 0;
	})();
	let exI = $state(initialEx);
	let weight = $state(0);
	let reps = $state(0); // reps — or seconds held, for mode: 'seconds'
	let sheetOpen = $state(false);

	let ex = $derived(exercises[exI]);
	let isHold = $derived(ex?.mode === 'seconds');
	// bodyweight ≠ seconds: the med-ball plank is a WEIGHTED hold. Weight UI
	// keys off bodyweight; the hold timer keys off mode.
	let isBW = $derived(!!ex?.bodyweight);
	let done = $derived(loggedThis.filter((e) => e.data.exercise === ex.name).length);
	let syncing = $derived(local.some((p) => p.status === 'queued' || p.status === 'inflight'));
	let allDone = $derived(loggedThis.length >= totalSets);
	let exDone = $derived(done >= ex.sets);
	let last = $derived(lastEntryFor(data.events, ex.name, session.id));
	// the reasoning behind the preloaded weight, so a drop is never silent —
	// an unexplained lighter bar reads as a bug, which is worse than no deload
	let load = $derived(ex && !ex.bodyweight ? nextLoad(data.events, ex, session.id) : null);
	// only before the first set: after that the table carries the session's
	// own numbers and the suggestion no longer describes what's on screen
	let hint = $derived(load && done === 0 ? loadHint(load, ex) : null);

	// The set about to be logged. Failed sets keep their numbers, so the next
	// attempt takes the number AFTER everything already on the table — logging
	// N+1 sets never prints "Set N+1 of N", the extra row is labelled (D2).
	let nextNum = $derived.by(() => {
		const nums = [...serverSets, ...optimistic]
			.filter((s) => s.data.exercise === ex.name)
			.map((s) => s.data.set);
		return nums.length ? Math.max(...nums) + 1 : 1;
	});

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
				enqueue(h.target, h.target);
			} else {
				remaining = r;
			}
		}, 200);
		return () => clearInterval(t);
	});
	// the ceiling is the top of the range: past it the answer is a harder
	// variation (the exercise note says which), never a longer hold
	const bumpTarget = (d: number) => {
		if (!hold) reps = Math.min(ex.hi, Math.max(ex.lo, reps + d));
	};
	const bumpReps = (d: number) => (reps = Math.max(1, Math.min(100, reps + d)));
	/* ± is never a fixed nudge: anything you pick up walks the rack's ladder
	   (there is no 37.5 lb dumbbell), machines step their per-exercise inc.
	   One gesture, one behaviour, on every layout (D3). */
	function bumpLoad(dir: 1 | -1) {
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
		const e = exercises[i];
		if (!e) return;
		const prior = loggedThis.filter((s) => s.data.exercise === e.name);
		const priorLast = prior[prior.length - 1];
		const nums = [...serverSets, ...optimistic]
			.filter((s) => s.data.exercise === e.name)
			.map((s) => s.data.set);
		const next = nums.length ? Math.max(...nums) + 1 : 1;
		const k = Math.min(next - 1, e.sets - 1); // ordinal of the set about to be logged
		const timed = e.mode === 'seconds';
		const sugg = e.bodyweight ? null : nextLoad(data.events, e, session.id);
		let overridden = false;
		if (sugg && priorLast) {
			const suggestedPrev = sugg.sets[Math.min(priorLast.data.set - 1, e.sets - 1)].weight;
			overridden = priorLast.data.weight !== suggestedPrev;
		}
		// weight: 0 for bodyweight; a timed-weighted hold (custom plans) carries
		// its load in the second tile
		weight = !sugg ? 0 : overridden ? priorLast!.data.weight : sugg.sets[k].weight;
		if (timed) {
			// target seconds: this session's last TARGET (a dropped hold shouldn't
			// lower the next bell), else the ledger's per-set suggestion. A level-up
			// on a weighted hold restarts at the bottom of the range, like reps do.
			if (priorLast) reps = priorLast.data.target ?? priorLast.data.reps;
			else if (sugg && sugg.sets[k].reason === 'increase') reps = e.lo;
			else reps = suggestedCount(data.events, e, session.id, k);
			reps = Math.min(e.hi, reps);
		} else if (e.bodyweight) {
			reps = priorLast ? priorLast.data.reps : suggestedCount(data.events, e, session.id, k);
		} else {
			// what you did last set if you're off-plan, else what this set asks for
			reps = overridden ? priorLast!.data.reps : sugg!.sets[k].reps;
		}
		hold = null;
		remaining = null;
	}
	preload(initialEx);

	function goTo(i: number) {
		if (i < 0 || i >= exercises.length || i === exI) return;
		exI = i;
		preload(i);
		// shallow routing: URL tracks the exercise, no loads run, no history spam
		replaceState(`?ex=${i}`, {});
	}

	/* ---------- the set table ---------- */
	let rows = $derived.by((): Row[] => {
		if (!ex) return [];
		const logged = [
			...serverSets
				.filter((s) => s.data.exercise === ex.name)
				.map((s) => ({ n: s.data.set, w: s.data.weight, r: s.data.reps, st: 'confirmed' as const })),
			...optimistic
				.filter((p) => p.data.exercise === ex.name)
				.map((p) => ({
					n: p.data.set,
					w: p.data.weight,
					r: p.data.reps,
					st:
						p.status === 'failed'
							? ('failed' as const)
							: p.status === 'confirmed'
								? ('confirmed' as const)
								: ('saving' as const)
				}))
		].sort((a, b) => a.n - b.n);
		const out: Row[] = logged.map((l) => ({
			set: l.n,
			weight: l.w,
			count: l.r,
			state: l.st,
			extra: l.n > ex.sets
		}));
		if (!exDone) {
			if (hold) {
				out.push({
					set: nextNum,
					weight,
					count: null,
					state: 'running',
					remaining: remaining ?? hold.target,
					target: hold.target
				});
			} else {
				out.push({ set: nextNum, weight, count: reps, state: 'current' });
			}
			// the rest of the exercise, queued by the rule — each with ITS number
			for (let n = nextNum + 1; n <= ex.sets; n++) {
				const k = Math.min(n - 1, ex.sets - 1);
				out.push({ set: n, weight: load ? load.sets[k].weight : 0, count: null, state: 'upcoming' });
			}
		}
		return out;
	});

	// plan · ledger, one line each — never a control, never volt
	let planLine = $derived(
		`TARGET ${rangeLabel(ex).toUpperCase()}${ex.each ? ' · PER HAND' : ''}${ex.bodyweight ? ' · BODYWEIGHT' : ''}`
	);
	let ledgerLine = $derived(last ? `LAST ${setsLine(last.sets, ex)}` : 'FIRST TIME');

	/* ---------- the write path ---------- */
	function enqueue(count: number, target?: number) {
		errMsg = null;
		const setNum = nextNum;
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
				set: setNum,
				at: new Date().toISOString(),
				...(isHold ? { unit: 's' as const, ...(target !== undefined ? { target } : {}) } : {})
			}
		});
		// the next set gets its own number — per-set progression, not a carry
		preload(exI);
		// instant feedback: the row fills in, the phone taps back. No flash —
		// the table changing IS the confirmation.
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
			const held = Math.max(1, hold.target - Math.ceil((hold.end - Date.now()) / 1000));
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
				else await markFailed(next, res.message);
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

	/** a failed set keeps its row, its numbers and a Retry — never removed (D4) */
	async function markFailed(p: LocalSet, message: string) {
		if (message.includes('No session in progress')) {
			// finished on another device — resync; the load guard redirects
			local = [];
			await invalidateAll();
			return;
		}
		p.status = 'failed';
		errMsg = message;
	}

	function retrySet(setNum: number) {
		const p = local.find(
			(x) => x.status === 'failed' && x.data.exercise === ex.name && x.data.set === setNum
		);
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
	let exiting = $state(false);

	async function finishNow() {
		finishing = true;
		await drain(); // queued sets must append before SessionFinished
		if (local.some((p) => p.status === 'failed')) {
			errMsg = 'A set didn’t save — Retry it, or finish from the ⋯ menu.';
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
		exiting = true;
		await drain();
		// we skipped all invalidation during the session, so Today must reload
		await goto('/', { invalidateAll: true });
	}

	function primaryAction() {
		if (finishing) return;
		if (allDone) return void finishNow();
		if (exDone) return goTo(exI + 1);
		if (isHold) return startOrDone();
		logSetNow();
	}

	let sideNow = $derived(
		ex?.side === 'sets' && !isHold ? (nextNum % 2 === 1 ? 'left' : 'right') : null
	);
	let primaryLabel = $derived(
		allDone
			? finishing
				? 'Saving…'
				: 'Finish workout'
			: exDone
				? isHold
					? 'Next pose'
					: 'Next exercise'
				: isHold
					? hold
						? 'Done early'
						: `Start ${reps}s hold`
					: sideNow
						? `Log ${sideNow} side`
						: 'Log set'
	);
	let primaryVariant = $derived((allDone || exDone ? 'advance' : 'commit') as 'advance' | 'commit');

	/** the receipt: what this session actually wrote, in ledger shape */
	function receiptSets(name: string): SessionSet[] {
		return loggedThis
			.filter((s) => s.data.exercise === name)
			.sort((a, b) => a.data.set - b.data.set)
			.map((s) => ({
				weight: s.data.weight,
				reps: s.data.reps,
				...(s.data.unit ? { unit: s.data.unit } : {}),
				...(s.data.target !== undefined ? { target: s.data.target } : {})
			}));
	}

	function onKey(ev: KeyboardEvent) {
		// typed entry belongs to the tile inputs — never fight the keypad
		if ((ev.target as HTMLElement | null)?.tagName === 'INPUT') return;
		if (ev.key === 'Escape') {
			if (sheetOpen) {
				sheetOpen = false;
				ev.preventDefault();
				return;
			}
			void exitToToday();
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
			if (isHold) bumpTarget(ex.inc);
			else if (isBW) bumpReps(1);
			else bumpLoad(1);
			ev.preventDefault();
		} else if (ev.key === 'ArrowDown') {
			if (isHold) bumpTarget(-ex.inc);
			else if (isBW) bumpReps(-1);
			else bumpLoad(-1);
			ev.preventDefault();
		} else if (ev.key === 'ArrowRight') {
			goTo(Math.min(exercises.length - 1, exI + 1));
			ev.preventDefault();
		} else if (ev.key === 'ArrowLeft') {
			goTo(Math.max(0, exI - 1));
			ev.preventDefault();
		} else if (!isHold && /^[1-9]$/.test(ev.key)) reps = parseInt(ev.key, 10);
		else if (!isHold && ev.key === '0') reps = 10;
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="fl">
	<div class="fl-inner">
		<header class="fl-top">
			<button
				type="button"
				class="fl-ghost"
				onclick={exitToToday}
				disabled={exiting}
				aria-label="Save and go back"
			>
				{exiting ? '…' : '×'}
			</button>
			<span class="fl-crumb">
				{dayTitle(plan, session.day)} · Ex {Math.min(exI + 1, exercises.length)}/{exercises.length}
			</span>
			<button
				type="button"
				class="fl-ghost"
				onclick={() => (sheetOpen = true)}
				aria-label="More — technique, jump to exercise, finish"
			>
				⋯
			</button>
		</header>

		{#if ex && !allDone}
			<main class="fl-main">
				<h1 class="fl-name">{ex.name}</h1>
				<p class="fl-meta">
					<span>{planLine}</span>
					<span class="fl-ledgerline"> · {ledgerLine}</span>
				</p>

				<SetTable {ex} {rows} onRetry={retrySet} />

				{#if hint}
					<p class="fl-hint">{hint}</p>
				{:else if isHold && done === 0 && holdMaxed(last, ex)}
					<!-- the ⋯ sheet's note says what "harder" means for this hold -->
					<p class="fl-hint">At the ceiling ({ex.hi}s) — make it harder, not longer.</p>
				{/if}
			</main>

			<div class="fl-bottom">
				{#if !exDone}
					<div class="fl-tiles" class:single={isBW}>
						{#if isHold}
							<AdjustTile
								label={`Hold · +${ex.inc}s`}
								bind:value={reps}
								min={ex.lo}
								max={ex.hi}
								disabled={!!hold}
								onStep={(d) => bumpTarget(d * ex.inc)}
							/>
							{#if !isBW}
								<AdjustTile
									label={`Weight · ${stepLabel(ex)}`}
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
									label={`Weight · ${stepLabel(ex)}`}
									bind:value={weight}
									decimals
									min={0}
									onStep={bumpLoad}
								/>
							{/if}
						{/if}
					</div>
				{/if}
				{#if errMsg ?? form?.message}<p class="fl-err">{errMsg ?? form?.message}</p>{/if}
				<FloorPrimary
					variant={primaryVariant}
					label={primaryLabel}
					disabled={finishing}
					onclick={primaryAction}
				/>
			</div>
		{:else if allDone}
			<!-- workout complete: no adjuster on screen — the table becomes a
			     receipt in the same two-column shape as the Ledger tab (D6) -->
			<main class="fl-main">
				<h1 class="fl-name">Done</h1>
				<p class="fl-meta">
					<span>{loggedThis.length} SETS LOGGED{syncing ? ' · SAVING…' : ''}</span>
				</p>
				<div class="fl-receipt">
					{#each exercises as e (e.name)}
						{@const sets = receiptSets(e.name)}
						<div class="fl-rrow">
							<span class="fl-rname">{e.name}</span>
							<span class="fl-rval">{sets.length ? setsLine(sets, e) : '—'}</span>
						</div>
					{/each}
				</div>
				<p class="fl-hint">Stretch 5 min while you're warm.</p>
			</main>
			<div class="fl-bottom">
				{#if anyFailed}
					<p class="fl-err">
						A set didn’t save.
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
	{ex}
	{warmup}
	{exercises}
	doneFor={(name) => loggedThis.filter((s) => s.data.exercise === name).length}
	current={exI}
	logged={loggedThis.length}
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
		padding: 8px 12px 4px;
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
	.fl-ghost:disabled { opacity: 0.5; }
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
		color: var(--ink-2);
		margin: 10px 0 0;
		background: var(--volt-tint);
		display: inline-block;
		padding: 3px 8px;
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
	}
	@media (max-height: 640px) {
		.fl-ledgerline { display: none; }
		.fl-hint { margin-top: 6px; }
	}
	@media (max-height: 560px) {
		.fl-hint { display: none; }
		.fl-meta { margin: 2px 0 6px; font-size: 12px; }
		.fl-name { font-size: clamp(22px, 5vh, 26px); }
		.fl-tiles { gap: 8px; margin-bottom: 8px; }
	}
</style>
