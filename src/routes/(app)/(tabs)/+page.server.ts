import { fail, redirect } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import { listProgrammes } from '$lib/server/plans';
import { requireUid } from '$lib/server/auth';
import type { AfterEntry } from '$lib/domain/commands';
import { parseWorkout } from '$lib/domain/events';
import { disciplineOf } from '$lib/domain/plan';
import { wholePlan } from '$lib/domain/plans';
import type { Actions } from './$types';

/** what a routine IS, from the whole programme — so the discipline is stamped at the edge whatever this person switched */
async function stampDiscipline(plan: string, routine: string) {
	return disciplineOf((await listProgrammes()).map(wholePlan).find((p) => p.id === plan), routine);
}

export const actions: Actions = {
	/** start a live session: the id, the timestamp and the discipline are stamped here at the edge, then the floor */
	start: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const form = await request.formData();
		const workout = parseWorkout(form.get('routine'));
		const plan = String(form.get('plan') ?? '');
		if (!workout || !plan) return fail(400, { message: 'Missing routine or plan.' });
		const discipline = await stampDiscipline(plan, workout.routine);
		if (!discipline) return fail(400, { message: 'That routine is not on this plan.' });
		const err = await tryCommand(uid, {
			type: 'StartSession',
			data: { session: crypto.randomUUID(), plan, at: new Date().toISOString(), discipline, ...workout }
		});
		if (err) return fail(400, { message: err });
		redirect(303, '/floor');
	},

	/** Undo the session you just finished, or bin the one in progress: the same SessionRemoved the Ledger's Remove appends, one tap from where the mistake happened */
	remove: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const session = String((await request.formData()).get('session') ?? '');
		if (!session) return fail(400, { message: 'Missing session id.' });
		const err = await tryCommand(uid, { type: 'RemoveSession', data: { session, at: new Date().toISOString() } });
		if (err) return fail(400, { message: err });
	},

	/** finish the session in progress from Today — leaving is a session question, and not every session is walked to its last step */
	finish: async ({ locals }) => {
		const err = await tryCommand(requireUid(locals), { type: 'FinishSession', data: { at: new Date().toISOString() } });
		if (err) return fail(400, { message: err });
	},

	/** a session you already did, in one LogAfter command: start · entries · finish, backdated, written with the plan's sets */
	logAfter: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const form = await request.formData();
		const plan = String(form.get('plan') ?? '');
		const workout = parseWorkout(form.get('routine'));
		const startAt = String(form.get('startAt') ?? '');
		const at = String(form.get('at') ?? '');
		if (!plan || !workout) return fail(400, { message: 'Missing routine or plan.' });
		if (Number.isNaN(Date.parse(startAt)) || Number.isNaN(Date.parse(at))) return fail(400, { message: 'When did it happen?' });
		const discipline = await stampDiscipline(plan, workout.routine);
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
		redirect(303, '/ledger');
	}
};
