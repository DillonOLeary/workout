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
    │                                        ledger_plans: the programmes, reference rows
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

Run it: `pnpm dev` → http://localhost:5173. Check it: `pnpm test` (vitest,
`src/**/*.test.ts`), `pnpm check` (svelte-check), `pnpm build`.

One wrinkle: `adapter-cloudflare` emulates the Worker bindings from
[wrangler.jsonc](wrangler.jsonc) in dev, and wrangler won't emulate the
`HYPERDRIVE` binding without a Postgres string in
`process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` — a
variable Vite never sets from `.env.local`. [vite.config.ts](vite.config.ts)
bridges that by copying `DB` into it at startup, so local "Hyperdrive" is
just Neon, `DB` stays the one secret, and the Hyperdrive branch of
[hooks.server.ts](src/hooks.server.ts) runs in dev exactly as in prod.

Two more folders sit beside `src/`: [tools/glyphs](tools/glyphs) bakes the
dot-matrix figures (§4), and [tools/stream](tools/stream) holds read-only SQL
over the event store (§2, the upcaster).

## 2. Event sourcing: the mental model

Most apps store **current state** (a `sets` table you UPDATE). Event sourcing
stores **what happened** (facts, appended, never edited) and computes state on
demand. Current state becomes a cache; history becomes the truth.

### The layers — one job per file

The domain folder is small, and every file does exactly one job. Knowing
which job a file has tells you what belongs in it — and what doesn't:

| layer | file | the job | the rule of the layer |
|---|---|---|---|
| **vocabulary** | [measure.ts](src/lib/domain/measure.ts), [plan.ts](src/lib/domain/plan.ts), [preferences.ts](src/lib/domain/preferences.ts), [events.ts](src/lib/domain/events.ts), [commands.ts](src/lib/domain/commands.ts) | the measure; the plan model and the week (routines, cycles, disciplines, blocks); the two menus; the facts; the requests | closed unions, self-describing, past / imperative tense — and the *current* shape only |
| **read boundary** | [upcast.ts](src/lib/domain/upcast.ts) | translate stored rows into today's vocabulary | the only place shape inference lives; an unknown name throws |
| **rules** | [decider.ts](src/lib/domain/decider.ts) | accept or refuse a command | state holds only what a rule needs; validates shape, never meaning |
| **read model** | [projections.ts](src/lib/domain/projections.ts) | what happened — per session, per exercise, per cycle, per week — and what to offer next | pure folds over events; removal applied once; `now` is an argument |
| **policy** | [progression.ts](src/lib/domain/progression.ts) | what every set should be next time | a function of (history, exercise, now) — knows nothing about events |
| **words** | [labels.ts](src/lib/domain/labels.ts) | every phrase about a set, a load, a range, a week | one implementation per phrase, tested as strings |
| **reference** | [plans.ts](src/lib/domain/plans.ts), [racks.ts](src/lib/domain/racks.ts), [steps.ts](src/lib/domain/steps.ts) | the shipped programmes and blocks, the ladders, the walk | parsed at *its* boundary too — a programme row is data from outside, like an event row |

