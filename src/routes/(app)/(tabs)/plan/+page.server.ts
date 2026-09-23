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
	},

	/** the rest between sets, dialled: one RestSet */
	rest: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const seconds = Number((await request.formData()).get('seconds'));
		const err = await tryCommand(uid, { type: 'SetRest', data: { seconds, at: new Date().toISOString() } });
		if (err) return fail(400, { message: err });
	},

	/** the one real choice: a ProgrammeSelected event — that IS history */
	select: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const programme = String((await request.formData()).get('programme') ?? '');
		if (!programme) return fail(400, { message: 'Missing programme id.' });
		const err = await tryCommand(uid, { type: 'SelectProgramme', data: { programme, at: new Date().toISOString() } });
		if (err) return fail(400, { message: err });
	}
};
