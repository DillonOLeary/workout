import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GRID, MOTIONS, cycleMs, frameAt, frameOf, framesFor, glyphFor, motionFor, repMs, workFrame } from './glyphs';
import type { Motion } from './glyphs';

const gears = Object.keys(MOTIONS) as Motion[];

describe('exercise glyphs', () => {
	it('an unknown name gets nothing — never a stand-in', () => {
		expect(framesFor('Zercher Squat')).toBeNull();
		expect(frameOf('', 0)).toBeNull();
		expect(motionFor('')).toBeNull();
		expect(glyphFor('')).toBeNull();
	});

	it('is the three gears the clock assumes, on the grid the renderer assumes', () => {
		expect(GRID).toBe(31);
		expect(MOTIONS.rep).toMatchObject({ frameMs: 130, holdMs: 900 });
		expect(MOTIONS.rep.seq).toHaveLength(12);
		expect(MOTIONS.breath).toEqual({ seq: [0, 0.5, 1, 0.5], frameMs: 800, holdMs: 0 });
		expect(MOTIONS.still).toEqual({ seq: [1], frameMs: 0, holdMs: 0 });
		expect(workFrame('rep')).toBe(6);
		for (let k = 1; k <= 6; k++) expect(MOTIONS.rep.seq[k], `seq[${k}]`).toBeGreaterThan(MOTIONS.rep.seq[k - 1]);
		for (let k = 7; k < 12; k++) expect(MOTIONS.rep.seq[k], `seq[${k}]`).toBeLessThan(MOTIONS.rep.seq[k - 1]);
		expect(workFrame('breath')).toBe(2);
		expect(workFrame('still')).toBe(0);
		expect(repMs('rep')).toBe(1560);
		expect(cycleMs('rep')).toBe(2460);
		expect(cycleMs('breath')).toBe(3200);
		expect(cycleMs('still')).toBe(0);
	});

	it('a stamp is asked for one at a time and is the same one the whole gear gives', () => {
		const all = framesFor('Goblet Squat')!;
		expect(all).toHaveLength(12);
		expect(frameOf('Goblet Squat', 6)).toBe(all[6]);
		expect(frameOf('Goblet Squat', 99)).toBe(all[0]);
		expect(framesFor('Calf stretch')).toHaveLength(1);
		for (const g of gears) expect(MOTIONS[g].seq.length).toBeGreaterThan(0);
	});

	it('the shipped figures are in the gears the design classified', () => {
		expect(motionFor('Goblet Squat')).toBe('rep');
		expect(['Long-Lever Plank', 'Side Plank', 'Copenhagen Plank', 'Plank', 'Forearm Plank'].map(motionFor)).toEqual(['breath', 'breath', 'breath', 'breath', 'breath']);
		expect(['Calf stretch', 'Hip flexor stretch', 'Hamstring stretch', 'Figure-4 stretch', 'Doorway chest stretch'].map(motionFor)).toEqual(['still', 'still', 'still', 'still', 'still']);
		expect(['Pigeon', 'Sphinx', 'Supine Twist'].map(motionFor)).toEqual(['still', 'still', 'still']);
		expect(['Chair Pose', 'Warrior II', 'Downward Dog', 'Savasana', 'Hollow Hold', 'Superman Hold'].map(motionFor)).toEqual(['breath', 'breath', 'breath', 'breath', 'breath', 'breath']);
		expect(['Push-up', 'Bear Crawl', 'Bodyweight Squat', 'Reverse Lunge', 'Single-leg Calf Raise', 'Easy run'].map(motionFor)).toEqual(['rep', 'rep', 'rep', 'rep', 'rep', 'rep']);
		expect(glyphFor('Bodyweight Squat')?.name).toBe('Goblet Squat');
		expect(glyphFor('Easy run')?.name).toBe('Easy jog');
		expect(glyphFor('Goblet Squat')?.cue).toMatch(/hips drop/);
	});

	it('the clock: the pass, a hold on the still, then again — per gear', () => {
		expect(frameAt(0, 'rep')).toBe(0);
		expect(frameAt(129, 'rep')).toBe(0);
		expect(frameAt(130, 'rep')).toBe(1);
		expect(frameAt(6 * 130, 'rep')).toBe(6);
		expect(frameAt(1559, 'rep')).toBe(11);
		expect(frameAt(1560, 'rep')).toBe(0);
		expect(frameAt(2459, 'rep')).toBe(0);
		expect(frameAt(2460, 'rep')).toBe(0);
		expect(frameAt(2460 + 130, 'rep')).toBe(1);
		expect([0, 799, 800, 1600, 2400, 3199, 3200].map((t) => frameAt(t, 'breath'))).toEqual([0, 0, 1, 2, 3, 3, 0]);
		expect(frameAt(12345, 'still')).toBe(0);
		expect(frameAt(-50, 'rep')).toBe(0);
	});

	it('the reviewed snapshot is what the rig draws', () => {
		const bake = fileURLToPath(new URL('../../../tools/glyphs/bake.mjs', import.meta.url));
		expect(() => execFileSync(process.execPath, [bake, '--check'], { stdio: 'pipe' })).not.toThrow();
	});
});
