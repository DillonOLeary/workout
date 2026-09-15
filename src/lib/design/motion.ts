/** A motion token as the number a Svelte transition takes; 0 on the server and under reduced motion. */
export function durationMs(token: '--dur-fast' | '--dur-med' | '--dur-slow', fallback: number): number {
	if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return 0;
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
	const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
	const n = parseFloat(raw);
	return Number.isFinite(n) ? n : fallback;
}
