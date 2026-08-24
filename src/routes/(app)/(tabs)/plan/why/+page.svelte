<script lang="ts">
	import { tick } from 'svelte';
	import Card from '$lib/components/Card.svelte';

	/**
	 * The case for the plans, on the same screen as the plans — written as an
	 * essay, not a card deck, because it IS an argument. Static on purpose: no
	 * load(), nothing derived from events. Every claim carries a numbered
	 * reference; the list at the bottom is the point of the page, not
	 * decoration. Reference numbering matches TRAINING.md exactly.
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

	let refsOpen = $state(false);

	// A cite must open the references before the browser can scroll to the
	// target — fragment navigation into a closed <details> is not reliable
	// across browsers.
	function goRef(e: MouseEvent, n: number) {
		e.preventDefault();
		refsOpen = true;
		void tick().then(() =>
			document.getElementById(`ref-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
		);
	}
</script>

<div class="col">
	<div class="head">
		<a class="back" href="/plan" aria-label="Back to The Plan">←</a>
		<h1>Why this works</h1>
	</div>

	<article class="essay">
		<p class="lede">
			A sourced case for these plans, and enough of the fundamentals to judge them yourself
			instead of taking anyone’s word for it. Where the evidence is strong, this says so;
			where a call is judgement rather than a finding, it says that too. A case you can’t
			check isn’t a case — so every claim is numbered.
		</p>

		<h2>The case for lifting at all</h2>
		<p>
			Muscle-strengthening activity is associated with a 10–17% lower risk of all-cause
			mortality, cardiovascular disease, cancer and diabetes — independently of aerobic
			exercise <a href="#ref-3" class="cite" onclick={(e) => goRef(e, 3)}>[3]</a>. The dose is smaller than anyone expects:
			the benefit shows up at 30–60 minutes a week, and past about an hour the curve goes
			flat. The WHO guideline has the same shape — aerobic minutes <i>plus</i> strength work
			on two or more days <a href="#ref-2" class="cite" onclick={(e) => goRef(e, 2)}>[2]</a>. Two or three short sessions
			a week is not a down-payment on a real program. It is the program.
		</p>
		<p>
			The 2026 ACSM position stand, a summary of 137 reviews, leads with the same reframe:
			the largest gain by far is going from no resistance training to any. Training to
			failure, equipment choice and periodisation “did not consistently impact outcomes” for
			the average healthy adult <a href="#ref-1" class="cite" onclick={(e) => goRef(e, 1)}>[1]</a>. Everything below is a
			refinement, not an entry requirement — and the plan you’ll actually repeat beats the
			optimal one you won’t.
		</p>

		<h2>The engine: one rule, run set by set</h2>
		<p>
			Your body adapts to a stress slightly beyond what it currently handles, so the stress
			has to keep rising <a href="#ref-12" class="cite" onclick={(e) => goRef(e, 12)}>[12]</a>. The practical form in a gym
			of fixed dumbbell sizes is double progression — keep the weight, add reps, take the
			next size when you reach the top of the range — and the detail that decides whether it
			works is <i>what counts as reaching the top</i>. This app’s original answer was every
			set at once, at one load: the strictest version in use, and in practice it never fired.
			The rule now runs per set, the way coaches actually apply it
			<a href="#ref-19" class="cite" onclick={(e) => goRef(e, 19)}>[19]</a>: hit the top of the range on a set and
			<b>that set</b> takes the next size next time, while the others keep climbing where
			they are. The strongest set never waits for the weakest, and a rack that jumps 14–20%
			between sizes gets absorbed one set at a time.
		</p>
		<p>
			Down has two paths, both one size at a time. Miss the bottom of the range on the same
			set, at the same weight, twice inside a fortnight, and that set backs off a size — two
			misses are evidence. Stay away more than a fortnight and everything comes back one size
			lighter, never below the start — a haircut, not a verdict. There used to be a third
			rule here, the classic “stall three sessions, drop 10%”. It’s gone: the one randomised
			trial of a scheduled deload found no benefit for size and a cost to strength
			<a href="#ref-15" class="cite" onclick={(e) => goRef(e, 15)}>[15]</a>, and one session a week at a held load
			maintains for months <a href="#ref-16" class="cite" onclick={(e) => goRef(e, 16)}>[16]</a> — so at low frequency a
			“stall” is under-stimulus, not fatigue, and a 10% cut is just a slide.
		</p>
		<p>
			Timed holds follow the same philosophy in a different axis: they stop at the top of
			their range. A plank past twenty seconds is an endurance test, not a strength stimulus;
			the long-lever version roughly doubles abdominal work at the same length
			<a href="#ref-18" class="cite" onclick={(e) => goRef(e, 18)}>[18]</a>. Past the cap, the exercise note names the
			harder variation. Holds get harder, never longer.
		</p>

		<h2>What the evidence constrains — and what it doesn’t</h2>
		<p>
			Load barely matters: muscle growth is similar from roughly 30% to 100% of your one-rep
			max, as long as sets come close to failure <a href="#ref-6" class="cite" onclick={(e) => goRef(e, 6)}>[6]</a> — and
			actually reaching failure adds nothing over stopping a couple of reps short
			<a href="#ref-7" class="cite" onclick={(e) => goRef(e, 7)}>[7]</a>. What does matter is volume, with a dose-response
			that flattens around ten hard sets per muscle per week for <i>growth</i>
			<a href="#ref-4" class="cite" onclick={(e) => goRef(e, 4)}>[4]</a> — a growth threshold, not a health one; the
			mortality benefit arrives far below it <a href="#ref-3" class="cite" onclick={(e) => goRef(e, 3)}>[3]</a>. Spread it
			over two sessions rather than one <a href="#ref-5" class="cite" onclick={(e) => goRef(e, 5)}>[5]</a>; with volume
			equal, two and three are hard to tell apart. Rest more than a minute — past ninety
			seconds there’s little further gain for size <a href="#ref-10" class="cite" onclick={(e) => goRef(e, 10)}>[10]</a>,
			though strength likes two minutes on the squat and the hinge. Machines and free weights
			build the same muscle <a href="#ref-8" class="cite" onclick={(e) => goRef(e, 8)}>[8]</a>. Soreness tracks novelty,
			not progress <a href="#ref-11" class="cite" onclick={(e) => goRef(e, 11)}>[11]</a>. And range of motion is the quiet
			one: full range beats partial for growth only trivially
			<a href="#ref-9" class="cite" onclick={(e) => goRef(e, 9)}>[9]</a>, but lifting through a full range improves how
			far your joints move about as much as stretching does
			<a href="#ref-14" class="cite" onclick={(e) => goRef(e, 14)}>[14]</a> — flexibility you can load.
		</p>

		<h2>Open to Work</h2>
		<p>
			The lifting half of a lifter-who-runs week: all six movement patterns, push and pull
			balanced in both planes, an A/B alternation that gives every muscle two exposures.
			The audit added what a runner’s plan most often lacks — calves, which absorb more force
			in running than any other muscle and track running economy in trials
			<a href="#ref-17" class="cite" onclick={(e) => goRef(e, 17)}>[17]</a>, and face pulls, the one shoulder-health input
			with a trial behind it <a href="#ref-22" class="cite" onclick={(e) => goRef(e, 22)}>[22]</a> — and swapped the long
			holds for planks that get harder instead <a href="#ref-18" class="cite" onclick={(e) => goRef(e, 18)}>[18]</a>.
			Two honest limits stand. Chest and shoulders sit at maintenance volume, below the
			growth mark <a href="#ref-4" class="cite" onclick={(e) => goRef(e, 4)}>[4]</a>; the clean fix is a third day, and it
			only makes sense once three sessions a week is a habit. And the running relationship is
			one-way at these loads: ninety easy minutes a week costs the lifting nothing
			<a href="#ref-21" class="cite" onclick={(e) => goRef(e, 21)}>[21]</a>, but 8–12-rep training does little for running
			economy — that comes from heavy loading and the calves
			<a href="#ref-20" class="cite" onclick={(e) => goRef(e, 20)}>[20]</a>.
		</p>

		<h2>Full Range of Motion</h2>
		<p>
			Written for a beginner, and rewritten after its own ledger testified against it. Three
			starting weights sat at 96–115% of a typical untrained woman’s one-rep max, and the
			first real session quietly corrected all three. Women’s relative strength gains match
			or beat men’s — the absolute numbers just start lower, especially up top
			<a href="#ref-27" class="cite" onclick={(e) => goRef(e, 27)}>[27]</a> — so the starts now sit at learnable loads,
			the first session is a ramp rather than a test, and the machine presses run 6–15
			because the smallest stack step is a 25–33% jump at these loads: the wide floor is
			what lets a post-jump set land inside the range instead of reading as a miss. Days are
			named — Mon and Thursday — because “more regimented” was the request, and named days
			get kept.
		</p>
		<p>
			The deep-ROM premise earns its name here. As hypertrophy, deep beats shallow only
			trivially <a href="#ref-9" class="cite" onclick={(e) => goRef(e, 9)}>[9]</a>; as mobility, loaded full-range work
			matches stretching <a href="#ref-14" class="cite" onclick={(e) => goRef(e, 14)}>[14]</a> — and the bodyweight-only
			subgroup in that meta-analysis showed no gain at all, which is exactly why this is a
			lifting plan and not a stretching list. The leg curl says <i>seated</i> now: hamstrings
			trained at length grew about half again more in a direct trial
			<a href="#ref-28" class="cite" onclick={(e) => goRef(e, 28)}>[28]</a>. One claim is retracted: this page used to say
			the yoga plan “covers” the adductors and hip external rotation this plan lacked.
			Passive holds at realistic durations build essentially no strength
			<a href="#ref-23" class="cite" onclick={(e) => goRef(e, 23)}>[23]</a>; the loaded coverage lives here now — face
			pulls, and a side plank whose upgrade path ends at the Copenhagen plank, the one
			adductor exercise with an injury-prevention trial behind it
			<a href="#ref-24" class="cite" onclick={(e) => goRef(e, 24)}>[24]</a>.
		</p>
		<p>
			On “toned”: muscle plus a little less fat over it — there is no toning-specific way to
			lift, and moderate-rep double progression is already the right tool. Lifting alone
			moves body fat modestly (about −1.5% over months
			<a href="#ref-25" class="cite" onclick={(e) => goRef(e, 25)}>[25]</a>); protein around 1.6 g per kilo per day is
			where the benefit plateaus <a href="#ref-26" class="cite" onclick={(e) => goRef(e, 26)}>[26]</a>, and everyday
			walking counts toward the aerobic target that sixty running minutes don’t fill
			<a href="#ref-2" class="cite" onclick={(e) => goRef(e, 2)}>[2]</a>. Muscle is denser than fat, so the scale can hold
			still while the waist shrinks — clothes change before the mirror does. Visible change
			typically shows at eight to twelve consistent weeks. And one breathing rule, written
			for the pelvic floor: exhale through the hard part, never hold your breath
			<a href="#ref-29" class="cite" onclick={(e) => goRef(e, 29)}>[29]</a>.
		</p>

		<h2>Hold Steady</h2>
		<p>
			Thirty minutes on a mat: isometric strength on day one, balance and mobility on day
			two. Yoga genuinely improves balance, flexibility and lower-limb strength against
			controls <a href="#ref-13" class="cite" onclick={(e) => goRef(e, 13)}>[13]</a> — with the honest caveat that the
			evidence is largely in older adults. It sits alongside the lifting plans as a
			complement, and after the retraction above it is no longer asked to be anything more:
			mobility, not load.
		</p>

		<h2>The fine print</h2>
		<p class="note">
			The downward rules — the two-miss adjustment and the re-entry haircut — are weaker
			evidence than everything else on this page. They follow from the overload principle
			<a href="#ref-12" class="cite" onclick={(e) => goRef(e, 12)}>[12]</a> and the maintenance data
			<a href="#ref-16" class="cite" onclick={(e) => goRef(e, 16)}>[16]</a>, not from a meta-analysis. They’re here because
			a program with no reverse gear quietly asks you to grind through failing sets or quit —
			and the second one is what actually happens. Technique cues live on each exercise, and
			every day opens with a warm-up line; nutrition beyond the protein sentence is out of
			scope, and none of this is medical advice. If something hurts in a specific joint — as
			opposed to being hard — that’s a physio question.
		</p>
	</article>

	<details class="refsbox" bind:open={refsOpen}>
		<summary>References ({refs.length})</summary>
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
	</details>
</div>

<style>
	.col { display: flex; flex-direction: column; gap: 28px; }
	.head { display: flex; align-items: center; gap: 14px; }
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: var(--text-display);
		line-height: var(--leading-tight);
	}
	/* a real 48px button home — this is a child page of The Plan now */
	.back {
		width: 48px;
		height: 48px;
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--white);
		border: var(--border-w) solid var(--ink);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-raised);
		text-decoration: none;
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: 22px;
		color: var(--ink);
	}
	.back:hover { background: var(--volt-tint); }
	.back:active { transform: translateY(2px); box-shadow: var(--shadow-pressed); }

	/* the essay: one reading column, prose-first */
	.essay { max-width: 66ch; display: flex; flex-direction: column; gap: 14px; }
	.lede { margin: 0; font-size: 18px; line-height: var(--leading-body); color: var(--ink-2); }
	.essay h2 {
		margin: 18px 0 0;
		font-family: var(--font-display);
		font-weight: var(--weight-black);
		font-size: 24px;
		line-height: var(--leading-snug);
		letter-spacing: -0.01em;
	}
	.essay p { margin: 0; font-size: 16px; line-height: 1.65; color: var(--ink); }
	.essay p b { font-weight: var(--weight-bold); }
	.essay .note { color: var(--ink-2); border-left: 3px solid var(--paper-3); padding-left: 14px; }
	.cite { font-family: var(--font-mono); font-size: 11.5px; color: var(--ink-3); text-decoration: none; padding: 0 2px; }
	.cite:hover { color: var(--ink); background: var(--volt-tint); }

	/* the essay stays whole; only the apparatus folds away */
	.refsbox summary {
		list-style: none;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		cursor: pointer;
		font-size: 12px;
		font-weight: var(--weight-bold);
		letter-spacing: var(--tracking-caps);
		text-transform: uppercase;
		color: var(--ink-3);
		border-radius: var(--radius-sm);
		padding: 0 4px;
	}
	.refsbox summary::-webkit-details-marker { display: none; }
	.refsbox summary::before { content: '▸'; }
	.refsbox[open] summary::before { content: '▾'; }
	.refsbox summary:hover { color: var(--ink); background: var(--volt-tint); }
	.refsbox[open] summary { margin-bottom: 12px; }
	.refs { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 10px; }
	.refs li { font-size: 13.5px; line-height: 1.5; color: var(--ink-2); }
	.reftext { margin-right: 6px; }
	.refs a { font-weight: var(--weight-bold); font-size: 12.5px; color: var(--ink); white-space: nowrap; }

	@media (max-width: 640px) {
		.essay h2 { font-size: 21px; }
		.essay p { font-size: 15.5px; }
	}
</style>
