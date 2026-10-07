# LEDGER — working rules

The tour is [WALKTHROUGH.md](WALKTHROUGH.md); the domain's contract is [src/lib/domain/README.md](src/lib/domain/README.md). These are the rules that are not in the code.

## Every session

- `pnpm`, never npm. `pnpm check` (types, tests, glyph snapshot) before claiming anything is done; it is also the deploy gate, so a push to `main` with a red check does not ship.
- Dev against a local Postgres. Production data lives in Neon and `.env.local` may still point there; never run the app, a script or a query against it without asking.
- Do not commit or push unless asked.

## The stream

- Every row is read through `src/lib/domain/upcast.ts` and nowhere else. Its header carries the dated counts that back each case; a case leaves only when a fresh count (`tools/stream/forensics.sql`) says zero. Never simplify that file.
- The six rules in the domain README and the freeze in `snapshot.test.ts` are the contract. A rule change must be meant: `pnpm exec vitest run -u` rewrites `__snapshots__/`, and the diff is the review — read it. The fixture is synthetic on purpose; the repo is public, never commit a real stream.
- `now` is an argument; the domain does no I/O. Ids, timestamps and the discipline are stamped in the form action, not the decider.

## The platform

- Workers: one `pg.Client` per unit of work, closed (awaited) before the response returns; a cached pool hangs. Dev keeps a singleton because a Node process owns its sockets.
- Hyperdrive's query cache stays disabled: a cached SELECT served stale streams after a write.
- Retired URLs 301 in `hooks.server.ts` and nowhere else.

## Writing

- Comments only for what the code cannot say (runtime and stream facts, magic-number arithmetic, operational steps with a trigger); one-line doc on every exported interface; the "why" narratives go in WALKTHROUGH.md, which must be kept current with any change it describes.
- The kit in `src/lib/ui` is props only, no domain imports; `/kit` renders every state in dev.
