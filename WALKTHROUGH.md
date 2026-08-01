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
    │  command e.g. { type: 'LogSet', data: {…} }
    ▼
 decider (src/lib/domain/decider.ts)      ← pure: decide(command, state) → events | throws
    │  via Emmett's DeciderCommandHandler
    ▼
 PostgreSQL event store on Neon           ← emt_messages: append-only facts
    │
    ▼
 load() re-reads the stream → projections (pure folds) → the UI you see
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

## 2. Event sourcing: the mental model

Most apps store **current state** (a `sets` table you UPDATE). Event sourcing
stores **what happened** (facts, appended, never edited) and computes state on
demand. Current state becomes a cache; history becomes the truth.

### The five facts

[src/lib/domain/events.ts](src/lib/domain/events.ts)

| Event | Meaning |
|---|---|
| `SessionStarted` | you walked onto the floor |
| `SetLogged` | one set: exercise, weight, reps |
| `SessionFinished` | you walked off |
| `RunLogged` | minutes of running |
| `PlanSelected` | you switched programs |

Names are **past tense** — an event can't be rejected, it already happened.
Requests that *can* be rejected are **commands**, named in the imperative
(`StartSession`, `LogSet` — [src/lib/domain/commands.ts](src/lib/domain/commands.ts)).

### The decider — the write side

[src/lib/domain/decider.ts](src/lib/domain/decider.ts) is three pure functions:

- `initialState()` — a fresh ledger: no active session, no plan chosen
- `evolve(state, event)` — how one fact changes state (a reducer)
- `decide(command, state)` — the business rules. Returns new events, or throws
  (`IllegalStateError: A session is already in progress — finish it first.`)

Notice what state holds: **only what the rules need** (is a session open?
which plan?). Not the workout history — that's the read side's job.

Notice also what's *not* here: `crypto.randomUUID()` and `new Date()` live in
the form actions and are passed **into** commands, so the decider is
deterministic and trivially testable.

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

[src/lib/domain/projections.ts](src/lib/domain/projections.ts) is a bag of pure
folds, each answering one question from the same events:

- `projectSessions` → the Ledger tab's history cards
- `nextDay` → which workout is due (alternate from last finished session)
- `nextLoad` + `earnedIncrease` → the progression rule ("all sets at the top of
  the range → add the smallest increment"), and `stallStreak` + `deloadWeight`
  → its downward half ("three sessions stuck at one weight → step back ~10%")
- `weekRunMinutes` → run minutes in the trailing 7 days, against the plan's
  own `runTarget`
- `activePlanId` → last `PlanSelected` wins

Even "is a session open?" is a projection (`currentState(events).activeSession`
in [+layout.server.ts](src/routes/u/[uid]/+layout.server.ts)) — the same
`evolve` that guards writes answers the UI. Nothing is stored twice, so nothing
can disagree.

These projections re-run per request (cheap at personal scale, and events are
read once per page anyway). When that stops scaling, Emmett can maintain
**stored projections** (Pongo / SQL) updated as events append — same concept,
cached.

### Not everything is an event

Plans are reference data — rows in `ledger_plans`
([src/lib/server/plans.ts](src/lib/server/plans.ts)), UPSERTed, no history.
Events point at them by id. Deciding *what deserves history* is the actual
modelling skill; the Insert card (behind "Advanced" on The Plan tab) does both
writes side by side: plan row → table, `PlanSelected` → ledger.

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
   │  ├─ plan/+page.svelte        The Plan     (/plan)
   │  └─ ledger/+page.svelte      Ledger       (/ledger)
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
  in place. The gym floor uses the callback form to flash volt and auto-advance
  ([log/+page.svelte](src/routes/u/[uid]/log/+page.svelte), `enhanceLog`).
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
| `class:` directive | `class:done={i < done}` on the set-pips rail |
| scoped `<style>` | every component — the design system's tokens are global, layout is local |

One deliberate subtlety: the gym floor snapshots `session` with a plain `const`
(and a `svelte-ignore state_referenced_locally`) because a session's identity
*can't* change while you're on the floor. Knowing when you *don't* want
reactivity is part of learning it.

## 4½. Lessons from the first real workout

The first gym session produced a feedback batch; three of the fixes are
patterns worth studying:

- **Optimistic UI over an event store**
  ([log/+page.svelte](src/routes/u/[uid]/log/+page.svelte)): "Log set" appends
  to a client-side `$state` queue and the screen updates in the same frame;
  a single-flight `pump()` POSTs queued sets in order in the background, and
  no invalidation runs mid-session. The safety net is in the DOMAIN, not the
  UI: the decider treats a duplicate `(exercise, set)` as a zero-event no-op,
  so ambiguous network retries are idempotent, and Emmett's
  `retry: { onVersionConflict: true }` absorbs concurrent appends. Exiting the
  screen drains the queue, then `goto(..., { invalidateAll: true })` restores
  server truth.
- **Schema evolution without migration**
  ([events.ts](src/lib/domain/events.ts)): planks became seconds-based by
  ADDING an optional `unit?: 'reps' | 's'` field whose absence means what old
  events always meant. Never repurpose an existing field — history must
  replay unchanged forever. And when a NAME retires (`SessionStruck` became
  `SessionRemoved` to match the UI's ubiquitous language), an **upcaster**
  translates old events at read time: `upcastLedgerEvent` runs at both read
  boundaries — `readLedgerEvents` for projections, the top of `evolve` for
  the decider fold — so `SessionStruck` rows stay in Postgres forever while
  no living code knows the old word.
- **Shallow routing** (`replaceState` from `$app/navigation`): the current
  exercise lives in the URL (`/log?ex=2`) so refresh keeps your place, but no
  server load runs and no history entries pile up.
- **The locked app shell**
  ([(tabs)/+layout.svelte](src/routes/u/[uid]/(tabs)/+layout.svelte)), stolen
  from the cabin site: on mobile the document itself never scrolls (html/body
  `overflow: hidden`), only an inner `<main>` does, and the tab bar is a plain
  flex child at the bottom — `position: fixed` bars slide when mobile browsers
  collapse their toolbars; an in-flow bar in a locked frame cannot.

## 5. Exercises

1. **Corrections, the event-sourced way.** Add a `SetCorrected` event
   (retract/assert — never mutate `SetLogged`). Touch: `events.ts`,
   `commands.ts`, `decide`/`evolve`, and make `projectSessions` apply it.
   A worked example now exists: `SessionStruck` (the Ledger's "Strike"
   button) — deleting a workout appends a fact instead of removing one,
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
