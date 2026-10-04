/**
 * When an entry happened: the phone's tap time, if it is a time within the last twelve hours and not ahead by more than a
 * clock's drift — so a set that waited out a dead link keeps the moment it was done; otherwise now. Stamped at the edge, like every timestamp.
 */
export function stampedAt(raw: FormDataEntryValue | null, now = Date.now()): string {
	const t = typeof raw === 'string' ? Date.parse(raw) : NaN;
	return new Date(Number.isFinite(t) && t <= now + 2 * 60_000 && t >= now - 12 * 3_600_000 ? t : now).toISOString();
}
