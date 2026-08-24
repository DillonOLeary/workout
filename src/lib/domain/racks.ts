/**
 * What the gym actually has on the floor.
 *
 * "+5 lb" is a fiction for free weights: there is no 37.5 lb kettlebell and no
 * 27.5 lb dumbbell on most racks. So for anything you pick UP, progression is
 * "the next size up", not "+inc" — the ladder is the source of truth and the
 * step between rungs is whatever the manufacturer decided.
 *
 * Machines are deliberately NOT modelled here. Selectorised stacks vary far
 * too much between gyms (10 lb plates on one, 15 on another, 5 lb add-ons on a
 * third), so machine exercises keep their per-exercise `inc`, which whoever
 * wrote the plan set by reading the actual stack.
 *
 * These are standard sizes, not this gym's inventory. Anything logged off the
 * ladder is honoured as-is and the next suggestion snaps from there, so a rack
 * that disagrees corrects itself the first time you log a real number.
 */
export type Rack = 'kettlebell' | 'dumbbell' | 'medball';

export const RACKS: Record<Rack, number[]> = {
	// The kg ladder every kettlebell is cast on, in pounds: 4, 6, 8, 10, 12,
	// 14, 16, 20, 24, 28, 32, 36, 40, 44, 48 kg. The gaps are real — there is
	// no 18 kg bell, which is why 16 → 20 kg is a genuine step up.
	kettlebell: [9, 13, 18, 22, 26, 31, 35, 44, 53, 62, 70, 79, 88, 97, 106],
	// 2.5 lb steps through the light end, 5 lb once the bells get big
	dumbbell: [
		2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80,
		85, 90, 95, 100
	],
	medball: [4, 6, 8, 10, 12, 14, 16, 18, 20, 25, 30]
};

/** Nearest real weight to `weight` — ties round down, never up into a jump. */
export function snapToRack(weight: number, rack: Rack): number {
	const rungs = RACKS[rack];
	let best = rungs[0];
	// strictly closer only: on a tie the earlier (lighter) rung keeps the win
	for (const r of rungs) if (Math.abs(r - weight) < Math.abs(best - weight)) best = r;
	return best;
}

/** The next size up. Already at the top of the rack → stays there. */
export function nextRung(weight: number, rack: Rack): number {
	const rungs = RACKS[rack];
	return rungs.find((r) => r > weight) ?? rungs[rungs.length - 1];
}

/** The next size down. Already at the bottom → stays there. */
export function prevRung(weight: number, rack: Rack): number {
	const rungs = RACKS[rack];
	for (let i = rungs.length - 1; i >= 0; i--) if (rungs[i] < weight) return rungs[i];
	return rungs[0];
}

/** "next bell up" — what the plan screen calls a level-up on this rack. */
export function rungLabel(rack: Rack): string {
	return rack === 'kettlebell' ? 'next bell up' : rack === 'medball' ? 'next ball up' : 'next dumbbell up';
}
