/** Keeps the screen lit while it is held; returns the release. Re-requested when the app comes back, since the lock drops when you switch away. */
export function holdScreen(): () => void {
	if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return () => {};
	let lock: WakeLockSentinel | null = null;
	let held = true;
	const request = async () => {
		try {
			lock = await navigator.wakeLock.request('screen');
			// released between the await and now — a fast unmount
			if (!held) await lock.release();
		} catch {
			/* a low battery, or a page not visible yet: the floor works without it */
		}
	};
	const onVisible = () => {
		if (document.visibilityState === 'visible') void request();
	};
	void request();
	document.addEventListener('visibilitychange', onVisible);
	return () => {
		held = false;
		document.removeEventListener('visibilitychange', onVisible);
		void lock?.release();
		lock = null;
	};
}
