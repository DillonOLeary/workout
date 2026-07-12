import pg from 'pg';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

/**
 * `$env/dynamic/private` reads process.env at RUNTIME (Vite loads .env.local
 * in dev; Cloudflare injects dashboard vars in prod). We deliberately avoid
 * `$env/static/private`, which would inline the connection string — password
 * and all — into the build output.
 */
const cs = env.DB;
if (!cs) throw new Error('Missing DB env var — put your Neon connection string in .env.local');
export const connectionString: string = cs;

/** The one query method both pg.Pool and pg.Client provide. */
export type Queryable = {
	query<R extends pg.QueryResultRow = pg.QueryResultRow>(
		text: string,
		values?: unknown[]
	): Promise<pg.QueryResult<R>>;
};

const g = globalThis as typeof globalThis & { __ledgerPool?: pg.Pool };

/**
 * Run one unit of database work.
 *
 * Cloudflare Workers forbid touching a socket that was opened during a
 * different request — and a connection pool cached across requests doesn't
 * error when that happens, it HANGS the request until the runtime kills it
 * ("Worker's code had hung and would never generate a response").
 *
 * So: in production every call connects fresh and disconnects after (Neon's
 * pooler exists to make that cheap). In dev the Node process is long-lived
 * and sockets are ours to keep, so one shared pool survives HMR via
 * globalThis and saves the reconnect per query.
 */
export async function withClient<T>(fn: (db: Queryable) => Promise<T>): Promise<T> {
	if (dev) {
		const pool = (g.__ledgerPool ??= new pg.Pool({ connectionString, max: 5 }));
		return fn(pool);
	}
	const client = new pg.Client({ connectionString });
	await client.connect();
	try {
		return await fn(client);
	} finally {
		// Awaited on purpose: an un-awaited close gets orphaned when the
		// response returns, leaving the socket in limbo on the Workers side.
		await client.end().catch(() => {});
	}
}
