import { fail } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import { insertPlan, parsePlan } from '$lib/server/plans';
import type { Actions } from './$types';

export const actions: Actions = {
	select: async ({ request, params }) => {
		const form = await request.formData();
		const plan = String(form.get('plan') ?? '');
		if (!plan) return fail(400, { message: 'Missing plan id.' });
		const err = await tryCommand(params.uid, {
			type: 'SelectPlan',
			data: { plan, at: new Date().toISOString() }
		});
		if (err) return fail(400, { message: err });
	},

	/**
	 * Two writes, two worlds: the plan row goes into the reference table
	 * (an UPSERT — plans have no history worth keeping), while "I chose it"
	 * goes into the ledger as a PlanSelected event (that IS history).
	 */
	addPlan: async ({ request, params }) => {
		const form = await request.formData();
		const json = String(form.get('json') ?? '');
		let plan;
		try {
			plan = parsePlan(json);
		} catch (e) {
			return fail(400, { planError: e instanceof Error ? e.message : String(e) });
		}
		await insertPlan(plan);
		const err = await tryCommand(params.uid, {
			type: 'SelectPlan',
			data: { plan: plan.id, at: new Date().toISOString() }
		});
		if (err) return fail(400, { message: err });
	}
};
