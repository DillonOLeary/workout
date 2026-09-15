import { withClient } from './db';
import { DEFAULT_PROGRAMMES } from '$lib/domain/plans';
import { parsePlan, type Plan } from '$lib/domain/plan';

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
			// Shipped programmes are code-owned: the whole row is refreshed on boot.
			await db.query(
				`insert into ledger_plans (id, data) values ($1, $2)
				 on conflict (id) do update set data = excluded.data`,
				[programme.id, JSON.stringify(programme)]
			);
		}
		// A retired programme leaves the table from code: list its id here for one deploy, delete it on boot, then drop the line.
	}).catch((e) => {
		ready = undefined; // retry next request
		throw e;
	});
	return ready;
}

/** The lift programmes on offer, oldest first; a row nobody can parse is logged and skipped. */
export async function listProgrammes(): Promise<Plan[]> {
	await ensureReady();
	return withClient(async (db) => {
		const { rows } = await db.query<{ id: string; data: unknown }>(
			'select id, data from ledger_plans order by created_at'
		);
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
