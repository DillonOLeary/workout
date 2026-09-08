/**
 * Motion tokens, read at runtime. CSS transitions take `var(--dur-med)`
 * directly; a Svelte transition takes a number, so a component asks here
 * instead of hard-coding one — the tokens in tokens/motion.css stay the
 * single source. On the server (no document) and under reduced motion the
 * answer is 0: nothing moves.
 */
export function durationMs(token: '--dur-fast' | '--dur-med' | '--dur-slow', fallback: number): number {
	if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return 0;
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
	const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
	const n = parseFloat(raw);
	return Number.isFinite(n) ? n : fallback;
}
