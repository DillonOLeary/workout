# LEDGER — Training Ledger

Dillon's single-user workout tracker. Ergonomics-first (56px+ hit targets,
full keyboard control, big mono numbers), event-sourced, paper-and-volt.

Track the work. The rule does the rest, one set at a time: hit the top of the
range on a set → that set takes the next size up next time. Miss the bottom of
the range on the same set twice in a row → it backs off one size; two weeks
away → everything comes back one size lighter. Every move lands on a real
rack size, so it never asks you for a 37.5 lb kettlebell.

**Stack**: SvelteKit (Svelte 5) · [Emmett](https://event-driven-io.github.io/emmett/)
PostgreSQL event store · Neon · TypeScript.

New here? Read [WALKTHROUGH.md](WALKTHROUGH.md) — a guided tour of the code as
a Svelte + event-sourcing course.

Wondering whether the plans are any good? [TRAINING.md](TRAINING.md) is the
sourced case for them, plus the training fundamentals behind the one rule.
The same thing lives in the app at `/plan/why`.

## Run it

```sh
pnpm install
pnpm dev
```

Needs `.env.local` (git-ignored):

```
DB=postgres://…            # Neon connection string
LEDGER_PEPPER=…            # any random secret; HMACs phone numbers into account ids and signs the cookie
```

Dev talks to Neon directly: [vite.config.ts](vite.config.ts) hands `DB` to
wrangler's local Hyperdrive emulation, which otherwise refuses to start.

Log in with a phone number — no password; a signed cookie keeps the device
signed in, and the same number reaches the same ledger from any device.
Empty phone → the shared demo sandbox.

## Layout

```
src/lib/design/       design tokens (colors, type, spacing, effects, motion)
src/lib/components/   Button, Card, TabBar, Stepper, … (Svelte 5 ports of the DS)
src/lib/domain/       events, commands, decider, projections — pure, no I/O
src/lib/server/       Emmett event store, plans table, HMAC login (server-only)
src/routes/           login · Today / The Plan / Ledger / Why · /log gym floor
```

## Checks

```sh
pnpm test     # vitest — the pure domain: decider, progression fold, racks
pnpm check    # svelte-check
pnpm build    # production build
```
