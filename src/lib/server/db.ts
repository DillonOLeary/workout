import pg from 'pg';
import { env } from '$env/dynamic/private';

/**
 * `$env/dynamic/private` reads process.env at RUNTIME (Vite loads .env.local
 * in dev). We deliberately avoid `$env/static/private`, which would inline
 * the connection string — password and all — into the build output.
 */
const cs = env.DB;
if (!cs) throw new Error('Missing DB env var — put your Neon connection string in .env.local');
export const connectionString: string = cs;

// Vite dev re-evaluates server modules on edit; stash singletons on
// globalThis so hot reloads don't leak a new connection pool each time.
const g = globalThis as typeof globalThis & { __ledgerPool?: pg.Pool };

export const pool = (g.__ledgerPool ??= new pg.Pool({ connectionString, max: 5 }));
