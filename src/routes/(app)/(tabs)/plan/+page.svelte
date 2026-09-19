<script lang="ts">
	import { page } from '$app/state';
	import Card from '$lib/components/Card.svelte';
	import ExerciseGlyph from '$lib/components/ExerciseGlyph.svelte';
	import { capitalise, doseLabel, prepLabel, turnLabel, weekHead, weekMeta } from '$lib/domain/labels';
	import { cooldownFor, cycleOf, restFor, routineTitle, warmupFor, type Block, type Cycle } from '$lib/domain/plan';
	import { BLOCKS } from '$lib/domain/plans';
	import { EQUIPMENT, INTENTS } from '$lib/domain/preferences';
	import { nextInCycle, weekProgress } from '$lib/domain/projections';
	import { estimateMinutes, sessionSteps } from '$lib/domain/steps';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const now = Date.now();

	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let lift = $derived(plan.cycles.find((c) => c.id === 'lift') ?? plan.cycles[0]);
	let liftWeek = $derived(weekProgress(data.events, plan, lift, now));
	let nextLift = $derived(nextInCycle(data.events, plan, lift));

	const isOn = (b: Block) => data.blocksOn.includes(b.id);
	let onBlocks = $derived(BLOCKS.filter(isOn));
	let offBlocks = $derived(BLOCKS.filter((b) => !isOn(b)));

	const minutesOf = (r: string) => estimateMinutes(sessionSteps(plan, { routine: r }));
	const cycleMinutes = (c: Cycle) => Math.round(c.routines.reduce((n, r) => n + minutesOf(r), 0) / c.routines.length);
	let weekSessions = $derived(plan.cycles.reduce((n, c) => n + c.target, 0));
	let weekMinutes = $derived(plan.cycles.reduce((n, c) => n + c.target * cycleMinutes(c), 0));
	let weekSpan = $derived.by(() => {
		const d = new Date(now);
		const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
		const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
		const f = (x: Date) => x.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
		return `${f(mon)} – ${f(sun)}`;
	});

	// seeded from ?routine= so Today and the blocks page can link straight to one
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

	// the four rows say their current value — the settings-list idiom, in LEDGER's clothes
	let programmeValue = $derived(`${plan.name} · full-body ${lift.routines.join('/')}`);
	let blocksValue = $derived(onBlocks.length ? onBlocks.map((b) => b.cycle.title).join(' · ') : 'none on');
	let blocksOff = $derived(offBlocks.length ? `· ${offBlocks.map((b) => b.cycle.title).join(', ')} off` : '');
	let afterValue = $derived(
		data.preferences.intents.length ? INTENTS.filter((i) => data.preferences.intents.includes(i.id)).map((i) => i.label).join(' · ') : 'nothing picked · the plan’s own order'
	);
	let gotValue = $derived(
		data.preferences.equipment.length ? capitalise(EQUIPMENT.filter((e) => data.preferences.equipment.includes(e.id)).map((e) => e.needed).join(' · ')) : 'nothing · only the floor deals'
	);
</script>

