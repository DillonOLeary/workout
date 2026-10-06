const PREFIX = 'ledger:skip:';
const store = (): Storage | null => {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
};

/** The step keys this phone skipped in a session, so a reload or a Resume from Today still walks past them; any other session's are dropped. */
export function loadSkips(session: string): string[] {
	const s = store();
	if (!s) return [];
	try {
		for (let i = s.length - 1; i >= 0; i--) {
			const k = s.key(i);
			if (k?.startsWith(PREFIX) && k !== PREFIX + session) s.removeItem(k);
		}
		const raw = s.getItem(PREFIX + session);
		const keys: unknown = raw ? JSON.parse(raw) : [];
		return Array.isArray(keys) ? keys.filter((k): k is string => typeof k === 'string') : [];
	} catch {
		return [];
	}
}

/** Keeps the skips; an empty list removes the key. */
export function saveSkips(session: string, keys: Iterable<string>) {
	try {
		const list = [...keys];
		if (list.length) store()?.setItem(PREFIX + session, JSON.stringify(list));
		else store()?.removeItem(PREFIX + session);
	} catch {
		// a full or blocked store: the skips last as long as the page does
	}
}
