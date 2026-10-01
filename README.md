# LEDGER

A single-user, event-sourced workout tracker. Track the work; the rule does the
rest, one set at a time: hit the top of the range on a set and that set takes
the next size up next time; miss the bottom twice in a row and it backs off one
size; two weeks away and everything comes back one size lighter. Every move
lands on a real rack size, so it never asks you for a 37.5 lb kettlebell.

The week is four practices — a lift programme, yoga, a morning stretch, an
easy run — each on or off, each at the cadence you set; five floor sessions
stand in for the lift whenever you pick one. Three tabs: **Today** ranks the
practices and answers "what should I do?" with one button, the **Ledger** is
the stream made readable (the latest session can be corrected, older history is
immutable), and the **Plan** is the rules' inputs. The floor covers the tabs
while a session is walked; a strip of cells along its top is the whole session,
and a tap on it opens every section to go to, skip or fix. Every screen is built from one thirteen-part kit in
`src/lib/ui/` — `/kit` renders every part in every state in dev.

**Stack**: SvelteKit (Svelte 5) · [Emmett](https://event-driven-io.github.io/emmett/)
PostgreSQL event store · Neon · Cloudflare Workers · TypeScript.

New here? [WALKTHROUGH.md](WALKTHROUGH.md) is the tour.

## Run it

```sh
pnpm install
pnpm dev
```

Needs `.env.local` (git-ignored): `DB` (a Postgres connection string) and
`LEDGER_PEPPER` (any random secret — it HMACs phone numbers into account ids and
signs the cookie). Dev against a local Postgres, never production: create a
database, point `DB` at it as `postgres://user:password@localhost:5432/ledger`
(wrangler's Hyperdrive emulation insists on a user and a password), and the
first `pnpm dev` creates the event-store schema. Log in with a phone number — no
password; an empty phone is the shared demo sandbox.

## Checks

```sh
pnpm check    # types, tests and the glyph snapshot — the gate a deploy runs
pnpm test     # vitest alone, one suite per domain layer
pnpm build    # production build
```

Deploy: push to `main` — Cloudflare Workers Builds runs `pnpm check`, then builds.
