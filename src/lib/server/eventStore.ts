import {
	getPostgreSQLEventStore,
	type PostgresEventStore
} from '@event-driven-io/emmett-postgresql';
import { connectionString } from './db';

/**
 * The event store IS the database of record. On first use Emmett runs its own
 * migrations against Neon, creating `emt_messages` (every event ever appended,
 * globally ordered) and `emt_streams` (one row per stream with its current
 * version, used for optimistic concurrency).
 *
 * Peek at it with psql any time:
 *   select stream_id, stream_position, message_type, message_data
 *   from emt_messages order by global_position;
 */
const g = globalThis as typeof globalThis & { __ledgerEventStore?: PostgresEventStore };

export const eventStore = (g.__ledgerEventStore ??= getPostgreSQLEventStore(connectionString));
