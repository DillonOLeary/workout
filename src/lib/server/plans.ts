import { withClient } from './db';
import { DEFAULT_PROGRAMMES } from '$lib/domain/plans';
import { parsePlan, type Plan } from '$lib/domain/plan';

/**
 * Programmes are reference data, NOT events — a deliberate contrast with
 * the ledger. They change rarely, have no interesting history, and events
 * refer to them by id. One JSONB row per programme; the blocks are code
 * (plans.ts) and shared by every week. New programmes are added at the
 * table, not in the app.
 */
let ready: Promise<void> | undefined;

function ensureReady(): Promise<void> {
	ready ??= withClient(async (db) => {
		await db.query(
			`create table if not exists ledger_plans (
				id text primary key,
				data jsonb not null,
				created_at timestamptz not null default now()
			)`
		);
		for (const programme of DEFAULT_PROGRAMMES) {
			// Shipped programmes are code-owned: refresh the whole row on boot so
			// renames AND exercise changes reach existing databases. Rows with
			// other ids are untouched.
			await db.query(
				`insert into ledger_plans (id, data) values ($1, $2)
				 on conflict (id) do update set data = excluded.data`,
				[programme.id, JSON.stringify(programme)]
			);
		}
		// A programme that ships once and is retired leaves the table the same
		// way it arrived — from code: list its id here for one deploy, delete it
		// on boot, then drop the line (Hold Steady, yoga-2day-v1, 2026-09-14).
		// Its sessions stay in the stream and read back as what they were.
	}).catch((e) => {
		ready = undefined; // let the next request retry instead of caching the failure
		throw e;
	});
	return ready;
}

/** The lift programmes on offer, in the order they were added. */
export async function listProgrammes(): Promise<Plan[]> {
	await ensureReady();
	return withClient(async (db) => {
		const { rows } = await db.query<{ id: string; data: unknown }>(
			'select id, data from ledger_plans order by created_at'
		);
		// the programme's read boundary: a row is parsed on the way in, the way
		// an event row is upcast. A row nobody can read is logged and skipped —
		// one bad row must never take the whole app down with a 500.
		return rows.flatMap((r) => {
			try {
				return [parsePlan(r.data)];
			} catch (e) {
				console.error(`ledger_plans "${r.id}" skipped:`, e instanceof Error ? e.message : e);
				return [];
			}
		});
	});
}
