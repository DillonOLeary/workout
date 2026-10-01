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
