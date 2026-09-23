# The domain — five rules, and the boundary they read through

Everything under `src/lib/domain/` is pure: no I/O, `now` is always an argument, and
the only input is the event stream read through the upcaster. A screen never
re-derives a rule; it calls the function named here. [WALKTHROUGH.md](../../../WALKTHROUGH.md)
§2 is the long version; this page is the contract the v3 UI rebuild was held to.

## owed — `weekProgress(events, plan, cycle, now)` in [projections.ts](projections.ts)

A practice owes what its weekly target says minus what the trailing seven days
hold. The count is by **discipline**, not by plan or routine (`countedBy`): yoga
done under a retired plan is still yoga, and a cycle that stands in for another
(the floor for the lift) pays into that cycle's count. A goal rewrites the target
before this runs (`composePlan` in [plan.ts](plan.ts)), so "3 a week" is whatever
the person last asked for. Seven days trailing, not a calendar week, so the strip
under Today and the sentence in the Ledger always agree.

## deal — `queue(events, plan, now)` in [projections.ts](projections.ts)

One candidate per cycle of the composed plan, ranked by a single number whose
bands cannot touch: **owed** (a target above zero) beats everything; then the
**shortfall** under that target; then **staleness** in whole cadences since the
cycle last counted a session (never done counts as four); then **minutes**,
shorter first; then plan order. Today shows the first, "Something else" lists the
rest. No discipline is privileged — a lift rises because it is owed. Each
candidate carries its one-line reason (`whyLine`), and the floor's line is
`standInLine`.

## next — `nextInCycle(events, plan, cycle)` in [projections.ts](projections.ts)

A cycle's position is never stored. It is the routine after the last one of this
cycle you **finished** (`turnedBy`: finished, this plan, a routine on its list).
Do B twice and the pointer sits after B; a removed session does not turn it; a
session in progress does not either. A floor session counts toward the lift but
does not turn the lift's A/B.

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

## stand-in — `FLOOR` in [plans.ts](plans.ts), read by `countedBy`

Five bodyweight routines in a cycle at target 0 with `standsInFor: 'lift'`. Target
0 means never owed on its own, so the deal puts it last; `standsInFor` means its
sessions are counted by the lift (`countedBy` folds a cycle's stand-ins into its
count). It follows the lift's switch and is never switched itself.

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
