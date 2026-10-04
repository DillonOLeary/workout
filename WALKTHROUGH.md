# LEDGER — a guided tour

This app exists twice: once as a working workout tracker, and once as a course
in **Svelte 5 + SvelteKit + event sourcing with Emmett**. This file is the
course. Read it with the code open; the code itself carries only interface
lines and the few constraints it cannot state, so the *why* lives here.

## 0. The 30-second architecture

```
 browser (Svelte 5 components, runes state)
    │  <form method="POST"> … use:enhance
    ▼
 form action (+page.server.ts)            ← generates ids, timestamps — and stamps the discipline
    │  command e.g. { type: 'LogEntry', data: {…} }
    ▼
 decider (src/lib/domain/decider.ts)      ← pure: decide(command, state) → events | throws
    │  via Emmett's DeciderCommandHandler
    ▼
 PostgreSQL event store on Neon           ← emt_messages: append-only facts
    │                                        (the programmes are code: DEFAULT_PROGRAMMES in plans.ts)
    ▼
 load() re-reads the stream → upcast → composePlan(programme, blocks on) → projections → the rule, the words → the UI
```

One loop. Every button in the app goes around it, with one exception you will
meet in §4½: on the gym floor a queue POSTs the same actions by hand and no
`load()` reruns until you leave.

## 1. How this project was assembled

```sh
pnpm dlx sv create . --template minimal --types ts     # SvelteKit scaffold (Svelte CLI)
pnpm add @event-driven-io/emmett @event-driven-io/emmett-postgresql pg
```

Secrets live in `.env.local` (git-ignored), read at runtime via
`$env/dynamic/private`:

- `DB` — your Neon connection string
- `LEDGER_PEPPER` — HMAC secret that turns phone numbers into account ids
  ([src/lib/server/uid.ts](src/lib/server/uid.ts)) and signs the
  stay-signed-in cookie ([src/lib/server/auth.ts](src/lib/server/auth.ts))

Run it: `pnpm dev` → http://localhost:5173. Check it: `pnpm check` — types
(svelte-check), tests (vitest, `src/**/*.test.ts`) and the glyph snapshot, the
same gate Workers Builds runs before a deploy — and `pnpm build`.

One wrinkle: `adapter-cloudflare` emulates the Worker bindings from
[wrangler.jsonc](wrangler.jsonc) in dev, and wrangler won't emulate the
`HYPERDRIVE` binding without a Postgres string in
`process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` — a
variable Vite never sets from `.env.local`. [vite.config.ts](vite.config.ts)
bridges that by copying `DB` into it at startup, so local "Hyperdrive" is
just Neon, `DB` stays the one secret, and the Hyperdrive branch of
[hooks.server.ts](src/hooks.server.ts) runs in dev exactly as in prod.

Two more folders sit beside `src/`: [tools/glyphs](tools/glyphs) snapshots the
dot-matrix figures the rig draws (§4), and [tools/stream](tools/stream) holds
read-only SQL over the event store (§2, the upcaster).

## 2. Event sourcing: the mental model

Most apps store **current state** (a `sets` table you UPDATE). Event sourcing
stores **what happened** (facts, appended, never edited) and computes state on
demand. Current state becomes a cache; history becomes the truth.

### The layers — one job per file

The domain folder is small, and every file does exactly one job. Knowing
which job a file has tells you what belongs in it — and what doesn't:

| layer | file | the job | the rule of the layer |
|---|---|---|---|
| **vocabulary** | [measure.ts](src/lib/domain/measure.ts), [plan.ts](src/lib/domain/plan.ts), [events.ts](src/lib/domain/events.ts), [commands.ts](src/lib/domain/commands.ts) | the measure; the plan model and the week (routines, cycles, disciplines, practices, goals); the facts; the requests | closed unions, self-describing, past / imperative tense — and the *current* shape only |
| **read boundary** | [upcast.ts](src/lib/domain/upcast.ts) | translate stored rows into today's vocabulary | the only place shape inference lives; an unknown name throws |
| **rules** | [decider.ts](src/lib/domain/decider.ts) | accept or refuse a command | state holds only what a rule needs; validates shape, never meaning |
| **read model** | [projections.ts](src/lib/domain/projections.ts) | what happened — per session, per exercise, per day — and what the week is set to | pure folds over events; removal applied once; `now` is an argument |
| **the week** | [week.ts](src/lib/domain/week.ts) | the three rules over the read model: owed, next, the deal | one function per rule, named in [domain/README.md](src/lib/domain/README.md) |
| **policy** | [progression.ts](src/lib/domain/progression.ts) | what every set should be next time | a function of (history, exercise, now) — knows nothing about events |
| **words** | [labels.ts](src/lib/domain/labels.ts) | every phrase about a set, a load, a range, a week | one implementation per phrase, tested as strings |
| **reference** | [plans.ts](src/lib/domain/plans.ts), [racks.ts](src/lib/domain/racks.ts), [steps.ts](src/lib/domain/steps.ts) | the shipped programmes and blocks, the ladders, the walk | parsed at *its* boundary too — a programme row is data from outside, like an event row |

Dependencies point one way. `plan.ts` is vocabulary: `events.ts` and
`commands.ts` import its types (`PracticeId`, `Goal`, `Discipline`),
`upcast.ts` reads them, `decider.ts` checks against them. On the read side `week → projections`,
`week → progression → plan → racks`, `week → steps` (the minutes a candidate
costs) and `week → labels` (a candidate's one-line reason) — so a file never
reaches up. When
something feels like it belongs in two places, the table says which. The
smell that produced this shape was `projections.ts` holding the read model,
the rule *and* the words at once, while every screen re-derived the words
for itself.

### The measure, and the eight facts

[measure.ts](src/lib/domain/measure.ts) is the heart of the vocabulary. An
entry measures exactly one of:

| measure | what it says | who writes it |
|---|---|---|
| `load` | a weighted set: load × reps | a `load` exercise |
| `reps` | a bodyweight count | a `reps` exercise (dead bug, sun salutation) |
| `hold` | seconds held, and the bell aimed for (`target`) | a `hold` exercise |
| `duration` | minutes | the run — a routine whose one exercise is `kind: 'run'` |
| `step` | it happened | a warm-up line, a cooldown stretch, a walk |

The three questions every screen asks — `isSet`, `countOf`, `loadOf` — are
exhaustive switches in the same file, so adding a variant fails to compile
in one place instead of miscounting somewhere in a route. `parseMeasure`
rebuilds a form's JSON from the fields each variant owns ("parse, don't
validate"); `validateMeasure` is the decider's bounds, kept next to the type
they govern; `measureFor(exercise, …)` is the one place "which variant does
this exercise write" is decided. Note there is no "load of 0 means
bodyweight": a convention is exactly what a union exists to remove.

[events.ts](src/lib/domain/events.ts) then names the nine facts:

| Event | Meaning |
|---|---|
| `SessionStarted` | a workout began: which programme (`plan`), which **routine** (`{ routine }` — the run is the routine called `run`, no second arm, no sentinel), what **discipline** it was (`lift` · `yoga` · `bodyweight` · `mobility` · `run`) and `mode` — `live` (the floor walked it) or `after` (written in one shot, backdated) |
| `EntryLogged` | one entry: `item` + `index` is its identity (`entryKey`), `measure` is what it measured |
| `EntryCorrected` | a set you fixed: the same identity, the measure it should have carried. The original stays in the stream; every reader takes the last word |
| `SessionFinished` | the workout ended |
| `SessionRemoved` | the event-sourced delete — a fact about a fact |
| `ProgrammeSelected` | you switched the lifting to another programme — the blocks stay as they were |
| `BlockToggled` | you switched a block of the week (yoga · stretch · run · no gym) on or off — a fact with a date, so the Ledger can say when the week changed |
| `GoalSet` | what you asked a practice for — sessions a week, the run's minutes — over the programme's own cadence |
| `RestSet` | the rest between sets, in seconds: a programme constant until the Plan made it a person's setting (2026-09-22) |

The discipline is **stamped** on `SessionStarted` when the session starts and
never looked up later. Programme rows are upserted with no history, so a
routine renamed or retired in September must not quietly rewrite what a
January session was; the row says what it was, forever. That one decision
is what makes the upcaster's dated table (below) necessary for the rows
written before the field existed.

A **workout is a session: an ordered list of entries, each with one
measure**. A lift is a session of sets; a run is a session with one
`duration` entry; a warm-up line is an entry too. *Guided* and *logged after
the fact* are not two kinds of thing: they are **when** the same events get
written. Yoga at 7am and a lift at 6pm is one day, two sessions, two
disciplines, and no type needs a special case for that sentence. Two habits
keep the file honest: it describes the current shape only (no field is
optional merely because old rows lack it — filling those is the upcaster's
job), and an event carries what a reader needs and nothing a reader never
uses (`plan`, the routine and the discipline live on `SessionStarted` alone;
an entry names its session, and the session says the rest). `Workout` is the
`{ routine }` a session ran, with `parseWorkout` for a form's string;
`WARMUP_ITEM` and `COOLDOWN_ITEM` name the two prep entries every session
may write.

Names are **past tense** — an event can't be rejected, it already happened.
Requests that *can* be rejected are **commands**, named in the imperative —
ten of them in [commands.ts](src/lib/domain/commands.ts): `StartSession`,
`LogEntry`, `CorrectEntry`, `FinishSession`, `LogAfter` (a whole backdated
session: `startAt`, `at`, its `AfterEntry` list), `RemoveSession`,
`SelectProgramme`, `TogglePractice`, `SetGoal`, `SetRest`. One command per verb, and
nothing else writes: every tap in the app maps to exactly one of them. The
discipline rides IN on `StartSession` and `LogAfter`: the form action reads
it off `wholePlan(programme)` — every routine, whether or not its practice is
on — so the decider never needs the plan. `PracticeId` is a closed union
(`'lift' | 'yoga' | 'mob' | 'run'`) for the same reason `Measure` is: a
switch or a goal that names no practice must be refusable, and a closed
union is what lets the decider refuse it.

### The week: one programme, the practices that are on, and the floor

A plan is a handful of **cycles** over a set of **routines** — but a plan is
not the unit a person chooses. The week is four **practices** — the lift,
yoga, the morning stretch, the run — each on or off, each at a cadence:

- The lift is a **programme**: a lift-only `Plan`, shipped as code.
  Two ship in `DEFAULT_PROGRAMMES` ([plans.ts](src/lib/domain/plans.ts)):
  *Open to Work* (routines A "Squat & Shove" and B "Hinge & Haul", cycle
  `lift` at 3 a week, 90 s rest) and *Full Range of Motion* (routines 1 "Get
  Low" and 2 "Bridge Club", cycle `lift` at 2 a week, 60 s rest, a breathing
  cue). Choosing one is a `ProgrammeSelected` event; the last one wins
  (`activeProgramme`).
- The other three are **blocks**: shared cycles with their routines, in code
  (`BLOCKS`), never stored — `yoga` (Hips & Hamstrings, Shoulders & Spine — 2
  a week), `mob` "Stretch" (the morning stretch — 3) and `run` (the easy run
  — 3).
- The **floor** (`FLOOR`) is the lift's fallback, not a practice: five
  bodyweight routines in a cycle at target 0 with `standsInFor: 'lift'`. It
  is never switched and never owed on its own — Today deals it last, one
  "Something else" away — and a floor session **counts as a lift**: the
  lift's "2 of 3 this week" includes it (`countedBy` folds a cycle's stand-ins
  into its count), while the lift's own A/B pointer stays put.