<div class="col">
	<div class="titleblock">
		<h1>The Plan</h1>
		<div class="activemeta">{weekHead(weekSessions, weekMinutes)}</div>
	</div>

	<section class="sect">
		<div class="sechead">
			<span class="caps">What's the week</span>
			<span class="meta">{weekSpan}</span>
		</div>
		<Card pad={false}>
			<div class="wrow lift">
				<span class="sw ink-lift"></span>
				<span class="rowcaps">
					<span class="rowtitle">{lift.title}</span>
					<span class="rowmeta">· {plan.name} · {lift.target} a week</span>
				</span>
				<span class="dots" aria-label="{liftWeek.done} of {liftWeek.target} this week">
					{#each { length: liftWeek.target } as _, k (k)}<span class="dot" class:done={k < liftWeek.done}></span>{/each}
				</span>
				<div class="rchips">
					{#each lift.routines as r (r)}
						<button type="button" class="rchip" class:next={r === nextLift} class:shown={shown === r} aria-pressed={shown === r} onclick={() => show(r)}>
							{routineTitle(plan, r)}
						</button>
					{/each}
				</div>
			</div>
			{#each onBlocks as b (b.id)}
				{@const c = b.cycle}
				{@const done = weekProgress(data.events, plan, c, now).done}
				{@const own = c.routines.filter((r) => b.routines[r])}
				<div class="wrow">
					<span class="sw ink-{b.routineInfo[own[0]].discipline}"></span>
					<span class="rowcaps">
						<span class="rowtitle">{c.title}</span>
						<span class="rowmeta">· {c.target > 0 ? weekMeta(c.target, done) : `takes ${lift.title}'s ${lift.target} when there's no gym`} · ~{cycleMinutes(c)} min</span>
					</span>
					<span class="sub">
						{#each own as r, k (r)}{#if k}<span class="dotsep"> · </span>{/if}<button type="button" class="rlink" class:shown={shown === r} onclick={() => show(r)}>{routineTitle(plan, r)}</button>{/each}
						{#if c.routines.length > own.length}<span class="dotsep"> · +{c.routines.length - own.length}</span>{/if}
					</span>
				</div>
			{/each}
		</Card>
	</section>

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
				<div class="rulebox">
					<div class="caps mb8">How it progresses</div>
					<div class="rule">
						Each set climbs on its own. Top of the range on a set → <span class="hl">that set takes the next size up</span> next time; the others keep climbing where they are.
					</div>
				</div>
			{/if}
		</Card>
	{/if}

	<section class="sect">
		<div class="sechead">
			<span class="caps">What's yours to change</span>
			<span class="meta">all go in the ledger</span>
		</div>
		<Card pad={false} interactive>
			<a class="crow" href="/plan/programme">
				<span class="crowtext"><span class="crowtitle">Lift programme</span><span class="crowval">{programmeValue}</span></span>
				<span class="chev">›</span>
			</a>
			<a class="crow" href="/plan/blocks">
				<span class="crowtext"><span class="crowtitle">Blocks in the week</span><span class="crowval">{blocksValue} <span class="off">{blocksOff}</span></span></span>
				<span class="chev">›</span>
			</a>
			<a class="crow" href="/plan/after">
				<span class="crowtext"><span class="crowtitle">What I'm after</span><span class="crowval">{afterValue}</span></span>
				<span class="chev">›</span>
			</a>
			<a class="crow" href="/plan/gear">
				<span class="crowtext"><span class="crowtitle">What I've got</span><span class="crowval">{gotValue}</span></span>
				<span class="chev">›</span>
			</a>
			<div class="foot">that's the whole list · sets, reps and exercises are the plan's</div>
		</Card>
	</section>

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
	.caps {
		font-size: 12px; font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps);
		text-transform: uppercase; color: var(--ink-3);
	}
	.mb8 { margin-bottom: 8px; }
	.sect { display: flex; flex-direction: column; gap: 10px; }
	.sechead { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
	.meta { font-family: var(--font-mono); font-size: 11px; color: var(--ink-3); }

	/* the reading list: one row per cycle, nothing to press but a routine's name */
	.wrow {
		display: grid; grid-template-columns: auto 1fr auto; grid-template-areas: 'sw caps dots' '. sub sub';
		column-gap: 10px; row-gap: 6px; align-items: center; padding: 10px 16px; border-top: 1px solid var(--border-soft);
	}
	.wrow:first-child { border-top: none; }
	.wrow.lift { padding-top: 12px; }
	.sw { grid-area: sw; align-self: start; width: 12px; height: 12px; border-radius: 3px; border: 1px solid var(--ink); display: inline-block; margin-top: 5px; }
	.rowcaps { grid-area: caps; min-width: 0; font-size: 15px; font-weight: var(--weight-bold); }
	.rowmeta { font-family: var(--font-mono); font-size: 11px; font-weight: 400; color: var(--ink-3); }
	.dots { grid-area: dots; display: inline-flex; gap: 4px; justify-self: end; }
	.dot { width: 10px; height: 10px; border-radius: 50%; border: 1px solid var(--ink); background: var(--white); }
	.dot.done { background: var(--ink); }
	.rchips { grid-area: sub; display: flex; gap: 6px; flex-wrap: wrap; }
	.rchip {
		min-height: 32px; padding: 0 10px;
		background: var(--white); border: 1px solid var(--border-soft); border-radius: var(--radius-pill);
		font-family: var(--font-body); font-size: 13px; font-weight: var(--weight-bold); color: var(--ink-2); cursor: pointer;
		touch-action: manipulation;
	}
	.rchip:hover { background: var(--volt-tint); color: var(--ink); }
	.rchip.next { background: var(--volt); border-color: var(--ink); color: var(--ink); }
	.rchip.shown { border-color: var(--ink); box-shadow: inset 0 0 0 1px var(--ink); }
	.sub { grid-area: sub; font-size: 13px; color: var(--ink-2); line-height: 1.45; }
	.dotsep { color: var(--ink-3); }
	.rlink {
		background: none; border: none; padding: 0; font: inherit; color: inherit; cursor: pointer;
		text-decoration: underline dotted; text-underline-offset: 3px; text-decoration-color: var(--ink-3);
	}
	.rlink:hover, .rlink.shown { color: var(--ink); text-decoration-color: var(--ink); }
	.rlink.shown { text-decoration-style: solid; }

	/* the settings list: a row says its value and opens the thing */
	.crow {
		display: grid; grid-template-columns: 1fr auto; column-gap: 12px; align-items: center;
		min-height: 50px; padding: 7px 16px; border-top: 1px solid var(--border-soft);
		color: var(--ink); text-decoration: none; transition: background var(--dur-med) var(--ease-snap);
	}
	.crow:first-child { border-top: none; border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
	.crow:hover { background: var(--volt-tint); }
	.crowtext { display: flex; flex-direction: column; min-width: 0; }
	.crowtitle { font-size: 15px; font-weight: var(--weight-bold); }
	.crowval { font-size: 13px; color: var(--ink-2); line-height: 1.4; }
	.crowval .off { color: var(--ink-3); }
	.chev { font-family: var(--font-body); font-weight: var(--weight-bold); font-size: 18px; color: var(--ink-2); }
	.foot {
		padding: 6px 16px; background: var(--paper-2); border-top: 1px solid var(--border-soft);
		border-radius: 0 0 var(--radius-lg) var(--radius-lg);
		font-family: var(--font-mono); font-size: 11px; color: var(--ink-3);
	}

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
