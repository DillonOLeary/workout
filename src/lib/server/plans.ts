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
	if (p.runs !== undefined && typeof p.runs !== 'boolean') throw new Error('runs must be a boolean');
	if (p.runTarget !== undefined && (typeof p.runTarget !== 'number' || p.runTarget <= 0))
		throw new Error('runTarget must be a positive number of minutes');
	if (p.warmup !== undefined && typeof p.warmup !== 'string') throw new Error('warmup must be a string');
	for (const [d, info] of Object.entries(p.dayInfo ?? {}))
		if (info.warmup !== undefined && typeof info.warmup !== 'string')
			throw new Error(`dayInfo "${d}" warmup must be a string`);
	const days = p.days as Record<string, Exercise[]>;
	if (typeof days !== 'object' || !Object.keys(days).length) throw new Error('days must be a non-empty object');
	for (const [day, exercises] of Object.entries(days)) {
		if (!Array.isArray(exercises) || !exercises.length) throw new Error(`day "${day}" needs a non-empty exercise list`);
		for (const ex of exercises) {
			if (!ex.name) throw new Error(`exercise in day "${day}" is missing a name`);
			// bodyweight exercises have no weight axis — start is optional (0)
			const required = ex.bodyweight === true
				? (['sets', 'lo', 'hi', 'inc'] as const)
				: (['sets', 'lo', 'hi', 'start', 'inc'] as const);
			for (const k of required) {
				if (typeof ex[k] !== 'number') throw new Error(`"${ex.name}" needs numeric ${k}`);
			}
			if (ex.bodyweight === true && typeof ex.start !== 'number') ex.start = 0;
			// the per-hand / per-side fields exist to kill an ambiguity; a typo in
			// them would quietly reintroduce it, so they are checked, not coerced
			if (ex.side !== undefined && ex.side !== 'reps' && ex.side !== 'sets')
				throw new Error(`"${ex.name}" side must be "reps" (per side) or "sets" (one per side)`);
			if (ex.each !== undefined && typeof ex.each !== 'boolean')
				throw new Error(`"${ex.name}" each must be a boolean`);
			if (ex.note !== undefined && typeof ex.note !== 'string')
				throw new Error(`"${ex.name}" note must be a string`);
			if (ex.rack !== undefined && !['kettlebell', 'dumbbell', 'medball'].includes(ex.rack))
				throw new Error(`"${ex.name}" rack must be kettlebell, dumbbell or medball (omit it for machines)`);
		}
	}
	return { schedule: '', ...p } as Plan;
}
