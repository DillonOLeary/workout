import { fail, redirect } from '@sveltejs/kit';
import { tryCommand } from '$lib/server/ledger';
import { requireUid } from '$lib/server/auth';
import type { AfterEntry } from '$lib/domain/commands';
import { parseMeasure } from '$lib/domain/measure';
import { parseWorkout, type Workout } from '$lib/domain/events';
import { disciplineOf, levelsOf } from '$lib/domain/plan';
import { SHIPPED_PLANS } from '$lib/domain/plans';
import type { Actions } from './$types';

/** what a routine IS, from the whole programme — so the discipline is stamped at the edge whatever this person switched */
const stampDiscipline = (plan: string, routine: string) => disciplineOf(SHIPPED_PLANS.find((p) => p.id === plan), routine);
/** a circuit's rounds, one of its levels — Level I when none was posted; straight sets take none */
function stampRounds(plan: string, w: Workout): Workout | null {
	const levels = levelsOf(SHIPPED_PLANS.find((p) => p.id === plan), w.routine);
	if (!levels) return w.rounds === undefined ? w : null;
	if (w.rounds === undefined) return { ...w, rounds: levels[0] };
	return levels.includes(w.rounds) ? w : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = 86_400_000;
/** A backdated time as stored: ISO, within the fortnight the sheet can reach and not ahead of now by more than a clock's drift; null otherwise. */
function backdated(raw: FormDataEntryValue | null, now = Date.now()): string | null {
	const t = typeof raw === 'string' ? Date.parse(raw) : NaN;
	return Number.isFinite(t) && t <= now + 2 * 60_000 && t >= now - 14 * DAY ? new Date(t).toISOString() : null;
}

export const actions: Actions = {
	/** start a live session: the id, the timestamp and the discipline are stamped here at the edge, then the floor */
	start: async ({ request, locals }) => {
		const uid = requireUid(locals);
		const form = await request.formData();
		const posted = parseWorkout(form.get('routine'), form.get('rounds'));
		const plan = String(form.get('plan') ?? '');
		if (!posted || !plan) return fail(400, { message: 'Missing routine or plan.' });
		const discipline = stampDiscipline(plan, posted.routine);
		if (!discipline) return fail(400, { message: 'That routine is not on this plan.' });
		const workout = stampRounds(plan, posted);
		if (!workout) return fail(400, { message: 'That level is not on this routine.' });
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
		const posted = parseWorkout(form.get('routine'), form.get('rounds'));
		// the sheet made the id when it opened, so a double tap is one session: the decider refuses an id it has seen
		const session = String(form.get('session') ?? '');
		if (!UUID.test(session)) return fail(400, { message: 'Open the sheet again and log it from there.' });
		const startAt = backdated(form.get('startAt'));
		const at = backdated(form.get('at'));
		if (!plan || !posted) return fail(400, { message: 'Missing routine or plan.' });
		if (!startAt || !at) return fail(400, { message: 'When did it happen?' });
		const discipline = stampDiscipline(plan, posted.routine);
		if (!discipline) return fail(400, { message: 'That routine is not on this plan.' });
		const workout = stampRounds(plan, posted);
		if (!workout) return fail(400, { message: 'That level is not on this routine.' });
		// rebuilt field by field, like the floor's and the Ledger's: the stream is append-only, so nothing the form did not mean gets in
		const entries: AfterEntry[] = [];
		try {
			const parsed = JSON.parse(String(form.get('entries') ?? '')) as unknown;
			if (!Array.isArray(parsed)) throw new Error();
			for (const e of parsed as { item?: unknown; index?: unknown; measure?: unknown }[]) {
				const measure = parseMeasure(e?.measure);
				if (!measure || typeof e.item !== 'string' || !e.item || !Number.isInteger(e.index) || (e.index as number) < 1) throw new Error();
				entries.push({ item: e.item, index: e.index as number, measure });
			}
		} catch {
			return fail(400, { message: 'Malformed entries.' });
		}
		const err = await tryCommand(uid, {
			type: 'LogAfter',
			data: { session, plan, discipline, startAt, at, entries, ...workout }
		});
		if (err) return fail(400, { message: err });
		redirect(303, '/ledger');
	}
};
