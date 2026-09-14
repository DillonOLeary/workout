<script lang="ts">
	import { page } from '$app/state';
	import Card from '$lib/components/Card.svelte';
	import Chip from '$lib/components/Chip.svelte';
	import ExerciseGlyph from '$lib/components/ExerciseGlyph.svelte';
	import { doseLabel, prepLabel, scheduleLine, turnLabel } from '$lib/domain/labels';
	import { cooldownFor, cycleOf, restFor, routineKeys, routineTitle, warmupFor } from '$lib/domain/plan';
	import { EQUIPMENT, INTENTS } from '$lib/domain/preferences';
	import { estimateMinutes, sessionSteps } from '$lib/domain/steps';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let plan = $derived(data.plans.find((p) => p.id === data.activePlanId) ?? data.plans[0]);
	let keys = $derived(routineKeys(plan));

	// Which routine's exercises are expanded — client state, seeded from
	// ?routine= so Today can link straight to the one that is due
	let picked = $state(page.url.searchParams.get('routine') ?? '');
	let shown = $derived(plan.routines[picked] ? picked : keys[0]);
	let info = $derived(plan.routineInfo[shown]);
	let cycle = $derived(cycleOf(plan, shown));

	// the routine is a list of steps, and its length is honest about all of them
	let warm = $derived(warmupFor(plan, shown));
	let cool = $derived(cooldownFor(plan, shown));
	let rests = $derived([...new Set((plan.routines[shown] ?? []).filter((ex) => ex.kind !== 'run').map((ex) => restFor(plan, ex)))]);
	let len = $derived(estimateMinutes(sessionSteps(plan, { routine: shown })));
	let metaLine = $derived(
		[cycle ? turnLabel(cycle, shown) : null, `About ${len} min`, rests.length ? `rest ${rests.join(' / ')}s between sets` : null]
			.filter(Boolean)
			.join(' · ')
	);

	// what you've said you're after, as one quiet subline under the entry
	let prefLine = $derived.by(() => {
		const p = data.preferences;
		if (!p.intents.length) return '';
		const wants = p.intents.map((i) => INTENTS.find((x) => x.id === i)?.label ?? i).join(', ');
		const has = EQUIPMENT.filter((e) => p.equipment.includes(e.id)).map((e) => e.label.replace(/^A /, '').toLowerCase());
		return `${wants} · ${has.length ? has.join(', ') : 'nothing to hand'}`;
	});
</script>

<div class="col">
	<!-- The plan IS the page: its name is the title, its cadence the line under
	     it. Technique notes live on the gym floor's ⋯ sheet, where the movement
	     is actually happening; the increment column is gone because the rule
	     below states it once. -->
	<div class="titleblock">
		<h1>{plan.name}</h1>
		<div class="activemeta">{scheduleLine(plan)}</div>
	</div>

	<Card pad={false}>
		<div class="dayhead">
			<!-- the chips are the routines, in cycle order -->
			<div class="chips">
				{#each keys as r (r)}
					<Chip selected={shown === r} onclick={() => (picked = r)}>{routineTitle(plan, r)}</Chip>
				{/each}
			</div>
			{#if info?.desc}
				<div class="daydesc">{info.desc}</div>
			{/if}
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
		<!-- The rule belongs INSIDE the plan, under the exercises it governs:
		     the one sentence. The rest of it is on /plan/why. -->
		<div class="rulebox">
			<div class="caps mb8">How it progresses</div>
			<div class="rule">
				Each set climbs on its own. Top of the range on a set → <span class="hl">that set takes the next size up</span> next time; the others keep climbing where they are.
			</div>
		</div>
		<!-- the two rare acts, text-sized, on the card's bottom border row:
		     what you're after (the only place you tell the app about yourself),
		     and the other plans -->
		<div class="bottomrow">
			<a class="textlink" href="/plan/after">
				What I'm after{#if prefLine}<span class="sub">{prefLine}</span>{/if}
			</a>
			<a class="textlink" href="/plan/change">Change plan</a>
		</div>
	</Card>

	<!-- the case for the plans, one tap from the plans themselves -->
	<a class="disclosure" href="/plan/why">
		<span class="tri">▸</span> Why this works
	</a>
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
		font-size: 12px;
		font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.mb8 { margin-bottom: 8px; }
	.rule {
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: 24px;
		line-height: var(--leading-snug);
	}
	.hl { background: var(--volt); padding: 0 6px; }

	.dayhead { padding: 16px 24px 4px; }
	.chips { display: flex; gap: 10px; flex-wrap: wrap; }
	.daydesc { font-size: var(--text-sm); color: var(--ink-3); padding: 12px 2px 0; }
	.daylen { font-family: var(--font-mono); font-size: 12px; color: var(--ink-3); padding: 6px 2px 4px; }
	/* prep rows: the steps around the lifts, in the list but quieter than a lift */
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
		min-width: 0;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 14px;
		padding: 14px 24px;
		border-top: 1px solid var(--border-soft);
	}
	.exrow.first { border-top: none; margin-top: 8px; }
	.exmain { min-width: 0; flex: 1 1 auto; }
	.exname { font-weight: var(--weight-bold); font-size: 17px; }
	.exequip { font-size: 13px; color: var(--ink-3); }
	.exdose { font-family: var(--font-mono); font-size: 13px; color: var(--ink-2); white-space: nowrap; flex: none; }
	/* the rule, as the closing section of the plan card it governs */
	.rulebox { padding: 18px 24px 20px; border-top: var(--border-w) solid var(--ink); background: var(--paper-2); }
	.bottomrow {
		display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;
		padding: 4px 16px; border-top: 1px solid var(--border-soft);
		background: var(--paper-2); border-radius: 0 0 var(--radius-lg) var(--radius-lg);
	}
	.textlink {
		display: inline-flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 8px;
		background: none; border: none; cursor: pointer;
		font-family: var(--font-body); font-size: 12px; font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-3);
		text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--border-soft);
	}
	.textlink:hover { color: var(--ink); background: var(--volt-tint); border-radius: var(--radius-sm); }
	/* the picks, as a subline: sentence case, mono, no underline of its own */
	.sub { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0; text-transform: none; color: var(--ink-2); }

	.disclosure {
		display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 4px;
		font-size: 12px; font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps);
		text-transform: uppercase; color: var(--ink-3); text-decoration: none; border-radius: var(--radius-sm);
	}
	.disclosure:hover { color: var(--ink); background: var(--volt-tint); }
	.tri { font-size: 12px; }
</style>
