-- Why is my ledger empty? Read-only: paste into the Neon SQL editor against the database Hyperdrive points at.
-- The recovery notes at the bottom are the only part that changes data, and they are deliberately not runnable as-is.
--
-- To read the results:
--   * A user id is 'u-' + HMAC(LEDGER_PEPPER, digits-of-phone) truncated to 10 hex chars (src/lib/server/uid.ts):
--     same phone + same pepper = same id, forever. The stream is 'ledger-' + that id (src/lib/server/ledger.ts).
--   * Neither has changed since the first commit, so an empty ledger is the pepper value, the database or the rows — never the id math.
--   * Emmett stores one row per event in emt_messages, with the stream summary in emt_streams; both carry is_archived.


-- 1. Every stream in the store, most recently written first.
--    Two or more ledger-u-* rows: LEDGER_PEPPER changed, and the history is intact under the old pepper's id.
--    Zero rows: this is not the database those workouts were written to.
select s.stream_id,
       s.stream_position as events,
       s.is_archived,
       (select min(created) from emt_messages m where m.stream_id = s.stream_id) as first_event,
       (select max(created) from emt_messages m where m.stream_id = s.stream_id) as last_event
from emt_streams s
order by last_event desc nulls last;


-- 2. What is in each stream, by event type: which one holds the real history and which is the near-empty one the app reads today.
select stream_id, message_type, count(*) as n,
       min(created) as first, max(created) as last
from emt_messages
group by stream_id, message_type
order by stream_id, n desc;


-- 3. Archived rows are skipped by normal reads: any true here and the events exist but are invisible to the app.
select is_archived, count(*) from emt_messages group by is_archived;


-- 4. Any event name the current code cannot read. Empty = nothing to add; a name here needs a case in upcast()
--    (src/lib/domain/upcast.ts). The eight current names, then the retired ones the upcaster still reads (PlanSelected among them).
select distinct message_type
from emt_messages
where message_type not in (
      'SessionStarted','EntryLogged','EntryCorrected','SessionFinished','SessionRemoved','ProgrammeSelected','BlockToggled','PreferencesSet',
      'SetLogged','RunLogged','RunRemoved','SessionStruck','PlanSelected');


-- 5. The oldest ten events, raw: the old data's shape against what the upcaster expects (a SetLogged carries exercise/weight/reps/set).
select global_position, stream_id, message_type, created, message_data
from emt_messages order by global_position asc limit 10;


-- ---------------------------------------------------------------------------
-- RECOVERY, once you know which case you are in. Do not run blind.
--
-- Case A — two ledger-u-* streams (pepper changed).
--   Best fix is not SQL: put the OLD LEDGER_PEPPER back in the Cloudflare environment variables — zero risk, instantly reversible.
--   Only if the old pepper is genuinely gone, re-point the history at the id you have now. Check first (query 2) that the new
--   stream is empty or disposable, because stream_position values collide otherwise, and take a Neon branch as a snapshot before any of it:
--
--     -- delete from emt_messages where stream_id = 'ledger-<new-id>';
--     -- delete from emt_streams  where stream_id = 'ledger-<new-id>';
--     -- update emt_messages set stream_id = 'ledger-<new-id>' where stream_id = 'ledger-<old-id>';
--     -- update emt_streams  set stream_id = 'ledger-<new-id>' where stream_id = 'ledger-<old-id>';
--
-- Case B — is_archived = true on the rows you want.
--   -- update emt_messages set is_archived = false where stream_id = 'ledger-<id>';
--   -- update emt_streams  set is_archived = false where stream_id = 'ledger-<id>';
--
-- Case C — no ledger-u-* streams at all: the workouts are in a different database. Neon branches each get their own
--   endpoint; check which one the Hyperdrive binding resolves to versus the branch queried here.
--
-- Case D — an unknown message_type from query 4: add a case to upcast(). The stream is never rewritten; the
--   translation happens at the read boundary.

-- 6. Every SessionStarted row by plan and routine key, and whether it carries its discipline.
--    Run this before deleting a case from upcast.ts — a case leaves only at zero.
select coalesce(message_data->>'plan','<none>') as plan,
       coalesce(message_data->>'routine', message_data->>'day', '<none>') as key,
       coalesce(message_data->>'kind','-') as kind,
       (message_data ? 'discipline') as has_discipline,
       count(*)
from emt_messages
where message_type = 'SessionStarted'
group by 1, 2, 3, 4 order by 1, 2, 3;
