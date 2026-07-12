import { withClient } from './db';
import { DEFAULT_PLANS } from '$lib/domain/plans';
import type { Exercise, Plan } from '$lib/domain/types';

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
			// Shipped plans refresh their name/description/dayInfo on boot (so a
			// rename in code reaches existing rows), but stored `days` win —
			// mirroring the design's domain.js merge rule for default plans.
			await db.query(
				`insert into ledger_plans (id, data) values ($1, $2)
				 on conflict (id) do update set data = ledger_plans.data || jsonb_build_object(
					'name', excluded.data->'name',
					'description', excluded.data->'description',
					'dayInfo', excluded.data->'dayInfo'
				 )`,
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
		const { rows } = await db.query<{ data: Plan }>(
			'select data from ledger_plans order by created_at'
		);
		return rows.map((r) => r.data);
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

/** Validate a pasted JSON row before it goes anywhere near the table. */
export function parsePlan(json: string): Plan {
	const p = JSON.parse(json) as Partial<Plan>;
	if (!p.id || !p.name || !p.days) throw new Error('needs id, name, days');
	if (typeof p.id !== 'string' || typeof p.name !== 'string') throw new Error('id and name must be strings');
	const days = p.days as Record<string, Exercise[]>;
	if (typeof days !== 'object' || !Object.keys(days).length) throw new Error('days must be a non-empty object');
	for (const [day, exercises] of Object.entries(days)) {
		if (!Array.isArray(exercises) || !exercises.length) throw new Error(`day "${day}" needs a non-empty exercise list`);
		for (const ex of exercises) {
			if (!ex.name) throw new Error(`exercise in day "${day}" is missing a name`);
			for (const k of ['sets', 'lo', 'hi', 'start', 'inc'] as const) {
				if (typeof ex[k] !== 'number') throw new Error(`"${ex.name}" needs numeric ${k}`);
			}
		}
	}
	return { schedule: '', ...p } as Plan;
}
