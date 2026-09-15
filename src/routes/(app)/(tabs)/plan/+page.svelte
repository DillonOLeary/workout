<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import ExerciseGlyph from '$lib/components/ExerciseGlyph.svelte';
	import { doseLabel, prepLabel, standInMeta, turnLabel, weekHead, weekMeta } from '$lib/domain/labels';
	import { cooldownFor, cycleOf, restFor, routineTitle, warmupFor, type Block, type Cycle } from '$lib/domain/plan';
	import { BLOCKS } from '$lib/domain/plans';
	import { EQUIPMENT, INTENTS, MAX_INTENTS, samePreferences, type Equipment, type Intent, type Preferences } from '$lib/domain/preferences';
	import { nextInCycle, queue, weekProgress } from '$lib/domain/projections';
	import { estimateMinutes, sessionSteps } from '$lib/domain/steps';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const now = Date.now();

	/**
	 * Tab 3 is the week: one lift programme, and the blocks that are on. The
	 * programme is the one real choice (a page of its own, /plan/programme);
	 * a block is a switch, right here, and a switch is an event. Cadence is
	 * the plan's — there is no dial, because a target is a training decision
	 * and a dial would be a second source of truth. What you're after tilts
	 * the order Today deals in; it lives on this page too, since it is the
	 * only other thing you ever tell the app about yourself.
	 */
	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let lift = $derived(plan.cycles.find((c) => c.id === 'lift') ?? plan.cycles[0]);
	let liftWeek = $derived(weekProgress(data.events, plan, lift, now));
	let nextLift = $derived(nextInCycle(data.events, plan, lift));

	// every block has a switch; the on ones first
	const isOn = (b: Block) => data.blocksOn.includes(b.id);
	let onBlocks = $derived(BLOCKS.filter(isOn));
	let offBlocks = $derived(BLOCKS.filter((b) => !isOn(b)));
	// the floor: the block that stands in for the lift when the gym is ruled out
	let floor = $derived(BLOCKS.find((b) => b.cycle.standsInFor === lift.id));

	// what a routine takes, and what a cycle averages
	const minutesOf = (r: string) => estimateMinutes(sessionSteps(plan, { routine: r }));
	const cycleMinutes = (c: Cycle) => Math.round(c.routines.reduce((n, r) => n + minutesOf(r), 0) / c.routines.length);
	// the head: what the week comes to — every on cycle's target, at its routines' average length
	let weekSessions = $derived(plan.cycles.reduce((n, c) => n + c.target, 0));
	let weekMinutes = $derived(plan.cycles.reduce((n, c) => n + c.target * cycleMinutes(c), 0));
	// this week, Monday to Sunday, as the section head says it
	let weekSpan = $derived.by(() => {
		const d = new Date(now);
		const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
		const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
		const f = (x: Date) => x.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
		return `${f(mon)} – ${f(sun)}`;
	});

	// Which routine's exercises are shown under the week — client state,
	// seeded from ?routine= so Today can link straight to the one that is due
	let picked = $state(page.url.searchParams.get('routine') ?? '');
	let shown = $derived(plan.routines[picked] ? picked : '');
	let info = $derived(shown ? plan.routineInfo[shown] : undefined);
	let cycle = $derived(shown ? cycleOf(plan, shown) : undefined);
	let warm = $derived(shown ? warmupFor(plan, shown) : []);
	let cool = $derived(shown ? cooldownFor(plan, shown) : []);
	let rests = $derived([...new Set((plan.routines[shown] ?? []).filter((ex) => ex.kind !== 'run').map((ex) => restFor(plan, ex)))]);
	let metaLine = $derived(
		[cycle ? turnLabel(cycle, shown) : null, shown ? `About ${minutesOf(shown)} min` : null, rests.length ? `rest ${rests.join(' / ')}s between sets` : null]
			.filter(Boolean)
			.join(' · ')
	);
	const show = (r: string) => (picked = picked === r ? '' : r);

	/* ---------- what I'm after: two menus, saved as one snapshot ---------- */
	// svelte-ignore state_referenced_locally
	let intents = $state<Intent[]>([...data.preferences.intents]);
	// svelte-ignore state_referenced_locally
	let equipment = $state<Equipment[]>([...data.preferences.equipment]);
	let full = $derived(intents.length >= MAX_INTENTS);
	function toggleIntent(id: Intent) {
		if (intents.includes(id)) intents = intents.filter((x) => x !== id);
		else if (!full) intents = [...intents, id]; // the fourth tap is refused
	}
	function toggleGear(id: Equipment) {
		equipment = equipment.includes(id) ? equipment.filter((x) => x !== id) : [...equipment, id];
	}
	let draft = $derived<Preferences>({ intents, equipment });
	let changed = $derived(!samePreferences(draft, data.preferences));
	// what Today would lead with, from the same fold Today runs
	let first = $derived(queue(data.events, plan, draft, now)[0]);
	let preview = $derived(
		!first ? '' : first.out ? 'Nothing you can do with what you have — check the gear.' : `Today leads with ${first.title} · ${first.why}`
	);
