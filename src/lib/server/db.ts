import pg from 'pg';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

let runtimeCs: string | undefined;
/** Lets hooks.server.ts swap in Hyperdrive's connection string on Cloudflare. */
export function setRuntimeConnectionString(value: string | undefined) {
	if (value) runtimeCs = value;
}
// Resolved lazily, never at module load: SvelteKit's build analyse step imports every server module with no env.
export function currentConnectionString(): string {
	const cs = runtimeCs ?? env.DB;
	if (!cs) throw new Error('Missing DB env var — put your Postgres connection string in .env.local');
	return cs;
}

/** Client-side limits on every connection: a Neon that is slow to wake fails the request in seconds instead of hanging to the Worker's limit. */
export const PG_LIMITS = { connectionTimeoutMillis: 10_000, query_timeout: 20_000 } as const;

/** One statement, its rows back. */
export type Sql = <R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]) => Promise<R[]>;

const g = globalThis as typeof globalThis & { __ledgerPool?: pg.Pool };

/** Plain SQL for the tables beside the event store, on withEventStore's terms: a pool in dev, one client per unit of work in prod, closed before the response returns. */
export async function withSql<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
	if (dev) {
		const pool = (g.__ledgerPool ??= new pg.Pool({ connectionString: currentConnectionString(), ...PG_LIMITS }));
		return fn(async (text, values) => (await pool.query(text, values)).rows);
	}
	const client = new pg.Client({ connectionString: currentConnectionString(), ...PG_LIMITS });
	await client.connect();
	try {
		return await fn(async (text, values) => (await client.query(text, values)).rows);
	} finally {
		await client.end().catch(() => {});
	}
}
