<script lang="ts">
	import Badge from '$lib/components/Badge.svelte';
	import Card from '$lib/components/Card.svelte';

	/**
	 * The case for the plans, on the same screen as the plans. Static content
	 * on purpose — no load(), nothing derived from events. Every claim carries
	 * a numbered reference; the reference list at the bottom is the point of
	 * the page, not decoration.
	 */
	const refs = [
		{
			n: 1,
			text: 'Phillips SM, Currier BS, D’Souza AC, et al. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews. Medicine & Science in Sports & Exercise, April 2026. ACSM Position Stand — 137 systematic reviews, >30,000 participants.',
			url: 'https://acsm.org/science-spotlight-acsm-releases-new-position-stand-on-resistance-training/'
		},
		{
			n: 2,
			text: 'Bull FC, Al-Ansari SS, Biddle S, et al. World Health Organization 2020 guidelines on physical activity and sedentary behaviour. British Journal of Sports Medicine, 2020.',
			url: 'https://pubmed.ncbi.nlm.nih.gov/33239350/'
		},
		{
			n: 3,
			text: 'Momma H, Kawakami R, Honda T, Sawada SS. Muscle-strengthening activities are associated with lower risk and mortality in major non-communicable diseases. British Journal of Sports Medicine, 2022;56(13):755–763.',
			url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9209691/'
		},
		{
			n: 4,
			text: 'Schoenfeld BJ, Ogborn D, Krieger JW. Dose-response relationship between weekly resistance training volume and increases in muscle mass. Journal of Sports Sciences, 2017;35(11):1073–1082.',
			url: 'https://www.tandfonline.com/doi/full/10.1080/02640414.2016.1210197'
		},
		{
			n: 5,
			text: 'Schoenfeld BJ, Ogborn D, Krieger JW. Effects of Resistance Training Frequency on Measures of Muscle Hypertrophy: A Systematic Review and Meta-Analysis. Sports Medicine, 2016.',
			url: 'https://pubmed.ncbi.nlm.nih.gov/27102172/'
		},
		{
			n: 6,
			text: 'Schoenfeld BJ, Grgic J, Ogborn D, Krieger JW. Strength and Hypertrophy Adaptations Between Low- vs. High-Load Resistance Training. Journal of Strength and Conditioning Research, 2017.',
			url: 'https://pubmed.ncbi.nlm.nih.gov/28834797/'
		},
		{
			n: 7,
			text: 'Refalo MC, Helms ER, Trexler ET, Hamilton DL, Fyfe JJ. Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy. Sports Medicine, 2023.',
			url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9935748/'
		},
		{
			n: 8,
			text: 'Haugen ME, Vårvik FT, Larsen S, et al. Effect of free-weight vs. machine-based strength training on maximal strength, hypertrophy and jump performance. BMC Sports Science, Medicine and Rehabilitation, 2023.',
			url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10426227/'
		},
		{
			n: 9,
			text: 'Wolf M, Androulakis-Korakakis P, Fisher J, Schoenfeld B, Steele J. Partial Vs Full Range of Motion Resistance Training: A Systematic Review and Meta-Analysis. International Journal of Strength and Conditioning, 2023.',
			url: 'https://journal.iusca.org/index.php/Journal/article/view/182'
		},
		{
			n: 10,
			text: 'Singer A, Wolf M, Generoso L, et al. Give it a rest: a systematic review with Bayesian meta-analysis on the effect of inter-set rest interval duration on muscle hypertrophy. Frontiers in Sports and Active Living, 2024.',
			url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11349676/'
		},
		{
			n: 11,
			text: 'Schoenfeld BJ, Contreras B. Is Postexercise Muscle Soreness a Valid Indicator of Muscular Adaptations? Strength and Conditioning Journal, 2013;35(5):16–21.',
			url: 'https://journals.lww.com/nsca-scj/fulltext/2013/10000/is_postexercise_muscle_soreness_a_valid_indicator.2.aspx'
		},
		{
			n: 12,
			text: 'American College of Sports Medicine. Progression Models in Resistance Training for Healthy Adults (Position Stand). Medicine & Science in Sports & Exercise, 2009;41(3):687–708.',
			url: 'https://pubmed.ncbi.nlm.nih.gov/19204579/'
		},
		{
			n: 13,
			text: 'Sivaramakrishnan D, Fitzsimons C, Kelly P, et al. The effects of yoga compared to active and inactive controls on physical function and health related quality of life in older adults. International Journal of Behavioral Nutrition and Physical Activity, 2019.',
			url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6451238/'
		}
	];

	const fundamentals = [
		{
			t: 'The reason to lift isn’t aesthetic',
			body: 'Muscle-strengthening activity is linked to 10–17% lower risk of all-cause mortality, cardiovascular disease, cancer and diabetes — independently of aerobic exercise. The benefit shows up at 30–60 minutes a week, and the curve is J-shaped: past about an hour a week there’s no conclusive further gain.',
			punch: 'Two or three sessions isn’t a down-payment on a real program. It is the program.',
			cite: [3, 2]
		},
		{
			t: 'Progressive overload is the whole engine',
			body: 'The body adapts to a stress slightly beyond what it currently handles, so the stress has to keep rising. The practical form here is double progression: keep the weight, add reps to the top of the range on every set, then take the next size up and start again at the bottom. That’s literal — free weights come in fixed sizes, so the ledger steps along the real ladder (dumbbells 2.5 lb through the light end then 5, kettlebells on the kg castings, med balls in 2s). Machines keep a per-exercise increment, because stacks differ too much between gyms to guess at.',
			punch: 'It’s self-limiting — you can’t add weight until you’ve earned it. That’s what makes it safe.',
			cite: [12]
		},
		{
			t: 'Effort matters more than load',
			body: 'Muscle growth is similar across loads from roughly 30% to 100% of your one-rep max, as long as each set is taken close to failure. Maximal strength does favour heavy loads — but for muscle and health there is no magic rep range.',
			punch: '8–15 reps with a moderate dumbbell isn’t a lesser version of heavy lifting. The curve is nearly flat.',
			cite: [6, 1]
		},
		{
			t: 'You don’t need to train to failure',
			body: 'Going to momentary failure gives no meaningful advantage over stopping 1–3 reps short, for strength, size or power. It just costs more fatigue and more risk.',
			punch: 'The last rep should be hard but clean. If your form breaks, that rep subtracted.',
			cite: [1, 7]
		},
		{
			t: 'About 10 hard sets per muscle per week — for growth',
			body: 'There’s a graded dose-response between weekly sets and muscle growth, and the 2026 ACSM position stand converges on ~10 sets per muscle per week for hypertrophy. Read the number carefully: that’s a growth threshold, not a health threshold.',
			punch: 'Under 10 isn’t a failed program. It’s a program aimed at something else.',
			cite: [4, 1]
		},
		{
			t: 'Spread the work over two sessions',
			body: 'With weekly volume held equal, training a muscle twice a week beats training it once.',
			punch: 'Two moderate sessions beat one punishing one.',
			cite: [5]
		},
		{
			t: 'Machines aren’t cheating',
			body: 'Free weights and machines show no detectable difference in strength or hypertrophy outcomes. Choose for consistency and for what doesn’t hurt.',
			punch: 'A machine you use beats a barbell you avoid.',
			cite: [8]
		},
		{
			t: 'Soreness is not the scoreboard',
			body: 'Post-exercise soreness isn’t a valid indicator of adaptation — it tracks novelty, connective tissue and personal pain sensitivity, not growth. Separately: rest more than 60s between sets, though past ~90s adds little; and full range of motion beats partial, but only trivially — what matters is loading the muscle at long lengths.',
			punch: 'Not being sore doesn’t mean it didn’t work.',
			cite: [11, 10, 9]
		}
	];

	// Stated last on purpose: it reframes the eight above as refinements.
	const headline = {
		t: 'And the thing the 2026 stand leads with',
		body:
			'The ACSM’s own summary of 137 reviews is that the largest gain by far is going from no resistance training to any resistance training — bands, bodyweight and home routines all produce marked improvements. Training to failure, equipment choice and periodisation “did not consistently impact outcomes” for the average healthy adult, and rigid prescriptions are no longer supported.',
		punch: 'The eight above are refinements, not entry requirements. The plan you’ll repeat beats the optimal one you won’t.',
		cite: [1]
	};
