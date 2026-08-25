import { withClient } from './db';
import { DEFAULT_PLANS } from '$lib/domain/plans';
import { parsePlan, type Plan } from '$lib/domain/plan';

/**
 * Plans are reference data, NOT events — a deliberate contrast with the
 * ledger. They change rarely, have no interesting history, and events refer
 * to them by id. One JSONB row per plan.
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
		for (const plan of DEFAULT_PLANS) {
			// Shipped plans are code-owned: refresh the whole row on boot so
			// renames AND exercise changes (e.g. plank going seconds-based)
			// reach existing databases. Custom plans (other ids) are untouched.
			await db.query(
				`insert into ledger_plans (id, data) values ($1, $2)
				 on conflict (id) do update set data = excluded.data`,
				[plan.id, JSON.stringify(plan)]
			);
		}
	}).catch((e) => {
		ready = undefined; // let the next request retry instead of caching the failure
		throw e;
	});
	return ready;
}

export async function listPlans(): Promise<Plan[]> {
	await ensureReady();
	return withClient(async (db) => {
		const { rows } = await db.query<{ id: string; data: unknown }>(
			'select id, data from ledger_plans order by created_at'
		);
		// the plan's read boundary: a row is parsed on the way in, the way an
		// event row is upcast. A row nobody can read is logged and skipped —
		// one bad custom plan must never take the whole app down with a 500.
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

export async function insertPlan(plan: Plan): Promise<void> {
	await ensureReady();
	await withClient((db) =>
		db.query(
			`insert into ledger_plans (id, data) values ($1, $2)
			 on conflict (id) do update set data = excluded.data`,
			[plan.id, JSON.stringify(plan)]
		)
	);
}
