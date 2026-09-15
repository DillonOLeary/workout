/** A ladder of real sizes for anything you pick up — progression is the next size, not +inc. */
export type Rack = 'kettlebell' | 'dumbbell' | 'medball';

/** Standard sizes in pounds, not this gym's inventory; a number logged off the ladder is honoured and the next suggestion snaps from there. */
export const RACKS: Record<Rack, number[]> = {
	// the kg ladder every kettlebell is cast on: 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48 kg — there is no 18 kg bell
	kettlebell: [9, 13, 18, 22, 26, 31, 35, 44, 53, 62, 70, 79, 88, 97, 106],
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
