import { fail, redirect } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import { requireUid } from '$lib/server/auth';
import type { AfterEntry } from '$lib/domain/commands';
import { parseWorkout } from '$lib/domain/events';
import type { Actions } from './$types';

/**
 * "Log it after": a run you did without the phone, or a whole lift. The
 * page composes the entries; this turns them into ONE command that writes
 * start · entries · finish backdated, so the ledger holds the same session
 * shape whether it was walked live or written afterwards.
 */
export const actions: Actions = {
	log: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const form = await request.formData();
		const plan = String(form.get('plan') ?? '');
		const workout = parseWorkout(form.get('kind'), form.get('day'));
		const startAt = String(form.get('startAt') ?? '');
		const at = String(form.get('at') ?? '');
		if (!plan || !workout) return fail(400, { message: 'Missing workout or plan.' });
		if (Number.isNaN(Date.parse(startAt)) || Number.isNaN(Date.parse(at)))
			return fail(400, { message: 'When did it happen?' });
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
			data: { session: crypto.randomUUID(), plan, startAt, at, entries, ...workout }
		});
		if (err) return fail(400, { message: err });
		redirect(303, '/');
	}
};
