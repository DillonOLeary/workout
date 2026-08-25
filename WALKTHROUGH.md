# LEDGER — a guided tour

This app exists twice: once as a working workout tracker, and once as a course
in **Svelte 5 + SvelteKit + event sourcing with Emmett**. This file is the
course. Read it with the code open.

## 0. The 30-second architecture

```
 browser (Svelte 5 components, runes state)
    │  <form method="POST"> … use:enhance
    ▼
 form action (+page.server.ts)            ← generates ids/timestamps
    │  command e.g. { type: 'LogEntry', data: {…} }
    ▼
 decider (src/lib/domain/decider.ts)      ← pure: decide(command, state) → events | throws
    │  via Emmett's DeciderCommandHandler
    ▼
 PostgreSQL event store on Neon           ← emt_messages: append-only facts
    │
    ▼
 load() re-reads the stream → upcast → projections (pure folds) → the rule, the words → the UI you see
```

One loop. Every button in the app goes around it.

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

Run it: `pnpm dev` → http://localhost:5173

One wrinkle: `adapter-cloudflare` emulates the Worker bindings from
[wrangler.jsonc](wrangler.jsonc) in dev, and wrangler won't emulate the
`HYPERDRIVE` binding without a Postgres string in
`process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` — a
variable Vite never sets from `.env.local`. [vite.config.ts](vite.config.ts)
bridges that by copying `DB` into it at startup, so local "Hyperdrive" is
just Neon, `DB` stays the one secret, and the Hyperdrive branch of
[hooks.server.ts](src/hooks.server.ts) runs in dev exactly as in prod.

## 2. Event sourcing: the mental model

Most apps store **current state** (a `sets` table you UPDATE). Event sourcing
stores **what happened** (facts, appended, never edited) and computes state on
demand. Current state becomes a cache; history becomes the truth.

### The layers — one job per file

The domain folder is small, and every file does exactly one job. Knowing
which job a file has tells you what belongs in it — and what doesn't:

| layer | file | the job | the rule of the layer |
|---|---|---|---|
| **vocabulary** | [measure.ts](src/lib/domain/measure.ts), [events.ts](src/lib/domain/events.ts), [commands.ts](src/lib/domain/commands.ts) | the measure, the facts, the requests | closed unions, self-describing, past / imperative tense — and the *current* shape only |
| **read boundary** | [upcast.ts](src/lib/domain/upcast.ts) | translate stored rows into today's vocabulary | the only place shape inference lives; an unknown name throws |
| **rules** | [decider.ts](src/lib/domain/decider.ts) | accept or refuse a command | state holds only what a rule needs; validates shape, never meaning |
| **read model** | [projections.ts](src/lib/domain/projections.ts) | what happened — per session, per exercise, per week | pure folds over events; removal applied once; `now` is an argument |
| **policy** | [progression.ts](src/lib/domain/progression.ts) | what every set should be next time | a function of (history, exercise, now) — knows nothing about events |
| **words** | [labels.ts](src/lib/domain/labels.ts) | every phrase about a set, a load, a range | one implementation per phrase, tested as strings |
| **reference** | [plan.ts](src/lib/domain/plan.ts), [plans.ts](src/lib/domain/plans.ts), [racks.ts](src/lib/domain/racks.ts), [steps.ts](src/lib/domain/steps.ts) | the plan model, the shipped plans, the ladders, the walk | parsed at *its* boundary too — a plan row is data from outside, like an event row |

Dependencies point one way — `measure ← events ← upcast ← decider`,
`projections → progression → plan → racks`, and `labels` sits between
`progression` and the screens — so a file never reaches up. When something
feels like it belongs in two places, the table says which. The smell that
produced this shape was `projections.ts` holding the read model, the rule
*and* the words at once, while every screen re-derived the words for itself.

### The measure, and the five facts

[measure.ts](src/lib/domain/measure.ts) is the heart of the vocabulary. An
entry measures exactly one of:

| measure | what it says | who writes it |
|---|---|---|
| `load` | a weighted set: load × reps | a `load` exercise |
| `reps` | a bodyweight count | a `reps` exercise (dead bug, sun salutation) |
| `hold` | seconds held, and the bell aimed for | a `hold` exercise |
| `duration` | minutes | the run |
| `step` | it happened | a warm-up line, a cooldown stretch, a walk |

