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
		},
		{
			n: 14,
			text: 'Alizadeh S, Daneshjoo A, Zahiri A, Anvar SH, Goudini R, Hicks JP, Konrad A, Behm DG. Resistance training induces improvements in range of motion: a systematic review and meta-analysis. Sports Medicine, 2023;53:707–722.',
			url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9935664/'
		},
		{
			n: 15,
			text: 'Coleman M, Burke R, Benavente C, et al. Supervised resistance training with or without a one-week deload: effects on muscle hypertrophy and strength in trained lifters. PeerJ, 2024. Randomised; the deload week gave no hypertrophy advantage and cost lower-body strength.',
			url: 'https://peerj.com/articles/16777/'
		},
		{
			n: 16,
			text: 'Bickel CS, Cross JM, Bamman MM. Exercise dosing to retain resistance training adaptations in young and older adults. Medicine & Science in Sports & Exercise, 2011;43(7):1177–1187. One session a week at maintained intensity held strength and size for 32 weeks.',
			url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Bickel+Cross+Bamman+2011+exercise+dosing+retain'
		},
		{
			n: 17,
			text: 'Eihara Y, Takao K, Sugiyama T, et al. Heavy resistance training improves running economy in recreational runners; calf-raise strength gains track the improvement. European Journal of Sport Science, 2024.',
			url: 'https://onlinelibrary.wiley.com/doi/full/10.1002/ejsc.12197'
		},
		{
			n: 18,
			text: 'Schoenfeld BJ, Contreras B, Tiryaki-Sonmez G, Willardson JM, Fontana F. An electromyographic comparison of a modified version of the plank with a long lever and posterior tilt versus the traditional plank exercise. Sports Biomechanics, 2014;13(3):296–306.',
			url: 'https://www.tandfonline.com/doi/abs/10.1080/14763141.2014.942355'
		},
		{
			n: 19,
			text: 'Helms E, Morgan A. Progression — the Muscle & Strength Pyramid (Training), applied: the first-set trigger for double progression. Coaching practice, not a trial.',
			url: 'https://rippedbody.com/progression/'
		},
		{
			n: 20,
			text: 'Llanos-Lagos C, Ramirez-Campillo R, Moran J, Sáez de Villarreal E. The effect of strength training methods on middle-distance and long-distance runners’ athletic performance: a systematic review with meta-analysis. Sports Medicine, 2024. High-load and combined methods improved running economy; submaximal 40–79% loads did not.',
			url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11052887/'
		},
		{
			n: 21,
			text: 'Schumann M, Feuerbacher JF, Sünkeler M, et al. Compatibility of concurrent aerobic and strength training for skeletal muscle size and function: an updated systematic review and meta-analysis. Sports Medicine, 2022. No interference for hypertrophy or maximal strength.',
			url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8891239/'
		},
		{
			n: 22,
			text: 'Andersson SH, Bahr R, Clarsen B, Myklebust G. Preventing overuse shoulder injuries among throwing athletes: a cluster-randomised controlled trial in 660 elite handball players. British Journal of Sports Medicine, 2017;51:1073–1080.',
			url: 'https://bjsm.bmj.com/content/51/14/1073'
		},
		{
			n: 23,
			text: 'Warneke K, et al. Effects of chronic static stretching on maximal strength and muscle hypertrophy: systematic review and meta-analysis. Sports Medicine — Open, 2024. Trivial effects except at extreme daily durations.',
			url: 'https://link.springer.com/article/10.1186/s40798-024-00706-8'
		},
		{
			n: 24,
			text: 'Harøy J, et al. The Adductor Strengthening Programme prevents groin problems among male football players: a cluster-randomised controlled trial. British Journal of Sports Medicine, 2019;53:150–157.',
			url: 'https://bjsm.bmj.com/content/53/3/150'
		},
		{
			n: 25,
			text: 'Wewege MA, et al. The effect of resistance training in healthy adults on body fat percentage, fat mass and visceral fat: systematic review and meta-analysis. Sports Medicine, 2022;52:287–300.',
			url: 'https://link.springer.com/article/10.1007/s40279-021-01562-2'
		},
		{
			n: 26,
			text: 'Morton RW, et al. Protein supplementation and resistance training-induced gains in muscle mass and strength: systematic review, meta-analysis and meta-regression. British Journal of Sports Medicine, 2018;52:376–384.',
			url: 'https://pubmed.ncbi.nlm.nih.gov/28698222/'
		},
		{
			n: 27,
			text: 'Roberts BM, Nuckols G, Krieger JW. Sex differences in resistance training: a systematic review and meta-analysis. Journal of Strength and Conditioning Research, 2020;34(5):1448–1460.',
			url: 'https://journals.lww.com/nsca-jscr/fulltext/2020/05000/sex_differences_in_resistance_training__a.30.aspx'
		},
		{
			n: 28,
			text: 'Maeo S, et al. Greater hamstrings hypertrophy after training at long versus short muscle lengths. Medicine & Science in Sports & Exercise, 2021;53(4):825–837.',
			url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7969179/'
		},
		{
			n: 29,
			text: 'Bø K, Nygaard IE. Is physical activity good or bad for the female pelvic floor? A narrative review. Sports Medicine, 2020;50:471–484.',
			url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7018791/'
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
			body: 'The body adapts to a stress slightly beyond what it currently handles, so the stress has to keep rising. The practical form here is double progression, set by set: keep the weight, add reps; the set that reaches the top of the range takes the next size up next time, and starts again at the bottom. That’s literal — free weights come in fixed sizes, so the ledger steps along the real ladder (dumbbells 2.5 lb through the light end then 5, kettlebells on the kg castings). Machines keep a per-exercise increment, because stacks differ too much between gyms to guess at.',
			punch: 'It’s self-limiting — a set can’t add weight until it has earned it. That’s what makes it safe.',
			cite: [12, 19]
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
			body: 'Post-exercise soreness isn’t a valid indicator of adaptation — it tracks novelty, connective tissue and personal pain sensitivity, not growth. Separately: rest more than 60s between sets — past ~90s adds little for growth, though strength likes longer, so take about two minutes on the squat and the hinge. And on range of motion — for muscle growth, full ROM beats partial only trivially; but for range of motion itself, lifting through a full range increases joint ROM about as much as stretching does, to the point that stretching around a session may add nothing on top.',
			punch: 'Not being sore doesn’t mean it didn’t work.',
			cite: [11, 10, 9, 14]
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
			so. Where it’s thin, or where a call is judgement rather than a finding, it says that too.
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
					both planes — the thing self-made programs most often miss — plus the two things a
					<i>runner’s</i> lifting plan most often lacks. The soleus produces more force than any
					other muscle in running and calf strength tracks running economy
					<a href="#ref-17" class="cite">[17]</a>; it had zero sets, and now has nine a week.
					And nothing trained external rotation at the shoulder, the one shoulder-health input
					with a trial behind it <a href="#ref-22" class="cite">[22]</a> — two light sets of
					face pulls after the press fix that. The hinge still appears on both days, so it runs
					every session on top of three runs: comfortable at these loads, and the first place
					recovery will run short as the weights climb.
				</p>
				<p>
					The core slots are deliberately not long holds. A plank past twenty seconds is an
					endurance test; the long-lever version roughly doubles abdominal activation at the same
					length <a href="#ref-18" class="cite">[18]</a>, and the Copenhagen plank loads the
					adductors, which nothing else in a front-to-back plan touches. Both progress by getting
					harder, never longer.
				</p>
				<div class="tablewrap">
					<table>
						<thead><tr><th>Muscle group</th><th>Sets/week</th><th>vs. growth mark <a href="#ref-1" class="cite">[1]</a></th></tr></thead>
						<tbody>
							<tr><td>Hamstrings / glutes</td><td>~13</td><td>above</td></tr>
							<tr><td>Back</td><td>~9 (+3 rear delt)</td><td>at the mark</td></tr>
							<tr><td>Quads</td><td>~9</td><td>at the mark</td></tr>
							<tr><td>Calves</td><td>~9</td><td>at the mark</td></tr>
							<tr><td>Core</td><td>~7.5</td><td>near</td></tr>
							<tr><td>Adductors</td><td>~3</td><td>maintenance</td></tr>
							<tr><td>Chest</td><td>~4.5</td><td>below</td></tr>
							<tr><td>Shoulders</td><td>~4.5 (+3 rear delt)</td><td>below</td></tr>
						</tbody>
					</table>
				</div>
				<p>
					So lower body and back are dosed for growth; <b>chest and shoulders are dosed for
					strength and maintenance, not size</b>. If visible upper-body change is a goal, the
					cleanest fix is a third day with a second press and a chest-supported row — and it
					only makes sense once three sessions a week is a habit. If it isn’t a goal, this is
					fine as written.
				</p>
				<p>
					Two honest limits on the running side. Ninety minutes a week of easy running costs
					nothing on the lifting side — interference is real only at far higher endurance doses
					<a href="#ref-21" class="cite">[21]</a>. But 8–12 rep training does little for running
					economy on its own; what moves running is heavy loading and the calves
					<a href="#ref-17" class="cite">[17]</a><a href="#ref-20" class="cite">[20]</a>. The
					calf raise is the part of this plan that is <i>for</i> the running. 90 min sits inside
					the WHO’s 75–150 min vigorous band, and the lifting covers the ≥2 muscle-strengthening
					days <a href="#ref-2" class="cite">[2]</a>.
				</p>
			</Card>

			<Card>
				<h2>Full Range of Motion</h2>
				<div class="badges"><Badge tone="neutral">Lift Mon / Thu</Badge><Badge tone="neutral">NRC runs Wed / Sat</Badge></div>
				<p>
					Every pattern, plus the two things the first version lacked: face pulls for the rear
					delts and external rotators, and calf raises — the muscle running loads hardest had
					zero sets. The days are named (Mon / Thu) on purpose: the request was
					<i>regimented</i>, and named days get kept. A third lift, when it fits, moves most
					muscles from maintenance volume to the ~10-set growth mark
					<a href="#ref-1" class="cite">[1]</a><a href="#ref-4" class="cite">[4]</a>.
				</p>
				<p>
					<b>Three starting weights were wrong, and the ledger caught it.</b> Against beginner
					norms for an untrained woman, the old pulldown start was ~96% of a typical one-rep
					max, the RDL ~100%, the lunge ~115% — and the first real session quietly corrected
					all three. Women's relative strength gains match or beat men's; the absolute numbers
					start lower <a href="#ref-27" class="cite">[27]</a>. The starts now sit at learnable
					loads, and the first session is a ramp, not a test. The machine presses run 6–15
					because the smallest stack step is a 25–33% jump at these loads — the wide floor
					absorbs it, and each set climbs on its own.
				</p>
				<p>
					The deep-ROM premise holds. As hypertrophy, full range beats partial only trivially
					<a href="#ref-9" class="cite">[9]</a>; as "mobility you can load" it earns its name —
					loaded full-range work improves joint range about as much as stretching
					<a href="#ref-14" class="cite">[14]</a>, and the bodyweight-only subgroup showed no
					ROM gain, which is why this is a lifting plan and not a stretching list. The leg curl
					says <i>seated</i> now: hamstrings trained at length grew about half again more
					<a href="#ref-28" class="cite">[28]</a>.
				</p>
				<p>
					<b>One claim is retracted.</b> This page used to say Hold Steady "covers exactly" the
					adductors and hip external rotation. Passive holds at realistic durations build
					essentially no strength or muscle <a href="#ref-23" class="cite">[23]</a> — yoga is
					mobility, not load. The loaded coverage lives here now: face pulls, and a side plank
					whose upgrade path ends at the Copenhagen plank, the one adductor exercise with an
					injury-prevention trial behind it <a href="#ref-24" class="cite">[24]</a>.
				</p>
				<p>
					<b>On "toned":</b> muscle plus a little less fat over it — there is no toning-specific
					way to lift. Lifting alone moves fat modestly (~−1.5% body fat
					<a href="#ref-25" class="cite">[25]</a>); protein around 1.6 g/kg/day is where the
					benefit plateaus <a href="#ref-26" class="cite">[26]</a>, and everyday walking counts
					toward the aerobic target 60 running minutes don't fill
					<a href="#ref-2" class="cite">[2]</a>. Muscle is denser than fat: the scale can hold
					still while the waist shrinks — clothes change before the mirror does. Visible change
					typically shows at 8–12 consistent weeks. And one breathing rule, written for the
					pelvic floor: exhale through the hard part; never hold your breath
					<a href="#ref-29" class="cite">[29]</a>.
				</p>
			</Card>

			<Card>
				<h2>Hold Steady</h2>
				<div class="badges"><Badge tone="neutral">Flow 2–3×/week</Badge><Badge tone="neutral">Mat only</Badge></div>
				<p>
					Day 1 (chair, warrior II, plank, boat, bridge) is genuine isometric strength work. Day 2
					(tree, warrior III, low lunge, pigeon, fold, twist) is balance and mobility with little
					strength stimulus. There’s no aerobic component and no external load, so it sits
					alongside the lifting rather than in place of it — a complement, a deload week, or a
					mobility day.
				</p>
				<p>
					Yoga does improve balance, flexibility and lower-limb strength against both active and
					inactive controls <a href="#ref-13" class="cite">[13]</a>. One honest limit: that
					evidence is largely <b>in older adults</b>, so the strength finding shouldn’t transfer
					wholesale to someone already lifting three days a week.
				</p>
			</Card>
		</div>
	</section>

	<section>
		<div class="caps mb8">Part 3 — The rule, set by set, and the way back down</div>
		<Card>
			<p>
				<b>Up:</b> hit the top of the range on a set → <i>that set</i> takes the next size up
				next time; the others keep climbing where they are. That’s double progression
				<a href="#ref-12" class="cite">[12]</a> applied per set — the first set to reach the top
				is the trigger, not the last <a href="#ref-19" class="cite">[19]</a>. The strongest set
				never waits for the weakest, and a rack that jumps 14–20% between sizes gets absorbed one
				set at a time.
			</p>
			<p>
				<b>Down, two ways:</b> miss the bottom of the range on the same set, at the same weight,
				twice inside a fortnight → that set backs off one size. More than a fortnight away → every
				set comes back one size lighter, never below the start — a haircut, not a verdict. Both
				walk the same ladder, so it can never ask you for a 37.5 lb kettlebell.
			</p>
			<p>
				<b>Holds stop at the top of the range.</b> Past it the answer is a harder variation — the
				exercise note says which — never a longer hold <a href="#ref-18" class="cite">[18]</a>.
			</p>
			<p class="note">
				There used to be a “stall three sessions → back off 10%” rule here. It’s gone: the one
				trial of a scheduled deload found no benefit for size and a cost to strength
				<a href="#ref-15" class="cite">[15]</a>, and one session a week holds strength and size
				for months as long as the load is held <a href="#ref-16" class="cite">[16]</a> — so at
				that frequency a “stall” is under-stimulus, not fatigue, and a 10% cut is a slide.
				Worth flagging plainly: <b>the two downward rules are weaker evidence than everything else
				on this page.</b> They follow from the overload principle and from what the re-entry data
				shows, not from a meta-analysis. They’re here because a program with no reverse gear
				quietly asks you to grind through failing sets or quit — and the second one is what
				actually happens.
			</p>
			<p class="quiet">
				Technique cues live on each exercise now, and every day opens with a warm-up line;
				nutrition is out of scope, and none of this is medical advice. If something hurts in a
				specific joint — as opposed to being hard — that’s a physio question.
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
	/* the page being straight about its own weakest claim */
	.note {
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

	.refs { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 12px; }
	.refs li { font-size: 13px; line-height: var(--leading-body); color: var(--ink-2); }
	.reftext { display: block; }
	.refs a { font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--ink); }
	/* an anchored reference should be findable after the jump */
	.refs li:target { background: var(--volt-tint); border-radius: var(--radius-sm); }
</style>
