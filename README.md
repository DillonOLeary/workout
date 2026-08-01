# LEDGER — Training Ledger

Dillon's single-user workout tracker. Ergonomics-first (56px+ hit targets,
full keyboard control, big mono numbers), event-sourced, paper-and-volt.

Track the work. The rule does the rest: hit every set at the top of the range
→ take the next size up next time; stall three sessions at one weight → step
back about 10% and build it again. Both directions move along real rack sizes,
so it never asks you for a 37.5 lb kettlebell.

**Stack**: SvelteKit (Svelte 5) · [Emmett](https://event-driven-io.github.io/emmett/)
PostgreSQL event store · Neon · TypeScript.

New here? Read [WALKTHROUGH.md](WALKTHROUGH.md) — a guided tour of the code as
a Svelte + event-sourcing course.

Wondering whether the plans are any good? [TRAINING.md](TRAINING.md) is the
sourced case for them, plus the training fundamentals behind the one rule.
The same thing lives in the app at `/why`.

## Run it

```sh
pnpm install
pnpm dev
```

Needs `.env.local` (git-ignored):

```
DB=postgres://…            # Neon connection string
LEDGER_PEPPER=…            # any random secret; HMACs phone numbers into /u/<id> URLs
```

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
pnpm check    # svelte-check
pnpm build    # production build
```
