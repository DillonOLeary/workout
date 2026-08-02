-- Why is my ledger empty?
--
-- Read-only. Paste into the Neon SQL editor against the database Hyperdrive
-- points at. Nothing here writes; the recovery notes at the bottom are the
-- only part that changes data, and they are deliberately not runnable as-is.
--
-- Background, so the answers mean something:
--   * A user id is  'u-' + HMAC(LEDGER_PEPPER, digits-of-phone) truncated to
--     10 hex chars  (src/lib/server/uid.ts). Same phone + same pepper = same
--     id, forever.
--   * The stream is 'ledger-' + that id (src/lib/server/ledger.ts).
--   * Neither of those two lines has changed since the first commit. So an
--     empty ledger is never the id *math* drifting — it is the pepper value,
--     the database, or the rows themselves.
--   * Emmett stores everything in emt_messages, one row per event, with the
--     stream summary in emt_streams. Both carry is_archived.


-- 1. Every stream in the store, most recently written first.
--    TWO OR MORE ledger-u-* rows is the answer: LEDGER_PEPPER changed, and
--    your history is intact under the id the old pepper produced.
--    ZERO rows means this is not the database those workouts were written to.
select s.stream_id,
       s.stream_position as events,
       s.is_archived,
       (select min(created) from emt_messages m where m.stream_id = s.stream_id) as first_event,
       (select max(created) from emt_messages m where m.stream_id = s.stream_id) as last_event
from emt_streams s
order by last_event desc nulls last;


-- 2. What is in each stream, by event type.
--    Tells you which stream holds the real training history and which one is
--    the near-empty stream the app is reading today.
select stream_id, message_type, count(*) as n,
       min(created) as first, max(created) as last
from emt_messages
group by stream_id, message_type
order by stream_id, n desc;


-- 3. Archived rows are skipped by normal reads.
--    Any true here and the events exist but are invisible to the app.
select is_archived, count(*) from emt_messages group by is_archived;


-- 4. Any event name the current code cannot read.
--    Empty result = no upcaster needed. A name here needs one line adding to
--    upcastLedgerEvent() in src/lib/domain/events.ts.
select distinct message_type
from emt_messages
where message_type not in ('SessionStarted','SetLogged','SessionFinished',
      'SessionRemoved','SessionStruck','RunLogged','RunRemoved','PlanSelected');


-- 5. The oldest ten events, raw. Confirms the shape of the old data matches
--    what the projections expect (SetLogged carries exercise/weight/reps/set).
select global_position, stream_id, message_type, created, message_data
from emt_messages order by global_position asc limit 10;


-- ---------------------------------------------------------------------------
-- RECOVERY, once you know which case you are in. Do not run blind.
--
-- Case A — two ledger-u-* streams (pepper changed).
--   Best fix is not SQL: put the OLD LEDGER_PEPPER back in the Cloudflare
--   environment variables. Zero risk, instantly reversible, and the old
--   history reappears because the phone hashes back to the old id.
--
--   Only if the old pepper is genuinely gone, re-point the history at the id
--   you have now. Check first that the new stream is empty or disposable
--   (query 2), because stream_position values will collide otherwise:
--
--     -- delete from emt_messages where stream_id = 'ledger-<new-id>';
--     -- delete from emt_streams  where stream_id = 'ledger-<new-id>';
--     -- update emt_messages set stream_id = 'ledger-<new-id>' where stream_id = 'ledger-<old-id>';
--     -- update emt_streams  set stream_id = 'ledger-<new-id>' where stream_id = 'ledger-<old-id>';
--
--   Take a Neon branch as a snapshot before running any of that.
--
-- Case B — is_archived = true on the rows you want.
--   -- update emt_messages set is_archived = false where stream_id = 'ledger-<id>';
--   -- update emt_streams  set is_archived = false where stream_id = 'ledger-<id>';
--
-- Case C — no ledger-u-* streams at all.
--   The workouts are in a different database. Neon branches each get their
--   own endpoint; check which one the Hyperdrive binding actually resolves
--   to versus the branch you are querying here.
--
-- Case D — an unknown message_type from query 4.
--   Add it to upcastLedgerEvent(). The stream is never rewritten; the
--   translation happens at the read boundary, which is why SessionStruck
--   still reads fine today.