</script>

<div class="col">
	<div class="titleblock">
		<h1>The Plan</h1>
		<div class="activemeta">{weekHead(weekSessions, weekMinutes)} · the plan sets each cadence</div>
	</div>

	{#if form?.message}<p class="err">{form.message}</p>{/if}

	<!-- a block: what it is, what it holds, and its switch -->
		{#snippet blockRow(b: Block, on: boolean)}
			{@const c = b.cycle}
			{@const done = weekProgress(data.events, plan, c, now).done}
			<!-- the routines the block owns; a borrowed one (the floor's yoga) is a count -->
			{@const own = c.routines.filter((r) => b.routines[r])}
			{@const standIn = c.standsInFor ? plan.cycles.find((x) => x.id === c.standsInFor) : undefined}
			<div class="blockrow" class:off={!on}>
				<span class="sw ink-{b.routineInfo[own[0]].discipline}"></span>
				<div class="rowcaps">
					<span class="rowtitle">{c.title}</span>
					<span class="rowmeta">{c.target > 0 ? weekMeta(c.target, done) : standInMeta(standIn?.title ?? lift.title, standIn?.target ?? lift.target)}</span>
				</div>
				<span class="sub">
					{#each own as r, k (r)}{#if k}<span class="dotsep"> · </span>{/if}<button type="button" class="rlink" onclick={() => show(r)}>{routineTitle(plan, r)}</button>{/each}
					{#if c.routines.length > own.length}<span class="dotsep"> · +{c.routines.length - own.length}</span>{/if}
					<span class="dotsep"> · ~{cycleMinutes(c)} min</span>
				</span>
				<form method="POST" action="?/toggle" use:enhance class="togform">
					<input type="hidden" name="block" value={b.id} />
					<input type="hidden" name="on" value={String(!on)} />
					<button type="submit" class="tog" role="switch" aria-checked={on} aria-label="{b.cycle.title} {on ? 'on' : 'off'}">
						<span class="knob"></span>
					</button>
				</form>
			</div>
		{/snippet}

	<!-- the week: the lift row, then a row per block with its switch -->
	<section class="sect">
		<div class="sechead">
			<span class="caps">The week</span>
			<span class="meta">{weekSpan}</span>
		</div>
		<Card pad={false}>
			<div class="liftrow">
				<span class="sw ink-lift"></span>
				<div class="rowcaps">
					<span class="rowtitle">{lift.title}</span>
					<span class="rowmeta">{weekMeta(liftWeek.target, liftWeek.done)}</span>
				</div>
				<span class="dots" aria-label="{liftWeek.done} of {liftWeek.target} this week">
					{#each { length: liftWeek.target } as _, k (k)}<span class="dot" class:done={k < liftWeek.done}></span>{/each}
				</span>
				<span class="progname">{plan.name}</span>
				<a class="change" href="/plan/programme">Change ▸</a>
				<div class="rchips">
					{#each lift.routines as r (r)}
						<button type="button" class="rchip" class:next={r === nextLift} class:shown={shown === r} aria-pressed={shown === r} onclick={() => show(r)}>
							{routineTitle(plan, r)}
						</button>
					{/each}
				</div>
			</div>


			{#each onBlocks as b (b.id)}{@render blockRow(b, true)}{/each}

			{#if offBlocks.length}
				<div class="divider">
					<span class="caps">Not in your week</span>
					<span class="meta">switch one on and Today deals it</span>
				</div>
				{#each offBlocks as b (b.id)}{@render blockRow(b, false)}{/each}
			{/if}
			<div class="foot">a switch is an event · the ledger shows when the week changed</div>
		</Card>
	</section>

	<!-- a routine, opened from a chip: its steps, and the rule that governs them -->
	{#if shown && info}
		<Card pad={false}>
			<div class="dayhead">
				<div class="daytitle">{info.title}</div>
				{#if info.desc}<div class="daydesc">{info.desc}</div>{/if}
				<div class="daylen">{metaLine}</div>
			</div>
			{#if warm.length}
				<div class="preprow first">
					<span class="prepcaps">Warm-up</span>
					<span class="preptext">{warm.map(prepLabel).join(' · ')}</span>
				</div>
			{/if}
			{#each plan.routines[shown] as ex, i (ex.name)}
				<div class="exrow" class:first={i === 0 && !warm.length}>
					<!-- still (frame 0): a list must never animate itself. Press one
					     to see the rep; a hold breathes only on the floor. -->
					<ExerciseGlyph name={ex.name} size={48} play={false} />
					<div class="exmain">
						<div class="exname">{ex.name}</div>
						<div class="exequip">
							{ex.equip}{ex.kind === 'load' && ex.progress.each ? ' · weight is per hand' : ''}{ex.progress.of === 'variant' ? ` · ${ex.progress.ladder.join(' → ')}` : ''}
						</div>
					</div>
					<span class="exdose">{doseLabel(ex)}</span>
				</div>
			{/each}
			{#if cool.length}
				<div class="preprow">
					<span class="prepcaps">Cooldown</span>
					<span class="preptext">{cool.map(prepLabel).join(' · ')}</span>
				</div>
			{/if}
			{#if info.discipline === 'lift'}
				<!-- The rule belongs INSIDE the routine, under the exercises it governs:
				     the one sentence. The rest of it is on /plan/why. -->
				<div class="rulebox">
					<div class="caps mb8">How it progresses</div>
					<div class="rule">
						Each set climbs on its own. Top of the range on a set → <span class="hl">that set takes the next size up</span> next time; the others keep climbing where they are.
					</div>
				</div>
			{/if}
		</Card>
	{/if}

	<!-- what you're after: the only place you tell the app about yourself -->
	<section class="sect">
		<div class="sechead">
			<span class="caps">What I'm after</span>
			<span class="meta">tilts the order · pick up to {MAX_INTENTS}</span>
		</div>
		<Card>
			<form method="POST" action="?/save" use:enhance class="prefs">
				<div class="pills">
					{#each INTENTS as it (it.id)}
						{@const on = intents.includes(it.id)}
						<button type="button" class="pick" class:on class:dim={full && !on} aria-pressed={on} onclick={() => toggleIntent(it.id)}>{it.label}</button>
					{/each}
				</div>
				<div class="sechead inner">
					<span class="caps">I've got</span>
					<span class="meta">{floor && isOn(floor) ? `no gym → the ${floor.cycle.title} block deals` : `no gym → nothing stands in for the lift · switch ${floor?.cycle.title ?? 'No gym'} on`}</span>
				</div>
				<div class="pills">
					{#each EQUIPMENT as g (g.id)}
						{@const on = equipment.includes(g.id)}
						<button type="button" class="pick" class:on aria-pressed={on} onclick={() => toggleGear(g.id)}>{g.label}</button>
					{/each}
				</div>
				<div class="previewrow">
					<span class="preview">{preview}</span>
					{#if changed}
						<input type="hidden" name="intents" value={JSON.stringify(intents)} />
						<input type="hidden" name="equipment" value={JSON.stringify(equipment)} />
						<Button variant="accent" type="submit" disabled={!intents.length}>Save</Button>
					{/if}
				</div>
			</form>
		</Card>
	</section>

	<!-- the case for the plan, and the two rarest acts -->
	<div class="rare">
		<a class="disclosure" href="/plan/why"><span class="tri">▸</span> Why this works</a>
		<span class="rarelinks">
			<a class="textlink" href="/export" download="training-ledger-events.json">Export</a>
			<form method="POST" action="/logout"><button type="submit" class="textlink">Sign out</button></form>
		</span>
	</div>
</div>

<style>
	.col { display: flex; flex-direction: column; gap: 20px; }
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: var(--text-display);
		line-height: var(--leading-tight);
	}
	.titleblock { display: flex; flex-direction: column; gap: 4px; }
	.activemeta { font-family: var(--font-mono); font-size: 12.5px; color: var(--ink-3); }
	.err { margin: 0; color: var(--danger); font-weight: var(--weight-bold); font-size: var(--text-sm); }
	.caps {
		font-size: 12px; font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps);
		text-transform: uppercase; color: var(--ink-3);
	}
	.mb8 { margin-bottom: 8px; }
	.sect { display: flex; flex-direction: column; gap: 10px; }
	.sechead { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
	.sechead.inner { margin-top: 14px; }
	.meta { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); }

	/* one ink per discipline: the swatch is the calendar's stripe, 12px */
	.sw { width: 12px; height: 12px; border-radius: 3px; border: 1px solid var(--ink); display: inline-block; margin-top: 4px; }
	.rowcaps { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; min-width: 0; }
	.rowtitle { font-size: 16px; font-weight: var(--weight-bold); }
	.rowmeta { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); }

	/* the lift row: the programme is the name, the routines are chips */
	.liftrow {
		display: grid; grid-template-columns: auto 1fr auto; grid-template-areas: 'sw caps dots' '. name change' '. sub sub';
		column-gap: 10px; row-gap: 6px; align-items: center; padding: 14px 16px;
	}
	.liftrow .sw { grid-area: sw; align-self: start; }
	.liftrow .rowcaps { grid-area: caps; }
	.dots { grid-area: dots; display: inline-flex; gap: 4px; justify-self: end; }
	.dot { width: 10px; height: 10px; border-radius: 50%; border: 1px solid var(--ink); background: var(--white); }
	.dot.done { background: var(--ink); }
	.progname { grid-area: name; font-family: var(--font-display); font-weight: var(--weight-black); font-size: 22px; line-height: 1.1; }
	.change {
		grid-area: change; justify-self: end;
		display: inline-flex; align-items: center; min-height: 36px; padding: 0 12px;
		background: var(--white); border: 1px solid var(--ink); border-radius: var(--radius-pill);
		font-size: 12px; font-weight: var(--weight-bold); color: var(--ink); text-decoration: none;
	}
	.change:hover { background: var(--volt-tint); }
	.rchips { grid-area: sub; display: flex; gap: 6px; flex-wrap: wrap; }
	.rchip {
		min-height: 32px; padding: 0 10px;
		background: var(--white); border: 1px solid var(--border-soft); border-radius: var(--radius-pill);
		font-family: var(--font-body); font-size: 13px; font-weight: var(--weight-bold); color: var(--ink-2); cursor: pointer;
		touch-action: manipulation;
	}
	.rchip:hover { background: var(--volt-tint); color: var(--ink); }
	/* the one Today deals next wears volt; the one open under the card wears the ink border */
	.rchip.next { background: var(--volt); border-color: var(--ink); color: var(--ink); }
	.rchip.shown { border-color: var(--ink); box-shadow: inset 0 0 0 1px var(--ink); }

	/* a block: what it is, what it holds, and its switch */
	.blockrow {
		display: grid; grid-template-columns: auto 1fr auto; grid-template-areas: 'sw title tog' '. sub tog';
		column-gap: 10px; row-gap: 2px; align-items: center; padding: 12px 16px; border-top: 1px solid var(--border-soft);
	}
	.blockrow .sw { grid-area: sw; align-self: start; }
	.blockrow .rowcaps { grid-area: title; }
	.blockrow.off { opacity: 0.7; }
	.sub { grid-area: sub; font-size: 13px; color: var(--ink-2); line-height: 1.45; }
	.dotsep { color: var(--ink-3); }
	.rlink {
		background: none; border: none; padding: 0; font: inherit; color: inherit; cursor: pointer;
		text-decoration: underline dotted; text-underline-offset: 3px; text-decoration-color: var(--ink-3);
	}
	.rlink:hover { color: var(--ink); text-decoration-color: var(--ink); }
	.togform { grid-area: tog; align-self: center; }
	/* the switch: 48×28, a knob that slides 20px — on is volt, off is white */
	.tog {
		position: relative; width: 48px; height: 28px; padding: 0;
		background: var(--white); border: var(--border-w) solid var(--ink); border-radius: var(--radius-pill);
		cursor: pointer; touch-action: manipulation;
		transition: background var(--dur-med) var(--ease-snap);
	}
	.tog[aria-checked='true'] { background: var(--volt); }
	.knob {
		position: absolute; top: 2px; left: 2px; width: 20px; height: 20px;
		background: var(--ink); border-radius: 50%;
		transition: left var(--dur-med) var(--ease-snap);
	}
	.tog[aria-checked='true'] .knob { left: 22px; }
	.divider {
		display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap;
		padding: 10px 16px 6px; border-top: 1px solid var(--border-soft);
	}
	.foot {
		padding: 8px 16px; background: var(--paper-2); border-top: 1px solid var(--border-soft);
		border-radius: 0 0 var(--radius-lg) var(--radius-lg);
		font-family: var(--font-mono); font-size: 11px; color: var(--ink-3);
	}

	/* the routine, opened: the same list the floor walks */
	.dayhead { padding: 16px 24px 4px; }
	.daytitle { font-family: var(--font-display); font-weight: var(--weight-black); font-size: 22px; line-height: 1.1; }
	.daydesc { font-size: var(--text-sm); color: var(--ink-3); padding: 8px 2px 0; }
	.daylen { font-family: var(--font-mono); font-size: 12px; color: var(--ink-3); padding: 6px 2px 4px; }
	.preprow {
		display: flex; flex-direction: column; gap: 2px;
		padding: 12px 24px; border-top: 1px solid var(--border-soft);
	}
	.preprow.first { border-top: none; margin-top: 8px; }
	.prepcaps {
		font-family: var(--font-mono); font-size: 11px; font-weight: 700;
		letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-3);
	}
	.preptext { font-size: 13px; color: var(--ink-2); line-height: 1.45; }
	.exrow {
		min-width: 0; display: flex; justify-content: space-between; align-items: center; gap: 14px;
		padding: 14px 24px; border-top: 1px solid var(--border-soft);
	}
	.exrow.first { border-top: none; margin-top: 8px; }
	.exmain { min-width: 0; flex: 1 1 auto; }
	.exname { font-weight: var(--weight-bold); font-size: 17px; }
	.exequip { font-size: 13px; color: var(--ink-3); }
	.exdose { font-family: var(--font-mono); font-size: 13px; color: var(--ink-2); white-space: nowrap; flex: none; }
	.rulebox {
		padding: 18px 24px 20px; border-top: var(--border-w) solid var(--ink); background: var(--paper-2);
		border-radius: 0 0 var(--radius-lg) var(--radius-lg);
	}
	.rule { font-family: var(--font-display); font-weight: var(--weight-black); font-size: 24px; line-height: var(--leading-snug); }
	.hl { background: var(--volt); padding: 0 6px; }

	/* what I'm after: pills, ink when on */
	.prefs { display: flex; flex-direction: column; gap: 8px; }
	.pills { display: flex; gap: 8px; flex-wrap: wrap; }
	.pick {
		min-height: 44px; padding: 0 16px;
		background: var(--white); color: var(--ink);
		border: var(--border-w) solid var(--border-soft); border-radius: var(--radius-pill);
		font-family: var(--font-body); font-weight: var(--weight-bold); font-size: 15px; cursor: pointer; touch-action: manipulation;
		transition: background var(--dur-med) var(--ease-snap), color var(--dur-med) var(--ease-snap);
	}
	.pick:hover { background: var(--volt-tint); }
	.pick.on { background: var(--ink); color: var(--paper); border-color: var(--ink); }
	.pick.dim { color: var(--ink-3); cursor: default; }
	.pick.dim:hover { background: var(--white); }
	.previewrow {
		display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
		margin-top: 12px; padding: 10px 12px; background: var(--paper-2); border-radius: var(--radius-md);
	}
	.preview { flex: 1 1 200px; font-family: var(--font-mono); font-size: 13px; line-height: 1.45; color: var(--ink); }

	.rare { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
	.rarelinks { display: flex; align-items: center; gap: 4px; }
	.disclosure, .textlink {
		display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 4px;
		background: none; border: none; cursor: pointer;
		font-family: var(--font-body); font-size: 12px; font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps);
		text-transform: uppercase; color: var(--ink-3); text-decoration: none; border-radius: var(--radius-sm);
	}
	.textlink { text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--border-soft); }
	.disclosure:hover, .textlink:hover { color: var(--ink); background: var(--volt-tint); }
	.tri { font-size: 12px; }
</style>