The three questions every screen asks — `isSet`, `countOf`, `loadOf` — are
exhaustive switches in the same file, so adding a variant fails to compile
in one place instead of miscounting somewhere in a route. `parseMeasure`
rebuilds a form's JSON from the fields each variant owns ("parse, don't
validate"); `validateMeasure` is the decider's bounds, kept next to the type
they govern; `measureFor(exercise, …)` is the one place "which variant does
this exercise write" is decided. Note there is no "load of 0 means
bodyweight": a convention is exactly what a union exists to remove.

[events.ts](src/lib/domain/events.ts) then names the five facts:

| Event | Meaning |
|---|---|
| `SessionStarted` | a workout began: which plan, which **workout** (`{ kind: 'lift', day }` or `{ kind: 'run' }`), and `mode` — `live` (the floor walked it) or `after` (written in one shot, backdated) |
| `EntryLogged` | one entry: `item` + `index` is its identity, `measure` is what it measured |
| `SessionFinished` | the workout ended |
| `SessionRemoved` | the event-sourced delete — a fact about a fact |
| `PlanSelected` | you switched programs |

A **workout is a session: an ordered list of entries, each with one
measure**. A lift is a session of sets; a run is a session with one
`duration` entry; a warm-up line is an entry too. *Guided* and *logged after
the fact* are not two kinds of thing: they are **when** the same events get
written. Two habits keep the file honest: it describes the current shape
only (no field is optional merely because old rows lack it — filling those
is the upcaster's job), and an event carries what a reader needs and nothing
a reader never uses (`plan` and the workout live on `SessionStarted` alone;
an entry names its session, and the session says the rest).

Names are **past tense** — an event can't be rejected, it already happened.
Requests that *can* be rejected are **commands**, named in the imperative
(`StartSession`, `LogEntry`, `LogAfter` — [commands.ts](src/lib/domain/commands.ts)).

### The read boundary — the upcaster

The stream still holds `SetLogged`, `RunLogged`, `RunRemoved` and
`SessionStruck` rows from earlier vocabularies, `SessionStarted` rows with
no `mode` and a run spelled `day: 'run'`, and four days of bodyweight sets
written as a load of 0 — **nothing in Postgres was rewritten**.
[upcast.ts](src/lib/domain/upcast.ts) translates each row as it is read,
and it is one-to-*many*: a stored `RunLogged` comes back as a whole
backdated session (started · one duration entry · finished), exactly what
logging a run after the fact writes today. Every reader — the decider's
fold and every projection — sees only the current vocabulary.

Three habits make it the *only* place shape inference lives. When a shape
changes, the event's **name** changes with it (`SetLogged → EntryLogged`,
`SessionStruck → SessionRemoved`), so a case is keyed by name, never by
sniffing fields. A new field is filled here with its default, so the
current type can make it required. And an unknown name **throws** — a row
nobody can read is a bug, not a no-op. The one dated exception (a load of 0
read as `reps`) was checked against the whole stream before it was written,
and its comment says so. `upcast.test.ts` pins every case, including that
reading twice is reading once.

### The decider — the write side

[decider.ts](src/lib/domain/decider.ts) is three pure functions:

- `initialState()` — a fresh ledger: no active session, no plan chosen
- `evolve(state, event)` — how one fact changes state (a reducer)
- `decide(command, state)` — the business rules. Returns new events, or throws
  (`IllegalStateError: A session is already in progress — finish it first.`)

Notice what state holds: **only what the rules need** — the id of the open
session and the entries it has (so a retried request is a no-op), which plan
is active, which sessions exist and which were removed. Not the workout
history, and not even what the open session *is*: the layout asks each layer
its own question — "is a session open?" to the decider, "what is it?" to
`projectSessions` — and they cannot disagree, because both fold the same
events. The one-live-slot rule is plain: a start takes the slot only when
nothing is open, which is all a backdated `LogAfter` batch (started ·
entries · finished, in one append) ever needed. `mode` is a recorded fact,
not a rule input.

Notice also what's *not* here: `crypto.randomUUID()` and `new Date()` live in
the form actions and are passed **into** commands, so the decider is
deterministic and trivially testable. And the decider validates **shape,
never meaning**: it doesn't know the plan, so it cannot say whether "Goblet
Squat #4" is a set the day asked for. The plan says what an entry means; the
decider says whether it can be recorded.

### Emmett glues the decider to Postgres

