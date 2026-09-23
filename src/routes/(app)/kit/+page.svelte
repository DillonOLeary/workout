<script lang="ts">
	import { Caption, Card, Cell, Note, Primary, Row, SetTable, Sheet, Slot, Stepper, Switch, Title, type SetRow } from '$lib/ui';

	let n = $state(3);
	let on = $state(true);
	let open = $state(false);
	let sheet = $state(false);
	let fixKey = $state<string | null>(null);
	let rows = $derived<SetRow[]>([
		{ key: '1', label: 'Set 1', text: '45 lb × 8', state: fixKey === '1' ? 'fixing' : 'done', right: '✓', fixable: true },
		{ key: '2', label: 'Set 2', text: '45 lb × 8', state: 'now', right: 'now' },
		{ key: '3', label: 'Set 3', text: '45 lb × 6–12', state: 'todo' },
		{ key: '4', label: 'Set 4', text: '45 lb × 8', state: 'saving', right: 'saving…' },
		{ key: '5', label: 'Set 5', text: '45 lb × 8', state: 'failed' },
		{ key: '6', label: 'Set 6', text: '45 lb × 8', state: 'now', right: 'rest 42s', bar: 0.6 },
		{ key: '7', label: 'Step 1', text: '3–5 min easy — bike, row or a brisk walk', state: 'todo', prose: true }
	]);
	const week = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
</script>

<div class="kit">
	<div class="head"><Title>The kit</Title><Note>Twelve parts, every state. Props only, no domain imports. This replaces /glyphs as the place you look.</Note></div>

	<section><Caption>Caption</Caption><div class="rowx"><Caption>Today · Thu 21</Caption><span class="ground now"><Caption tone="slate">In progress · set 4 of 12</Caption></span></div></section>
	<section><Caption>Title</Caption><Title>Hinge &amp; Haul</Title><Title size="md">Goblet Squat</Title><Title size="sm">Programme</Title><Title size="md" caps>Goblet Squat</Title></section>
	<section><Caption>Note</Caption><Note>3 days since Hinge &amp; Haul · 1 of 3 this week</Note><Note size="sm" tone="stone">L lift · Y yoga · S stretch · R run · today outlined</Note><Note onclick={() => (open = !open)}>45 lb · up from 40 · why?</Note>{#if open}<Note tone="ink">Last time set 1 hit 12 — the top of 6–12. So this goes up one rack size.</Note>{/if}</section>

	<section><Caption>Card</Caption>
		<Card><Caption>Due · Lift · 1 of 3 this week</Caption><Title>Hinge &amp; Haul</Title><Note>3 days since Squat &amp; Shove</Note><Primary>Start <small>~48 min</small></Primary></Card>
		<Card tone="now"><Caption tone="slate">In progress · set 4 of 12</Caption><Title>Squat &amp; Shove</Title><Note>next: Chest Press · set 1</Note><Primary>Back to the floor</Primary></Card>
		<Card tone="quiet"><Title size="sm">Hinge &amp; Haul</Title><Note size="sm" tone="stone">6 days ago · 50 min</Note></Card>
		<Card tone="signal" pad={false}><Row label="A row inside a signal card" right="›" /></Card>
	</section>

	<section><Caption>Primary</Caption><Primary>Start <small>~48 min</small></Primary><Primary size="lg">Log set 2</Primary><Primary tone="ink" size="lg">Finish · write it to the ledger</Primary><Primary disabled>Saving…</Primary></section>

	<section><Caption>Row</Caption>
		<div class="col">
			<Row label="Something else" right="2 more ▾" onclick={() => (open = !open)} expanded={open} />
			<Row label="Hips &amp; Hamstrings" sub="Yoga · 0 of 2 this week" right="~30 min ›" tone="now" onclick={() => {}} />
			<Row label="Log a session I already did" right="›" href="/kit" />
			<Row label="No gym? Floor 1 / 2 stand in and count" right="always" />
			<Row label="Bin this session" right="nothing is kept ›" tone="signal" onclick={() => {}} />
			<Row label="Rest between sets"><Stepper value={90} unit="s" size="sm" onstep={(d) => (n += d)} /></Row>
		</div>
	</section>

	<section><Caption>Stepper</Caption><div class="rowx"><Stepper value={n} onstep={(d) => (n += d)} label="sessions" /><Stepper value={90} unit="s" size="sm" onstep={() => {}} /><Stepper value={n} size="pair" onstep={(d) => (n += d)} /><Stepper value={n} disabled onstep={() => {}} /></div>
		<div class="tiles"><div class="tile"><Caption>Reps</Caption><Stepper value={n} size="bare" onstep={(d) => (n += d)} /></div><div class="tile dim"><Caption>Load · lb</Caption><Stepper value={45} size="bare" onstep={() => {}} /></div></div>
	</section>

	<section><Caption>Switch</Caption><div class="rowx"><Switch {on} label="Yoga" onclick={() => (on = !on)} /><Switch on={false} label="Run" /><span class="dimrow"><Switch on={false} label="Run" /> the row dims to 50% when off</span></div></section>

	<section><Caption>Cell</Caption>
		<div class="grid7" role="list">{#each week as w, i (i)}<Cell size="strip" label={i === 1 ? 'L' : i === 3 ? 'YS' : i === 6 ? 'R' : w} done={[1, 3, 6].includes(i)} today={i === 6} />{/each}</div>
		<div class="grid7" role="list">{#each Array.from({ length: 14 }, (_, i) => i) as i (i)}<Cell label={i === 2 ? 'L' : i === 5 ? 'R' : i === 9 ? 'LS' : i > 10 ? '' : '·'} done={[2, 5, 9].includes(i)} today={i === 10} future={i > 10} />{/each}</div>
	</section>

	<section><Caption>Set table</Caption>
		<SetTable {rows} onfix={(k) => (fixKey = k)} onretry={() => {}}>
			{#snippet fixing(r)}<Stepper value={r.text} size="pair" onstep={() => (fixKey = null)} />{/snippet}
		</SetTable>
	</section>

	<section><Caption>Sheet</Caption><Row label="Open the sheet" right="›" onclick={() => (sheet = true)} />
		<Sheet open={sheet} title="Programme" onclose={() => (sheet = false)}><Note>One at a time. Switching keeps every set logged.</Note><Card><Title size="md">Open to Work</Title><Note>Full body, A/B, three a week.</Note></Card><Primary onclick={() => (sheet = false)}>Log it</Primary></Sheet>
	</section>

	<section><Caption>Slot</Caption><div class="rowx"><Slot exercise="Goblet Squat" phase="set" /><Slot exercise="Goblet Squat" phase="ready" /><Slot exercise="Pigeon" phase="still" size={84} /><Slot exercise="Nothing here" size={84} /></div><Note size="sm">92px on the floor, 84px on Done. A still frame of the current rig until rig v2 fills it.</Note></section>
</div>

<style>
	.kit { max-width: 420px; margin: 0 auto; padding: 16px 16px 80px; display: flex; flex-direction: column; gap: 28px; }
	.head, section { display: flex; flex-direction: column; gap: 10px; }
	section { padding-top: 16px; border-top: 1px dashed var(--stone); }
	.rowx { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
	.col { display: flex; flex-direction: column; }
	.ground.now { background: var(--volt-light); padding: 6px 10px; border-radius: 8px; }
	.tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
	.tile { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 6px; background: var(--white); border: 1px solid var(--paper-3); border-radius: 14px; }
	.tile.dim { opacity: 0.35; }
	.dimrow { display: inline-flex; align-items: center; gap: 10px; opacity: 0.5; font-size: 14px; }
	.grid7 { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
</style>