- Every practice is **on by default** (`allPracticesOn()`); a switch is a
  `BlockToggled` event (the name and the `block` field are the stored
  vocabulary — the lift switches under the same name), and `practicesOn(events)`
  folds them. A **goal** is a `GoalSet` event — sessions a week, and for the
  run its minutes — over the programme's or the block's own cadence; `goals(events)`
  keeps the last per practice.
- `composePlan(programme, BLOCKS, FLOOR, on, goals, rest)` ([plan.ts](src/lib/domain/plan.ts))
  folds it all into the one `Plan` every projection, step list and rule
  consumes: the programme's cycle with its goal applied and the floor behind
  it (while the lift is on), then the cycle of each block that is on with its
  goal applied — the run's minutes rewrite the run exercise's `lo`/`hi`, a
  `RestSet` rewrites the programme's `rest` while an exercise's own stands — and
  **every** routine and `routineInfo`, on or off, so a session of something
  you switched off still has a title. The layout does this once
  ([+layout.server.ts](src/routes/(app)/+layout.server.ts)) for every
  programme, and no screen downstream can tell a block from the programme.
  `wholePlan(programme)` is the same fold with everything on and no goals —
  what the form actions use to stamp a discipline, and what `SHIPPED_PLANS`
  gives the tests.

Four words are kept apart in `plan.ts`. A **routine** is a thing the plan
offers, with a `discipline` (required, never inferred). A **cycle** is an
ordered list of routine keys with a weekly `target` in sessions — two long
(A/B), five long (the floor), one long (a routine you simply repeat); its
position is never stored. A **session** is one time a routine was done (the
event). A **day** is a calendar bucket the Ledger draws, with no opinion.
The programme and the block write the cadence; a goal overrides it, and
because a goal is an event the Ledger can say when the week changed. What
the user says is all on The Week: which practices are on, their goals, and
which programme. Two earlier menus — *What I'm after* (intents that weighted a
discipline up) and *What I've got* (gear that ruled one out) — are gone: an
intent's only real effect was a tie-break "Something else" already gives you,
and "not at a gym" is a fact about today, not the week, so the floor is one
tap away on Today instead of a fifth block with a switch. Their events
(`PreferencesSet`, and `BlockToggled` for the retired `bw` block) still sit
in the stream and read as nothing at the boundary.

### The read boundary — the upcaster

The stream still holds `SetLogged`, `RunLogged`, `RunRemoved`,
`SessionStruck` and `PlanSelected` rows from earlier vocabularies,
`SessionStarted` rows with no `mode`, with `day` where today's say
`routine`, with a run spelled `day: 'run'` and later `kind: 'run'`, and —
every row before 2026-09-14 — no `discipline`; `EntryLogged` rows still
carrying `plan` and `day`; and four days of bodyweight sets written as a
load of 0 — **nothing in Postgres was rewritten**.
[upcast.ts](src/lib/domain/upcast.ts) translates each row as it is read,
and it is one-to-*many* twice over: a stored `RunLogged` comes back as a
whole backdated session (started · one duration entry · finished), exactly
what logging a run after the fact writes today; and a stored `PlanSelected`
comes back as what choosing that plan *meant* — a `ProgrammeSelected` plus
one `BlockToggled` per block (`WEEK_OF_PLAN`: Open to Work reads yoga,
stretch and run on; Full Range of Motion reads run on and the rest off; Hold
Steady, the retired yoga-only plan, had no lifting, so it switches blocks
and leaves the programme alone). It is also one-to-*none*: a `PreferencesSet`
snapshot and a `BlockToggled` for the retired no-gym block read as nothing —
the settings they fed are gone, the rows stay. Every reader — the decider's
fold and every projection — sees only the current vocabulary.

Three habits make it the *only* place shape inference lives. When a shape
changes, the event's **name** changes with it (`SetLogged → EntryLogged`,
`SessionStruck → SessionRemoved`), so a case is keyed by name, never by
sniffing fields. A new field is filled here with its default, so the
current type can make it required — `mode` gets `live`, and `discipline`
comes from `DISCIPLINE_BEFORE_2026_09_14`, a table of what each shipped plan
said its keys were on the day the row was written (every one of the 121 old
rows is under one of three plans). A table, deliberately, not a lookup into
the live rows: those are upserted with no history, and a routine renamed or
retired later — Hold Steady, whose two routines stay yoga after its row is
gone — must never rewrite what a session was. And an unknown name
**throws** — a row nobody can read is a bug, not a no-op. The one dated
exception (a load of 0 read as `reps`) was checked against the whole stream
before it was written, and its line says so. `upcast.test.ts` pins every
case, including that reading twice is reading once.

A fourth habit keeps the file from growing stale: every case is **backed by
rows**, and the file's header says how many, dated (counted 2026-09-14 with
[tools/stream/forensics.sql](tools/stream/forensics.sql), query 6: 288
`SetLogged`, 22 `RunLogged`, 121 `SessionStarted` without a discipline, 40
`PlanSelected`, and so on; on 2026-09-21, 7 `PreferencesSet` and 7 no-gym
switches). A legacy reader that reads nothing is dead code
wearing a good excuse; a case leaves this file only when a fresh count says
zero — run the query first. That is the same test the plan parser was held
to, and it has no legacy readers at all: the shipped programmes are
rewritten from code on every boot, and the table has never held a custom
row.

### The decider — the write side

[decider.ts](src/lib/domain/decider.ts) is three pure functions:

- `initialState()` — a fresh ledger: no active session, no programme chosen,
  every block on
- `evolve(state, event)` — how one fact changes state (a reducer)
- `decide(command, state)` — the business rules. Returns new events, or throws
  (`IllegalStateError: A session is already in progress — finish it first.`)

