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
	if (!cs) throw new Error('Missing DB env var — put your Neon connection string in .env.local');
	return cs;
}

export type Queryable = {
	query<R extends pg.QueryResultRow = pg.QueryResultRow>(
		text: string,
		values?: unknown[]
	): Promise<pg.QueryResult<R>>;
};

const g = globalThis as typeof globalThis & { __ledgerPool?: pg.Pool };

// One client per request: Cloudflare Workers forbid using a socket opened in another request, and a cached pool HANGS rather than errors.
/** Runs one unit of database work; in prod on a client of its own, in dev on one pool that survives HMR. */
export async function withClient<T>(fn: (db: Queryable) => Promise<T>): Promise<T> {
	if (dev) {
		const pool = (g.__ledgerPool ??= new pg.Pool({
			connectionString: currentConnectionString(),
			max: 5
		}));
		return fn(pool);
	}
	const client = new pg.Client({ connectionString: currentConnectionString() });
	await client.connect();
	try {
		return await fn(client);
	} finally {
		// Awaited so the socket is not orphaned when the response returns.
		await client.end().catch(() => {});
	}
}
