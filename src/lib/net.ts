/** the browser's word on the connection, now and on every change — offline is certain, online only means "maybe"; returns the unsubscribe */
export function watchOnline(on: (online: boolean) => void): () => void {
	const set = () => on(navigator.onLine);
	set();
	addEventListener('online', set);
	addEventListener('offline', set);
	return () => {
		removeEventListener('online', set);
		removeEventListener('offline', set);
	};
}

/** a request that never reached the server — Chrome's "Failed to fetch", Safari's "Load failed", Firefox's NetworkError — or any error while the phone says it's offline */
export const NO_CONNECTION = 'No connection';
export function isNetworkError(message: string | undefined): boolean {
	return message === NO_CONNECTION || /failed to fetch|load failed|networkerror|network connection was lost/i.test(message ?? '') || (typeof navigator !== 'undefined' && navigator.onLine === false);
}
