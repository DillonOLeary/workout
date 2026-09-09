/* Port of src/lib/design/glyphs.ts (types stripped) + the ExerciseGlyph.svelte renderer.
   v2: one fixed 31×31 dot grid for every pose (world x −0.65..0.65, y 0..1.3, ground at y=0); poses light dots, never resize the grid. */
(function () {
  const SEQ = [0, 0.16, 0.34, 0.55, 0.76, 0.92, 1, 0.9, 0.72, 0.5, 0.28, 0.1]; // 12 stamps: out over 7, back over 5
  const FRAME_MS = 130;
  const GRID_STEP = 0.042;
  const GRID_N = 31;
  const WORLD = { x0: -0.65, x1: 0.65, y0: 0, y1: 1.3 };

  function ik(sx, sy, hx, hy, l1, l2, out) {
    let dx = hx - sx, dy = hy - sy, d = Math.hypot(dx, dy);
    const mn = Math.abs(l1 - l2) + 1e-4, mx = l1 + l2 - 1e-4;
    if (d < mn) { const k = mn / (d || 1e-6); dx *= k; dy *= k; d = mn; }
    if (d > mx) { const k = mx / d; dx *= k; dy *= k; d = mx; }
    const base = Math.atan2(dy, dx);
    const off = Math.acos(Math.max(-1, Math.min(1, (d * d + l1 * l1 - l2 * l2) / (2 * d * l1))));
    const e1 = { x: sx + l1 * Math.cos(base + off), y: sy + l1 * Math.sin(base + off) };
    const e2 = { x: sx + l1 * Math.cos(base - off), y: sy + l1 * Math.sin(base - off) };
    if (Math.abs(e1.y - e2.y) > 0.02) return e1.y < e2.y ? e1 : e2;
    return out > 0 ? (e1.x > e2.x ? e1 : e2) : (e1.x < e2.x ? e1 : e2);
  }

  /* one figure grammar: joints in, segments out. Widths are the same for every pose. */
  const W = { torso: 0.058, thigh: 0.045, shin: 0.034, foot: 0.02, uarm: 0.026, farm: 0.022, head: 0.055 };
  function person(P) {
    const segs = [], circs = [[P.head[0], P.head[1], W.head]];
    segs.push([P.hip[0], P.hip[1], P.sh[0], P.sh[1], W.torso]);
    for (const l of P.legs || []) {
      segs.push([P.hip[0], P.hip[1], l.knee[0], l.knee[1], W.thigh]);
      segs.push([l.knee[0], l.knee[1], l.ankle[0], l.ankle[1], W.shin]);
      if (l.toe) { const h = l.heel || l.ankle; segs.push([h[0], h[1], l.toe[0], l.toe[1], W.foot]); }
    }
    for (const a of P.arms || []) {
      const s = a.sh || P.sh;
      segs.push([s[0], s[1], a.elbow[0], a.elbow[1], W.uarm]);
      segs.push([a.elbow[0], a.elbow[1], a.hand[0], a.hand[1], W.farm]);
    }
    return { segs, circs };
  }
  const add = (p, segs, circs) => { p.segs.push(...segs); if (circs) p.circs.push(...circs); return p; };
  const mirror = (p) => ({ segs: p.segs.map(([x1, y1, x2, y2, r]) => [-x1, y1, -x2, y2, r]), circs: p.circs.map(([x, y, r]) => [-x, y, r]) });
  const shift = (p, dx) => ({ segs: p.segs.map(([x1, y1, x2, y2, r]) => [x1 + dx, y1, x2 + dx, y2, r]), circs: p.circs.map(([x, y, r]) => [x + dx, y, r]) });

  function squatPose(d, deep) {
    const L = (a, b) => a + (b - a) * d;
    const kX = L(0.15, deep ? 0.24 : 0.22), kY = L(0.27, deep ? 0.22 : 0.24);
    const hipY = L(0.52, deep ? 0.24 : 0.31), shY = L(0.8, deep ? 0.52 : 0.585);
    const headY = L(0.92, deep ? 0.66 : 0.715), bellY = L(0.7, deep ? 0.44 : 0.5);
    const eX = L(0.15, 0.18), eY = L(0.6, deep ? 0.34 : 0.4);
    const segs = [], g2 = [-1, 1];
    for (const g of g2) {
      segs.push([g * 0.2, 0.03, g * 0.12, 0.03, 0.025]);
      segs.push([g * 0.16, 0.03, g * kX, kY, 0.03]);
      segs.push([g * kX, kY, g * 0.05, hipY, 0.042]);
      segs.push([g * 0.1, shY, g * eX, eY, 0.024]);
      segs.push([g * eX, eY, g * 0.04, bellY, 0.02]);
    }
    segs.push([0, hipY - 0.02, 0, shY, 0.062]);
    segs.push([-0.1, shY, 0.1, shY, 0.04]);
    return { segs, circs: [[0, headY, 0.06], [0, bellY - 0.01, 0.055]] };
  }

  const POSES = {
    goblet: (d) => squatPose(d, false),
    gobletdeep: (d) => squatPose(d, true),
    pulldown: (d) => {
      const barY = 1.04 - 0.36 * d;
      const segs = [
        [0, 0.27, -0.18, 0.26, 0.042], [-0.19, 0.25, -0.2, 0.04, 0.03],
        [0, 0.27, 0.18, 0.26, 0.042], [0.19, 0.25, 0.2, 0.04, 0.03],
        [0, 0.24, 0, 0.62, 0.062],
        [-0.36, barY, 0.36, barY, 0.013], [0, barY, 0, 1.26, 0.007],
        [-0.11, 0.17, 0.11, 0.17, 0.018]
      ];
      for (const g of [-1, 1]) {
        const S = { x: g * 0.13, y: 0.64 }, H = { x: g * 0.3, y: barY };
        const E = ik(S.x, S.y, H.x, H.y, 0.2, 0.18, g);
        segs.push([S.x, S.y, E.x, E.y, 0.028], [E.x, E.y, H.x, H.y, 0.022]);
      }
      return { segs, circs: [[0, 0.77, 0.062]] };
    },
    chestpress: (d) => {
      const L = (a, b) => a + (b - a) * d, hx = L(0.16, 0.38);
      const E = ik(0.02, 0.62, hx, 0.6, 0.19, 0.17, 1);
      return { segs: [
        [0, 0, 0, 0.26, 0.015], [-0.08, 0.28, 0.1, 0.28, 0.02], [-0.08, 0.3, -0.08, 0.6, 0.015],
        [0, 0.32, 0, 0.64, 0.058],
        [0, 0.32, 0.2, 0.32, 0.04], [0.2, 0.32, 0.24, 0.05, 0.028], [0.2, 0.03, 0.3, 0.03, 0.02],
        [0.02, 0.62, E.x, E.y, 0.026], [E.x, E.y, hx, 0.6, 0.022],
        [hx, 0.53, hx, 0.67, 0.015]
      ], circs: [[0.02, 0.76, 0.058]] };
    },
    /* side view, facing the cable stack on the right. Split stance, rope pulled to the face, elbows high and back. */
    facepull: (d) => {
      const L = (a, b) => a + (b - a) * d;
      const hand = [L(0.4, 0.14), L(0.8, 0.9)], elbow = [L(0.2, -0.1), L(0.74, 0.88)];
      const p = person({ head: [-0.04, 0.92], sh: [-0.03, 0.8], hip: [0, 0.52],
        legs: [{ knee: [0.08, 0.28], ankle: [0.1, 0.04], heel: [0.02, 0.02], toe: [0.2, 0.02] },
               { knee: [-0.06, 0.28], ankle: [-0.1, 0.04], heel: [-0.18, 0.02], toe: [0, 0.02] }],
        arms: [{ elbow, hand }] });
      return add(p, [[hand[0], hand[1], 0.6, 0.88, 0.007], [0.6, 0, 0.6, 1.24, 0.012]], [[hand[0], hand[1], 0.022]]);
    },
    /* side view. Hips travel back, back stays flat, dumbbells slide down the thighs to mid-shin. */
    rdl: (d) => {
      const L = (a, b) => a + (b - a) * d;
      const hand = [L(0.03, 0.25), L(0.5, 0.3)];
      const p = person({ head: [L(0, 0.34), L(0.92, 0.73)], sh: [L(0, 0.22), L(0.8, 0.66)], hip: [L(0, -0.14), L(0.52, 0.5)],
        legs: [{ knee: [L(0.02, 0), L(0.3, 0.3)], ankle: [0, 0.04], heel: [-0.08, 0.02], toe: [0.1, 0.02] }],
        arms: [{ elbow: [L(0.02, 0.24), L(0.65, 0.48)], hand }] });
      return add(p, [[hand[0] - 0.05, hand[1] - 0.03, hand[0] + 0.05, hand[1] - 0.03, 0.03]]);
    },
    /* side view. Standing tall with the bell hanging → knees and hips bend, bell to the floor between the feet. */
    kbdl: (d) => {
      const L = (a, b) => a + (b - a) * d;
      const hand = [L(0.03, 0.08), L(0.44, 0.18)];
      const p = person({ head: [L(0, 0.26), L(0.92, 0.7)], sh: [L(0, 0.16), L(0.8, 0.62)], hip: [L(0, -0.1), L(0.55, 0.4)],
        legs: [{ knee: [L(0.03, 0.12), L(0.3, 0.3)], ankle: [0, 0.04], heel: [-0.08, 0.02], toe: [0.1, 0.02] }],
        arms: [{ elbow: [L(0.02, 0.1), L(0.62, 0.4)], hand }] });
      return add(p, [[hand[0], hand[1], hand[0], hand[1] - 0.04, 0.014]], [[hand[0], hand[1] - 0.08, 0.06]]);
    },
    /* side view, one hand on a wall. The whole body rises on the toes; the heel leaves the floor, the toe never does. */
    calf: (d) => {
      const r = d * 0.12;
      const p = person({ head: [0, 0.92 + r], sh: [0, 0.8 + r], hip: [0, 0.53 + r],
        legs: [{ knee: [0.02, 0.3 + r], ankle: [0, 0.05 + r], heel: [-0.07, 0.02 + r * 1.1], toe: [0.1, 0.02] }],
        arms: [{ elbow: [0.16, 0.7 + r], hand: [0.32, 0.78 + r] }] });
      return add(p, [[0.34, 0, 0.34, 1.2, 0.012]]);
    },
    /* forearm plank with the elbows pushed far forward — the long lever. A hold: only a faint brace. */
    plankll: (d) => {
      const s = d * 0.02;
      return person({ head: [-0.36, 0.33], sh: [-0.26, 0.27], hip: [0.1, 0.2 - s],
        legs: [{ knee: [0.34, 0.13], ankle: [0.57, 0.06], toe: [0.6, 0.02] }],
        arms: [{ elbow: [-0.48, 0.04], hand: [-0.6, 0.04] }] });
    },
    ohp: (d) => {
      const L = (a, b) => a + (b - a) * d;
      const hy = L(0.7, 1.0), hx = L(0.2, 0.12);
      const segs = [
        [-0.16, 0.17, 0.16, 0.17, 0.02], [-0.13, 0.03, -0.13, 0.16, 0.016], [0.13, 0.03, 0.13, 0.16, 0.016],
        [0, 0.25, 0, 0.62, 0.06]
      ];
      for (const g of [-1, 1]) {
        segs.push([0, 0.27, g * 0.18, 0.26, 0.04], [g * 0.19, 0.25, g * 0.2, 0.05, 0.028]);
        const E = ik(g * 0.12, 0.62, g * hx, hy, 0.2, 0.18, g);
        segs.push([g * 0.12, 0.62, E.x, E.y, 0.026], [E.x, E.y, g * hx, hy, 0.022]);
        segs.push([g * hx, hy - 0.035, g * hx, hy + 0.035, 0.014]);
      }
      return { segs, circs: [[0, 0.76, 0.06]] };
    },
    /* side view, seated on a bench, feet flat on the floor, cable from the stack on the right. */
    row: (d) => {
      const L = (a, b) => a + (b - a) * d;
      const hand = [L(0.3, -0.14), L(0.52, 0.48)], sh = [L(-0.06, -0.12), 0.64];
      const p = person({ head: [L(-0.05, -0.12), 0.76], sh, hip: [-0.1, 0.32],
        legs: [{ knee: [0.14, 0.34], ankle: [0.24, 0.04], heel: [0.16, 0.02], toe: [0.34, 0.02] }],
        arms: [{ elbow: [L(0.12, -0.34), L(0.56, 0.5)], hand }] });
      return add(p, [
        [-0.28, 0.3, 0.06, 0.3, 0.02], [-0.22, 0.03, -0.22, 0.29, 0.016], [0, 0.03, 0, 0.29, 0.016],
        [hand[0], hand[1], 0.6, 0.5, 0.007], [0.6, 0, 0.6, 0.8, 0.014]
      ], [[hand[0], hand[1], 0.02]]);
    },
    lunge: (d) => {
      const L = (a, b) => a + (b - a) * d;
      const hip = [L(0.02, -0.04), L(0.53, 0.37)], sh = [L(0.04, -0.02), L(0.8, 0.66)];
      return { segs: [
        [0.08, 0.03, L(0.06, 0.16), L(0.28, 0.3), 0.034],
        [L(0.06, 0.16), L(0.28, 0.3), hip[0], hip[1], 0.045],
        [L(0.06, -0.38), 0.03, L(0.0, -0.22), L(0.28, 0.14), 0.03],
        [L(0.0, -0.22), L(0.28, 0.14), hip[0], hip[1], 0.04],
        [hip[0], hip[1], sh[0], sh[1], 0.058],
        [sh[0], sh[1], sh[0] + 0.08, L(0.52, 0.4), 0.02]
      ], circs: [[sh[0], sh[1] + 0.12, 0.055], [sh[0] + 0.08, L(0.48, 0.36), 0.045]] };
    },
    legcurl: (d) => {
      const L = (a, b) => a + (b - a) * d;
      const foot = [L(0.44, 0.3), L(0.32, 0.1)];
      return { segs: [
        [0, 0.02, 0, 0.3, 0.015], [-0.15, 0.32, 0.15, 0.32, 0.022], [-0.15, 0.34, -0.19, 0.6, 0.015],
        [-0.05, 0.36, -0.1, 0.66, 0.056],
        [-0.05, 0.36, 0.2, 0.36, 0.045],
        [0.2, 0.36, foot[0], foot[1], 0.032],
        [-0.08, 0.6, 0.0, 0.36, 0.02]
      ], circs: [[-0.1, 0.78, 0.055], [foot[0] + 0.02, foot[1] - 0.01, 0.032]] };
    },
    /* side plank with the top leg resting on a bench; the bottom leg lifts to meet it. */
    cph: (d) => {
      const L = (a, b) => a + (b - a) * d;
      const p = person({ head: [-0.46, 0.38], sh: [-0.36, 0.31], hip: [0.02, 0.29],
        legs: [{ knee: [0.26, 0.26], ankle: [0.5, 0.24], toe: [0.58, 0.24] },
               { knee: [L(0.1, 0.16), L(0.16, 0.2)], ankle: [L(0.18, 0.32), L(0.06, 0.17)], toe: [L(0.25, 0.39), L(0.06, 0.17)] }],
        arms: [{ elbow: [-0.4, 0.04], hand: [-0.22, 0.04] }] });
      return add(p, [[0.3, 0.19, 0.62, 0.19, 0.024], [0.34, 0.02, 0.34, 0.17, 0.016], [0.58, 0.02, 0.58, 0.17, 0.016]]);
    },
    /* on the back, arms to the ceiling, knees at 90°. One arm reaches overhead while the opposite leg extends. */
    deadbug: (d) => {
      const L = (a, b) => a + (b - a) * d;
      return person({ head: [-0.46, 0.08], sh: [-0.32, 0.09], hip: [0.05, 0.09],
        legs: [{ knee: [0.05, 0.38], ankle: [0.25, 0.38] },
               { knee: [L(0.05, 0.3), L(0.38, 0.24)], ankle: [L(0.25, 0.56), L(0.38, 0.12)] }],
        arms: [{ elbow: [-0.32, 0.25], hand: [-0.32, 0.42] },
               { elbow: [L(-0.32, -0.5), L(0.25, 0.18)], hand: [L(-0.32, -0.62), L(0.42, 0.16)] }] });
    },
    bridge: (d) => {
      const hy = 0.1 + d * 0.2;
      return { segs: [
        [-0.3, 0.09, 0, hy, 0.055],
        [0, hy, 0.2, 0.32, 0.045], [0.2, 0.32, 0.26, 0.05, 0.03], [0.22, 0.03, 0.32, 0.03, 0.018],
        [-0.3, 0.09, -0.08, 0.03, 0.02]
      ], circs: [[-0.42, 0.09, 0.052], [0, hy + 0.1, 0.05]] };
    },
    /* one straight line from the feet to the shoulder, on a forearm; top arm to the ceiling. A hold: faint hip dip. */
    sideplank: (d) => {
      const s = d * 0.03;
      return person({ head: [-0.4, 0.34], sh: [-0.3, 0.28], hip: [0.04, 0.18 - s],
        legs: [{ knee: [0.24, 0.11 - s * 0.5], ankle: [0.44, 0.04], toe: [0.52, 0.03] }],
        arms: [{ elbow: [-0.32, 0.04], hand: [-0.14, 0.04] }, { elbow: [-0.3, 0.42], hand: [-0.3, 0.56] }] });
    },

    /* ---- the stretches (from the repo, src/lib/design/glyphs.ts @main) — d leans into the hold ---- */
    calfstretch: (d) => {
      const L = (a, b) => a + (b - a) * d;
      const hip = [L(-0.06, 0.04), L(0.55, 0.5)], sh = [L(0.1, 0.2), L(0.82, 0.76)], knee = [L(0.18, 0.26), 0.28];
      return { segs: [
        [0.54, 0, 0.54, 1.12, 0.012],
        [-0.52, 0.02, -0.36, 0.02, 0.02], [-0.44, 0.03, hip[0], hip[1], 0.04],
        [0.08, 0.02, 0.26, 0.02, 0.02], [0.17, 0.03, knee[0], knee[1], 0.03], [knee[0], knee[1], hip[0], hip[1], 0.045],
        [hip[0], hip[1], sh[0], sh[1], 0.058],
        [sh[0], sh[1], 0.5, L(0.8, 0.74), 0.024], [sh[0], sh[1] - 0.02, 0.5, L(0.7, 0.64), 0.022]
      ], circs: [[sh[0] + 0.05, sh[1] + 0.12, 0.055]] };
    },
    hipflexor: (d) => {
      const L = (a, b) => a + (b - a) * d;
      const hip = [L(-0.14, -0.02), L(0.34, 0.33)], sh = [hip[0] + 0.03, hip[1] + 0.3], fk = [L(0.27, 0.33), 0.3];
      return shift({ segs: [
        [-0.3, 0.05, -0.62, 0.03, 0.03], [-0.62, 0.03, -0.74, 0.04, 0.02], [-0.3, 0.05, hip[0], hip[1], 0.045],
        [0.18, 0.02, 0.38, 0.02, 0.02], [0.27, 0.03, fk[0], fk[1], 0.03], [fk[0], fk[1], hip[0], hip[1], 0.045],
        [hip[0], hip[1], sh[0], sh[1], 0.058],
        [sh[0], sh[1], fk[0], fk[1] + 0.04, 0.022]
      ], circs: [[sh[0] + 0.01, sh[1] + 0.12, 0.055]] }, 0.14);
    },
    hamstring: (d) => {
      const L = (a, b) => a + (b - a) * d;
      const hip = [-0.08, 0.52], sh = [L(-0.04, 0.24), L(0.8, 0.58)], hand = [L(0.02, 0.36), L(0.55, 0.32)];
      return shift({ segs: [
        [0.3, 0, 0.3, 0.2, 0.014], [0.3, 0.2, 0.62, 0.2, 0.014], [0.62, 0, 0.62, 0.2, 0.014],
        [-0.24, 0.02, -0.06, 0.02, 0.02], [-0.15, 0.03, hip[0], hip[1], 0.04],
        [hip[0], hip[1], 0.42, 0.24, 0.04], [0.42, 0.24, 0.48, 0.32, 0.018],
        [hip[0], hip[1], sh[0], sh[1], 0.058],
        [sh[0], sh[1], hand[0], hand[1], 0.022]
      ], circs: [[sh[0] + L(0, 0.1), sh[1] + L(0.12, 0.06), 0.055]] }, -0.14);
    },
    figure4: (d) => {
      const L = (a, b) => a + (b - a) * d;
      const hip = [-0.06, 0.36], sh = [L(-0.04, 0.12), L(0.66, 0.52)];
      return { segs: [
        [-0.36, 0.3, 0.3, 0.3, 0.02], [-0.3, 0, -0.3, 0.28, 0.014], [0.24, 0, 0.24, 0.28, 0.014],
        [hip[0], hip[1], 0.22, 0.36, 0.045], [0.22, 0.36, 0.25, 0.03, 0.03], [0.2, 0.02, 0.34, 0.02, 0.018],
        [hip[0], hip[1], 0, 0.5, 0.045], [0, 0.5, 0.24, 0.42, 0.03],
        [hip[0], hip[1], sh[0], sh[1], 0.058],
        [sh[0], sh[1], L(0.06, 0.16), L(0.48, 0.44), 0.022]
      ], circs: [[sh[0] + 0.02, sh[1] + 0.12, 0.055]] };
    },
    doorway: (d) => {
      const L = (a, b) => a + (b - a) * d;
      const segs = [
        [-0.4, 0, -0.4, 1.16, 0.014], [0.4, 0, 0.4, 1.16, 0.014], [-0.4, 1.16, 0.4, 1.16, 0.014],
        [0, 0.25, 0, L(0.62, 0.6), 0.06]
      ];
      for (const g of [-1, 1]) {
        segs.push([0, 0.27, g * L(0.12, 0.16), 0.26, 0.04], [g * L(0.12, 0.16), 0.25, g * L(0.14, 0.2), 0.05, 0.03], [g * L(0.1, 0.16), 0.03, g * L(0.2, 0.26), 0.03, 0.02]);
        segs.push([g * 0.12, L(0.62, 0.6), g * 0.36, L(0.66, 0.7), 0.028], [g * 0.36, L(0.66, 0.7), g * 0.38, L(0.92, 0.98), 0.024]);
      }
      return { segs, circs: [[0, L(0.76, 0.74), 0.06]] };
    },

    /* ---- the run's warm-up drills (from the repo) — d is the drive ---- */
    highknees: (d) => {
      const L = (a, b) => a + (b - a) * d, bob = L(0, 0.04);
      const hip = [0, 0.53 + bob], sh = [0.02, 0.8 + bob];
      const knee = [L(0.08, 0.22), L(0.28, 0.54) + bob], foot = [L(0.1, 0.16), L(0.03, 0.32) + bob];
      return { segs: [
        [-0.1, 0.02, 0.08, 0.02, 0.02],
        [0, 0.03, -0.02, 0.28 + bob, 0.032], [-0.02, 0.28 + bob, hip[0], hip[1], 0.045],
        [hip[0], hip[1], knee[0], knee[1], 0.045], [knee[0], knee[1], foot[0], foot[1], 0.03],
        [hip[0], hip[1], sh[0], sh[1], 0.058],
        [sh[0], sh[1], L(-0.02, -0.18), L(0.62, 0.7) + bob, 0.024], [L(-0.02, -0.18), L(0.62, 0.7) + bob, L(0.06, -0.06), L(0.5, 0.86) + bob, 0.022],
        [sh[0], sh[1], L(0.1, 0.2), L(0.62, 0.68) + bob, 0.024], [L(0.1, 0.2), L(0.62, 0.68) + bob, L(0.14, 0.34), L(0.5, 0.8) + bob, 0.022]
      ], circs: [[sh[0] + 0.01, sh[1] + 0.12, 0.055]] };
    },
    carioca: (d) => {
      const L = (a, b) => a + (b - a) * d;
      return { segs: [
        [0, 0.5, 0, 0.8, 0.058],
        [-0.1, 0.8, -0.36, L(0.72, 0.66), 0.024], [0.1, 0.8, 0.36, L(0.72, 0.66), 0.024],
        [0.05, 0.52, 0.12, 0.28, 0.045], [0.12, 0.28, 0.14, 0.04, 0.03], [0.08, 0.02, 0.22, 0.02, 0.02],
        [-0.05, 0.52, L(-0.14, 0.12), L(0.3, 0.34), 0.045], [L(-0.14, 0.12), L(0.3, 0.34), L(-0.18, 0.26), L(0.04, 0.06), 0.03],
        [L(-0.24, 0.2), 0.03, L(-0.1, 0.34), 0.03, 0.02]
      ], circs: [[0, 0.92, 0.058]] };
    },
    legswing: (d) => {
      const L = (a, b) => a + (b - a) * d, a = L(-0.6, 0.9);
      const hip = [0, 0.53], foot = [hip[0] + 0.5 * Math.sin(a), hip[1] - 0.5 * Math.cos(a)];
      return { segs: [
        [-0.54, 0, -0.54, 1.1, 0.012],
        [-0.14, 0.02, 0.04, 0.02, 0.02], [-0.04, 0.03, hip[0], hip[1], 0.04],
        [hip[0], hip[1], foot[0], foot[1], 0.04],
        [foot[0], foot[1], foot[0] + 0.06 * Math.cos(a), foot[1] + 0.06 * Math.sin(a), 0.02],
        [hip[0], hip[1], -0.02, 0.8, 0.058],
        [-0.02, 0.8, -0.5, 0.78, 0.022], [-0.02, 0.8, L(0.14, 0.1), L(0.56, 0.6), 0.022]
      ], circs: [[-0.02, 0.92, 0.055]] };
    },
    askip: (d) => {
      const L = (a, b) => a + (b - a) * d, hop = L(0, 0.07);
      const hip = [0, 0.53 + hop], sh = [0.02, 0.8 + hop];
      const knee = [L(0.06, 0.24), L(0.3, 0.5) + hop], foot = [L(0.08, 0.22), L(0.04, 0.26) + hop];
      return { segs: [
        [-0.1, 0.02 + hop * 0.6, 0.08, 0.02 + hop * 0.6, 0.02],
        [0, 0.03 + hop * 0.6, 0, 0.28 + hop, 0.032], [0, 0.28 + hop, hip[0], hip[1], 0.045],
        [hip[0], hip[1], knee[0], knee[1], 0.045], [knee[0], knee[1], foot[0], foot[1], 0.03],
        [hip[0], hip[1], sh[0], sh[1], 0.058],
        [sh[0], sh[1], L(0.1, 0.18), L(0.62, 0.66) + hop, 0.024], [L(0.1, 0.18), L(0.62, 0.66) + hop, L(0.14, 0.26), L(0.5, 0.8) + hop, 0.022],
        [sh[0], sh[1], L(-0.06, -0.14), L(0.62, 0.62) + hop, 0.024], [L(-0.06, -0.14), L(0.62, 0.62) + hop, L(-0.08, -0.2), L(0.5, 0.46) + hop, 0.022]
      ], circs: [[sh[0] + 0.01, sh[1] + 0.12, 0.055]] };
    },
    walklunge: (d) => mirror(POSES.lunge(d))
  };

  const POSE_BY_NAME = {
    'Goblet Squat': 'goblet', 'Deep Goblet Squat': 'gobletdeep', 'Chest Press': 'chestpress',
    'Face Pull': 'facepull', 'Band Face Pull': 'facepull', 'Lat Pulldown': 'pulldown',
    'Romanian Deadlift': 'rdl', 'KB Deadlift': 'kbdl', 'Standing Calf Raise': 'calf',
    'Long-Lever Plank': 'plankll', 'Shoulder Press': 'ohp', 'Seated Row': 'row',
    'DB Reverse Lunge': 'lunge', 'Leg Curl': 'legcurl', 'Copenhagen Plank': 'cph',
    'Dead Bug': 'deadbug', 'DB Glute Bridge': 'bridge', 'Side Plank': 'sideplank',
    'Calf stretch': 'calfstretch', 'Hip flexor stretch': 'hipflexor', 'Hamstring stretch': 'hamstring',
    'Figure-4 stretch': 'figure4', 'Doorway chest stretch': 'doorway',
    'High knees': 'highknees', 'Carioca': 'carioca', 'Leg swings': 'legswing', 'A-skips': 'askip', 'Walking lunges': 'walklunge'
  };
  const GROUPS = [
    { title: 'Lifts', names: ['Goblet Squat', 'Deep Goblet Squat', 'Chest Press', 'Face Pull', 'Lat Pulldown', 'Romanian Deadlift', 'KB Deadlift', 'Standing Calf Raise', 'Long-Lever Plank', 'Shoulder Press', 'Seated Row', 'DB Reverse Lunge', 'Leg Curl', 'Copenhagen Plank', 'Dead Bug', 'DB Glute Bridge', 'Side Plank'] },
    { title: 'Stretches', names: ['Calf stretch', 'Hip flexor stretch', 'Hamstring stretch', 'Figure-4 stretch', 'Doorway chest stretch'] },
    { title: 'Run drills', names: ['High knees', 'Carioca', 'Leg swings', 'A-skips', 'Walking lunges'] }
  ];
  const poseFor = (name) => { const k = POSE_BY_NAME[name]; return k ? POSES[k] || null : null; };

  function distSeg(px, py, sg) {
    const dx = sg[2] - sg[0], dy = sg[3] - sg[1], LL = dx * dx + dy * dy;
    let t = LL ? ((px - sg[0]) * dx + (py - sg[1]) * dy) / LL : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (sg[0] + dx * t), py - (sg[1] + dy * t));
  }
  function prints(p, gx, gy) {
    for (const c of p.circs) if (Math.hypot(gx - c[0], gy - c[1]) <= c[2]) return true;
    for (const sg of p.segs) if (distSeg(gx, gy, sg) <= sg[4]) return true;
    return false;
  }

  /* draw(): the SAME 31×31 grid on every canvas; a pose only decides which dots print.
     `grid` (optional colour) also prints the unlit dots, for showing the grid itself. */
  function draw(canvas, name, d, ink, grid) {
    const fn = poseFor(name);
    if (!fn) return false;
    const r0 = canvas.getBoundingClientRect();
    const w = r0.width || canvas.clientWidth, h = r0.height || canvas.clientHeight;
    if (!w) return false;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const p = fn(d);
    const span = WORLD.y1 - WORLD.y0;
    const s = Math.min(w, h) * 0.92 / span;
    const cx = w / 2, gy = h / 2 + (span / 2) * s;
    const r = Math.max(1, 0.34 * GRID_STEP * s);
    for (let i = 0; i < GRID_N; i++) {
      const gx = (i - (GRID_N - 1) / 2) * GRID_STEP;
      for (let j = 0; j < GRID_N; j++) {
        const gyy = 0.021 + j * GRID_STEP;
        const on = prints(p, gx, gyy);
        if (!on && !grid) continue;
        ctx.fillStyle = on ? (ink || '#1A1915') : grid;
        ctx.beginPath(); ctx.arc(cx + gx * s, gy - gyy * s, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    return true;
  }

  /* one rep: six stamped frames at 260ms, then rest on frame 0 */
  function playRep(canvas, name) {
    const start = performance.now();
    let last = -1;
    const tick = (now) => {
      const t = now - start, total = FRAME_MS * SEQ.length;
      const idx = t < total ? Math.floor(t / FRAME_MS) : 0;
      if (idx !== last) { last = idx; draw(canvas, name, SEQ[idx]); }
      if (t < total) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  window.LedgerGlyphs = { SEQ, FRAME_MS, GRID_STEP, GRID_N, WORLD, POSES, POSE_BY_NAME, GROUPS, poseFor, prints, draw, playRep, person };
})();
