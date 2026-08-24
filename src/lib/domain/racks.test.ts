import { describe, expect, it } from 'vitest';
import { RACKS, nextRung, prevRung, snapToRack } from './racks';

describe('racks', () => {
	it('snaps to the nearest rung, ties rounding down', () => {
		expect(snapToRack(37, 'dumbbell')).toBe(35);
		expect(snapToRack(47.5, 'dumbbell')).toBe(45);
		expect(snapToRack(48, 'kettlebell')).toBe(44); // 44 vs 53: 4 away vs 5
	});
	it('honours an off-ladder weight by moving from it, not to it', () => {
		expect(nextRung(52, 'kettlebell')).toBe(53);
		expect(prevRung(52, 'kettlebell')).toBe(44);
	});
	it('pins at the ends of the rack', () => {
		const top = RACKS.dumbbell[RACKS.dumbbell.length - 1];
		expect(nextRung(top, 'dumbbell')).toBe(top);
		expect(prevRung(RACKS.dumbbell[0], 'dumbbell')).toBe(RACKS.dumbbell[0]);
	});
});
