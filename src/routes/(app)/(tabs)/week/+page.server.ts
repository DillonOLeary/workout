import { fail } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import { requireUid } from '$lib/server/auth';
import { isPractice } from '$lib/domain/plan';
import type { Actions } from './$types';

export const actions: Actions = {
	/** a practice switched on or off: one BlockToggled, a fact with a date */
	toggle: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const form = await request.formData();
		const practice = form.get('practice');
		const on = form.get('on') === 'true';
		if (!isPractice(practice)) return fail(400, { message: 'No such practice.' });
		const err = await tryCommand(uid, { type: 'TogglePractice', data: { practice, on, at: new Date().toISOString() } });
		if (err) return fail(400, { message: err });
	},

	/** a goal dialled: sessions a week, and the run's minutes — one GoalSet, no-op when it says what the last one said */
	goal: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const form = await request.formData();
		const practice = form.get('practice');
		const sessions = Number(form.get('sessions'));
		const rawMinutes = form.get('minutes');
		const minutes = rawMinutes === null || rawMinutes === '' ? undefined : Number(rawMinutes);
		if (!isPractice(practice)) return fail(400, { message: 'No such practice.' });
		const err = await tryCommand(uid, {
			type: 'SetGoal',
			data: { practice, sessions, ...(minutes !== undefined ? { minutes } : {}), at: new Date().toISOString() }
		});
		if (err) return fail(400, { message: err });
	}
};