Dependencies point one way. `plan.ts` and `preferences.ts` are vocabulary:
`events.ts` and `commands.ts` import their types (`BlockId`, `Discipline`,
`Intent`, `Equipment`), `upcast.ts` reads them, `decider.ts` checks against
them. On the read side `projections → progression → plan → racks`,
`projections → steps` (the minutes a candidate costs) and `projections →
labels` (a candidate's one-line reason) — so a file never reaches up. When
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

[events.ts](src/lib/domain/events.ts) then names the eight facts:

| Event | Meaning |
|---|---|
| `SessionStarted` | a workout began: which programme (`plan`), which **routine** (`{ routine }` — the run is the routine called `run`, no second arm, no sentinel), what **discipline** it was (`lift` · `yoga` · `bodyweight` · `mobility` · `run`) and `mode` — `live` (the floor walked it) or `after` (written in one shot, backdated) |
| `EntryLogged` | one entry: `item` + `index` is its identity (`entryKey`), `measure` is what it measured |
| `EntryCorrected` | a set you fixed: the same identity, the measure it should have carried. The original stays in the stream; every reader takes the last word |
| `SessionFinished` | the workout ended |
| `SessionRemoved` | the event-sourced delete — a fact about a fact |
| `ProgrammeSelected` | you switched the lifting to another programme — the blocks stay as they were |
| `BlockToggled` | you switched a block of the week (yoga · stretch · run · no gym) on or off — a fact with a date, so the Ledger can say when the week changed |
| `PreferencesSet` | what you told the app you're after and what you've got — a full snapshot with a date, so "you said you wanted to run better six weeks ago" is sayable |

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
nine of them in [commands.ts](src/lib/domain/commands.ts): `StartSession`,
`LogEntry`, `CorrectEntry`, `FinishSession`, `LogAfter` (a whole backdated
session: `startAt`, `at`, its `AfterEntry` list), `RemoveSession`,
`SelectProgramme`, `ToggleBlock`, `SetPreferences`. One command per verb,
and nothing else writes: every tap in the app maps to exactly one of them.
The discipline rides IN on `StartSession` and `LogAfter`: the form action
reads it off `wholePlan(programme)` — every block's routines, whether or not
the block is on — so the decider never needs the plan. `BlockId` is a closed
union (`'yoga' | 'mob' | 'run' | 'bw'`) for the same reason `Measure` is: a
switch that names no block must be refusable, and a closed union is what
lets the decider refuse it.

### The week: one programme, the blocks that are on

A plan is a handful of **cycles** over a set of **routines** — but a plan is
not the unit a person chooses. The week is one lift **programme** plus the
**blocks** that are on:

- A programme is a lift-only `Plan`, a row in `ledger_plans`. Two ship in
  `DEFAULT_PROGRAMMES` ([plans.ts](src/lib/domain/plans.ts)): *Open to Work*
  (routines A "Squat & Shove" and B "Hinge & Haul", cycle `lift` at 3 a week,
  90 s rest) and *Full Range of Motion* (routines 1 "Get Low" and 2 "Bridge
  Club", cycle `lift` at 2 a week, 60 s rest, a breathing cue). Choosing one
  is a `ProgrammeSelected` event; the last one wins (`activeProgramme`).
- A block is a shared cycle with its routines, in code (`BLOCKS`), never
  stored: `yoga` (Hips & Hamstrings, Shoulders & Spine — 2 a week), `mob`
  "Stretch" (the morning stretch — 3), `run` (the easy run — 3) and `bw` "No
  gym" (seven routines, five floor sessions plus the two yoga routines
  borrowed, target 0, `standsInFor: 'lift'`). Every block is **on by default**
  (`allBlocksOn()`); a switch is a `BlockToggled` event, and `blocksOn(events)`
  folds them.
- `composePlan(programme, BLOCKS, on)` ([plan.ts](src/lib/domain/plan.ts))
  folds the two into the one `Plan` every projection, step list and rule
  consumes: the programme's cycles, then the cycle of each block that is on;
  and **every** block's routines and `routineInfo`, on or off, so a session of
  a block you switched off still has a title and the no-gym block can borrow
  the yoga routines. The layout does this once
  ([+layout.server.ts](src/routes/(app)/+layout.server.ts)) for every
  programme, and no screen downstream can tell a block from the programme.
  `wholePlan(programme)` is the same fold with everything on — what the form
  actions use to stamp a discipline, and what `SHIPPED_PLANS` gives the tests.

Four words are kept apart in `plan.ts`. A **routine** is a thing the plan
offers, with a `discipline` (required, never inferred). A **cycle** is an
ordered list of routine keys with a weekly `target` in sessions — two long
(A/B), seven long (the no-gym block), one long (a routine you simply repeat),
or mixed, since discipline lives on the routine; its position is never
stored. A **session** is one time a routine was done (the event). A **day**
is a calendar bucket the Ledger draws, with no opinion. The programme and the
block write the targets; the user never does — cadence is the part of a
programme you audit, and a dial would be a second source of truth. What the
user *does* say is on The Plan: which blocks are on, which programme, and
what they're after ([preferences.ts](src/lib/domain/preferences.ts): an
intent weights a discipline up, a piece of equipment rules one out, and
"just show up more" puts the shorter owed session first — each pick has one
exact effect on the queue, nothing free-text).

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
one `BlockToggled` per block (`WEEK_OF_PLAN`: Open to Work carried the
floor, so it reads yoga, stretch, run and no gym on; Full Range of Motion
reads run on and the rest off; Hold Steady, the retired yoga-only plan, had
no lifting, so it switches blocks and leaves the programme alone). Every
reader — the decider's fold and every projection — sees only the current
vocabulary.

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
`PlanSelected`, and so on). A legacy reader that reads nothing is dead code
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
active, which blocks are on, which sessions were removed, and the last
preferences snapshot (so saying the same thing twice records nothing). Not
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
records nothing; `ToggleBlock` refuses a block the week has not got
(`isBlockId`) and records nothing for a switch to where it already is;
`SetPreferences` takes one to three intents from the menu, each once, and
records nothing when the snapshot is the same (`samePreferences`);
`StartSession` and `LogAfter` refuse a discipline that is not one of the five.

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
- `trendFor` → one exercise over time: the last `TREND_WINDOW` (7) sessions
  as points, what the rule has queued next, a tone (`start` · `up` · `down` ·
  `warn` · `flat`) and ONE status sentence ("35 lb since Jul 11 — 6 sessions,
  no change", "Set 1 at the top of the range — 40 lb next time", "Re-entry
  haircut in 3 days"). The Ledger's "Am I getting stronger" list is this fold
  run per exercise at request time — no stored projection, no new events
- `nextInCycle` / `weekProgress` / `staleness` → where each cycle of the plan
  is turned to (the routine after the last one of it you finished — position
  is derived, never stored: do B twice and the pointer sits after B), how
  many sessions of it the trailing week holds against its target, and how
  long since it last turned. Two different questions, named once in the
  file: a cycle COUNTS sessions by discipline, whatever plan offered them
  (`countedBy` — yoga is yoga), and TURNS only on its own routines
  (`turnedBy` — a finished session of this plan's key); `lastCounted` is the
  session the first question ends on
- `queue` → what Today deals, one `Candidate` per cycle (its `workout`,
  `discipline`, `title`, `why`, `minutes`, `out`, `due`, and a `score` that is
  ordering only). The next section is about it
- `preferences` → the last `PreferencesSet` over the defaults;
  `activeProgramme` → the last `ProgrammeSelected` wins; `blocksOn` → every
  block until a `BlockToggled` says otherwise; `weekChanges` → both, grouped
  by the moment they happened (a stored plan choice comes back as several
  events with one `at`), newest first, for the Ledger's dividers between
  sessions
- `monthGrid` → the last `GRID_WEEKS` (5) weeks as a calendar, one cell per
  local day, each cell saying what every session on it was, in order (`did:
  ['yoga', 'lift']` is a normal Tuesday). A week of cells can only say "this
  week was quiet"; a month says whether that is the habit
- `weeklyPace` → the running average: sessions per week *per discipline*
  over the trailing `PACE_DAYS` (28), each against the four weeks before it
  (the Ledger says it in one sentence against the week's targets), so "am I
  doing less than I meant to?" gets a direction and not just a number. Rates
  divide by the window the fold was given, never by weeks it assumes

Even "is a session open?" is a projection (`currentState(events).activeSession`
in [+layout.server.ts](src/routes/(app)/+layout.server.ts)) — the same
`evolve` that guards writes answers the UI. Nothing is stored twice, so nothing
can disagree.

These projections re-run per request (cheap at personal scale, and events are
read once per page anyway). When that stops scaling, Emmett can maintain
**stored projections** (Pongo / SQL) updated as events append — same concept,
cached.

### The queue — how Today decides

`queue(events, plan, prefs, now)` is the one piece of genuinely new logic:
ONE candidate per cycle of the composed plan, ranked, and Today shows the
first; "Something else" deals the next. The ranking is a single number with
bands that cannot touch:

1. **owed** — the cycle's target is above zero, or it is a target-0 cycle
   *standing in* for a cycle that is ruled out (the no-gym block takes the
   lift's target while the gym is off in "I've got")
2. **shortfall** — sessions under this cycle's weekly target, plus one when an
   intent names its discipline (`weightedUp`)
3. **staleness** — whole cadences since it last turned (`staleTier`: never done
   counts as four; a cadence is seven days over the target)
4. **minutes** — shorter first, from `estimateMinutes(sessionSteps(…))`
5. plan order

"Just show up more" (`shorterFirst`) swaps 3 and 4: among what you owe, the
shorter session outranks the staler one. No discipline is privileged: a lift
you owe rises because it is owed. A routine that needs what you haven't got
(`missingFor`) is ruled OUT, not hidden — it scores −1, sits at the bottom
and says why (`needsLine`). A cycle with target 0 (the no-gym block, while
it is on) is always in the deck and never above anything owed — one
"Something else" away — unless it is standing in, when it is owed like any
other. That last band is why the owed term sits *above* the shortfall term:
without it, an intent that names the floor could lift it past a session you
are due.

Every candidate carries its own `why` (`whyLine`), one mono line in the
grammar Today already speaks, with a precedence: a re-entry warning first,
then how long since ("First session", "3 days since Hinge & Haul"), then
what the rule is about to move or where the week stands ("Chest Press comes
back a size", "1 of 3 this week"), then "you asked for this" when an intent
tilted it.

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
screen shows — about a set, a load or a range (`setsLine` "35 lb · 12 · 9 ·
5", "8 L · 8 R"; `doseLabel` "3 × 6–12 · per side"; `loadHint`, the one line
before set 1: "Set 1 goes up to 40 lb — sets 2–3 stay at 35."; `lineValue`
"40 lb · 3 × 8" on Log it after), and now about the week (`weekMeta` "3 a
week · 1 done", `standInMeta`, `weekHead` "11 sessions a week · about 5 h",
`blockLabel` and `weekChangeLine` "switched to Open to Work · yoga, stretch,
run, no gym on" for the Ledger's dividers), the pace (`paceSentence`
"Showing up 6.5 times a week of the 11 the plan asks — lifts are the gap.",
`paceSub` "asks 3 · ↑ from 2") and a folded session (`sessionSummary` "20
sets · 48 min", "9 holds · 11 min") — written once and tested as strings.
The per-hand and per-side questions must be answered identically on the
plan screen, the gym floor and the ledger; two screens phrasing "3 × 8–12"
differently is how a lunge ends up meaning two different workouts.
`setsLine` reads the measures alone, so a retired exercise still renders
exactly as it was logged.

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
sees them. An `extra` list appends exercises added on the floor (a stretch
from the ⋯ sheet) as sections after the plan's own (`loggedOutside` finds
the ones a reload must re-add). `estimateMinutes` prices the list — it is
where the queue's "minutes" and Today's "~48 min" come from.

`Step` is a discriminated union on `kind`, and each kind carries only what it
needs — a `prep` step its text, a `timed` one its name and countdown, a `set`
its exercise, the `run` its target. That is the same move as `Measure` and
`Exercise`: a consumer switches on `kind`, the compiler narrows, and there is
no set without an exercise to reach for with a `!`. The floor's `rowFor` is
the place to see it pay off.

### Not everything is an event — and the plan has a boundary too

Programmes are reference data — rows in `ledger_plans`
([src/lib/server/plans.ts](src/lib/server/plans.ts)), UPSERTed, no history.
Events point at them by id. Deciding *what deserves history* is the actual
modelling skill, and the split is visible on The Plan: the programme row is
a table row, *choosing* it is a `ProgrammeSelected` event, and a block's
switch is a `BlockToggled` event — the Ledger shows when the week changed,
the table only knows what a programme is now. New programmes are added at
the table, not in the app; `listProgrammes()` reads every row through
`parsePlan`, and a row nobody can parse is logged and skipped, never a 500.

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
screen writes `?? 60` for itself. The accessors — `routinesOf`, `cycleOf`,
`cycleDisciplines`, `disciplinesOf`, `routineKeys`, `planExercises`,
`exerciseNamed`, `routineTitle` (which returns `undefined` for a key the plan
hasn't got, so a screen falls back to the session's own discipline) — are
how every screen asks the plan a question without indexing it by hand.

A programme row is data from outside, exactly like an event row — so
`parsePlan` is its read boundary, and it runs on *read* as well as on the
composed plans the tests round-trip. It refuses more than bad types:
anything the fields can't say about each other — a range upside down (`lo >
hi`), a per-side movement with an odd set count, a hold that climbs but has
one length, a mobility routine with a squat on it, a cycle naming a routine
the plan hasn't got, a duplicate cycle id, a `standsInFor` naming itself or
a cycle that isn't there, a run routine with no run in it — is refused with
a sentence. Unlike the event stream, the table has no upcasters: the shipped
programmes are rewritten from code on every boot, so there is no old shape
to read (Hold Steady, the retired yoga plan, was deleted the same way, from
code, on 2026-09-14 — its sessions stay in the stream and read as yoga).
One consequence worth knowing: editing `DEFAULT_PROGRAMMES` (or `BLOCKS`,
which are code and never stored) in [plans.ts](src/lib/domain/plans.ts)
*is* the migration. `ensureReady` upserts the shipped programmes on every
boot, so a new exercise, a widened rep range or a rewritten note reaches
every database the next time a worker starts — no migration file, no
upcaster. History for an exercise that has since left the plan stays in the
stream under its old name, and the Ledger still renders it correctly,
because the measure says what it was: a retired "Weighted Plank" is still
`45s`, not `45`.

### Tests — the domain is pure, so test it like arithmetic

`pnpm test` runs vitest over `src/**/*.test.ts` — ten suites, 181 tests, one
per layer: `decider.test.ts` (the write-side rules — including that a
correction on anything but the latest session fails, that one changing a
set's variant fails, that a removal on an older one does not, that a block
the week has not got is refused and a switch to where it already is records
nothing, and that the same preferences twice record nothing),
`upcast.test.ts` (every retired shape, that an old session reads as what its
plan said on the day, that a plan chosen reads as a programme chosen and its
blocks switched, and that reading twice is reading once),
`progression.test.ts` (the rule, against a `History` literal — no events
needed; the rung counted from the stream), `labels.test.ts` (every phrase, as
a string), `projections.test.ts` (the folds, fed the retired `SetLogged`
shape on purpose so the boundary is proved every run; that a correction
replaces its set; that the queue leads with what is owed, keeps the floor
last, rules a routine out by equipment and lets the floor stand in for the
gym; the week's folds), `plan.test.ts` (the plan's boundary — every illegal
pairing and contradiction it refuses — its accessors, and `composePlan`),
`steps.test.ts` (that `restUntil` counts from the local timestamp, that an
extra appends, that a step carries only what its kind needs),
`preferences.test.ts`, `racks.test.ts`, and [glyphs.test.ts](src/lib/design/glyphs.test.ts)
(every exercise has a figure, every frame prints, the JSON is what the
generator bakes). Two things make these cheap to write: nothing in the
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
├─ login/                          phone → HMAC id → signed stay-signed-in cookie (+page.svelte, +page.server.ts)
├─ logout/+page.server.ts          POST signs out (CSRF-checked); a GET just redirects
└─ (app)/                          layout GROUP — every page inside requires the cookie
   ├─ +layout.server.ts            ONE load for all pages: programmes composed with this person's blocks, plus the stream
   ├─ (tabs)/                      nested group — the TabBar shell (+layout.svelte: the locked frame)
   │  ├─ +page.svelte              Today — tab 1: the deck, one card at a time  (/)
   │  ├─ +page.server.ts             ?/start (StartSession → /floor) · ?/finish
   │  ├─ log/after/                 Log it after — What/When card, the sets card, one button  (/log/after)
   │  │                              ?/log (LogAfter)
   │  ├─ ledger/                    Ledger — tab 2: Did I show up · Am I getting stronger · What I did  (/ledger)
   │  │                              ?/remove (RemoveSession) · ?/correct (one CorrectEntry per changed set)
   │  ├─ plan/                      The Plan — tab 3: the week's switches, What I'm after  (/plan)
   │  │                              ?/toggle (ToggleBlock) · ?/save (SetPreferences)
   │  ├─ plan/programme/            the lift programme — the one real choice  (/plan/programme)
   │  │                              ?/select (SelectProgramme)
   │  └─ plan/why/+page.svelte      the cited case — a child of The Plan, static  (/plan/why)
   ├─ floor/                        gym floor — outside (tabs): no tab bar  (/floor)
   │                                 load guard → / when nothing is open · ?/logEntry · ?/correctEntry · ?/finish
   └─ export/+server.ts             GET /export: the stream as a JSON download

src/lib/
├─ domain/        the layers of §2 — pure, no I/O
├─ server/        db.ts (a pg client per request), eventStore.ts, ledger.ts, plans.ts, auth.ts, uid.ts
├─ components/    Button, Card, Chip, Badge, TabBar, PhoneInput, ExerciseGlyph, MonthGrid, TrendRow,
│                 floor/{StepTable, AdjustTile, FloorPrimary, FloorSheet, bell, entry-queue, countdown}
└─ design/        tokens/*.css, disciplines.css (one ink per discipline), glyphs.ts + glyph-frames.json

tools/glyphs/     athlete.js (the figure generator) + bake.mjs (rewrites glyph-frames.json; --check proves it)
tools/stream/     forensics.sql — read-only queries over the event store
```

Identity never rides in the URL: [hooks.server.ts](src/hooks.server.ts) verifies
a signed, HttpOnly cookie on every request into `locals.uid` and re-issues it
(sliding 400-day expiry — sign in once per device, stay signed in). Sharing a
link shares nothing. The same file is where retired URLs live, all in one
place, as permanent redirects: the old host `workout.dillonoleary.com` →
`ledger.dillonoleary.com`; `/u/<id>` (once the login itself) → `/login`;
`/why` → `/plan/why`; `/log` → `/floor` with its query (a phone mid-session
at deploy time reloads onto the same step); `/plan/change` →
`/plan/programme`; `/plan/after` → `/plan`.

Things to notice:

- **`+page.server.ts` runs only on the server.** So do all of `$lib/server/*`
  (SvelteKit enforces this — importing them from a component is a build error).
  Your DB password cannot leak into the client bundle.
- **Layout data merges down.** The `(app)` layout loads `{ uid, plans, events,
  activePlanId, blocksOn, preferences, activeSession, latestSession }` once;
  every child page receives it as `data` and picks its plan with
  `data.plans.find((p) => p.id === data.activePlanId)`.
- **Form actions are the only mutations.** No API routes, no fetch handlers —
  `<form method="POST" action="?/start">` works with JS disabled, and
  `use:enhance` upgrades it to a fetch that re-runs `load` and updates `data`
  in place. The one exception that proves the rule is the gym floor's queue,
  which POSTs the same `?/logEntry` and `?/correctEntry` actions by hand
  (§4½) — but even there, Finish is a real hidden `<form use:enhance>`.
- **Errors flow as data.** The decider throws → the action catches
  (`tryCommand`) → `fail(400, { message })` → the page renders `form.message`.
  Infrastructure errors still crash to a 500, as they should.
- **The URL is state you read, not store.** Pages read `page.url` from
  `$app/state` (the runes-era module; `$app/stores` is the old one): Today
  links Log it after with `?what=A`, The Plan opens a routine from
  `?routine=`, and the floor keeps its step in `?step=`.

## 4. Svelte 5: the runes tour

| Rune / feature | Where to look |
|---|---|
| `$state` | `stepI`, `weight`, `reps` on the gym floor — plain variables, deeply reactive; Log it after's `lines[]` is an array of objects, and mutating `l.sets` inside it is enough |
| `$derived` | everything computed from `data.events`; change the stream, the screen recomputes |
| `$derived.by` | a derivation that needs a block: the Ledger's `items` (sessions and week changes interleaved by time), The Plan's `weekSpan`, Log it after's `groups` |
| `$props` | every component; typed destructuring `let { data, form }: PageProps = $props()` |
| `$bindable` | `floor/AdjustTile.svelte` — `bind:value={reps}` two-way binds the floor's number to the tile |
| `$effect` that writes state | Log it after rebuilds `lines` from the rule when `routine` changes, and closes the open line — the one effect in the app that assigns state, because the lines are a *draft* seeded from data, not a derivation of it |
| `Snippet` / `{@render children()}` | `Button`, `Card` — Svelte's children |
| page-local `{#snippet name(args)}` | the Ledger's `stepper` and `editor`, The Plan's `blockRow` — a snippet with parameters is a local component without a file, rendered with `{@render blockRow(b, on)}`. Declare it at the top level of the markup, not inside a component's children |
| `{@const}` | inside an `{#each}`: `{@const done = weekProgress(…)}` on The Plan, `{@const latest = s.id === data.latestSession}` on the Ledger — a value computed once per item |
| `<svelte:window onkeydown>` | gym floor keyboard: ↑↓ reps on a hold or bodyweight tile, otherwise weight; 1–9 reps and 0 = 10; Enter is the primary action; ← → step; Esc closes the sheet. The Ledger's `<svelte:window onclick>` disarms the two-tap Remove |
| `class:` directive | `class:out={card.out}` on Today's card, `class:did` · `class:today` · `class:future` · `class:dark` on a MonthGrid cell, `class:single={tileBW}` on the floor's tile row; StepTable interpolates instead — `class="row {r.state}"` |
| `bind:this` | the floor's hidden Finish form (`finishFormEl`, submitted from a keyboard shortcut), the tab layout's inner scroller, the glyph's canvas |
| scoped `<style>` | every component — the design system's tokens are global (`disciplines.css` too: `.ink-lift` is one rule shared by the calendar, the legend and The Plan), layout is local |
| `use:enhance` with a callback | the Ledger's editor: `use:enhance={() => async ({ update, result }) => { await update(); if (result.type === 'success') editingRow = null; }}` — the row stays open on a refusal, so the message is read where the numbers are |
| `$effect` | `ExerciseGlyph.svelte` — a canvas that stamps baked frames: the effect wires a `ResizeObserver` and a `requestAnimationFrame` loop that plays one pass of the figure's gear, and the function it returns tears both down; a second effect runs the gear on repeat while `loop` is set (a hold in progress) — a rep with its 900 ms rest, a breath without one, a still not at all |
| `bind:clientHeight` | Today measures the room under its card (`slack`) instead of guessing the device: ≥ 150px → the figure strip, ≥ 60px → one mono line, else nothing. Nothing ever half-shows, and nothing scrolls |
| `{#key}` | the gym floor wraps the glyph in `{#key glyphName}`: advancing to the next exercise remounts it, and a fresh mount plays once — a rest on the *same* exercise does not |
| time as input | `restUntil(step, entries, plan)` and `runStart(...)` — the floor passes `now` from a 200 ms ticker that only runs while something is counting, so the rest bar, the run clock and the bell are pure functions of the entries and the time |
| `$derived` over `$state` | the floor's `steps` are derived, not a snapshot: a stretch added from the ⋯ sheet changes `added`, the steps grow a section, and every row, label and estimate follows |
| transitions timed from a token | `TrendRow` opens with `transition:slide={{ duration: OPEN }}` where `OPEN = durationMs('--dur-med', 180)` — the CSS token is the one place the tempo lives |
| `bind:open` | the Why page's `<details bind:open={refsOpen}>`: a cite opens the references before the browser scrolls to the target |
| `afterNavigate` | the tab layout resets its inner scroller on every navigation — the document never scrolls, so the browser can't do it for you |
| `<script module>` | `StepTable` and `FloorSheet` export their row and prop types from a module script, so the page can type what it hands them |
| callback props | `ontoggle`, `onStep`, `onTap`, `onRetry` — a function prop instead of an event dispatcher; the child calls it, the parent owns the state |
| runes in a `.svelte.ts` module | [floor/entry-queue.svelte.ts](src/lib/components/floor/entry-queue.svelte.ts) and [floor/countdown.svelte.ts](src/lib/components/floor/countdown.svelte.ts) — classes with `$state` fields and getters, constructed during the page's init so the `$effect` in the countdown's constructor belongs to the page. The page reads `queue.anyFailed` and `clock.remaining` like any other state; the queue and the clock know nothing about steps, rows or buttons |

One deliberate subtlety: the gym floor snapshots `session` with a plain `const`
(and a `svelte-ignore state_referenced_locally`) because a session's identity
*can't* change while you're on the floor; The Plan and Log it after do the
same when they seed a draft (`intents`, `lines`) from `data`. Knowing when
you *don't* want reactivity is part of learning it.

The glyph is the same lesson from the other side: its playback clock (`start`,
`lastIdx`, the rAF handle) is plain `let`s, not `$state`, because it changes
twelve times a rep and nothing in the template reads it. Reactivity nobody
depends on is work the compiler does for no one. The figures themselves are
data, not code: `src/lib/design/glyph-frames.json` holds 51 figures on one
31 × 31 grid, baked by the repo's own generator in `tools/glyphs/` (seeded
from two Claude Design projects, trimmed to what the bake uses;
`node tools/glyphs/bake.mjs`, and `--check` proves the JSON is what the
generator makes), each in one of three GEARS the JSON carries the timing
for — a `rep` (twelve stamps out and back, then a rest), a `breath` (four
stamps, the hold rising and falling: the planks, chair, warrior II,
savasana) or a `still` (one stamp at full depth: the stretches, pigeon,
sphinx). A hold is not a rep with the ends chopped off; it is a body that
stays where it is and breathes, and `glyphs.ts` only looks a name up and
tells the clock which frame is due in that gear. Tested like the domain:
every plan exercise has a figure, every frame is 31 × 31 and prints, the
frame count follows the gear, a rep moves and a breath rises, the clock holds
on frame 0, and the JSON is what the generator bakes.

## 4½. Lessons from the first real workouts

The first gym session produced a feedback batch, and the week-model rewrite
another; the patterns worth studying:

- **Optimistic UI over an event store**
  ([floor/entry-queue.svelte.ts](src/lib/components/floor/entry-queue.svelte.ts)): "Log
  set" pushes onto the `EntryQueue` and the screen updates in the same
  frame; a single-flight pump POSTs queued entries in order in the
  background, and no invalidation runs mid-session. The safety net is in
  the DOMAIN, not the UI: the decider treats a duplicate `(item, index)`
  as a zero-event no-op, so ambiguous network retries are idempotent, and
  Emmett's `retry: { onVersionConflict: true }` absorbs concurrent appends.
  A set the server rejects stays on the table as a failed row with a Retry
  — marked, never silently removed — and the floor draws the whole queue as
  rows of a step table (confirmed / saving… / current / resting / editing /
  upcoming). A correction rides the same queue with `op: 'correct'`:
  `overlay()` lays the queue over the server's entries, a log adding a row
  and a correction replacing a measure, and that merged list is what the
  rest clock reads — so a set that hasn't reached the server yet still
  starts the clock. Exiting the screen drains the queue, then
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
  step lives in the URL (`/floor?step=6`, plus `&add=` for stretches added
  from the sheet) so refresh keeps your place, but no server load runs and
  no history entries pile up.
- **The locked app shell**
  ([(tabs)/+layout.svelte](src/routes/(app)/(tabs)/+layout.svelte)), stolen
  from the cabin site: on mobile the document itself never scrolls (html/body
  `overflow: hidden`), only an inner `<main>` does, and the tab bar is a plain
  flex child at the bottom — `position: fixed` bars slide when mobile browsers
  collapse their toolbars; an in-flow bar in a locked frame cannot.

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
3. **A fifth block.** Add `'swim'` to `BlockId` and let the compiler walk
   you: `allBlocksOn`, `blockLabel`, `WEEK_OF_PLAN` (what did choosing an old
   plan mean for it?), a `Discipline` if it needs one — `disciplineLabel`,
   `NEEDS`, MonthGrid's `INK`, `disciplines.css` — and the block itself in
   `BLOCKS`. Nothing in a screen should need to change. Then switch it off
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
   [db.ts](src/lib/server/db.ts) `withClient` and
   [eventStore.ts](src/lib/server/eventStore.ts) `withEventStore` open a
   fresh `pg.Client` per unit of work in prod (Emmett takes it via
   `connectionOptions: { client }`) and close it — awaited — before
   returning; dev keeps cached singletons because a Node process owns its
   sockets. A second scar, same shape: the connection string is resolved
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
