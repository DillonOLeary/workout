import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SHIPPED_PLANS } from '$lib/domain/plans';
import { planExercises } from '$lib/domain/plan';
import { FIGURES, GRID, GROUPS, STAND, figureFor, figureFrame, keyGrid, planRoute, snapshot, timeline } from './rig';
import { Stage } from './stage';

const fig = (name: string) => figureFor(name)!;
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const routeOf = (from: string, to: string) => {
	const a = fig(from), f = figureFrame(a, 'ambient', 0, 0, 0);
	return planRoute(snapshot(f.body, f.scene.J, f.props), a.base, fig(to), 'ambient');
};

describe('the rig', () => {
	it('every exercise and every named warm-up or cooldown line of every shipped plan has a figure — the run included', () => {
		for (const plan of SHIPPED_PLANS) {
			for (const ex of planExercises(plan)) expect(figureFor(ex.name), ex.name).not.toBeNull();
			const lines = [...(plan.warmup ?? []), ...(plan.cooldown ?? []), ...Object.values(plan.routineInfo).flatMap((r) => [...(r.warmup ?? []), ...(r.cooldown ?? [])])];
			for (const it of lines) if (typeof it !== 'string') expect(figureFor(it.name), it.name).not.toBeNull();
		}
		expect(figureFor('Nothing here')).toBeNull();
		expect(fig(STAND).kind).toBe('idle');
	});

	it('the library: every figure once, in one group, its name and aliases its own; a rep has four tempo beats, a hold a breath', () => {
		expect(new Set(FIGURES.map((f) => f.id)).size).toBe(FIGURES.length);
		expect(GROUPS.flatMap(([, ids]) => ids).sort()).toEqual(FIGURES.map((f) => f.id).sort());
		const names = FIGURES.flatMap((f) => [f.name, ...(f.aliases ?? [])]);
		expect(new Set(names).size).toBe(names.length);
		for (const f of FIGURES) {
			if (f.kind === 'rep') expect([f.tempo?.length, f.labels?.length], f.id).toEqual([4, 4]);
			if (f.kind === 'hold' || f.kind === 'stretch') expect(f.breath && f.hold, f.id).toBeTruthy();
		}
	});

	it('bones keep their length whatever the pose — the knee and the elbow are solved, never stretched', () => {
		for (const f of FIGURES) for (const tau of [0, 0.7, 1.9, 3.3]) {
			const J = figureFrame(f, 'ambient', tau, tau, 0).scene.J;
			for (let i = 0; i < 2; i++) {
				expect(dist(J.legs[i].hip, J.legs[i].knee), f.id).toBeCloseTo(0.44, 3);
				expect(dist(J.legs[i].knee, J.legs[i].ank), f.id).toBeCloseTo(0.43, 3);
				expect(dist(J.sh[i], J.arms[i].E), f.id).toBeCloseTo(0.29, 3);
				expect(dist(J.arms[i].E, J.arms[i].W), f.id).toBeCloseTo(0.27, 3);
			}
		}
	});

	it('contacts hold: a foot down for the whole rep stays where it was planted, a planted hand never moves', () => {
		const toes = [0.5, 1.5, 2.5, 3.5].map((t) => figureFrame(fig('Goblet Squat'), 'ambient', t, t, 0).scene.J.legs[1].toe);
		for (const t of toes) expect(dist(t, toes[0])).toBeLessThan(0.002);
		const hands = [0, 1, 2].map((t) => figureFrame(fig('Push-up'), 'ambient', t, t, 0).scene.J.arms[0].T);
		for (const h of hands) expect(h).toEqual(hands[0]);
	});

	it('every figure stands on its floor: the key pose casts a contact shadow', () => {
		for (const f of FIGURES) {
			const g = keyGrid(f);
			expect(g.N).toBe(GRID);
			let shadow = 0, body = 0;
			for (let i = 0; i < g.kind.length; i++) {
				if (g.kind[i] === 1) shadow = Math.max(shadow, g.val[i]);
				if (g.kind[i] === 2) body++;
			}
			expect(shadow, f.id).toBeGreaterThan(0.5);
			expect(body, f.id).toBeGreaterThan(60);
		}
	});

	it('time: two demo reps at tempo then the start pose, breathing; a hold settles into its pose; reduced motion is the key pose', () => {
		const g = fig('Goblet Squat'), T = g.tempo!.reduce((a, b) => a + b, 0);
		expect(timeline(g, 'ambient', 0.1)).toMatchObject({ seg: 0, label: 'Lower', sub: 'rep 1 of 2' });
		expect(timeline(g, 'ambient', 3.5)).toMatchObject({ d: 1, label: 'Pause' });
		expect(timeline(g, 'ambient', T + 0.1).sub).toBe('rep 2 of 2');
		expect(timeline(g, 'ambient', 2 * T + 0.1)).toMatchObject({ d: 0, label: 'Ready', settled: true });
		expect(timeline(g, 'still', 1)).toMatchObject({ d: 1, label: 'Still' });
		const plank = fig('Long-Lever Plank');
		expect(timeline(plank, 'ambient', 0).d).toBe(0);
		expect(timeline(plank, 'ambient', 1.2).d).toBe(1);
		const pigeon = fig('Pigeon');
		expect(timeline(pigeon, 'ambient', 0).d).toBeCloseTo(0.3);
		expect(timeline(pigeon, 'ambient', 30).d).toBe(1);
	});

	it('a route walks the waypoints and never takes much more than five seconds', () => {
		const names = (a: string, b: string) => routeOf(a, b).hops.map((h) => h.B.name);
		expect(names('Goblet Squat', 'Savasana')).toEqual(['Half-kneel', 'Sit back', 'Sit', 'Lie back', 'Savasana']);
		expect(names('Goblet Squat', 'Push-up')).toEqual(['Half-kneel', 'Sit back', 'All fours', 'Push-up']);
		expect(names('Goblet Squat', 'Chest Press')).toEqual(['Bench', 'Chest Press']);
		expect(names('Goblet Squat', 'Warrior II')).toEqual(['Warrior II']);
		for (const f of FIGURES) expect(routeOf('Savasana', f.name).total, f.id).toBeLessThanOrEqual(5.5 + 1e-9);
	});

	it('the stage: a new figure is walked to and then played; reduced motion cuts; a tap replays', () => {
		const at = (s: Stage, t: number) => s.frame(t, 21).readout;
		const s = new Stage(fig('Goblet Squat'), false, 0);
		at(s, 0);
		s.show(fig('Low Lunge'), 1);
		expect(at(s, 1.5)).toMatchObject({ label: 'Moving', sub: '→ Low Lunge' });
		expect(s.figure).toBe(fig('Low Lunge'));
		expect(at(s, 10).label).not.toBe('Moving');
		const still = new Stage(fig('Goblet Squat'), true, 0);
		at(still, 0);
		still.show(fig('Savasana'), 1);
		expect(at(still, 1.1)).toMatchObject({ label: 'Inhale', sub: 'reduced motion' });
		const r = new Stage(fig('Goblet Squat'), false, 0);
		expect(at(r, 20).label).toBe('Ready');
		r.replay(20);
		expect(at(r, 20.1).label).toBe('Lower');
	});

	it('the reviewed snapshot is what the rig draws', () => {
		const bake = fileURLToPath(new URL('../../../tools/glyphs/bake.mjs', import.meta.url));
		expect(() => execFileSync(process.execPath, [bake, '--check'], { stdio: 'pipe' })).not.toThrow();
	});
});