[src/lib/server/ledger.ts](src/lib/server/ledger.ts):

```ts
const handle = DeciderCommandHandler({ decide, evolve, initialState });
handle(eventStore, `ledger-${uid}`, command);
```

That one call: reads every event in the stream → folds them with `evolve` →
runs `decide` → appends the result, **expecting the stream version it read**.
If two tabs race, the second append fails instead of silently clobbering —
that's optimistic concurrency, and you got it for free.

The store itself ([src/lib/server/eventStore.ts](src/lib/server/eventStore.ts))
migrated Neon on first use. Go look — this is your data now:

```sql
select stream_id, stream_position, message_type, message_data
from emt_messages order by global_position;

select stream_id, stream_position from emt_streams;  -- the concurrency version
```

Streams: this app uses **one stream per user** (`ledger-u-…`) because the
product is literally "one ledger per person". Bigger systems usually stream
per aggregate (per order, per cart) so streams stay short.

### Projections — the read side

[src/lib/domain/projections.ts](src/lib/domain/projections.ts) is pure folds
over the event list, each answering one question for a screen — and nothing
else lives there:

- `projectSessions` → the "By day" view's history cards: each session's rows,
  each row's sets *as the measures the entries carried*. Removed sessions are
  excluded here, and only here, so one exclusion makes the whole app behave
  as if the workout never happened
- `historyFor` → the seam between the read model and the rule: one exercise's
  sets per session, newest first, the session in progress left out — exactly
  what `suggest` reads
- `trendFor` → one exercise over time: the last seven sessions as points, what
  the rule has queued next, and ONE status sentence ("35 lb since Jul 11 — 6
  sessions, no change", "Set 1 at the top of the range — 40 lb next time",
  "Re-entry haircut in 3 days"). Today's "How it's going" list is this fold
  run per exercise at request time — no stored projection, no new events
- `weekStrip` / `dayAges` → this week's seven cells (lifted / ran / today) and
  how old each plan day is, for the re-entry nudge
- `nextDay` → which lift is due (alternate from the last finished lift; runs
  don't count)
- `weekRunMinutes` → run minutes in the trailing 7 days, against the plan's
  own `runTarget`
- `activePlanId` → last `PlanSelected` wins

Even "is a session open?" is a projection (`currentState(events).activeSession`
in [+layout.server.ts](src/routes/(app)/+layout.server.ts)) — the same
`evolve` that guards writes answers the UI. Nothing is stored twice, so nothing
can disagree.

These projections re-run per request (cheap at personal scale, and events are
read once per page anyway). When that stops scaling, Emmett can maintain
**stored projections** (Pongo / SQL) updated as events append — same concept,
cached.

### The rule — progression.ts

[src/lib/domain/progression.ts](src/lib/domain/progression.ts) is **policy,
not projection**: `suggest(history, exercise, now)` answers "what should every
set be next time" and knows nothing about events. Three axes, chosen by the
exercise's `kind` (see the plan, below):

- `load` — SET BY SET, "dynamic double progression": each set's suggestion
  comes from the same set last time (top of the range → *that* set takes the
  next size up), with two ways down — the same set missed twice inside a
  fortnight backs off one size (`adjust`), and more than a fortnight away
  brings every set back one size (`reentry`), never below the plan's start
- `hold` — ring the bell → +inc seconds next time, capped at the ceiling;
  past the ceiling the answer is a harder variation, never a longer hold
- `reps` — carry last time's count, capped at the ceiling

The answer's *shape follows the kind* — a `Suggestion` is weights-and-reps,
or counts-and-a-ceiling — so no screen reads a weight of 0 as "bodyweight".
Every move walks the real ladders in [racks.ts](src/lib/domain/racks.ts), so
a suggestion is always a bell that exists; and the ± tiles on the floor call
the same one-size step (`bumpLoad`, `bumpCount`), so a hand-dialled number
lands on the same sizes. `nextSet` is the rule *inside* a session: set 2 can
legitimately ask for less than set 1, unless you overrode the ledger on set 1
— then the override sticks for the rest of the exercise. `now` is a
parameter with no default, so time is data the rule receives, never a clock
it reads.

### The words — labels.ts

[src/lib/domain/labels.ts](src/lib/domain/labels.ts) holds every phrase a
screen shows about a set, a load or a range — `setsLine` ("35 lb · 12 · 9 ·
5", "8 L · 8 R"), `doseLabel` ("3 × 6–12 · per side"), `loadHint` (the one
line before set 1: "Set 1 goes up to 40 lb — sets 2–3 stay at 35."), and the
rest — written once and tested as strings. The per-hand and per-side
questions must be answered identically on the plan screen, the gym floor and
the ledger; two screens phrasing "3 × 8–12" differently is how a lunge ends
up meaning two different workouts. `setsLine` reads the measures alone, so a
retired exercise still renders exactly as it was logged.

### The session is a list of steps

[src/lib/domain/steps.ts](src/lib/domain/steps.ts) turns a workout (a plan
day, or the run) into the list the gym floor walks: warm-up lines, every set with a rest before
the next, the cooldown — or, for a run, walk · run · walk. Steps are
**derived from the plan, never stored**. Which ones are done is read from
the session's entries; a rest is done when the set after it is, or when its
clock has simply run out — rests are timed from the previous entry's
timestamp and never written, which is why a reload lands back on the same
countdown. Warm-up and cooldown lines *are* written (as `step` entries) so
"Step 6 of 24" is honest after a reload — but the by-day view keeps them to
one quiet line, and the progression rule never sees them.

### Not everything is an event — and the plan has a boundary too

Plans are reference data — rows in `ledger_plans`
([src/lib/server/plans.ts](src/lib/server/plans.ts)), UPSERTed, no history.
Events point at them by id. Deciding *what deserves history* is the actual
modelling skill; the Insert card on `/plan/change` does both writes side by
side: plan row → table, `PlanSelected` → ledger.

[src/lib/domain/plan.ts](src/lib/domain/plan.ts) is the model. An exercise's
**kind** — `load` | `hold` | `reps` — decides which measure a set writes,
which axis progression moves and how a number reads; a field that only means
something for one kind (`start`, `inc`, `rack`, `each`) exists only on that
kind, so every consumer switches on `kind` and the compiler checks the
switch. That is the whole "escalation path": a named choice per exercise,
three of them, not a combination of flags. The plan's defaults (rest 60 s,
run target 150 min, runs on) live here once, behind `restFor` / `runTarget`
/ `hasRuns` — no screen writes `?? 150` for itself.

