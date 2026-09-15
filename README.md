# LEDGER

A single-user, event-sourced workout tracker. Track the work; the rule does the
rest, one set at a time: hit the top of the range on a set and that set takes
the next size up next time; miss the bottom twice in a row and it backs off one
size; two weeks away and everything comes back one size lighter. Every move
lands on a real rack size, so it never asks you for a 37.5 lb kettlebell.

The week is one lift programme plus the blocks you have on — yoga, a morning
stretch, an easy run, a no-gym floor. Today ranks them and answers "what should
I do?" with one button; the latest session can be corrected, older history is
immutable.

**Stack**: SvelteKit (Svelte 5) · [Emmett](https://event-driven-io.github.io/emmett/)
PostgreSQL event store · Neon · Cloudflare Workers · TypeScript.

New here? [WALKTHROUGH.md](WALKTHROUGH.md) is the tour.

## Run it

```sh
pnpm install
pnpm dev
```

Needs `.env.local` (git-ignored): `DB` (a Neon connection string) and
`LEDGER_PEPPER` (any random secret — it HMACs phone numbers into account ids and
signs the cookie). Dev talks to Neon directly. Log in with a phone number — no
password; an empty phone is the shared demo sandbox.

## Checks

```sh
pnpm test     # vitest, one suite per domain layer
pnpm check    # svelte-check
pnpm build    # production build
```

Deploy: push to `main` — Cloudflare Workers Builds does the rest.
