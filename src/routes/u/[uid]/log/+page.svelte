<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { dayTitle, lastEntryFor, suggestedWeight } from '$lib/domain/projections';
	import type { SetLogged } from '$lib/domain/events';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Snapshots, not $derived — deliberately. id/plan/day cannot change while
	// this screen is open (the load() guard guarantees a session exists), and
	// a session belongs to the plan it was started under, even if you switch
	// plans afterwards.
	// svelte-ignore state_referenced_locally
	const session = data.activeSession!;
	// svelte-ignore state_referenced_locally
	const plan = data.plans.find((p) => p.id === session.plan) ?? data.plans[0];
	const exercises = plan.days[session.day] ?? [];
	const totalSets = exercises.reduce((n, e) => n + e.sets, 0);

	// Client-side state: which exercise is in focus, and the pending set.
	let exI = $state(0);
	let inc = $state(5);
	let flash = $state(false);
	let weight = $state(0);
	let reps = $state(0);

	// Everything logged is $derived from data.events — after each action,
	// use:enhance re-runs the load and these recompute from the new stream.
	let ex = $derived(exercises[exI]);
	let loggedThis = $derived(
		data.events.filter(
			(e): e is SetLogged => e.type === 'SetLogged' && e.data.session === session.id
		)
	);
	let done = $derived(loggedThis.filter((e) => e.data.exercise === ex.name).length);
	let allDone = $derived(loggedThis.length >= totalSets);
	let exDone = $derived(done >= ex.sets);
	let last = $derived(lastEntryFor(data.events, ex.name, session.id));
	let repChoices = $derived([ex.lo, ex.lo + 1, ex.lo + 2, ex.lo + 3, ex.lo + 4]);
	let fmtW = $derived(Number.isInteger(weight) ? String(weight) : weight.toFixed(1));

	function initFor(i: number) {
		const e = exercises[i];
		if (!e) return;
		const prior = loggedThis.filter((s) => s.data.exercise === e.name);
		weight = prior.length
			? prior[prior.length - 1].data.weight
			: suggestedWeight(data.events, e, session.id);
		reps = Math.min(e.lo + 2, e.hi);
	}
	initFor(0);

	function goTo(i: number) {
		if (i < 0 || i >= exercises.length || i === exI) return;
		exI = i;
		initFor(i);
	}

	const bump = (d: number) => (weight = Math.max(0, Math.round((weight + d) * 2) / 2));

	let logFormEl = $state<HTMLFormElement>();
	let finishFormEl = $state<HTMLFormElement>();

	function primaryAction() {
		if (allDone) return finishFormEl?.requestSubmit();
		if (exDone) return goTo(exI + 1);
		logFormEl?.requestSubmit();
	}

	// use:enhance hook: update() refreshes `data` (the stream re-read), THEN
	// we flash, buzz, and auto-advance once the exercise's sets are complete.
	const enhanceLog: SubmitFunction = () =>
		async ({ result, update }) => {
			await update();
			if (result.type === 'success') {
				flash = true;
				setTimeout(() => (flash = false), 160);
				navigator.vibrate?.(12);
				if (done >= ex.sets && exI < exercises.length - 1) setTimeout(() => goTo(exI + 1), 280);
			}
		};

	function onKey(ev: KeyboardEvent) {
		if (ev.key === 'ArrowUp') { bump(inc); ev.preventDefault(); }
		else if (ev.key === 'ArrowDown') { bump(-inc); ev.preventDefault(); }
		else if (ev.key === 'ArrowRight') { goTo(Math.min(exercises.length - 1, exI + 1)); ev.preventDefault(); }
		else if (ev.key === 'ArrowLeft') { goTo(Math.max(0, exI - 1)); ev.preventDefault(); }
		else if (ev.key === 'Enter') { primaryAction(); ev.preventDefault(); }
		else if (ev.key === 'Escape') { goto(`/u/${data.uid}`); }
		else if (/^[1-9]$/.test(ev.key)) reps = parseInt(ev.key, 10);
		else if (ev.key === '0') reps = 10;
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="lg-floor">
	<div class="lg-flash" class:on={flash}></div>
	<div class="lg-inner">
		<div class="lg-top">
			<a class="lg-exit" href={`/u/${data.uid}`} aria-label="Pause and go back">×</a>
			<span class="lg-day">{dayTitle(plan, session.day)}</span>
			<span class="lg-where">Ex {exI + 1} / {exercises.length}</span>
		</div>

		{#if ex}
			<div class="lg-rail" aria-hidden="true">
				{#each Array.from({ length: ex.sets }), i}
					<div class="seg" class:done={i < done} class:now={i === done}></div>
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
							<span><b>All {ex.sets} sets logged</b> · target {ex.lo}–{ex.hi}</span>
						{:else}
							<span>Set <b>{done + 1}</b> of {ex.sets} · target {ex.lo}–{ex.hi} reps</span>
						{/if}
					</div>
					<div class="lg-last">
						{last
							? `LAST  ${last.weight} lb · ${last.reps.join(' · ')} — ${last.dateLabel}`
							: 'First time — starting weight'}
					</div>
				</div>

				<div class="lg-block">
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

					<div class="lg-reps">
						<p class="lg-lbl">Reps{repChoices.indexOf(reps) === -1 ? ` — set to ${reps}` : ''}</p>
						<div class="lg-repgrid" role="group" aria-label="Reps">
							{#each repChoices as n (n)}
								<button type="button" class="lg-rep" aria-pressed={reps === n} onclick={() => (reps = n)}>
									{n}<span class="off">{n === ex.lo ? 'min' : n === ex.hi ? 'max' : ' '}</span>
								</button>
							{/each}
						</div>
						<div class="lg-repextra">
							<button type="button" onclick={() => (reps = Math.max(1, reps - 1))}>− below {ex.lo}</button>
							<button type="button" onclick={() => (reps = reps + 1)}>above {ex.lo + 4} +</button>
						</div>
					</div>
				</div>
			</main>

			<p class="lg-khint">
				<kbd>↑</kbd><kbd>↓</kbd> weight · <kbd>1</kbd>–<kbd>9</kbd> reps · <kbd>←</kbd><kbd>→</kbd>
				exercise · <kbd>Enter</kbd> log set
			</p>
			{#if form?.message}<p class="lg-err">{form.message}</p>{/if}
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

<!-- The actual write: one hidden form per command, POSTing to form actions -->
<form bind:this={logFormEl} method="POST" action="?/logSet" use:enhance={enhanceLog} hidden>
	<input type="hidden" name="session" value={session.id} />
	<input type="hidden" name="plan" value={plan.id} />
	<input type="hidden" name="day" value={session.day} />
	<input type="hidden" name="exercise" value={ex?.name ?? ''} />
	<input type="hidden" name="weight" value={weight} />
	<input type="hidden" name="reps" value={reps} />
	<input type="hidden" name="set" value={done + 1} />
</form>
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
		text-decoration: none;
	}
	.lg-day { font-family: var(--font-body); font-weight: 700; font-size: 13px; letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-2); }
	.lg-where { font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--ink-3); white-space: nowrap; }

	.lg-rail { display: flex; gap: 4px; padding: 4px 16px 10px; }
	.lg-rail .seg { height: 8px; flex: 1; border-radius: 4px; background: var(--paper-3); border: 1px solid var(--paper-3); transition: background var(--dur-med) var(--ease-snap); }
	.lg-rail .seg.done { background: var(--volt); border-color: var(--ink); }
	.lg-rail .seg.now { background: var(--white); border-color: var(--ink); }

	.lg-main { flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 0 16px; overflow-y: auto; }
	.lg-exname { font-family: var(--font-display); font-weight: 900; font-size: clamp(30px, 7vw, 44px); line-height: 1; letter-spacing: var(--tracking-tightish); text-transform: uppercase; }
	.lg-exmeta { display: flex; gap: 10px; align-items: center; margin-top: 6px; flex-wrap: wrap; }
	.lg-tag { font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: var(--ink); background: var(--volt-tint); border: 1px solid var(--ink); border-radius: var(--radius-pill); padding: 3px 10px; }
	.lg-equip { font-size: 13px; color: var(--ink-3); }
	.lg-setline { font-family: var(--font-mono); font-size: 13px; color: var(--ink-2); margin-top: 10px; }
	.lg-setline b { color: var(--ink); background: var(--volt); padding: 0 5px; border-radius: 4px; }
	.lg-last { font-family: var(--font-mono); font-size: 12px; color: var(--ink-3); margin-top: 4px; }

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
	.lg-repgrid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
	.lg-rep {
		font-family: var(--font-mono); font-weight: 800; font-size: 30px; color: var(--ink);
		background: var(--white); border: 2px solid var(--ink); border-radius: var(--radius-lg);
		box-shadow: var(--shadow-raised); min-height: 78px; cursor: pointer; touch-action: manipulation;
	}
	.lg-rep[aria-pressed='true'] { background: var(--volt); box-shadow: var(--shadow-pressed); transform: translateY(2px); }
	.lg-rep .off { display: block; font-family: var(--font-body); font-weight: 700; font-size: 9px; letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-3); margin-top: 2px; }
	.lg-repextra { display: flex; gap: 8px; margin-top: 8px; }
	.lg-repextra button {
		flex: 1; font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--ink-2);
		background: var(--white); border: 2px solid var(--paper-3); border-radius: var(--radius-md); min-height: 44px; cursor: pointer;
	}

	.lg-khint { font-family: var(--font-mono); font-size: 10.5px; color: var(--ink-3); text-align: center; padding: 8px 16px 6px; line-height: 1.7; margin: 0; }
	.lg-khint kbd { background: var(--white); border: 1px solid var(--paper-3); border-radius: 5px; padding: 1px 6px; color: var(--ink); }
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
		.lg-inc button, .lg-repextra button { min-height: 38px; }
		.lg-khint { display: none; }
		.lg-actions { grid-template-columns: 64px 1fr 64px; }
		.lg-nav, .lg-log { min-height: var(--hit-min); }
		.lg-exname { font-size: clamp(24px, 5vh, 36px); }
	}
</style>
