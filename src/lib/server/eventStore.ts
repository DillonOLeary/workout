import pg from 'pg';
import {
	getPostgreSQLEventStore,
	type PostgresEventStore
} from '@event-driven-io/emmett-postgresql';
import { dev } from '$app/environment';
import { connectionString } from './db';

/**
 * The event store IS the database of record: `emt_messages` (every event ever
 * appended, globally ordered) and `emt_streams` (one row per stream with its
 * current version, used for optimistic concurrency). Peek any time:
 *
 *   select stream_id, stream_position, message_type, message_data
 *   from emt_messages order by global_position;
 */
const g = globalThis as typeof globalThis & { __ledgerEventStore?: PostgresEventStore };

/**
 * Run one unit of event-store work. Same Cloudflare Workers rule as
 * withClient in db.ts: sockets can't cross requests. In prod we open ONE
 * pg.Client for the unit of work, hand it to Emmett (`connectionOptions:
 * { client }` — no internal pool), and close it before returning, so every
 * request's socket lifecycle is fully deterministic. Schema migrations are
 * skipped in prod; dev's singleton store runs them on first use, which is
 * also how a brand-new database gets its schema (run the app once in dev).
 */
export async function withEventStore<T>(
	fn: (store: PostgresEventStore) => Promise<T>
): Promise<T> {
	if (dev) {
		const store = (g.__ledgerEventStore ??= getPostgreSQLEventStore(connectionString));
		return fn(store);
	}
	const client = new pg.Client({ connectionString });
	await client.connect();
	const store = getPostgreSQLEventStore(connectionString, {
		schema: { autoMigration: 'None' },
		connectionOptions: { client }
	});
	try {
		return await fn(store);
	} finally {
		await store.close().catch(() => {});
		await client.end().catch(() => {});
	}
}
