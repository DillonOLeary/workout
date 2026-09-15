import pg from 'pg';
import {
	getPostgreSQLEventStore,
	type PostgresEventStore
} from '@event-driven-io/emmett-postgresql';
import { dev } from '$app/environment';
import { currentConnectionString } from './db';

const g = globalThis as typeof globalThis & { __ledgerEventStore?: PostgresEventStore };

// Schema migrations run only in dev (`autoMigration: 'None'` in prod): a new database gets its schema by running the app once in dev.
export async function withEventStore<T>(
	fn: (store: PostgresEventStore) => Promise<T>
): Promise<T> {
	if (dev) {
		const store = (g.__ledgerEventStore ??= getPostgreSQLEventStore(currentConnectionString()));
		return fn(store);
	}
	const cs = currentConnectionString();
	const client = new pg.Client({ connectionString: cs });
	await client.connect();
	const store = getPostgreSQLEventStore(cs, {
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