A plan row is data from outside, exactly like an event row — so `parsePlan`
is its read boundary, and it runs on *read* as well as insert: legacy flags
become a kind, a one-line warm-up becomes a list, a pasted typo is refused
with a sentence, and a stored row nobody can read is logged and skipped,
never a 500. One consequence worth knowing: editing `DEFAULT_PLANS` in
[plans.ts](src/lib/domain/plans.ts) *is* the migration. `ensureReady`
upserts the shipped plans on every boot, so a new exercise, a widened rep
range or a rewritten note reaches every database the next time a worker
starts — no migration file, no upcaster. History for an exercise that has
since left the plan stays in the stream under its old name, and the By day
view still renders it correctly, because the measure says what it was: a
retired "Weighted Plank" is still `45s`, not `45`.

### Tests — the domain is pure, so test it like arithmetic

`pnpm test` runs vitest over [src/lib/domain](src/lib/domain), one suite per
layer: `decider.test.ts` (the write-side rules), `upcast.test.ts` (every
retired shape, and that reading twice is reading once), `progression.test.ts`
(the rule, against a `History` literal — no events needed), `labels.test.ts`
(every phrase, as a string), `projections.test.ts` (the folds, fed the
retired `SetLogged` shape on purpose so the boundary is proved every run),
`plan.test.ts` (the plan's boundary and its defaults), `steps.test.ts` and
`racks.test.ts`. Two things make these cheap to write: nothing in the domain
does I/O, and every fold that needs the time takes `now` as an argument — a
test builds a history with "15 days ago" arithmetic and never touches the
clock. The config is a separate
[vitest.config.ts](vitest.config.ts) so the suite doesn't load the SvelteKit
plugin (and, with it, wrangler's Hyperdrive emulation).

## 3. SvelteKit: the mental model

Routing is the filesystem:

```
src/routes/
├─ +layout.svelte                 global CSS import, favicon
├─ login/                         phone → HMAC id → signed stay-signed-in cookie
└─ (app)/                         layout GROUP — every page inside requires the cookie
   ├─ +layout.server.ts           ONE load for all pages: plans + events (uid from locals)
   ├─ (tabs)/                     nested group — the TabBar shell
   │  ├─ +page.svelte             Today        (/)
   │  ├─ ledger/+page.svelte      By day — the chronological view, a child of Today (/ledger)
   │  ├─ plan/+page.svelte        The Plan     (/plan)
   │  ├─ plan/change/             other plans + the plans table, and its actions (/plan/change)
   │  └─ plan/why/+page.svelte    the cited case — a child of The Plan (/plan/why)
   ├─ log/+page.svelte            gym floor — outside (tabs): no tab bar  (/log)
   └─ export/+server.ts           GET /export: the stream as a JSON download
```

Identity never rides in the URL: [hooks.server.ts](src/hooks.server.ts) verifies
a signed, HttpOnly cookie on every request into `locals.uid` and re-issues it
(sliding 400-day expiry — sign in once per device, stay signed in). Sharing a
link shares nothing; the retired `/u/<id>` capability URLs 301 to /login.

Things to notice:

- **`+page.server.ts` runs only on the server.** So do all of `$lib/server/*`
  (SvelteKit enforces this — importing them from a component is a build error).
  Your DB password cannot leak into the client bundle.
- **Layout data merges down.** The `[uid]` layout loads `{ plans, events,
  activeSession }` once; every child page receives it as `data`.
- **Form actions are the only mutations.** No API routes, no fetch handlers —
  `<form method="POST" action="?/logSet">` works with JS disabled, and
  `use:enhance` upgrades it to a fetch that re-runs `load` and updates `data`
  in place. The one exception that proves the rule is the gym floor's set
  queue, which POSTs the same `?/logSet` action by hand (§4½) — but even
  there, Finish is a real hidden `<form use:enhance>`.
- **Errors flow as data.** The decider throws → the action catches
  (`tryCommand`) → `fail(400, { message })` → the page renders `form.message`.
  Infrastructure errors still crash to a 500, as they should.

## 4. Svelte 5: the runes tour

| Rune / feature | Where to look |
|---|---|
| `$state` | `exI`, `weight`, `reps` on the gym floor — plain variables, deeply reactive |
| `$derived` | everything computed from `data.events`; change the stream, the screen recomputes |
| `$props` | every component; typed destructuring `let { data, form }: PageProps = $props()` |
| `$bindable` | `Stepper.svelte` — `bind:value={runMin}` two-way binds parent state |
| `Snippet` / `{@render children()}` | `Button`, `Card` — Svelte's children |
| `<svelte:window onkeydown>` | gym floor keyboard: ↑↓ weight, 1–9 reps, Enter logs |
| `class:` directive | `class:single={isBW}` on the floor's adjust tiles; row states on the set table |
| scoped `<style>` | every component — the design system's tokens are global, layout is local |
| `$effect` | `ExerciseGlyph.svelte` — a canvas that plays one rep: the effect wires a `ResizeObserver` and a `requestAnimationFrame` loop, and the function it returns tears both down |
| `{#key}` | the gym floor wraps the glyph in `{#key ex.name}`: advancing to the next exercise remounts it, and a fresh mount plays once |
| time as input | `sessionProgress(steps, entries, now)` — the floor passes `now` from a 200 ms ticker, so rests, the run clock and "done" are one pure fold |

One deliberate subtlety: the gym floor snapshots `session` with a plain `const`
(and a `svelte-ignore state_referenced_locally`) because a session's identity
*can't* change while you're on the floor. Knowing when you *don't* want
reactivity is part of learning it.

The glyph is the same lesson from the other side: its playback clock (`start`,
`lastIdx`, the rAF handle) is plain `let`s, not `$state`, because it changes six
times a rep and nothing in the template reads it. Reactivity nobody depends on
is work the compiler does for no one. The poses themselves live in
`src/lib/design/glyphs.ts` — pure functions of a depth `d` in 0..1, so they are
unit-tested like the domain: every plan exercise maps to a pose, every pose
prints at every frame, and the working frame differs from rest.

## 4½. Lessons from the first real workout

The first gym session produced a feedback batch; three of the fixes are
patterns worth studying:

- **Optimistic UI over an event store**
  ([log/+page.svelte](src/routes/(app)/log/+page.svelte)): "Log set" appends
  to a client-side `$state` queue and the screen updates in the same frame;
  a single-flight `pump()` POSTs queued sets in order in the background, and
  no invalidation runs mid-session. The safety net is in the DOMAIN, not the
  UI: the decider treats a duplicate `(exercise, set)` as a zero-event no-op,
  so ambiguous network retries are idempotent, and Emmett's
  `retry: { onVersionConflict: true }` absorbs concurrent appends. A set the
  server rejects stays on the table as a failed row with a Retry — marked,
  never silently removed — and the floor draws the whole queue as rows of a
  set table (confirmed / saving… / current / upcoming), which replaced the
  old progress rail. Exiting the screen drains the queue, then
  `goto(..., { invalidateAll: true })` restores server truth.
- **Schema evolution without migration**
  ([events.ts](src/lib/domain/events.ts)): planks became seconds-based by
  ADDING an optional `unit?: 'reps' | 's'` field whose absence means what old
  events always meant. Never repurpose an existing field — history must
  replay unchanged forever. And when a NAME retires (`SessionStruck` became
  `SessionRemoved` to match the UI's ubiquitous language), an **upcaster**
  translates old events at read time: `upcast` ([upcast.ts](src/lib/domain/upcast.ts))
  runs at both read boundaries — `readLedgerEvents` for projections, the top
  of `evolve` for the decider fold — so `SessionStruck` rows stay in Postgres
  forever while no living code knows the old word. The same additive field is
  what let the med-ball plank retire without a migration: its events say
  `unit: 's'`, so By day formats them as seconds long after no plan knows the
  name. And `unit` has since retired in turn: the `Measure` union replaced
  it, `SetLogged` became `EntryLogged`, and the upcaster reads a `unit: 's'`
  row as a `hold` measure. Same two moves each time — add a field, then
  rename the event and translate at the boundary — and the stream never
  changes.
- **Shallow routing** (`replaceState` from `$app/navigation`): the current
  step lives in the URL (`/log?step=6`) so refresh keeps your place, but no
  server load runs and no history entries pile up.
- **The locked app shell**
  ([(tabs)/+layout.svelte](src/routes/(app)/(tabs)/+layout.svelte)), stolen
  from the cabin site: on mobile the document itself never scrolls (html/body
  `overflow: hidden`), only an inner `<main>` does, and the tab bar is a plain
  flex child at the bottom — `position: fixed` bars slide when mobile browsers
  collapse their toolbars; an in-flow bar in a locked frame cannot.

## 5. Exercises

1. **Corrections, the event-sourced way.** Add a `SetCorrected` event
   (retract/assert — never mutate `SetLogged`). Touch: `events.ts`,
   `commands.ts`, `decide`/`evolve`, and make `projectSessions` apply it.
   A worked example now exists: `SessionRemoved` (the Ledger's "Remove"
   button, born as `SessionStruck`) — deleting a workout appends a fact
   instead of removing one,
   the decider's state tracks known/struck ids to refuse nonsense and
   no-op repeats, and one exclusion inside `projectSessions` makes every
   downstream view (progression, next-day, history) forget it at once.
2. **Rest timer.** 90s countdown on the gym floor after each logged set —
   your first `$effect` (start it in `enhanceLog`, clean it up properly).
3. **Import.** `export/+server.ts` dumps events; write the reverse (validate,
   then append — through the decider or not? decide and defend it).
4. **Stored projection.** Move `projectSessions` into a Pongo projection with
   `emmett-postgresql` and compare.
5. **Deploy — done (with a scar worth studying).** The first production bug
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
   sockets. The latency cost of those per-request connects is paid for by
   **Hyperdrive** ([wrangler.jsonc](wrangler.jsonc) binding +
   [hooks.server.ts](src/hooks.server.ts)): an edge-local pooler, so a fresh
   connect is ~ms while the real Neon connections stay warm at Cloudflare.
   One landmine found the hard way: Hyperdrive's SELECT cache (default 60s)
   served **stale event streams** right after a write — cache-invalidation
   semantics and "the stream is the truth" are incompatible, so caching is
   disabled on the config (`wrangler hyperdrive update <id> --caching-disabled`).
   This runs on Cloudflare Workers via `adapter-cloudflare`
   ([wrangler.jsonc](wrangler.jsonc)): the `nodejs_compat` flag gives `pg` its
   TCP sockets and `node:crypto` its HMAC; `DB` + `LEDGER_PEPPER` live in the
   Cloudflare dashboard; `keep_vars` stops deploys from wiping them.
   Deploy by pushing to main (Workers Builds) or `npx wrangler deploy`.
