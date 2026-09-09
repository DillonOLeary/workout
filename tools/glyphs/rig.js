/* Figure rig: one parametric skeleton on the fixed 31×31 grid. Poses are joint ANGLES; forward kinematics builds the dots.
   Every exercise glyph = rig + a motion primitive (+ a 1-dot world line). */
(function () {
  const G = window.LedgerGlyphs, U = G.GRID_STEP; // 1 dot
  const rad = (a) => (a * Math.PI) / 180;
  const lerp = (a, b, d) => a + (b - a) * d;

  const STROKE = { thin: { torso: 0.045, limb: 0.03, foot: 0.024 }, regular: { torso: 0.062, limb: 0.045, foot: 0.03 }, heavy: { torso: 0.08, limb: 0.06, foot: 0.036 } };
  const SNAP = { free: 0, '22.5': 22.5, '45': 45 };

  /* proportions in dots */
  const DIM = { torso: 8, thigh: 6, shin: 6, foot: 3, uarm: 5, farm: 4.5, gap: 1.5 };
  /* five rig constructions. dims in dots; widths are world radii (0.021 ≈ a 1-dot line, 0.045 ≈ 2 dots, 0.062 ≈ 3). */
  const RIGS = {
    pictogram:  { label: 'Pictogram',  dims: { torso: 8, thigh: 6, shin: 6, foot: 3, uarm: 5, farm: 4.5, gap: 1.5 }, headDots: 5,   w: { torso: 0.062, limb: 0.045, foot: 0.03 } },
    anatomical: { label: 'Anatomical', dims: { torso: 8, thigh: 7.5, shin: 7, foot: 3, uarm: 5.5, farm: 5, gap: 0.6 }, headDots: 3.6, w: { torso: 0.05, limb: 0.03, foot: 0.024 } },
    mannequin:  { label: 'Mannequin',  dims: { torso: 8, thigh: 7, shin: 6.5, foot: 3, uarm: 5.5, farm: 5, gap: 1 },   headDots: 4,   w: { torso: 0.03, limb: 0.02, foot: 0.022 }, joints: 0.05, pelvis: 0.078, chest: 0.088 },
    silhouette: { label: 'Silhouette', dims: { torso: 8, thigh: 7, shin: 7, foot: 3.5, uarm: 5.5, farm: 5, gap: 0 },  headDots: 4,   w: { torso: 0.09, limb: 0.052, foot: 0.036 }, pelvis: 0.085 },
    wire:       { label: 'Wire',       dims: { torso: 9, thigh: 8, shin: 7.5, foot: 3, uarm: 6, farm: 5.5, gap: 1 },   headDots: 3,   w: { torso: 0.022, limb: 0.02, foot: 0.02 } }
  };

  function build(opts) {
    const cfg = RIGS[opts.rig] || null;
    const DIM = cfg ? cfg.dims : { torso: 8, thigh: 6, shin: 6, foot: 3, uarm: 5, farm: 4.5, gap: 1.5 };
    const headR = ((cfg ? cfg.headDots : (opts.headDots || 5)) / 2) * U, W = cfg ? cfg.w : STROKE[opts.stroke || 'regular'], snapStep = SNAP[opts.snap || 'free'] || 0;
    const J = cfg && cfg.joints || 0, PEL = cfg && cfg.pelvis || 0, CH = cfg && cfg.chest || 0;
    const sn = (a) => (snapStep ? Math.round(a / snapStep) * snapStep : a);
    // pose: { view:'side'|'front', torso, legs:[{thigh,shin}], arms:[{upper,fore}], lift? }  — angles in degrees; 0 = vertical, + = forward (side) / outward (front)
    return function figure(pose) {
      const front = pose.view === 'front', parts = [];
      const T = DIM.torso * U, hipHalf = front ? 1.2 * U : 0.35 * U, shHalf = front ? 2.4 * U : 0;
      const hip = [0, 0], t = rad(sn(pose.torso || 0));
      const top = [hip[0] + T * Math.sin(t), hip[1] + T * Math.cos(t)];
      const dir = [Math.sin(t), Math.cos(t)];
      const head = [top[0] + (DIM.gap * U + headR) * dir[0], top[1] + (DIM.gap * U + headR) * dir[1]];
      const tc = []; if (PEL) tc.push([hip[0], hip[1], PEL]); if (CH) tc.push([top[0] - 1.6 * U * dir[0], top[1] - 1.6 * U * dir[1], CH]);
      parts.push({ name: 'torso', segs: [[hip[0], hip[1], top[0], top[1], W.torso]], circs: tc });
      if (front) parts.push({ name: 'shoulders', segs: [[top[0] - shHalf, top[1] - 0.5 * U, top[0] + shHalf, top[1] - 0.5 * U, W.limb]], circs: [] });
      parts.push({ name: 'head', segs: [], circs: [[head[0], head[1], headR]] });
      (pose.legs || []).forEach((l, i) => {
        const side = i === 0 ? -1 : 1, o = [hip[0] + side * hipHalf, hip[1]];
        const a = rad(sn(l.thigh || 0) * (front ? side : 1)), b = rad(sn(l.shin || 0) * (front ? side : 1));
        const knee = [o[0] + DIM.thigh * U * Math.sin(a), o[1] - DIM.thigh * U * Math.cos(a)];
        const ank = [knee[0] + DIM.shin * U * Math.sin(b), knee[1] - DIM.shin * U * Math.cos(b)];
        const f = DIM.foot * U, heel = front ? [ank[0] - f / 2, ank[1] - 0.6 * U] : [ank[0] - f * 0.3, ank[1] - 0.6 * U], toe = front ? [ank[0] + f / 2, ank[1] - 0.6 * U] : [ank[0] + f * 0.7, ank[1] - 0.6 * U];
        const L = i === 0 ? 'L' : 'R';
        parts.push({ name: 'thigh' + L, segs: [[o[0], o[1], knee[0], knee[1], W.limb]], circs: J ? [[knee[0], knee[1], J]] : [] }, { name: 'shin' + L, segs: [[knee[0], knee[1], ank[0], ank[1], W.limb]], circs: J ? [[ank[0], ank[1], J * 0.8]] : [] }, { name: 'foot' + L, segs: [[heel[0], heel[1], toe[0], toe[1], W.foot]], circs: [] });
      });
      (pose.arms || []).forEach((ar, i) => {
        const side = i === 0 ? -1 : 1, o = [top[0] + side * shHalf - 0.3 * U * dir[0], top[1] - 0.6 * U];
        const p = rad(sn(ar.upper || 0) * (front ? side : 1)), q = rad(sn(ar.fore || 0) * (front ? side : 1));
        const el = [o[0] + DIM.uarm * U * Math.sin(p), o[1] - DIM.uarm * U * Math.cos(p)];
        const hd = [el[0] + DIM.farm * U * Math.sin(q), el[1] - DIM.farm * U * Math.cos(q)];
        const L = i === 0 ? 'L' : 'R';
        parts.push({ name: 'uarm' + L, segs: [[o[0], o[1], el[0], el[1], W.limb]], circs: J ? [[o[0], o[1], J], [el[0], el[1], J]] : [] }, { name: 'farm' + L, segs: [[el[0], el[1], hd[0], hd[1], W.limb]], circs: [] });
      });
      // floor: lowest point sits on dot row 0
      let minY = Infinity;
      for (const p of parts) { for (const s of p.segs) minY = Math.min(minY, s[1] - s[4], s[3] - s[4]); for (const c of p.circs) minY = Math.min(minY, c[1] - c[2]); }
      const dy = 0.021 - minY - (pose.lift || 0);
      for (const p of parts) { p.segs = p.segs.map((s) => [s[0], s[1] + dy, s[2], s[3] + dy, s[4]]); p.circs = p.circs.map((c) => [c[0], c[1] + dy, c[2]]); }
      return parts;
    };
  }

  /* motion primitives: A (d=0) → B (d=1). actor = the parts that print solid; everything else prints checker. anchor = what must not move. */
  const side = (torso, legs, arms) => ({ view: 'side', torso, legs: legs.length === 1 ? [legs[0], { thigh: legs[0].thigh - 6, shin: legs[0].shin + 6 }] : legs, arms });
  const mix = (A, B, d) => ({ view: A.view, torso: lerp(A.torso, B.torso, d),
    legs: A.legs.map((l, i) => ({ thigh: lerp(l.thigh, B.legs[i].thigh, d), shin: lerp(l.shin, B.legs[i].shin, d) })),
    arms: A.arms.map((a, i) => ({ upper: lerp(a.upper, B.arms[i].upper, d), fore: lerp(a.fore, B.arms[i].fore, d) })) });
  const PRIMS = [
    { id: 'rest', label: 'Rest', actor: [], anchor: '—', note: 'the rig at rest, side and front. Everything else is a deformation of this',
      A: side(0, [{ thigh: 0, shin: 0 }], [{ upper: 8, fore: 8 }]), B: side(0, [{ thigh: 0, shin: 0 }], [{ upper: 8, fore: 8 }]) },
    { id: 'hinge', label: 'Hinge', actor: ['torso', 'head'], anchor: 'feet', note: 'torso rotates about the hip; hips drift back so the mass stays over the feet. RDL, KB deadlift, good morning',
      A: side(0, [{ thigh: 0, shin: 0 }], [{ upper: 5, fore: 5 }]), B: side(80, [{ thigh: -14, shin: 8 }], [{ upper: 8, fore: 8 }]) },
    { id: 'squat', label: 'Squat', actor: ['thighL', 'shinL'], anchor: 'feet', note: 'knees forward, hips down, torso tips just enough. Goblet, leg press, lunge (one leg)',
      A: side(0, [{ thigh: 0, shin: 0 }], [{ upper: 90, fore: 90 }]), B: side(28, [{ thigh: 72, shin: -22 }], [{ upper: 90, fore: 90 }]) },
    { id: 'push', label: 'Push', actor: ['uarmL', 'farmL'], anchor: 'torso', note: 'elbow bent → arm straight, away from the body. Chest press, shoulder press, push-up',
      A: side(0, [{ thigh: 0, shin: 0 }], [{ upper: 40, fore: 120 }]), B: side(0, [{ thigh: 0, shin: 0 }], [{ upper: 90, fore: 90 }]) },
    { id: 'pull', label: 'Pull', actor: ['uarmL', 'farmL'], anchor: 'torso', note: 'arm straight → hand to the ribs, elbow travelling behind. Row, pulldown, face pull',
      A: side(4, [{ thigh: 0, shin: 0 }], [{ upper: 90, fore: 90 }]), B: side(-4, [{ thigh: 0, shin: 0 }], [{ upper: -30, fore: 80 }]) },
    { id: 'bend', label: 'Side-bend', actor: ['torso', 'head', 'uarmR', 'farmR'], anchor: 'feet', note: 'front view: the torso tilts and the far arm sweeps up and over. Lateral work, obliques, some stretches',
      A: { view: 'front', torso: 0, legs: [{ thigh: 8, shin: 0 }, { thigh: 8, shin: 0 }], arms: [{ upper: 12, fore: 12 }, { upper: 20, fore: 20 }] },
      B: { view: 'front', torso: -28, legs: [{ thigh: 8, shin: 0 }, { thigh: 8, shin: 0 }], arms: [{ upper: 12, fore: 12 }, { upper: -150, fore: -150 }] } },
    { id: 'hold', label: 'Hold', actor: ['torso'], anchor: 'everything', note: 'no limb moves. The working part prints solid and a ring pulses out of it once per cycle. Planks, stretches, carries',
      A: side(0, [{ thigh: 0, shin: 0 }], [{ upper: 8, fore: 8 }]), B: side(0, [{ thigh: 0, shin: 0 }], [{ upper: 8, fore: 8 }]), pulse: true }
  ];

  function partsFor(prim, fig, d, k) {
    const parts = fig(mix(prim.A, prim.B, d));
    for (const p of parts) p.actor = prim.actor.includes(p.name);
    if (prim.pulse && k > 0) { const t = parts.find((p) => p.name === 'torso').segs[0]; parts.push({ name: 'ring', ring: [(t[0] + t[2]) / 2, (t[1] + t[3]) / 2, 0.14 + k * 0.07, 0.022], actor: true, segs: [], circs: [] }); }
    return parts;
  }
  function lit(parts, x, y, i, j, halftone) {
    let chk = false;
    for (const p of parts) {
      if (p.ring) { if (Math.abs(Math.hypot(x - p.ring[0], y - p.ring[1]) - p.ring[2]) < p.ring[3]) return true; continue; }
      if (G.prints(p, x, y)) { if (p.actor || !halftone) return true; chk = true; }
    }
    return chk && (i + j) % 2 === 0;
  }
  function draw(canvas, parts, opts) {
    const r0 = canvas.getBoundingClientRect(), w = r0.width || canvas.clientWidth, h = r0.height || canvas.clientHeight;
    if (!w) return;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const s = Math.min(w, h) * 0.92 / 1.3, cx = w / 2, cy = h / 2, r = Math.max(0.8, 0.34 * U * s);
    for (let i = 0; i < 31; i++) for (let j = 0; j < 31; j++) {
      const on = lit(parts, (i - 15) * U, 0.65 + (j - 15) * U, i, j, opts.halftone); if (!on && !opts.grid) continue;
      ctx.fillStyle = on ? (opts.ink || '#1A1915') : opts.grid; ctx.beginPath(); ctx.arc(cx + (i - 15) * U * s, cy - (j - 15) * U * s, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  window.FigureRig = { build, PRIMS, RIGS, partsFor, draw, DIM, STROKE };
})();
