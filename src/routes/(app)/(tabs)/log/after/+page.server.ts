import { fail, redirect } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import { listProgrammes } from '$lib/server/plans';
import { requireUid } from '$lib/server/auth';
import type { AfterEntry } from '$lib/domain/commands';
import { parseWorkout } from '$lib/domain/events';
import { disciplineOf } from '$lib/domain/plan';
import { wholePlan } from '$lib/domain/plans';
import type { Actions } from './$types';

export const actions: Actions = {
	/** one LogAfter command: start · entries · finish, backdated, the discipline stamped from the plan */
	log: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const form = await request.formData();
		const plan = String(form.get('plan') ?? '');
		const workout = parseWorkout(form.get('routine'));
		const startAt = String(form.get('startAt') ?? '');
		const at = String(form.get('at') ?? '');
		if (!plan || !workout) return fail(400, { message: 'Missing routine or plan.' });
		if (Number.isNaN(Date.parse(startAt)) || Number.isNaN(Date.parse(at)))
			return fail(400, { message: 'When did it happen?' });
		const discipline = disciplineOf((await listProgrammes()).map(wholePlan).find((p) => p.id === plan), workout.routine);
		if (!discipline) return fail(400, { message: 'That routine is not on this plan.' });
		let entries: AfterEntry[];
		try {
			const parsed = JSON.parse(String(form.get('entries') ?? '')) as unknown;
			if (!Array.isArray(parsed)) throw new Error();
			entries = parsed.filter(
				(e): e is AfterEntry =>
					!!e && typeof e === 'object' && typeof (e as AfterEntry).item === 'string' &&
					typeof (e as AfterEntry).index === 'number' && typeof (e as AfterEntry).measure === 'object'
			);
		} catch {
			return fail(400, { message: 'Malformed entries.' });
		}
		const err = await tryCommand(uid, {
			type: 'LogAfter',
			data: { session: crypto.randomUUID(), plan, discipline, startAt, at, entries, ...workout }
		});
		if (err) return fail(400, { message: err });
		redirect(303, '/');
	}
};