Notice what state holds: **only what the rules need** — the id of the open
session, every session in the order it started (the last one not removed is
the **latest**, `latestSessionOf`), which entries each has and what each
measured (so a retried request is a no-op and a correction has something to
correct, and cannot change a run's minutes into a set), which programme is
active, which practices are on and what each was last asked for (so saying
the same thing twice records nothing), and which sessions were removed. Not
the workout history, and not even what a session *is*: the layout asks each
layer its own question — "is a session open? which is the latest?" to the
decider (`currentState(events)`), "what is it?" to `projectSessions` — and
they cannot disagree, because both fold the same events. The one-live-slot
rule is plain: a start takes the slot only when nothing is open, which is
all a backdated `LogAfter` batch (started · entries · finished, in one
append) ever needed; `LogAfter` also refuses a session id it has seen and an
end before its start. `mode` is a recorded fact, not a rule input.

This file owns every "no" in the app. The two rules that protect history are
the ones to study: `CorrectEntry` is allowed on the session in progress and on
the latest finished one — anything older has already been read by the rule,
and rewriting it would silently change what the next suggestion was based on
— while `RemoveSession` works on any session, because removal is itself a
fact and nothing is lost (an older session is fixed by removing it and
logging it again). A screen never re-checks either rule; it hides what the
decider would refuse (the Ledger opens rows inline on the latest card only,
from `latestSession` in the layout's data), and the decider refuses it
anyway. The rest are idempotence: `SelectProgramme` on the active programme
records nothing; `TogglePractice` refuses a practice the week has not got
(`isPractice`) and records nothing for a switch to where it already is;
`SetGoal` refuses a number off the dial (`GOAL_SESSIONS`, `GOAL_MINUTES`) or
minutes for anything but the run, and records nothing when the goal is the
one already set; `SetRest` refuses a rest off its dial (`REST_SECONDS`: 30–180
in 15 s steps) and records nothing when it is the one already set; `StartSession` and `LogAfter` refuse a discipline that is
not one of the five.

Notice also what's *not* here: `crypto.randomUUID()` and `new Date()` live in
the form actions and are passed **into** commands, so the decider is
deterministic and trivially testable. And the decider validates **shape,
never meaning**: it doesn't know the plan, so it cannot say whether "Goblet
Squat #4" is a set the routine asked for. The plan says what an entry means;
the decider says whether it can be recorded.

### Emmett glues the decider to Postgres

[src/lib/server/ledger.ts](src/lib/server/ledger.ts):

```ts
const handle = DeciderCommandHandler({ decide, evolve, initialState, retry: { onVersionConflict: true } });
export const streamName = (uid: string) => `ledger-${uid}`;
export const executeCommand = (uid: string, command: LedgerCommand) =>
	withEventStore((store) => handle(store, streamName(uid), command));
```

That one call: reads every event in the stream → folds them with `evolve`
(upcasting each row on the way) → runs `decide` → appends the result,
**expecting the stream version it read**. If two devices race, the second
append conflicts instead of silently clobbering — that's optimistic
concurrency — and `retry.onVersionConflict` makes Emmett re-read and re-run
`decide` up to three times, which is safe only because `decide` is
idempotent. `readLedgerEvents(uid)` is the other half: every row of the
stream, stripped to `{ type, data }` and passed through `upcastAll`, which is
what every `load()` hands to the projections. `tryCommand` wraps
`executeCommand` and turns a decider's throw into a message the page can
render.

The store itself ([src/lib/server/eventStore.ts](src/lib/server/eventStore.ts))
migrates the schema only in dev (`autoMigration: 'None'` in prod) — a new
database gets its tables by running the app once locally. Go look — this is
your data now: [forensics.sql](tools/stream/forensics.sql) has the queries,
starting with every stream and its event counts.

Streams: this app uses **one stream per user** (`ledger-u-…`) because the
product is literally "one ledger per person". Bigger systems usually stream
per aggregate (per order, per cart) so streams stay short.

### Projections — the read side

[src/lib/domain/projections.ts](src/lib/domain/projections.ts) is pure folds
over the event list, each answering one question for a screen — and nothing
else lives there:

- `projectSessions` → the Ledger's session shells: each session's rows,
  each row's sets *as the measures the entries carried*, its discipline, its
  mode, when it finished, its duration entries, and how many prep steps it
  wrote. Removed sessions are excluded here, and only here, so one exclusion
  makes the whole app behave as if the workout never happened; a correction
  replaces its set in place, so the rule and the ledger read the corrected
  number without knowing it was corrected
- `sessionEntries` → one session's entries as the floor sees them, corrections
  applied, original timestamps kept (a fix must not restart the rest clock)
- `historyFor` → the seam between the read model and the rule: one exercise's
  sets per session, newest first, the session in progress left out — exactly
  what `suggest` reads. `lastEntryFor` is the same seam for one set
- `nextInCycle` / `weekProgress` / `staleness` / `queue` / `weekTally` live in
  [week.ts](src/lib/domain/week.ts) since v3 — the three rules the domain
  README names (owed · next · deal), read against this file's folds. Position
  is derived, never stored: do B twice and the pointer sits after B. Two
  different questions, named once: a cycle COUNTS sessions by discipline,
  whatever plan offered them (`countedBy` — yoga is yoga, and a cycle that
  stands in for another pays into its count), and TURNS only on its own
  routines (`turnedBy` — a finished session of this plan's key)
- `activeProgramme` → the last `ProgrammeSelected` wins; `practicesOn` → every
  practice until a `BlockToggled` says otherwise; `goals` → the last `GoalSet`
  per practice; `restSeconds` → the last `RestSet`, or nothing; `weekChanges` → the first three, grouped by the moment they
  happened (a stored plan choice comes back as several events with one
  `at`), newest first, for the dividers between sessions in How it's going
- `monthGrid` → the last `GRID_WEEKS` (5) weeks as a calendar, one cell per
  local day, each cell saying what every session on it was, in order (`did:
  ['yoga', 'lift']` is a normal Tuesday). A week of cells can only say "this
  week was quiet"; a month says whether that is the habit. `dayMarks` in
  labels.ts turns `did` into what the kit's `Cell` draws: one mark per
  session, its letter (`disciplineLetter`) on its fill (`disciplineInk` —
  volt lift, stone yoga, white stretch, ink run, hatched floor), side by side
- `weekStrip` → the trailing seven days as the same cells, today last — the
  strip under Today's title, and the door to the month
- `weekTally` (in week.ts) → this week in one line's worth of numbers: every
  session in the trailing seven days, everything the on cycles ask, and which
  of them are behind (`paceLine` says it: "6 of 9 this week — lift, run still
  owed."). Seven days, not a running average: the strip and the sentence must
  agree

Even "is a session open?" is a projection (`currentState(events).activeSession`
in [+layout.server.ts](src/routes/(app)/+layout.server.ts)) — the same
`evolve` that guards writes answers the UI. Nothing is stored twice, so nothing
can disagree.

These projections re-run per request (cheap at personal scale, and events are
read once per page anyway). Measured on 2026-09-30 against a synthetic stream
the size of the real one (~600 events): one pass over the events is 0.02 ms and
the decider's rebuild 0.4 ms — the replay is free. What was not free was
`projectSessions`: every rule in week.ts calls it for itself, so Today folded
the stream some fifty times a render, and each fold was ~95% `fmtDate`
(`toLocaleDateString`, ~30 µs a session) — 52 ms on a laptop, once on the
Worker and again in the browser. So `projectSessions` folds once per array (a
`WeakMap` keyed on the events array — a read of the store is a new array, and
nothing changes one in place) and Today is back to about one fold. When the
stream itself is the cost — the payload is ~170 bytes an event, and the
decider's `evolve` copies its `logged` map per entry, so it turns quadratic past
~10k events, years away — the answers are to send views instead of events, or
to close the books into a new stream; Emmett's **stored projections** (Pongo /
SQL) are for queries across many streams, which this app has none of.

### The queue — how Today decides

`queue(events, plan, now)` in [week.ts](src/lib/domain/week.ts) is the one piece of genuinely new logic: ONE
candidate per cycle of the composed plan, ranked, and Today shows the
first; "Something else" lists the rest. The ranking is a single number with
bands that cannot touch:

1. **owed** — the cycle's target is above zero
2. **shortfall** — sessions under this cycle's weekly target (the goal's
   number, if one is set)
3. **staleness** — whole cadences since it last turned (`staleTier`: never done
   counts as four; a cadence is seven days over the target)
4. **minutes** — shorter first, from `estimateMinutes(sessionSteps(…))`
5. plan order

No discipline is privileged: a lift you owe rises because it is owed. The
floor (target 0) is always in the deck and never above anything owed — one
"Something else" away, captioned *counts as the lift* — and because its
sessions count toward the lift's target, doing one pays the lift's debt
without moving the lift's A/B pointer.

Every candidate carries its own `why` (`whyLine`), one mono line in the
grammar Today already speaks, with a precedence: a re-entry warning first,
then how long since ("First session", "3 days since Hinge & Haul"), then
what the rule is about to move or where the week stands ("Chest Press comes
back a size", "1 of 3 this week"). The floor's line is `standInLine`:
"Stands in for Hinge & Haul · counts toward 3 lifts a week".

### The rule — progression.ts

[src/lib/domain/progression.ts](src/lib/domain/progression.ts) is **policy,
not projection**: `suggest(history, exercise, now)` answers "what should every
set be next time" and knows nothing about events. Five axes, chosen by the
exercise's `progress` — what the rule MOVES, as distinct from what a set
writes:

- `size` — SET BY SET, "dynamic double progression": each set's suggestion
  comes from the same set last time (top of the range → *that* set takes the
  next size up), with two ways down — the same set missed twice inside a
  fortnight backs off one size (`adjust`, and two misses are evidence, so
  this can go below the plan's `start`), and more than `REENTRY_DAYS` (14)
  away brings every set back one size (`reentry`, floored at `start` and
  never raised to it); `REENTRY_WARN_DAYS` (11) is when the trend warns
- `time` — ring the bell → +inc seconds next time, capped at the ceiling;
  past the ceiling the answer is a harder variation, never a longer hold
- `count` — carry last time's count, capped at the ceiling
- `variant` — every set at the top of the range → the next rung of the
  ladder, reps back to the bottom. The rung is DERIVED from the stream like a
  rack walk: count the sessions that earned a promotion. With no weight to
  add, the variant *is* the progression
- `none` — the dose is the dose (a stretch, a yoga hold, the run); the rule
  returns early

The answer's *shape follows the progress* — a `Suggestion` is weights and
reps per set, each with its `Reason` (`start` · `increase` · `hold` ·
`adjust` · `reentry`), or counts and a ceiling with the rung alongside — so
no screen reads a weight of 0 as "bodyweight". Every move walks the real
ladders in [racks.ts](src/lib/domain/racks.ts), so a suggestion is always a
bell that exists; and the ± tiles on the floor call the same one-size step
(`bumpLoad`, `bumpCount`), so a hand-dialled number lands on the same sizes.
`nextSet` is the rule *inside* a session: set 2 can legitimately ask for less
than set 1, unless you overrode the ledger on set 1 — then the override
sticks for the rest of the exercise. `now` is a parameter with no default, so
time is data the rule receives, never a clock it reads.

### The words — labels.ts

[src/lib/domain/labels.ts](src/lib/domain/labels.ts) holds every phrase a
screen shows — about a set, a load or a range (`setsLine` "35 lb · 12 · 9 · 5",
"8 L · 8 R"; `doseLabel` "3 × 6–12 · per side"; `itemDose` "45 lb · 3 × 6–12",
the line beside an exercise on Today's card; `loadHint`, the one line behind
"why?" on the floor: "Set 1 goes up to 40 lb — sets 2–3 stay at 35."), about the
week (`dealCaption` "Due · Lift · 1 of 3 this week", `standInLine`, `weekHead`
"11 sessions a week · about 5 h", `goalHint`, `paceLine` "6 of 9 this week —
lift, run still owed.", `weekChangeLine` for the Ledger's dividers), about a day
(`disciplineLetter` L · Y · S · R · F and `cellLegend`), about when (`whenLabel`
"yesterday", "6 days ago") and about a folded session (`sessionSummary` "20 sets
· 48 min", `monthLine`) — written once and tested as strings. The per-hand and
per-side questions must be answered identically on the plan screen, the gym
floor and the ledger; two screens phrasing "3 × 8–12" differently is how a
lunge ends up meaning two different workouts. `setsLine` reads the measures
alone, so a retired exercise still renders exactly as it was logged. The v3
trim shortened this file: a phrase leaves when no screen says it.

### The session is a list of steps

[src/lib/domain/steps.ts](src/lib/domain/steps.ts) turns a routine into the
list the gym floor walks: its warm-up lines, every set, its cooldown. The run
is built the same way — it is a routine whose one exercise measures minutes,
so it gets a `run` step where a lift gets its sets, between the same drills
and stretches. Steps are **derived from the plan, never stored**, and this file
is the only one that knows what a session *is*: the floor renders steps, it
never invents one. Which steps are done is read from the session's entries
(`sessionProgress`, `positionLabel` "Set 4 of 20"). A **rest is not a
step** — it is a clock that runs under the next set (`restUntil`: the
previous set's timestamp plus the exercise's rest), never written, which is
why a reload lands back on the same countdown and why a set that hasn't
reached the server yet still starts one. A warm-up line is a `prep` step
you tick, or a `timed` one the floor counts down for you (a three-minute
jog, thirty seconds of carioca per side); both *are* written, as `step`
entries, so "Set 4 of 20" is honest after a reload — but the Ledger folds
them to one quiet line ("+ 6 prep steps"), and the progression rule never
sees them. A cooldown *stretch* is the exception: it is not prose but an
entry from the **stretch catalogue** (`STRETCHES` in
[plans.ts](src/lib/domain/plans.ts) — each stretch declared once, with its
note and its `why`, and referenced by name from the morning stretch and every
cooldown as `stretch('Calf stretch', 60)`), so it walks as holds in its own
section, logs as holds, lands in the receipt and the Ledger with its figure,
and never earns an arrow (a fixed hold has no top to reach). Before the
catalogue "Calf stretch" existed three ways — an exercise, a prose string, a
timed line — and only the first had a note or a glyph. An `extra` list
appends exercises added on the floor (a stretch or a pose from the session
sheet) as sections after the plan's own (`loggedOutside` finds the ones a
reload must re-add, the cooldown's holds excepted). `estimateMinutes` prices
the list — it is where the queue's "minutes" and Today's "~48 min" come from.
`sessionSections` reads the same list by part — every step of a section
together, wherever it falls (a cooldown's lines either side of a stretch are
one part), with how many are done and where a tap lands: the first open step,
else the first. It is the floor's session map and its ‹ / › jumps. `stepName`
says one step as a sentence ("Goblet Squat · set 2", "the run"), the words
Today's "next:" line and the floor's "Back to …" pill share.

`Step` is a discriminated union on `kind`, and each kind carries only what it
needs — a `prep` step its text, a `timed` one its name and countdown, a `set`
its exercise, the `run` its target. That is the same move as `Measure` and
`Exercise`: a consumer switches on `kind`, the compiler narrows, and there is
no set without an exercise to reach for with a `!`. The floor's `rowFor` is
the place to see it pay off.

### Not everything is an event — and the plan has a boundary too

Programmes are reference data — `DEFAULT_PROGRAMMES` in
[plans.ts](src/lib/domain/plans.ts), code, no history. Events point at them
by id. Deciding *what deserves history* is the actual modelling skill, and
the split is visible on The Week: the programme is a constant, *choosing* it
is a `ProgrammeSelected` event, a practice's switch is a `BlockToggled` event
and its goal a `GoalSet` — the Ledger shows when the week changed, the code
only knows what a programme is now. (Until 2026-09-30 the programmes were
also rows in a `ledger_plans` table, upserted from the same constants on
every boot and read back on every page load — a round trip and a write for
data the Worker already had in its bundle. The table is gone from the code;
the pages import the constants. The lesson is the one the queue and the
cycle pointer already teach: derive, don't store, unless something outside
the code can change it.)

An exercise **measures one thing and progresses another**. Its `kind` —
`load` | `hold` | `reps` | `run` — decides which measure a set writes; its
`progress` — `size` | `time` | `count` | `variant` | `none` — decides what the
rule moves, and the fields only one axis needs (`start`, `inc`, `rack`,
`each`, `ladder`) live on that axis. Only the legal pairings parse (a load
progresses by size, a hold by time or not at all, reps by count, by variant
or not at all, the run not at all), so every consumer switches and the
compiler checks the switch. A stretch is `hold + none` with one length
(`lo === hi`): nothing to dial — Start 45s, the bell, the other side. A yoga
routine contains both kinds of hold, which is the honest granularity.
Warm-ups and cooldowns are lists of `PrepItem`s — a string you tick, a timed
item (`{ name, seconds, each? }`, `{ name, minutes }`) the floor counts down,
or a counted one (`{ name, reps, each? }` — "Sun Salutation A × 3") you
tick. The one default (rest 60 s) lives here once, behind `restFor` — no
screen writes `?? 60` for itself. The accessors — `cycleDisciplines`, `disciplinesOf`, `routineKeys`, `planExercises`,
`exerciseNamed`, `routineTitle` (which returns `undefined` for a key the plan
hasn't got, so a screen falls back to the session's own discipline) — are
how every screen asks the plan a question without indexing it by hand.

A programme row is data from outside, exactly like an event row — so
`parsePlan` is its read boundary, and it runs on *read* as well as on the
composed plans the tests round-trip. It keeps a **class** — a routine
the plan names in `routineInfo` but never writes in `routines` (`studio`,
"Yoga class", in the yoga block): no steps, never on a cycle, so it is never
dealt and never turns the yoga's A/B, but its discipline is stamped like any
routine's and it counts toward Yoga. `classKeys` lists them; Log-after offers
them, and their one entry is a duration. It refuses more than bad types:
anything the fields can't say about each other — a range upside down (`lo >
hi`), a per-side movement with an odd set count, a hold that climbs but has
one length, a mobility routine with a squat on it, a cycle naming a routine
the plan hasn't got, a duplicate cycle id, a `standsInFor` naming itself or
a cycle that isn't there, a run routine with no run in it — is refused with
a sentence. Unlike the event stream, a programme has no upcasters: it is
code, so there is no old shape to read (Hold Steady, the retired yoga plan,
was deleted from code on 2026-09-14 — its sessions stay in the stream and
read as yoga), and [plan.test.ts](src/lib/domain/plan.test.ts) round-trips
every shipped programme through `parsePlan` so the boundary still holds for
the day a programme comes from somewhere else. One consequence worth knowing:
editing `DEFAULT_PROGRAMMES` (or `BLOCKS`) in
[plans.ts](src/lib/domain/plans.ts) *is* the migration: a new exercise, a
widened rep range or a rewritten note reaches every user on the next deploy
— no migration file, no upcaster. History for an exercise that has since left the plan stays in the
stream under its old name, and the Ledger still renders it correctly,
because the measure says what it was: a retired "Weighted Plank" is still
`45s`, not `45`.

### Tests — the domain is pure, so test it like arithmetic

`pnpm test` runs vitest over `src/**/*.test.ts` — eleven suites, 182 tests, one
per layer, and one freeze over all of them: [snapshot.test.ts](src/lib/domain/snapshot.test.ts)
builds a full stream in every stored shape the upcaster reads, folds it through
every rule at one fixed `now`, and compares the JSON to the committed
`__snapshots__/` — the domain's contract for the v3 UI rebuild, written down as
five rules in [src/lib/domain/README.md](src/lib/domain/README.md). The layers: `decider.test.ts` (the write-side rules — including that a
correction on anything but the latest session fails, that one changing a
set's variant fails, that a removal on an older one does not, that a
practice the week has not got is refused and a switch to where it already is
records nothing, and that a goal is refused off the dial and recorded once),
`upcast.test.ts` (every retired shape, that an old session reads as what its
plan said on the day, that a plan chosen reads as a programme chosen and its
blocks switched, and that reading twice is reading once),
`progression.test.ts` (the rule, against a `History` literal — no events
needed; the rung counted from the stream), `labels.test.ts` (every phrase, as
a string), `projections.test.ts` (the folds, fed the retired `SetLogged`
shape on purpose so the boundary is proved every run; that a correction
replaces its set; and the week's rules from `week.ts` — that the queue leads
with what is owed, keeps the floor last and lets a floor session pay the
lift's debt), `plan.test.ts` (the plan's boundary — every illegal pairing and
contradiction it refuses — its accessors, and `composePlan` with its goals),
`steps.test.ts` (that `restUntil` counts from the local timestamp, that an
extra appends, that a step carries only what its kind needs),
`racks.test.ts`, and [rig.test.ts](src/lib/design/rig.test.ts)
(every exercise has a figure, bones keep their length, a planted foot and a
planted hand stay put, every figure casts its contact shadow, the tempo and
the breath land where the design says, a route walks the waypoints the
design named, the stage cuts under reduced motion, and the reviewed snapshot
in `tools/glyphs` is what the rig draws). Two things make these cheap to write: nothing in the
domain does I/O, and every fold that needs the time takes `now` as an
argument — a test builds a history with "15 days ago" arithmetic and never
touches the clock. The config is a separate
[vitest.config.ts](vitest.config.ts) so the suite doesn't load the SvelteKit
plugin (and, with it, wrangler's Hyperdrive emulation).

## 3. SvelteKit: the mental model

Routing is the filesystem:

```
src/routes/
├─ +layout.svelte                  global CSS import, favicon
├─ +error.svelte                   what a thrown load or action shows — a 404, or a database still waking up — on the kit, with a way home
├─ login/                          phone → HMAC id → signed stay-signed-in cookie (+page.svelte, +page.server.ts)
├─ logout/+page.server.ts          POST signs out (CSRF-checked); a GET just redirects
└─ (app)/                          layout GROUP — every page inside requires the cookie
   ├─ +layout.server.ts            ONE load for all pages: programmes composed with this person's practices, goals and rest, plus the stream
   ├─ (tabs)/                      nested group — the locked frame with the tab bar at its foot, three tabs
   │  ├─ +page.svelte              Today — the week strip, the deal on one card, Something else, Log a session I already did (a sheet)  (/)
   │  ├─ +page.server.ts             ?/start (StartSession → /floor) · ?/remove (RemoveSession: Undo, or Bin) · ?/finish (FinishSession, from Today) · ?/logAfter (LogAfter)
   │  ├─ ledger/                    Ledger — five weeks of cells, the pace, every session by month; the latest one fixable  (/ledger)
   │  │                              ?/remove (RemoveSession) · ?/correct (one CorrectEntry per changed set)
   │  └─ plan/                      Plan — four practices: switch · goal · rest; the programme (a sheet); how loads move  (/plan)
   │                                 ?/toggle (TogglePractice) · ?/goal (SetGoal) · ?/rest (SetRest) · ?/select (SelectProgramme)
   │                                 a dial posts 700 ms after the last tap — or at once when its panel folds or the page leaves, so a tap is never lost
   ├─ floor/                        gym floor — covers the tabs  (/floor)
   │                                 load guard → / when nothing is open · ?/logEntry · ?/correctEntry · ?/finish
   ├─ kit/                          every part of the kit in every state — dev only  (/kit)
   ├─ figures/                      the figure lab: every figure live, its tempo, its route, its skeleton — dev only  (/figures)
   └─ export/+server.ts             GET /export: the stream as a JSON download

src/lib/
├─ domain/        the layers of §2 — pure, no I/O; README.md is the contract, __snapshots__/ the freeze
├─ server/        db.ts (the connection string), eventStore.ts (a pg client per request), ledger.ts, auth.ts, uid.ts
├─ ui/            the kit — twelve parts, props only, no domain imports: Caption, Title, Note, Card, Primary, Row, Stepper, Switch, Cell, SetTable, Sheet, Slot
├─ floor/         bell, wake-lock, entry-queue, countdown — the floor's machinery, no markup
└─ design/        tokens/*.css, rig.ts (rig v2 — the figures as a 3D body), stage.ts (one figure on a clock: the Slot's and the lab's)

tools/glyphs/     bake.mjs snapshots every figure's key and start pose to glyph-frames.json; --check proves the snapshot is what the rig draws
tools/stream/     forensics.sql — read-only queries over the event store
```

Identity never rides in the URL: [hooks.server.ts](src/hooks.server.ts) verifies
a signed, HttpOnly cookie on every request into `locals.uid` and re-issues it
(sliding 400-day expiry — sign in once per device, stay signed in). Sharing a
link shares nothing. The same file is where retired URLs live, all in one
place, as permanent redirects: the old host `workout.dillonoleary.com` →
`ledger.dillonoleary.com`; `/u/<id>` (once the login itself) → `/login`;
`/log` → `/floor` with its query (a phone mid-session at deploy time reloads
onto the same step); and since v3 (2026-09-22) `/week`, everything under it,
`/why`, `/plan/why`, `/plan/change` and `/plan/programme` → `/plan`, and
`/log/after` → `/`.

Things to notice:

- **`+page.server.ts` runs only on the server.** So do all of `$lib/server/*`
  (SvelteKit enforces this — importing them from a component is a build error).
  Your DB password cannot leak into the client bundle.
- **Layout data merges down.** The `(app)` layout loads `{ uid, programmes,
  plans, events, activePlanId, practicesOn, goals, rest, activeSession, latestSession }` once;
  every child page receives it as `data` and picks its plan with
  `data.plans.find((p) => p.id === data.activePlanId)`.
- **Form actions are the only mutations.** No API routes, no fetch handlers —
  `<form method="POST" action="?/start">` works with JS disabled, and
  `use:enhance` upgrades it to a fetch that re-runs `load` and updates `data`
  in place. The kit's `Primary` and `Switch` take `type="submit"`, so a
  card's one button and a practice's switch are plain form posts. The one
  exception that proves the rule is the gym floor's queue, which POSTs the same
  `?/logEntry` and `?/correctEntry` actions by hand (§4½) — but even there,
  Finish is a real hidden `<form use:enhance>`.
- **Errors flow as data.** The decider throws → the action catches
  (`tryCommand`) → `fail(400, { message })` → the page renders `form.message`.
  Infrastructure errors still crash to a 500, as they should.
- **The URL is state you read, not store.** Pages read `page.url` from
  `$app/state` (the runes-era module; `$app/stores` is the old one): the
  floor keeps its step in `?step=`, so a reload lands on the same set.

## 4. Svelte 5: the runes tour

| Rune / feature | Where to look |
|---|---|
| `$state` | `stepI`, `weight`, `reps` on the gym floor — plain variables, deeply reactive; the Ledger's `edit[]` is an array of objects, and mutating `edit[k].count` inside it is enough |
| `$derived` | everything computed from `data.events`; change the stream, the screen recomputes |
| `$derived.by` | a derivation that needs a block: the Ledger's `months` (sessions and week changes interleaved by time, folded by month), Plan's `practices`, Today's `entries` for the Log-after sheet, the floor's `rows` |
| `$props` | every component; typed destructuring `let { data, form }: PageProps = $props()` |
| `$bindable` | nowhere, on purpose: the kit's `Stepper` never owns a number — it gets `value` and calls `onstep(±1)`, and the parent decides what a step means (a rack size, five minutes, one rep) |
| `$effect` that writes state | none left: Log it after used to rebuild a draft of lines when the routine changed; the sheet now derives its `entries` from the rule and the picked routine, so there is nothing to seed |
| `Snippet` / `{@render children()}` | every part of the kit that holds content — `Card`, `Primary`, `Row`, `Sheet`, `Note` — is Svelte's children |
| page-local `{#snippet name(args)}` | `Row`'s `inner` snippet renders the same label and right side whether the row is a link, a button or plain text; `SetTable` takes a `fixing` snippet as a prop, so the floor decides what an editing row shows |
| `{@const}` | inside an `{#each}`: `{@const expanded = open === p.id}` on Plan, `{@const latest = s.id === data.latestSession}` in the Ledger — a value computed once per item |
| `<svelte:window onkeydown>` | gym floor keyboard: ↑↓ the number, ← → step, Enter the primary, Esc cancels a fix. `Sheet` listens for Esc too, and the Ledger's `<svelte:window onclick>` disarms the two-tap Remove |
| `class:` directive | `class:done` · `class:today` · `class:future` on a `Cell`, `class:on` on a `Switch`, `class:off` on a Plan row; `SetTable` interpolates instead — `class="row {r.state}"` |
| `bind:this` | the floor's hidden Finish form (submitted from the primary), the Plan's goal and rest forms (submitted once the tapping stops), the tab layout's inner scroller, the Slot's canvas |
| scoped `<style>` | every component — the design system's tokens are global, layout is local; a kit part exposes nothing but its props, so a screen never reaches into one with `:global` except to size a `Slot` |
| `use:enhance` with a callback | the Ledger's editor: `use:enhance={() => async ({ update, result }) => { await update(); if (result.type === 'success') editingRow = null; }}` — the row stays open on a refusal, so the message is read where the numbers are |
| `$effect` + `untrack` | `Slot.svelte` — the effect reads only `exercise` and tells the stage to walk there inside `untrack`, so the stage's own bookkeeping never re-runs it; the 12 fps loop lives in `onMount`, whose returned function cancels the frame and the reduced-motion listener. The floor's `$effect` that rings the bell is the other one worth reading |
| a component that persists | the Slot's contract — `<Slot exercise size />` — says where the body is, never "animate": the Slot decides how to get there (walk the route, two reps at tempo, then breathe) and the screen only changes the name |
| time as input | `restUntil(step, entries, plan)` and `runStart(...)` — the floor passes `now` from a 200 ms ticker that only runs while something is counting, so the rest bar, the run clock and the bell are pure functions of the entries and the time |
| `$derived` over `$state` | the floor's `steps` are derived from the entries: a set logged outside the routine grows a section, and every row, label and estimate follows |
| transitions | `Sheet` flies in with `transition:fly` and fades its scrim; both durations drop to 0 under `prefers-reduced-motion`, read once when the sheet opens |
| `afterNavigate` | the tab layout resets its inner scroller on every navigation — the document never scrolls, so the browser can't do it for you |
| `<script module>` | `SetTable` exports its `SetRow` type from a module script, so the floor can type the rows it builds |
| a shell with a snippet | `ui/Sheet.svelte` is one shape — a scrim, a header with ×, a body that scrolls — and the Programme sheet, Log-after and the floor's session map fill its `children`. Log-after also passes a `foot` snippet (declared inside the component's children, so Svelte hands it over as a prop): the summary and Log it stay pinned while the body scrolls on its own. Three exist; a sheet never opens a sheet |
| `$effect` that returns a release | the floor's `$effect(() => (lit ? holdScreen() : undefined))` — `holdScreen` requests a screen wake lock and returns its release, so the effect's cleanup is the release; `lit` is false on the run, which is long enough to let the screen sleep and trust the bell |
| callback props | `onstep`, `onfix`, `onretry`, `onclose`, `onclick` — a function prop instead of an event dispatcher; the child calls it, the parent owns the state |
| runes in a `.svelte.ts` module | [floor/entry-queue.svelte.ts](src/lib/floor/entry-queue.svelte.ts) and [floor/countdown.svelte.ts](src/lib/floor/countdown.svelte.ts) — classes with `$state` fields and getters, constructed during the page's init so the `$effect` in the countdown's constructor belongs to the page. The page reads `queue.anyFailed` and `clock.remaining` like any other state; the queue and the clock know nothing about steps, rows or buttons |

One deliberate subtlety: the gym floor snapshots `session` with a plain `const`
(and a `svelte-ignore state_referenced_locally`) because a session's identity
*can't* change while you're on the floor; Plan does the same when it seeds a
draft goal from `data` — and the goal is posted once the tapping stops, not
once per tap, so a dial to 5 is one `GoalSet`, not three; the rest dial works
the same way. Knowing when you *don't* want reactivity is part of
learning it.

The figures live in [rig.ts](src/lib/design/rig.ts) — rig v2, the roadmap's
phase 5, from the `Gym App Workout Notes` design project's Figure Lab
(2026-10-04), typed from its `rig2.js` and checked dot for dot against it. The
dot grid stayed; underneath it is a body:

- **Bones, not dots.** A skeleton of fixed-length bones (a 1.78 m adult, about
  7½ heads) posed by rotating joints — `fk` for the spine and the legs. Hands
  reach their targets by two-bone IK (`ik2`: the bell at the chest, a palm on
  the floor), and a foot that is down at both ends of a rep is locked by IK
  too (`lockFoot`), so it stays rooted while the knee tracks.
- **Masses, not sticks.** About twenty-five volumes — ribcage, pelvis and
  head as ellipsoids on a bending spine, tapered capsules for the limbs —
  smooth-blended into one surface, ray-marched from the camera and lit from
  the upper left (`render`), then drawn as 41 × 41 dots whose size is the
  shade (`draw`). Props (the bell, the bar) are inked; furniture (the
  bench, the wall) is drawn lighter so the body reads first. The ground
  re-solves every frame, so a contact never floats or sinks, and casts the
  contact shadow under it.
- **Tempo is data.** Every lift carries gym tempo notation — lower · pause ·
  drive · pause — and `timeline` turns it into a depth 0..1 over time, the
  lowering eased evenly and the drive snappier, the breath following the rep.
  A hold settles in and breathes 2 s in, 3 s out; a stretch sinks a little on
  each exhale for about three breaths. A walk, a run or carioca is a
  treadmill: the body stays put, keyframed foot paths step on a floor whose
  gravel scrolls past.
- **Waypoints.** Every figure names the shape it is entered from (`base`:
  stand, kneel, all fours, the bench…), and `planRoute` walks a `GRAPH` of
  them, each hop pinned to a contact both ends share, compressed so no switch
  takes much more than five seconds.

[stage.ts](src/lib/design/stage.ts) is the clock over that: one figure at a
time, `show` walks the route to the next, `replay` starts the demo over,
`setReduced` honours the phone's reduced-motion setting (the key pose, a
faint breath, a cut between figures — the figure is decorative; the name and
the cue carry the instruction). It is framework-free, so the kit's `Slot` and
the dev page `/figures` drive the same thing: the Slot paints its grid at 12
frames a second ("on twos"), the floor only ever changes the name, and a tap
on the figure replays it. A counted warm-up line (Sun Salutation A × 3) now
carries its name on the step, so it gets its figure too.

The snapshot is the check, not the source: `node tools/glyphs/bake.mjs`
writes every figure's key pose (what reduced motion shows) and start pose to
`tools/glyphs/glyph-frames.json` as rows of characters — a digit for the
body's ink, a letter for a prop, `:` for the floor's shadow — (Node runs the
TypeScript rig as-is), and `--check` exits 1 unless the file is what the rig
draws now, so a nudged pose fails `rig.test.ts` until the new figures are
re-baked and looked at.

## 4½. Lessons from the first real workouts

The first gym session produced a feedback batch, and the week-model rewrite
another; the patterns worth studying:

- **Optimistic UI over an event store**
  ([floor/entry-queue.svelte.ts](src/lib/floor/entry-queue.svelte.ts)): "Log
  set" pushes onto the `EntryQueue` and the screen updates in the same
  frame; a single-flight pump POSTs queued entries in order in the
  background, and no invalidation runs mid-session. The safety net is in
  the DOMAIN, not the UI: the decider treats a duplicate `(item, index)`
  as a zero-event no-op, so ambiguous network retries are idempotent, and
  Emmett's `retry: { onVersionConflict: true }` absorbs concurrent appends.
  A set the server rejects stays on the table as a failed row with a Retry
  — marked, never silently removed — and so does a set the server never
  saw: a dead link is retried twice and then fails the row (each POST is
  `keepalive`, so a tab closed mid-save still lands, and carries a 15 s
  `AbortSignal.timeout`, so a dead link fails in seconds), and a `redirect`
  result is `requireUid`'s bounce to `/login`, which means the cookie is
  gone and nothing was written — a failed row, not a tick (until 2026-09-30
  it read as success). [entry-queue.test.ts](src/lib/floor/entry-queue.test.ts)
  scripts a server for each of those paths; the floor draws the whole queue as
  rows of a `SetTable` (done / saving / now / fixing / todo / failed). A correction rides the same queue with `op: 'correct'`:
  `overlay()` lays the queue over the server's entries, a log adding a row
  and a correction replacing a measure, and that merged list is what the
  rest clock reads — so a set that hasn't reached the server yet still
  starts the clock. Exiting the screen drains the queue and, like Finish,
  refuses to leave a failed row behind; then
  `goto(..., { invalidateAll: true })` restores server truth. The page
  ([floor/+page.svelte](src/routes/(app)/floor/+page.svelte)) keeps only
  what is *its* business: which step you are on, what the rows say, what
  the button does — and what the bell writes, which it hands to the
  `CountdownClock` as a callback.
- **Schema evolution without migration** ([upcast.ts](src/lib/domain/upcast.ts)):
  planks became seconds-based by ADDING an optional `unit?: 'reps' | 's'`
  field to the set event of the day (it survives as `SetLoggedV1`), whose
  absence meant what old events always meant. Never repurpose an existing
  field — history must replay unchanged forever. And when a NAME retires
  (`SessionStruck` became `SessionRemoved` to match the UI's ubiquitous
  language), an **upcaster** translates old events at read time: `upcast`
  runs at both read boundaries — `readLedgerEvents` for projections, the top
  of `evolve` for the decider fold — so `SessionStruck` rows stay in Postgres
  forever while no living code knows the old word. `unit` has since retired
  in turn: the `Measure` union replaced it, `SetLogged` became `EntryLogged`,
  and the upcaster reads a `unit: 's'` row as a `hold` measure. Same two
  moves each time — add a field, then rename the event and translate at the
  boundary — and the stream never changes.
- **Stamp what it was.** When the week grew disciplines, the tempting fix was
  to look a session's discipline up from its plan on read. But the plan row
  has no history, so a later rename would rewrite the past. The session
  carries its own `discipline` from the day it started; the rows written
  before that field existed get theirs from a *dated* table in the upcaster,
  frozen to what the plan said then. A fact about the past belongs in the
  event, not in a lookup.
- **Compose once at the boundary.** Programmes are rows and blocks are code,
  but no screen, fold or rule needs to know: the layout's `load()` composes
  the week into one `Plan` before anything reads it. The alternative — every
  screen asking "is this cycle a block?" — is the same smell as every screen
  phrasing "3 × 8–12" for itself.
- **Shallow routing** (`replaceState` from `$app/navigation`): the current
  step lives in the URL (`/floor?step=6`) so refresh keeps your place, but no
  server load runs and no history entries pile up.
- **The locked app shell**
  ([(tabs)/+layout.svelte](src/routes/(app)/(tabs)/+layout.svelte)), stolen
  from the cabin site: on mobile the document itself never scrolls (html/body
  `overflow: hidden`), only an inner `<main>` does, and the tab bar is a plain
  flex child at the bottom — `position: fixed` bars slide when mobile browsers
  collapse their toolbars; an in-flow bar in a locked frame cannot.

### The floor without a ⋯ (history — superseded by v3 below)

The floor used to keep everything that wasn't the next set behind one ⋯
button: what the exercise is, where you are in the session, and how to leave,
in one scroll. Nobody looks for technique under a kebab. Now each question has
its own literal handle. **The exercise name** is underlined the way every link
in LEDGER is and opens *About* in place, a card between the name and the
table (`AboutCard`) — the note, the dose as a sentence (`doseSentence`), the
figure to scrub, *Why it's here* (`ex.why`, the floor-level cousin of Why this
works, plus the routines it is part of), *The rule* (`ruleLine` — "Fixed at
45 s — a stretch doesn't progress", "+5 s at the top of the range, then
harder, never longer") and last time; the stage gives up its room while it is
open, and the next set closes it. **The row under the table** adds a stretch:
"+ add a stretch" unfolds every stretch and pose the plan knows as chips, and
the right-hand side of the same row says where you are in the section
("Goblet Squat · 2/3"). **The crumb** ("Hold 3/9 · ~6 min ▾") opens the
*Session* sheet — the map, and, because leaving is a session question,
*Finish stretch early* and *Pause*. **The ˅ at the top left** drops the floor
back to Today with the session open; Today then shows *Resume* and *Finish*.
The note's first sentence sits on the floor itself under the name
(`firstSentence`), because for a stretch the note *is* the instruction; a
lift shows its load hint there instead. Finish takes the discipline's noun
(`sessionNoun`: a workout, a practice, a stretch, a run).

### Two tabs (history — superseded by v3 below)

Three tabs asked three questions — what now, what happened, what is the
programme — and the answers were not equally often needed. History and
corrections are rare; the programme rarer. So the Ledger stopped being a
destination: Today's seven-day strip (`weekStrip`, "4 of 11 this week") is the
glance, and tapping it opens *How it's going* (`/ledger`) — the month, the
sentence (`weekSentence`), *What I did* with the latest session's fixes and
Remove. The Plan and its four settings pages became *The Week* (`/week`): one
card, four practices, each a row with a switch, "3 a week · 1 done", and a
goal dial one tap down; the lift's row also carries *Am I getting stronger*
(one line per exercise, `TrendRow`) and *Change programme*. Two settings went
entirely (§2, the week). And the one-tap-deeper screens — How it's going, Log
it after, the programme, Why — are **sheets that are pages** (`SheetPage`):
their own URL, the browser's Back, form actions like any page, but the sheet's
chrome — a title, a ×, and one big *Back to Today* above the home bar. The
design was a prototype with real bottom sheets over Today; a route that
*looks* like a sheet keeps every SvelteKit guarantee (§3) and loses nothing a
person would notice.

Three smaller lessons from the same batch of notes. **Undo where the mistake
happens**: Remove lived in the Ledger, inside the latest card, once expanded;
the moment you need it is the moment after Finish, so Today now shows
"Logged · Squat & Shove · 20 sets · 48 min — Undo" for the latest session
until the next one starts, posting the same `RemoveSession`. **A month is the
fold**: What I did is one line per month (`monthLine`: "SEPTEMBER · 11
sessions · 5 lift · 3 run · 3 stretch"), the newest open, and the line *is*
the monthly view. **Rest is a clock, not a state**: the rest bell rang under a
hold you'd started early because `resting` was derived from the previous
entry's timestamp alone; it now excludes `clock.active`, and starting a clock
clears the pending "rest over".

### v3: three tabs, one kit

The third redesign (2026-09-22, the `App flow and glyph system` design
project) started from a different question than the two before it: not "what
should the screen show" but "how many kinds of thing may a screen be made of".
The answer was twelve, in [src/lib/ui/](src/lib/ui/) — Caption, Title, Note,
Card, Primary, Row, Stepper, Switch, Cell, SetTable, Sheet, Slot — each under
eighty lines, props only, no domain imports, every state on the `/kit` page.
Every screen is those parts and nothing else, which is why the whole of
`src/lib/components/` could go. The rules that keep it clear are the design's:
every screen is caption → title → note → one primary; a row with › opens
something, a row with ▾ expands, a row with a value is just information;
volt-light is the one "you are here" colour (the current set, the in-progress
card, an open row, the deck); tabs are the only navigation, the floor covers
them and ‹ brings them back; nothing hides behind a long-press or a swipe.

The domain was frozen before a screen changed ([domain/README.md](src/lib/domain/README.md),
`snapshot.test.ts`), and it moved in exactly two places. `RestSet` is a new
event: rest between sets was a programme constant and the Plan makes it a
person's setting, so it is a fact with a date like a goal. And the three week
rules — owed, next, the deal — moved out of `projections.ts` into
[week.ts](src/lib/domain/week.ts), which is the split the read model always
wanted: what happened on one side, what to do about it on the other.

Tabs went back to three. Two tabs had made the Ledger a sheet under a strip and
the programme a sheet under a row under a tab, and each of those sheets was a
page with its own route and chrome. Now Today, Ledger and Plan are the tabs,
and the two things that are still sheets — the programme, and logging a session
you already did — are real bottom sheets on the tab they belong to, one `Sheet`
each, posting form actions to that tab's page. Six routes left with them:
`/week`, `/week/programme`, `/week/why`, `/log/after`, `/ledger` as a sheet
page, and `/glyphs`; [hooks.server.ts](src/hooks.server.ts) redirects the ones
a phone might still have. The essay that was `/week/why` is one paragraph
under a Row on Plan; the twenty-eight kilobytes of citations are in git.

The floor lost its About card, its session sheet, its add-a-stretch row and
its keyboard legend and kept what the design asked for: one table (the current
section's rows), one button, the figure's slot, "why?" as a note that expands,
and fixing a set in place — tap `fix` on a done row and the two tiles and the
primary point at that set until you save. Leaving early is a session question,
so it lives on Today: *Finish here* under the in-progress card, beside *Bin*. Everything underneath survived
untouched: the entry queue, the countdown, the bell, the wake lock, the rest as
a clock under the next set, the step in the URL.

### The session map, and Log-after with real sets (2026-10-04)

Losing the session sheet cost the floor any way to see what was left, skip a
machine that was taken, or go back to a set from an earlier exercise. A first
answer — a strip of cells and a wall of tiles — was reverted; the one that
landed came from the `Gym App Workout Notes` design project and is made of
parts the kit already had. The caption at the top (`Squat & Shove · set 4 of
25 ▾`) opens the map: a `Sheet` of `Row`s, one per part, saying `✓ 3 of 3`,
`now · 1 of 3` on the volt-light row where the work is, `looking ›` on the one
on screen. Under the table, `‹ Goblet Squat` and `then: Lat Pulldown ›` jump a
part either way. Any jump is a *look*: a dashed banner says **Looking ahead**
or **Looking back** with a volt `Back to Chest Press · set 1 ›`, and the
primary on a done step now reads `Next: …` toward the first open step, not
the step after the one on screen — the order waits where you left it. Log a
set while looking and you are working there; the banner goes. No event, rule
or action changed: the decider always took entries in any order within the
open session.

The calendar got its colour back the same day. v3's `Cell` drew every day
with something in it as ink with volt letters, which kept the letters (L Y S
R F — readable without colour) but lost the at-a-glance read the pre-v3
calendar had from one fill per discipline. The fills are back under the
letters, each session its own mark on a split day; an empty day is ash so a
white stretch day stands apart from it.

Log-after grew from "written with the plan's sets" to a sheet you fill in.
A **When** day, a **Started** time on the quarter hour (it follows the
routine's length until you touch it) and a **Length**; the summary and *Log
it* are pinned in the sheet's `foot`. A lift or a floor routine lists every
exercise with a "did it" `Switch` and opens to its sets — reps, load, `+ set`,
`×` — so the entries are what you did, not the plan's guess. Yoga and the
stretch still go in as the plan wrote them (the length is what changes); the
run's length *is* the run; and the new **Yoga class · studio** is a class
(above): one duration entry, counted toward Yoga, nothing to tick. Fixing it
later in the Ledger labels its line *Class*, not *Run*.

## 5. Exercises

1. **Corrections, the event-sourced way — done.** `EntryCorrected` is the
   worked example: the same identity as the entry it fixes and a new
   measure, appended, never an UPDATE. Follow one through: a tap on a done
   row on the floor (or a row on the Ledger's latest card) → `CorrectEntry` →
   the decider's two rules (latest session only; something must be there to
   correct) → `projectSessions` replaces the set in place → `historyFor`,
   `suggest` and the trend all read the corrected number without knowing.
   Its older sibling, `SessionRemoved` (born as `SessionStruck`), is the
   same move for a whole session. Now try: a correction to a *duration*
   entry (the Ledger already offers it on a run) — what does `sessionEntries`
   need that `projectSessions` doesn't?
2. **Rest timer — done, and then removed as a screen.** The first version
   made every rest its own step with a "Go now" button; thirteen of a
   routine's thirty-nine steps were that screen. Now a rest is `restUntil`: a
   clock under the *next* set, drawn as an ink bar along its row and a big
   number on the stage, with the bell at zero. Read the floor's `$effect`
   that rings it — it fires once, for the rest that was counting, and not
   when you simply walk away from one — and try adding a "skip the rest"
   gesture without adding a step.
3. **A fifth practice.** Add `'swim'` to `PracticeId` and let the compiler
   walk you: `allPracticesOn`, `practiceLabel`, `WEEK_OF_PLAN` (what did
   choosing an old plan mean for it?), a `Discipline` if it needs one —
   `disciplineLabel`, `disciplineLetter` and `disciplineInk` for the cells — and the block
   itself in `BLOCKS`. Nothing in a screen should need to change. Then switch it off
   and watch the Ledger's divider say so.
4. **Retire an upcaster case.** Run forensics query 6 against the store. If a
   retired shape counts zero, delete its case and its test; if it doesn't,
   you have learned why the header carries dates.
5. **Import.** `export/+server.ts` dumps events; write the reverse (validate,
   then append — through the decider or not? decide and defend it).
6. **Stored projection.** Move `projectSessions` into a Pongo projection with
   `emmett-postgresql` and compare.
7. **Deploy — done (with a scar worth studying).** The first production bug
   was platform-shaped: Workers forbid using a TCP socket opened during one
   request from another request, and a `globalThis`-cached pg pool does
   exactly that — the symptom is not an error but a HANG ("Worker's code had
   hung and would never generate a response") on the load right after a form
   action. The fix is per-request connection lifecycles:
   [eventStore.ts](src/lib/server/eventStore.ts) `withEventStore` opens a
   fresh `pg.Client` per unit of work in prod (Emmett takes it via
   `connectionOptions: { client }`) and closes it — awaited — before
   returning; dev keeps a cached singleton because a Node process owns its
   sockets. Since the programmes became code (2026-09-30) that is the only
   connection a page load makes. A second scar, same shape: the connection string is resolved
   lazily inside the function, never at module load, because SvelteKit's
   build step imports every server module in an environment with no env
   vars — a module-scope throw broke every CI build until it moved. The
   latency cost of those per-request connects is paid for by **Hyperdrive**
   ([wrangler.jsonc](wrangler.jsonc) binding + [hooks.server.ts](src/hooks.server.ts)):
   an edge-local pooler, so a fresh connect is ~ms while the real Neon
   connections stay warm at Cloudflare. One landmine found the hard way:
   Hyperdrive's SELECT cache (default 60s) served **stale event streams**
   right after a write — cache-invalidation semantics and "the stream is the
   truth" are incompatible, so caching is disabled on the config
   (`wrangler hyperdrive update <id> --caching-disabled`). This runs on
   Cloudflare Workers via `adapter-cloudflare`: the `nodejs_compat` flag
   gives `pg` its TCP sockets and `node:crypto` its HMAC; `DB` +
   `LEDGER_PEPPER` live in the Cloudflare dashboard; `keep_vars` stops
   deploys from wiping them. Deploy by pushing to `main` (Workers Builds) or
   `npx wrangler deploy`.
