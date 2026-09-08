import { fail, redirect } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import { requireUid } from '$lib/server/auth';
import { parseWorkout } from '$lib/domain/events';
import type { Actions } from './$types';

/**
 * Every mutation in the app is a command → the decider → appended events.
 * Note what's generated HERE at the edge: ids and timestamps. The decider
 * stays deterministic; the impure bits are inputs.
 *
 * Logging something after the fact lives on /log/after — one sheet for a
 * run or a whole lift, same session shape, backdated.
 */
export const actions: Actions = {
	start: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const form = await request.formData();
		const workout = parseWorkout(form.get('kind'), form.get('day'));
		const plan = String(form.get('plan') ?? '');
		if (!workout || !plan) return fail(400, { message: 'Missing workout or plan.' });
		// a pick — "just the calf stretch" — rides along as a JSON list of names;
		// its shape is the decider's to judge
		let pick: unknown;
		const rawPick = form.get('pick');
		if (rawPick) {
			try {
				pick = JSON.parse(String(rawPick));
			} catch {
				return fail(400, { message: 'Malformed pick.' });
			}
		}

		const err = await tryCommand(uid, {
			type: 'StartSession',
			data: { session: crypto.randomUUID(), plan, at: new Date().toISOString(), ...(pick !== undefined ? { pick: pick as string[] } : {}), ...workout }
		});
		if (err) return fail(400, { message: err });

		redirect(303, '/log');
	},

	finish: async ({ locals }) => {
		const err = await tryCommand(requireUid(locals), {
			type: 'FinishSession',
			data: { at: new Date().toISOString() }
		});
		if (err) return fail(400, { message: err });
	}
};
