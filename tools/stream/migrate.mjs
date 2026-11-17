#!/usr/bin/env node
// Creates or updates the event store's tables in the database `DB` names. Production runs with autoMigration 'None', so this is how
// its schema changes after an Emmett upgrade: take a Neon branch, run it there, check the app on it, then run it on main with --neon.
// The passkeys table makes itself on first use (ensure() in src/lib/server/passkeys.ts).
import { getPostgreSQLEventStore } from '@event-driven-io/emmett-postgresql';

const cs = process.env.DB;
if (!cs) {
	console.error('DB is not set — put it in .env.local or the environment.');
	process.exit(1);
}
const host = new URL(cs).host;
if (/neon\.tech$/.test(new URL(cs).hostname) && !process.argv.includes('--neon')) {
	console.error(`DB points at ${host}, a Neon database. Pass --neon to migrate it — and take a branch first.`);
	process.exit(1);
}
const store = getPostgreSQLEventStore(cs, { schema: { autoMigration: 'None' } });
try {
	await store.schema.migrate();
	console.log(`The event store schema is current on ${host}.`);
} finally {
	await store.close();
}