</script>

<div class="col">
	<div class="head">
		<h1>Why this works</h1>
		<a class="back" href="/plan">← The Plan</a>
	</div>

	<Card>
		<p class="lede">
			A sourced case for these three plans, and enough of the fundamentals to judge them
			yourself instead of taking anyone’s word for it. Where the evidence is strong, this says
			so. Where a plan has a real weakness, it says that too.
		</p>
		<p class="lede quiet">A case you can’t check isn’t a case — so every claim is numbered.</p>
	</Card>

	<section>
		<div class="caps mb8">Part 1 — Eight fundamentals</div>
		<div class="stack">
			{#each fundamentals as f, i (f.t)}
				<Card>
					<div class="fnum">{i + 1}</div>
					<h2>{f.t}</h2>
					<p>{f.body}</p>
					<p class="punch">{f.punch}</p>
					<div class="cites">
						{#each f.cite as c (c)}
							<a href="#ref-{c}" class="cite">[{c}]</a>
						{/each}
					</div>
				</Card>
			{/each}
			<Card>
				<div class="fnum">+</div>
				<h2>{headline.t}</h2>
				<p>{headline.body}</p>
				<p class="punch">{headline.punch}</p>
				<div class="cites">
					{#each headline.cite as c (c)}<a href="#ref-{c}" class="cite">[{c}]</a>{/each}
				</div>
			</Card>
		</div>
	</section>

	<section>
		<div class="caps mb8">Part 2 — The plans, one at a time</div>
		<div class="stack">
			<Card>
				<h2>Open to Work</h2>
				<div class="badges"><Badge tone="neutral">Lift Mon / Wed / Fri</Badge><Badge tone="neutral">Run 3×/week</Badge></div>
				<p>
					All six fundamental movement patterns every week, with push and pull balanced 1:1 in
					both planes — the single most common thing amateur programs get wrong, and it’s right
					here. Core is covered on both days, in two different vectors.
				</p>
				<div class="tablewrap">
					<table>
						<thead><tr><th>Muscle group</th><th>Sets/week</th><th>vs. growth mark <a href="#ref-1" class="cite">[1]</a></th></tr></thead>
						<tbody>
							<tr><td>Hamstrings / glutes</td><td>~13</td><td>above</td></tr>
							<tr><td>Back</td><td>~9</td><td>at the mark</td></tr>
							<tr><td>Quads</td><td>~9</td><td>at the mark</td></tr>
							<tr><td>Core</td><td>~7.5</td><td>near</td></tr>
							<tr><td>Chest</td><td>~4.5</td><td class="warn">below</td></tr>
							<tr><td>Shoulders</td><td>~4.5</td><td class="warn">below</td></tr>
						</tbody>
					</table>
				</div>
				<p>
					So lower body and back are dosed for growth; <b>chest and shoulders are dosed for
					strength and maintenance, not size</b>. If visible upper-body change is a goal, add a
					second pressing movement or a fourth set. If it isn’t, this is fine as written.
				</p>
				<p>
					90 min of running a week sits inside the WHO’s 75–150 min vigorous band, and the
					lifting covers the ≥2 muscle-strengthening days <a href="#ref-2" class="cite">[2]</a>.
				</p>
				<p class="verdict">
					<b>Verdict: sound.</b> Watch one thing — there’s a hinge in every session (RDL on A, KB
					deadlift on B) on top of three runs. Harmless now; it becomes the recovery bottleneck
					as the weights climb.
				</p>
			</Card>

			<Card>
				<h2>Full Range of Motion</h2>
				<div class="badges"><Badge tone="neutral">Lift 2–3×/week</Badge><Badge tone="neutral">Guided runs 1–2×/week</Badge></div>
				<p>
					Patterns are complete: squat, hinge, hip extension, lunge, both pushes, both pulls, and
					core on both days. Light dumbbells are where a fixed “+5 lb” hurts most — from 15 lb
					that’s a <b>33% jump</b>, enough to drop you out of the rep range in one go. Stepping
					along real rack sizes instead (15 → 17.5 → 20 → 22.5) keeps each level-up to 11–17%,
					and the wide 8–15 range absorbs what’s left.
				</p>
				<p>
					The deep-ROM premise holds up, modestly. Full range beats partial range, but by a
					trivial-to-small margin; most of the effect comes from loading at <b>long muscle
					lengths</b> <a href="#ref-9" class="cite">[9]</a> — which deep squats, RDLs and a deep
					press do by design. Sound logic; just don’t expect ROM alone to be the difference-maker.
				</p>
				<p class="caveat">
					<b>Caveat 1 — this is a health-and-strength dose, not a growth dose.</b> At 2–3 sessions
					a week across two days, most muscles get roughly 4–8 sets weekly, under the ~10-set mark
					for hypertrophy <a href="#ref-1" class="cite">[1]</a>. It clears the mortality-benefit
					window <a href="#ref-3" class="cite">[3]</a> comfortably. Both are true at once.
				</p>
				<p class="caveat">
					<b>Caveat 2 — the 60 min/week run target is under the WHO vigorous floor of 75 min</b>
					<a href="#ref-2" class="cite">[2]</a>. Either nudge it to 75, or make up the difference
					with moderate activity; brisk walking counts, and the guideline explicitly allows
					combining the two.
				</p>
				<p class="verdict">
					<b>Verdict: sound, with the volume caveat stated.</b> It had no core work at all on
					either day — Dead Bug and Side Plank now close that.
				</p>
			</Card>

			<Card>
				<h2>Hold Steady</h2>
				<div class="badges"><Badge tone="neutral">Flow 2–3×/week</Badge><Badge tone="neutral">Mat only</Badge></div>
				<p>
					Day 1 (chair, warrior II, plank, boat, bridge) is genuine isometric strength work. Day 2
					(tree, warrior III, low lunge, pigeon, fold, twist) is balance and mobility with little
					strength stimulus.
				</p>
				<p>
					Yoga does improve balance, flexibility and lower-limb strength against both active and
					inactive controls <a href="#ref-13" class="cite">[13]</a>. One honest limit: that
					evidence is largely <b>in older adults</b>, so the strength finding shouldn’t transfer
					wholesale to someone already lifting three days a week.
				</p>
				<p class="verdict">
					<b>Verdict: good at what it’s for — and not a substitute.</b> No aerobic component and no
					external load, so it can’t replace either lifting plan or the running. Use it as a
					complement, a deload week, or a mobility day.
				</p>
			</Card>
		</div>
	</section>

	<section>
		<div class="caps mb8">Part 3 — The one rule, and the way back down</div>
		<Card>
			<p><b>Up:</b> hit every set at the top of the range → take the next size up next time.</p>
			<p>
				<b>Down:</b> stall three sessions at the same weight → the ledger backs you off about 10%,
				again landing on a size that exists, and you build it back. Both directions walk the
				same ladder, so it can never ask you for a 37.5 lb kettlebell.
			</p>
			<p class="caveat">
				Worth flagging plainly: <b>the deload rule is weaker evidence than everything else on this
				page.</b> Planned back-offs are standard coaching practice and follow from the overload
				principle <a href="#ref-12" class="cite">[12]</a>, but they don’t rest on a meta-analysis
				the way the fundamentals above do. It’s here because a program with no reverse gear quietly
				asks you to grind through failing sets or quit — and the second one is what actually happens.
			</p>
			<p class="quiet">
				Warm-ups, technique and nutrition are out of scope, and none of this is medical advice. If
				something hurts in a specific joint — as opposed to being hard — that’s a physio question.
			</p>
		</Card>
	</section>

	<section>
		<div class="caps mb8">References</div>
		<Card>
			<ol class="refs">
				{#each refs as r (r.n)}
					<li id="ref-{r.n}">
						<span class="reftext">{r.text}</span>
						<a href={r.url} target="_blank" rel="noreferrer noopener">Source ↗</a>
					</li>
				{/each}
			</ol>
		</Card>
	</section>
</div>

<style>
	.col { display: flex; flex-direction: column; gap: 24px; }
	.head { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; }
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: var(--text-display);
		line-height: var(--leading-tight);
	}
	h2 {
		margin: 0 0 8px;
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: var(--text-title);
		line-height: var(--leading-tight);
	}
	.back {
		font-weight: var(--weight-bold);
		font-size: 14px;
		color: var(--ink-2);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.back:hover { color: var(--ink); }
	.caps {
		font-size: 12px;
		font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.mb8 { margin-bottom: 8px; }
	.stack { display: flex; flex-direction: column; gap: 12px; }
	p { margin: 0 0 10px; line-height: var(--leading-body); }
	p:last-child { margin-bottom: 0; }
	.lede { font-size: 16px; }
	.quiet { color: var(--ink-3); font-size: 14px; }

	/* the number is the anchor for scanning — big, quiet, out of the text flow */
	.fnum {
		font-family: var(--font-mono);
		font-weight: 800;
		font-size: 13px;
		color: var(--ink-3);
		margin-bottom: 2px;
	}
	.punch {
		font-weight: var(--weight-bold);
		background: var(--volt-tint);
		border-left: 3px solid var(--ink);
		padding: 8px 12px;
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
	}
	.cites { display: flex; gap: 6px; margin-top: 8px; }
	.cite {
		font-family: var(--font-mono);
		font-size: 12px;
		font-weight: 700;
		color: var(--ink-2);
		text-decoration: none;
		border-bottom: 1px solid var(--border-soft);
	}
	.cite:hover { color: var(--ink); background: var(--volt-tint); }

	.badges { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
	.verdict { border-top: 1px solid var(--border-soft); padding-top: 10px; }
	.caveat {
		border-left: 3px solid var(--paper-3);
		padding: 8px 12px;
		background: var(--paper-2);
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
	}

	/* wide content scrolls inside its own box — the page never scrolls sideways */
	.tablewrap { overflow-x: auto; margin: 0 0 10px; }
	table { border-collapse: collapse; width: 100%; font-size: 14px; }
	th, td { text-align: left; padding: 6px 10px 6px 0; border-bottom: 1px solid var(--border-soft); white-space: nowrap; }
	th { font-size: 11px; letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--ink-3); font-weight: var(--weight-bold); }
	td { font-family: var(--font-mono); }
	td:first-child { font-family: var(--font-body); }
	.warn { color: var(--danger); font-weight: 700; }

	.refs { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 12px; }
	.refs li { font-size: 13px; line-height: var(--leading-body); color: var(--ink-2); }
	.reftext { display: block; }
	.refs a { font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--ink); }
	/* an anchored reference should be findable after the jump */
	.refs li:target { background: var(--volt-tint); border-radius: var(--radius-sm); }
</style>
