# The domain — seven rules, and the boundary they read through

Everything under `src/lib/domain/` is pure ([projections.ts](projections.ts) is the read model — sessions, entries, the switches, the calendar — and [week.ts](week.ts) the rules over it): no I/O, `now` is always an argument, and
the only input is the event stream read through the upcaster. A screen never
re-derives a rule; it calls the function named here. [WALKTHROUGH.md](../../../WALKTHROUGH.md)
§2 is the long version; this page is the contract the v3 UI rebuild was held to.

## owed — `weekProgress(events, plan, cycle, now)` in [week.ts](week.ts)

A practice owes what its weekly target says minus what the trailing seven days
hold. The count is by **discipline**, not by plan or routine (`countedBy`): yoga
done under a retired plan is still yoga, and cycles that pool (the gym and the
floor are strength) keep one count between them — the target is their shares
added up, and either's session pays it. A goal rewrites the target before this
runs (`composePlan` in [plan.ts](plan.ts)), so "3 a week" is whatever the person
last asked for. Seven days trailing, not a calendar week, so the strip
under Today and the sentence in the Ledger always agree. A class — a routine the
plan names but never writes, the yoga class at a studio — counts the same way,
by the discipline it was stamped with.

## deal — `queue(events, plan, now)` in [week.ts](week.ts)

One candidate per cycle of the composed plan, ranked by a single number whose
bands cannot touch: **owed** (a target above zero) beats everything; then the
**shortfall** under that target; then **staleness** in whole cadences since the
cycle last counted a session (never done counts as four); then **minutes**,
shorter first; then plan order. Today shows the first, "Something else" lists the
rest. No discipline is privileged — a lift rises because it is owed. In a pool
only the **turn** carries what is owed; the other way to pay the same week is
dealt too, still marked due, and never above anything owed. Each candidate
carries its one-line reason (`whyLine`), the week it pays (`week`) and whether it
is its pool's turn.

## next — `nextInCycle(events, plan, cycle)` in [week.ts](week.ts)

A cycle's position is never stored. It is the routine after the last one of this
cycle you **finished** (`turnedBy`: finished, this plan, a routine on its list).
Do B twice and the pointer sits after B; a removed session does not turn it; a
session in progress does not either. A floor session counts toward strength but
does not turn the gym's A/B, nor a gym session the floor's.

## level — `roundsFor(events, plan, routine)` in [week.ts](week.ts)

A circuit (a routine with `levels`) is dealt rounds, not sets. They are the
level after its last **finished** session: every exercise at its count in every
round (`roundsDone`) → the next level up (`nextRounds`), never past the top;
anything short or skipped → the same level; never done → Level I. Derived, never
stored — but the session stamps the rounds it was dealt (`rounds` on
`SessionStarted`), so a session in progress keeps them, and the step list walks
them round by round. The deal carries the rounds on the workout and says the
level first in its line.

## load — `suggest(history, exercise, now)` in [progression.ts](progression.ts)

Set by set. For a loaded lift (`progress.of === 'size'`): a set that hit the top
of the range last time takes the next real rack size (`racks.ts`) this time; a set
that missed the bottom twice inside a fortnight at the same load backs off one
size (`adjust`); more than fourteen days away brings every set back one size,
floored at the programme's start (`reentry`). Holds climb by their `inc` when the
bell rang and stop at the ceiling; ladders take the next rung when every set was
at the top; a stretch, a yoga hold and the run do not progress. `historyFor` in
[projections.ts](projections.ts) is the seam that feeds it, newest first, the
session in progress left out. `nextSet` is the same rule inside a session.

## split — `turnOf(events, plan, cycle, now)` in [week.ts](week.ts), over `FLOOR` in [plans.ts](plans.ts)

Strength is two cycles in one pool: the programme's gym routines and the floor
(four Darebee cards and a band day, `standsInFor: 'lift'`). A strength goal says
how many sessions a week and how many of them are on the floor; `composePlan`
makes the floor's share its target and the gym's the rest. The **turn** goes to
the cycle furthest behind its own share this week — level, to the one done
longer ago, then plan order — and a share of none never has it: at 0 on the
floor the floor is a fallback one tap away, at all of them the gym is. The pool
follows the lift's switch and is never switched itself.

## kept — `weeksKept(events, plan, now)` in [week.ts](week.ts)

How many weeks in a row every pool met its target: seven days at a time back
from `now`, the same trailing week as **owed**, each held to **today's**
composed plan — so a week that grows (a practice on, a goal up) counts again
from the first week that kept it. The week in progress counts once it is kept
and never breaks the run; a plan that asks nothing keeps nothing. At
`GROW_AFTER_WEEKS` (4) the Plan says it is time to add one thing.

## The boundary

Every row is read through [upcast.ts](upcast.ts) and nowhere else. Its header
carries the dated counts that back each case; a case leaves only when a fresh
count says zero. That file is the one that must never be simplified.

## The freeze

[snapshot.test.ts](snapshot.test.ts) builds a full stream in every stored shape the
upcaster reads — retired names, rows without a mode or a discipline, a load of 0,
a plan chosen, a snapshot of preferences — folds it through every projection above
at a fixed `now`, and compares the JSON to the committed
[`__snapshots__/`](__snapshots__/). A change to any rule fails it. When the change
is meant, `pnpm test -- -u` rewrites the file and the diff is the review.
