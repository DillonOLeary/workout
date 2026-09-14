/* The dot athlete: one body of tapered masses (deltoid, chest, glute, quad, calf; curved spine; wedge feet), posed by
   ABSOLUTE joints — hip position + ankles ON THE FLOOR, knees solved by IK, so feet never slide or float — and shaded as
   lit mass on a 31×31 grid. Every pose names its MOTION: a rep (12 stamps out and back along d), a breath (four stamps,
   the hold rising and falling) or a still (one stamp at d = 1).

   Seeded from two Claude Design projects — "Workout app design review" (the rig, the shader and the 27 lifting, stretch
   and drill figures, 2026-09-08) and "Yoga and Bodyweight Workouts" (the 15 yoga poses, 2026-09-14) — and the repo's own
   since: the bodyweight figures were authored here, and the angle-based rig, the alternative builds and the shaders the
   bake never used are gone. bake.mjs is the only consumer; it attaches to `window` because the design's files did. */
(function () {
  /* the grid: 31 dots a side, one dot = GRID_STEP in body units. A rep stamps SEQ at FRAME_MS — both go into the JSON verbatim */
  const GRID_STEP = 0.042;
  const SEQ = [0, 0.16, 0.34, 0.55, 0.76, 0.92, 1, 0.9, 0.72, 0.5, 0.28, 0.1]; // 12 stamps: out over 7, back over 5
  const FRAME_MS = 130;
  const U = GRID_STEP, FLOOR = 0.021;
  const rad = (a) => (a * Math.PI) / 180;
  const cap = (a, b, r0, r1, part, group) => ({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], r0, r1: r1 == null ? r0 : r1, part, group: group || part });
  const dot = (o, dir, len) => [o[0] + dir[0] * len, o[1] + dir[1] * len];
  const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
  const THIGH = 7 * U, SHIN = 6.5 * U, UARM = 5.5 * U, FARM = 5 * U;
  const ANK = FLOOR + 0.9 * U; // ankle height when the foot is flat on the floor

  function ik(a, b, l1, l2, side) { // joint between a and b; side +1 bends toward +x, −1 toward −x, 0 straight
    let dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1e-6;
    const dmax = l1 + l2 - 1e-4; if (d > dmax) { dx *= dmax / d; dy *= dmax / d; d = dmax; }
    const x = (d * d + l1 * l1 - l2 * l2) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    const ux = dx / d, uy = dy / d, px = uy, py = -ux;
    if (!side) return [a[0] + ux * x, a[1] + uy * x];
    const k1 = [a[0] + ux * x + px * h, a[1] + uy * x + py * h], k2 = [a[0] + ux * x - px * h, a[1] + uy * x - py * h];
    return (side > 0 ? (k1[0] >= k2[0] ? k1 : k2) : (k1[0] < k2[0] ? k1 : k2));
  }

  /* the build: tapered muscle masses, chest up, ~1.3× real mass so the grid has something to shade */
  const K = { chest: 0.88, pelvis: 0.88, glute: 0.88, quad: 0.86, shin: 0.88, calf: 0.88, delt: 0.88, uarm: 0.86, farm: 0.86, neck: 0.9 };
  const SPINE = { lumbar: -6, thoracic: 5 };
  const kk = (n) => K[n] || 1;

  /* J = { view, hip:[x,y], t: torso angle (deg, + = lean forward/+x), legs:[{knee, ank, foot?: deg heel-up}], arms:[{hand:[x,y], bend:±1} | {el,hd}], world:[[x1,y1,x2,y2,r]] } */
  function buildMasses(J) {
    const _cap = (a, b, r0, r1, part, group) => cap(a, b, r0 * kk(group), r1 == null ? r0 * kk(group) : r1 * kk(group), part, group);
    const front = J.view === 'front', M = [], t = J.t || 0, hip = J.hip;
    const lum = [Math.sin(rad(t + SPINE.lumbar)), Math.cos(rad(t + SPINE.lumbar))], tho = [Math.sin(rad(t + SPINE.thoracic)), Math.cos(rad(t + SPINE.thoracic))];
    const mid = dot(hip, lum, 3.6 * U), top = dot(mid, tho, 4.6 * U), neck = dot(top, tho, 1.2 * U), headC = dot(dot(neck, tho, 2.3 * U), [tho[1], -tho[0]], (J.headFwd || 0) * U);
    const fwd = [Math.cos(rad(t)), -Math.sin(rad(t))];
    const hipHalf = front ? 1.5 * U : 0.4 * U, shHalf = front ? 3 * U : 0;
    if (front) {
      M.push(_cap([top[0] - shHalf, top[1]], [top[0] + shHalf, top[1]], 0.085, 0.085, 'torso', 'chest'));
      M.push(_cap(top, mid, 0.12, 0.085, 'torso', 'chest'), _cap(mid, hip, 0.085, 0.1, 'torso', 'pelvis'));
      M.push(_cap([hip[0] - 1.6 * U, hip[1]], [hip[0] + 1.6 * U, hip[1]], 0.085, 0.085, 'torso', 'pelvis'));
    } else {
      M.push(_cap(top, mid, 0.115, 0.08, 'torso', 'chest'));
      M.push(_cap(dot(top, fwd, 0.06), dot(mid, fwd, 0.03), 0.065, 0.04, 'torso', 'chest'));
      M.push(_cap(mid, hip, 0.075, 0.095, 'torso', 'pelvis'));
      M.push(_cap(dot(hip, fwd, -0.075), dot(hip, fwd, -0.05), 0.09, 0.08, 'torso', 'glute'));
    }
    M.push(_cap(top, neck, 0.042, 0.038, 'head', 'neck'));
    M.push(_cap(dot(headC, tho, -0.03), dot(headC, tho, 0.035), 0.078, 0.072, 'head', 'head'));
    (J.legs || []).forEach((l, i) => {
      const L = i === 0 ? 'L' : 'R', knee = l.knee, ank = l.ank;
      M.push(_cap([hip[0] + (i === 0 ? -1 : 1) * hipHalf, hip[1]], knee, 0.105, 0.068, 'thigh' + L, 'quad'));
      M.push(_cap(knee, ank, 0.06, 0.038, 'shin' + L, 'shin'));
      const sd = [ank[0] - knee[0], ank[1] - knee[1]], sl = Math.hypot(sd[0], sd[1]) || 1, su = [sd[0] / sl, sd[1] / sl], back = front ? [0, 0] : [-su[1], su[0]];
      const bk = back[0] > 0 ? [-back[0], -back[1]] : back; // calf bulges away from +x (the facing direction)
      M.push(_cap(dot(dot(knee, su, 1.4 * U), bk, 0.012), dot(dot(knee, su, 3.6 * U), bk, 0.014), 0.068, 0.045, 'shin' + L, 'calf'));
      const fa = -rad(l.foot || 0);
      const heel = front ? [ank[0] - 1.2 * U, ank[1] - 0.9 * U] : dot(ank, rot([-1.1 * U, -0.9 * U], fa), 1), toe = front ? [ank[0] + 1.2 * U, ank[1] - 0.9 * U] : dot(ank, rot([3.4 * U, -1.05 * U], fa), 1);
      M.push(_cap(heel, toe, 0.045, 0.024, 'foot' + L, 'foot'));
    });
    (J.arms || []).forEach((ar, i) => {
      const s = i === 0 ? -1 : 1, L = i === 0 ? 'L' : 'R', o = [top[0] + s * shHalf, top[1] - 0.4 * U];
      let el, hd;
      if (ar.el) { el = ar.el; hd = ar.hd; }
      else { el = ik(o, ar.hand, UARM, FARM, ar.bend || -1); hd = ar.hand; }
      const ud = [el[0] - o[0], el[1] - o[1]], ul = Math.hypot(ud[0], ud[1]) || 1, uu = [ud[0] / ul, ud[1] / ul];
      const fd = [hd[0] - el[0], hd[1] - el[1]], fl = Math.hypot(fd[0], fd[1]) || 1, fu = [fd[0] / fl, fd[1] / fl];
      M.push(_cap(o, dot(o, uu, 1.5 * U), 0.075, 0.062, 'uarm' + L, 'delt'));
      M.push(_cap(dot(o, uu, 1.2 * U), el, 0.06, 0.045, 'uarm' + L, 'uarm'));
      M.push(_cap(el, hd, 0.048, 0.03, 'farm' + L, 'farm'));
      M.push(_cap(hd, dot(hd, fu, 1.4 * U), 0.03, 0.02, 'farm' + L, 'hand'));
    });
    for (const w of J.world || []) { const m = cap([w[0], w[1]], [w[2], w[3]], w[4] || 0.013, w[4] || 0.013, 'world', 'world'); m.world = true; M.push(m); }
    return M;
  }

  /* a pose: { view, hip, t, legs:[{ank:[x,y], bend:±1|0, foot?} | {knee, ank, foot?}], arms, world, headFwd } — knees by IK unless given, ankles exactly where you put them */
  function figureAbs(P) {
    const front = P.view === 'front', hipHalf = front ? 1.5 * U : 0.4 * U;
    const legs = (P.legs || []).map((l, i) => { const o = [P.hip[0] + (i === 0 ? -1 : 1) * hipHalf, P.hip[1]]; return { knee: l.knee || ik(o, l.ank, THIGH, SHIN, l.bend == null ? 1 : l.bend), ank: l.ank, foot: l.foot }; });
    return buildMasses({ view: P.view, hip: P.hip, t: P.t || 0, legs, arms: P.arms || [], world: P.world || [], headFwd: P.headFwd || 0 });
  }

  /* ---- the ten exercises. d = drive 0→1. Feet are given as ankle positions on the floor and never move unless the exercise moves them. ---- */
  const L = (d) => (a, b) => a + (b - a) * d;
  const EXERCISES = [
    { id: 'goblet', name: 'Goblet Squat', aliases: ['Bodyweight Squat'], cue: 'hips drop between the heels, knees forward, torso tips just enough to keep the bell over mid-foot', actor: ['thighL', 'thighR'],
      pose: (d) => { const l = L(d); return { hip: [l(0, -0.07), l(0.6, 0.34)], t: l(2, 28), legs: [{ ank: [0.0, ANK] }, { ank: [0.06, ANK] }], arms: [{ hand: [l(0.1, 0.02), l(0.82, 0.62)], bend: -1 }], world: [[l(0.1, 0.02), l(0.82, 0.62), l(0.1, 0.02), l(0.86, 0.66), 0.03]] }; } },
    { id: 'rdl', name: 'Romanian Deadlift', cue: 'hips travel back, knees stay soft, back flat; the bar slides down the thighs', actor: ['torso', 'head'],
      pose: (d) => { const l = L(d), hip = [l(0, -0.11), l(0.6, 0.55)]; const hand = [l(0.05, 0.1), l(0.5, 0.26)]; return { hip, t: l(2, 82), legs: [{ ank: [0.0, ANK] }, { ank: [0.05, ANK] }], arms: [{ hand, bend: 1 }], world: [[hand[0] - 0.05, hand[1] - 0.02, hand[0] + 0.05, hand[1] - 0.02, 0.03]] }; } },
    { id: 'kbdl', name: 'KB Deadlift', cue: 'standing tall with the bell hanging; knees and hips bend together and the bell goes to the floor between the feet', actor: ['torso', 'thighL'],
      pose: (d) => { const l = L(d), hip = [l(0, -0.1), l(0.6, 0.38)]; const hand = [l(0.04, 0.06), l(0.42, 0.12)]; return { hip, t: l(2, 60), legs: [{ ank: [0.0, ANK], bend: 1 }, { ank: [0.06, ANK], bend: 1 }], arms: [{ hand, bend: 1 }], world: [[hand[0], hand[1] - 0.02, hand[0], hand[1] - 0.07, 0.03]] }; } },
    { id: 'ohp', name: 'Shoulder Press', cue: 'seated, front view: bar from the collarbones to lockout overhead, elbows travel under the bar', actor: ['uarmL', 'uarmR', 'farmL', 'farmR'],
      pose: (d) => { const l = L(d), y = l(0.78, 1.04), x = l(0.16, 0.1); return { view: 'front', hip: [0, 0.4], t: 0, legs: [{ ank: [-0.1, ANK], bend: 0 }, { ank: [0.1, ANK], bend: 0 }], arms: [{ hand: [-x, y], bend: -1 }, { hand: [x, y], bend: 1 }], world: [[-0.34, y, 0.34, y, 0.014], [-0.16, 0.37, 0.16, 0.37, 0.013], [-0.12, FLOOR, -0.12, 0.36, 0.013], [0.12, FLOOR, 0.12, 0.36, 0.013]] }; } },
    { id: 'row', name: 'Seated Row', cue: 'seated, feet braced, torso still; the handle comes to the ribs and the elbow passes behind', actor: ['uarmL', 'farmL'],
      pose: (d) => { const l = L(d), hand = [l(0.3, -0.02), l(0.5, 0.44)]; return { hip: [-0.12, 0.3], t: l(10, -6), legs: [{ ank: [0.3, ANK], bend: 1 }], arms: [{ hand, bend: -1 }], world: [[-0.34, 0.27, 0.02, 0.27, 0.013], [-0.28, FLOOR, -0.28, 0.26, 0.013], [hand[0] + 0.02, hand[1], 0.6, 0.5, 0.008], [0.6, FLOOR, 0.6, 0.9, 0.013]] }; } },
    { id: 'plank', name: 'Long-Lever Plank', aliases: ['Plank', 'Forearm Plank'], motion: 'breath', cue: 'a hold: elbows well ahead of the shoulders, one straight line from ear to heel. No pulse — just a breath: the hips settle a dot and come back', actor: ['torso'],
      pose: (d) => { const l = L(d); return { hip: [0.08, l(0.3, 0.28)], t: l(-100, -98), legs: [{ ank: [0.52, 0.09], bend: 0, foot: 70 }], arms: [{ el: [-0.5, 0.055], hd: [-0.36, 0.055] }] }; } },
    { id: 'lunge', name: 'DB Reverse Lunge', aliases: ['Reverse Lunge'], cue: 'front foot planted, shin vertical; the rear foot steps back onto its toes and the rear knee drops under the hip', actor: ['thighR', 'shinR'],
      pose: (d) => { const l = L(d), hip = [l(0.0, -0.02), l(0.6, 0.36)]; return { hip, t: l(2, 6), legs: [{ ank: [0.06, ANK], bend: 1 }, { knee: [l(0.01, -0.1), l(0.32, 0.09)], ank: [l(0.01, -0.37), l(ANK, 0.11)], foot: l(0, 80) }], arms: [{ hand: [hip[0] + 0.05, hip[1] + 0.02], bend: -1 }], world: [[hip[0] + 0.01, hip[1], hip[0] + 0.09, hip[1], 0.026]] }; } },
    { id: 'chest', name: 'Chest Press', cue: 'lying on the bench, feet flat; the bar presses from the chest to a straight arm', actor: ['uarmL', 'farmL'],
      pose: (d) => { const l = L(d), hand = [-0.28, l(0.5, 0.76)]; return { hip: [0.06, 0.37], t: -92, legs: [{ ank: [0.36, ANK], bend: 1 }, { ank: [0.42, ANK], bend: 1 }], arms: [{ hand, bend: 1 }], world: [[-0.5, 0.29, 0.26, 0.29, 0.013], [-0.42, FLOOR, -0.42, 0.28, 0.013], [0.2, FLOOR, 0.2, 0.28, 0.013], [hand[0], hand[1] - 0.05, hand[0], hand[1] + 0.05, 0.018]] }; } },
    { id: 'pulldown', name: 'Lat Pulldown', cue: 'seated under the cable; the bar is pulled from full stretch to the collarbones, chest up', actor: ['uarmL', 'farmL'],
      pose: (d) => { const l = L(d), hand = [l(0.16, 0.12), l(1.08, 0.78)]; return { hip: [-0.06, 0.3], t: l(-4, -12), legs: [{ ank: [0.24, ANK], bend: 1 }], arms: [{ hand, bend: 1 }], world: [[-0.28, 0.27, 0.08, 0.27, 0.013], [-0.22, FLOOR, -0.22, 0.26, 0.013], [hand[0] - 0.14, hand[1], hand[0] + 0.14, hand[1], 0.013], [hand[0], hand[1], hand[0] + 0.02, 1.29, 0.008]] }; } },
    { id: 'bridge', name: 'DB Glute Bridge', cue: 'shoulders on the floor, feet flat and close; the hips drive up until hip and knee are in line', actor: ['torso'],
      pose: (d) => { const l = L(d), hip = [0.02, l(0.17, 0.36)], sh = [-0.3, 0.13]; const t = Math.atan2(sh[0] - hip[0], sh[1] - hip[1]) * 180 / Math.PI; return { hip, t, legs: [{ ank: [0.26, ANK], bend: 1 }, { ank: [0.32, ANK], bend: 1 }], arms: [{ el: [-0.16, 0.06], hd: [0.02, 0.06] }] }; } },
    { id: 'calf', name: 'Standing Calf Raise', aliases: ['Single-leg Calf Raise'], cue: 'hand on the wall; the whole body rises on the toes — the heel lifts, the toe never does', actor: ['shinL', 'shinR'],
      pose: (d) => { const l = L(d), rise = l(0, 0.06); return { hip: [0, 0.6 + rise], t: 1, legs: [{ ank: [0.0, ANK + rise], foot: l(0, 25) }, { ank: [0.04, ANK + rise], foot: l(0, 25) }], arms: [{ hand: [0.4, 0.86 + rise], bend: -1 }], world: [[0.42, FLOOR, 0.42, 1.24, 0.013]] }; } }
  ];
  /* ---- the rest of the lifts ---- */
  EXERCISES.push(
    { id: 'gobletdeep', name: 'Deep Goblet Squat', cue: 'same squat, hips all the way down to the calves, torso tips a little more', actor: ['thighL', 'thighR'],
      pose: (d) => { const l = L(d); return { hip: [l(0, -0.09), l(0.6, 0.26)], t: l(2, 34), legs: [{ ank: [0.0, ANK] }, { ank: [0.07, ANK] }], arms: [{ hand: [l(0.1, 0.0), l(0.82, 0.56)], bend: -1 }], world: [[l(0.1, 0.0), l(0.82, 0.56), l(0.1, 0.0), l(0.86, 0.6), 0.03]] }; } },
    { id: 'facepull', name: 'Face Pull', aliases: ['Band Face Pull'], cue: 'split stance, cable at face height; the rope comes to the eyes with the elbow high and travelling behind', actor: ['uarmL', 'farmL'],
      pose: (d) => { const l = L(d), hand = [l(0.3, 0.04), l(0.9, 0.93)]; return { hip: [-0.06, 0.6], t: 4, legs: [{ ank: [0.08, ANK], bend: 1 }, { ank: [-0.18, ANK], bend: 0 }], arms: [{ hand, bend: -1 }], world: [[hand[0] + 0.02, hand[1], 0.6, 0.95, 0.008], [0.6, FLOOR, 0.6, 1.24, 0.013]] }; } },
    { id: 'legcurl', name: 'Leg Curl', cue: 'prone on the bench; the shin swings from flat to past vertical while the hips stay down', actor: ['shinL', 'shinR'],
      pose: (d) => { const l = L(d), a = rad(l(0, 100)), knee = [0.34, 0.33]; const ank = [knee[0] + 0.27 * Math.cos(a), knee[1] + 0.27 * Math.sin(a)]; return { hip: [0.1, 0.37], t: -92, legs: [{ knee, ank, foot: l(0, -100) }], arms: [{ el: [-0.42, 0.24], hd: [-0.46, 0.1] }], world: [[-0.5, 0.29, 0.4, 0.29, 0.013], [-0.42, FLOOR, -0.42, 0.28, 0.013], [0.3, FLOOR, 0.3, 0.28, 0.013]] }; } },
    { id: 'cph', name: 'Copenhagen Plank', motion: 'breath', cue: 'side plank with the top leg on a bench and the bottom leg held up to meet it. A breath: the hips dip a dot and come back', actor: ['thighL', 'shinL'],
      pose: (d) => { const l = L(d); return { hip: [0.05, l(0.34, 0.32)], t: -100, legs: [{ ank: [0.46, 0.27], bend: 0, foot: 60 }, { ank: [0.5, 0.31], bend: 0, foot: 60 }], arms: [{ el: [-0.46, 0.055], hd: [-0.3, 0.055] }], world: [[0.3, 0.27, 0.62, 0.27, 0.013], [0.34, FLOOR, 0.34, 0.26, 0.013], [0.58, FLOOR, 0.58, 0.26, 0.013]] }; } },
    { id: 'deadbug', name: 'Dead Bug', cue: 'on the back, arms up, knees at 90°; one arm reaches overhead as the opposite leg extends, low back stays down', actor: ['thighR', 'shinR', 'uarmR', 'farmR'],
      pose: (d) => { const l = L(d); return { hip: [0.05, 0.12], t: -90, legs: [{ knee: [0.1, 0.4], ank: [0.37, 0.4], foot: -90 }, { knee: [l(0.1, 0.32), l(0.4, 0.27)], ank: [l(0.37, 0.58), l(0.4, 0.14)], foot: l(-90, -20) }], arms: [{ el: [-0.28, 0.33], hd: [-0.28, 0.54] }, { el: [l(-0.28, -0.48), l(0.33, 0.22)], hd: [l(-0.28, -0.6), l(0.54, 0.08)] }] }; } },
    { id: 'sideplank', name: 'Side Plank', motion: 'breath', cue: 'a hold on the forearm, one straight line from shoulder to heel, top arm to the ceiling. A breath, no pulse', actor: ['torso'],
      pose: (d) => { const l = L(d); return { hip: [0.05, l(0.25, 0.23)], t: -100, legs: [{ ank: [0.5, 0.09], bend: 0, foot: 75 }], arms: [{ el: [-0.34, 0.055], hd: [-0.18, 0.055] }, { el: [-0.28, 0.5], hd: [-0.29, 0.7] }] }; } },
    /* ---- stretches: stills. d leans into the hold, and the bake takes d = 1 — the stretch, not the standing-up-straight it leans in from ---- */
    { id: 'calfstretch', name: 'Calf stretch', motion: 'still', cue: 'hands on the wall, rear leg straight with the heel down; the hips move toward the wall', actor: ['shinR'],
      pose: (d) => { const l = L(d); return { hip: [l(-0.08, 0.0), 0.58], t: l(8, 14), legs: [{ ank: [0.12, ANK], bend: 1 }, { ank: [-0.3, ANK], bend: 0 }], arms: [{ hand: [0.4, 0.86], bend: -1 }], world: [[0.42, FLOOR, 0.42, 1.24, 0.013]] }; } },
    { id: 'hipflexor', name: 'Hip flexor stretch', motion: 'still', cue: 'half-kneeling, hand on the front knee; the hips glide forward while the torso stays tall', actor: ['thighR'],
      pose: (d) => { const l = L(d); return { hip: [l(-0.1, -0.02), l(0.38, 0.36)], t: l(0, -4), legs: [{ ank: [0.2, ANK], bend: 1 }, { knee: [-0.16, 0.09], ank: [-0.43, 0.1], foot: 80 }], arms: [{ hand: [0.18, 0.34], bend: -1 }] }; } },
    { id: 'hamstring', name: 'Hamstring stretch', motion: 'still', cue: 'heel up on a box, toes up, leg straight; the hinge comes from the hips, back flat', actor: ['torso', 'head'],
      pose: (d) => { const l = L(d); return { hip: [-0.06, 0.6], t: l(10, 58), legs: [{ ank: [-0.06, ANK], bend: 0 }, { ank: [0.34, 0.24], bend: 0, foot: -20 }], arms: [{ hand: [l(0.06, 0.3), l(0.56, 0.4)], bend: 1 }], world: [[0.2, FLOOR, 0.2, 0.2, 0.013], [0.44, FLOOR, 0.44, 0.2, 0.013], [0.2, 0.2, 0.44, 0.2, 0.013]] }; } },
    { id: 'figure4', name: 'Figure-4 stretch', motion: 'still', cue: 'seated, ankle on the opposite knee; the torso folds forward over the shin', actor: ['torso', 'head'],
      pose: (d) => { const l = L(d); return { hip: [-0.08, 0.32], t: l(4, 30), legs: [{ ank: [0.2, ANK], bend: 1 }, { knee: [0.14, 0.42], ank: [0.24, 0.35], foot: 0 }], arms: [{ hand: [0.16, 0.42], bend: 1 }], world: [[-0.3, 0.29, 0.1, 0.29, 0.013], [-0.24, FLOOR, -0.24, 0.28, 0.013], [0.04, FLOOR, 0.04, 0.28, 0.013]] }; } },
    { id: 'doorway', name: 'Doorway chest stretch', motion: 'still', cue: 'forearm on the frame behind you; step through and let the chest lead', actor: ['torso'],
      pose: (d) => { const l = L(d); return { hip: [l(0, 0.05), 0.6], t: l(2, 10), legs: [{ ank: [0.2, ANK], bend: 1 }, { ank: [-0.16, ANK], bend: 0 }], arms: [{ el: [-0.14, 0.92], hd: [-0.17, 1.1] }], world: [[-0.19, FLOOR, -0.19, 1.24, 0.013], [-0.19, 1.24, 0.4, 1.24, 0.013]] }; } },
    /* ---- run drills: d is the drive ---- */
    { id: 'highknees', name: 'High knees', cue: 'on the toes; the knee drives to hip height while the arms run', actor: ['thighR', 'shinR'],
      pose: (d) => { const l = L(d); return { hip: [0, l(0.6, 0.63)], t: 6, legs: [{ ank: [0.0, l(ANK, ANK + 0.03)], bend: 1, foot: l(0, 25) }, { knee: [l(0.02, 0.26), l(0.31, 0.5)], ank: [l(0.03, 0.16), l(ANK, 0.25)], foot: l(0, 40) }], arms: [{ hand: [l(0.2, -0.12), l(0.7, 0.68)], bend: -1 }, { hand: [l(-0.12, 0.22), l(0.68, 0.76)], bend: 1 }] }; } },
    { id: 'carioca', name: 'Carioca', cue: 'front view, moving sideways; the trailing leg crosses in front, arms out for balance', actor: ['thighR', 'shinR'],
      pose: (d) => { const l = L(d); return { view: 'front', hip: [0, l(0.6, 0.58)], t: 0, legs: [{ knee: [l(-0.08, 0.16), l(0.31, 0.42)], ank: [l(-0.12, 0.26), l(ANK, 0.2)] }, { ank: [0.1, ANK], bend: 0 }], arms: [{ hand: [-0.36, 0.8], bend: -1 }, { hand: [0.36, 0.8], bend: 1 }] }; } },
    { id: 'legswing', name: 'Leg swings', cue: 'hand on the wall; the straight leg swings from behind to in front, torso quiet', actor: ['thighR', 'shinR'],
      pose: (d) => { const l = L(d), a = rad(l(-35, 60)), hip = [-0.06, 0.6]; return { hip, t: l(-2, -8), legs: [{ ank: [-0.08, ANK], bend: 0 }, { ank: [hip[0] + 0.55 * Math.sin(a), hip[1] - 0.55 * Math.cos(a)], bend: 0, foot: l(-30, 20) }], arms: [{ hand: [-0.48, 0.9], bend: 1 }], world: [[-0.5, FLOOR, -0.5, 1.24, 0.013]] }; } },
    { id: 'askip', name: 'A-skips', cue: 'a skip with a knee drive: the whole body hops off the toes as the knee comes up', actor: ['thighR', 'shinR'],
      pose: (d) => { const l = L(d), hop = l(0, 0.06); return { hip: [0, 0.6 + hop], t: 4, legs: [{ ank: [0.0, ANK + hop * 0.9], bend: 1, foot: l(0, 30) }, { knee: [l(0.02, 0.24), l(0.31, 0.5) + hop], ank: [l(0.03, 0.14), l(ANK, 0.26) + hop], foot: l(0, 30) }], arms: [{ hand: [l(0.18, -0.1), l(0.7, 0.68)], bend: -1 }, { hand: [l(-0.1, 0.2), l(0.68, 0.76)], bend: 1 }] }; } },
    { id: 'walklunge', name: 'Walking lunges', cue: 'a long stride; the rear knee drops toward the floor under the hip, front shin vertical', actor: ['thighR', 'shinR'],
      pose: (d) => { const l = L(d), hip = [l(0.0, 0.04), l(0.6, 0.37)]; return { hip, t: l(2, 5), legs: [{ ank: [0.22, ANK], bend: 1 }, { knee: [l(-0.02, -0.08), l(0.32, 0.1)], ank: [l(-0.02, -0.34), l(ANK, 0.12)], foot: l(0, 80) }], arms: [{ hand: [hip[0] + 0.05, hip[1] + 0.02], bend: -1 }], world: [[hip[0] + 0.01, hip[1], hip[0] + 0.09, hip[1], 0.026]] }; } }
  );

  /* ---- yoga: fifteen poses in the same vocabulary, from the design's yoga-poses.js. A still bakes one stamp at d = 1; a breath rises and falls along [0, .5, 1, .5] ---- */
  EXERCISES.push(
    { id: 'lowlunge', name: 'Low Lunge', motion: 'still', cue: 'back knee down, shin along the mat; front knee over the ankle; torso tall, hands on the front thigh', actor: ['thighR'],
      pose: () => ({ hip: [0, 0.33], t: 2, legs: [{ ank: [0.27, ANK], bend: 1 }, { knee: [-0.2, 0.09], ank: [-0.46, 0.1], foot: 170 }], arms: [{ hand: [0.2, 0.42], bend: -1 }] }) },
    { id: 'halfsplit', name: 'Half Splits', motion: 'still', cue: 'hips back over the rear knee, front leg straight with the toes up, hinge from the hip', actor: ['torso'],
      pose: () => ({ hip: [-0.14, 0.34], t: 52, legs: [{ ank: [0.36, ANK + 0.02], bend: 0, foot: -25 }, { knee: [-0.12, 0.09], ank: [-0.38, 0.1], foot: 170 }], arms: [{ hand: [0.2, 0.14], bend: 1 }] }) },
    { id: 'chair', name: 'Chair Pose', motion: 'breath', cue: 'a squat you hold: knees over the ankles, arms in line with the torso. Breath: the hips settle a dot', actor: ['thighL', 'thighR'],
      pose: (d) => { const l = L(d); return { hip: [-0.08, l(0.41, 0.395)], t: 32, legs: [{ ank: [0.04, ANK], bend: 1 }, { ank: [0.09, ANK], bend: 1 }], arms: [{ hand: [0.3, l(1.02, 1.005)], bend: -1 }] }; } },
    { id: 'warrior2', name: 'Warrior II', motion: 'breath', cue: 'front view: wide stance, one knee bent to 90, arms out in a T. Breath: the hips settle', actor: ['thighR'],
      pose: (d) => { const l = L(d), y = l(0.79, 0.78); return { view: 'front', hip: [0, l(0.44, 0.43)], t: 0, legs: [{ ank: [-0.3, ANK], bend: 0 }, { ank: [0.34, ANK], bend: 1 }], arms: [{ hand: [-0.52, y], bend: -1 }, { hand: [0.52, y], bend: 1 }] }; } },
    { id: 'pigeon', name: 'Pigeon', motion: 'still', cue: 'front shin folded across on the mat, back leg long behind, torso upright with a hand down', actor: ['thighL'],
      pose: () => ({ hip: [0, 0.17], t: 4, legs: [{ knee: [0.26, 0.12], ank: [0.05, 0.08], foot: 60 }, { knee: [-0.28, 0.1], ank: [-0.54, 0.09], foot: 170 }], arms: [{ hand: [0.18, 0.12], bend: 1 }] }) },
    { id: 'bridgepose', name: 'Bridge', motion: 'breath', cue: 'shoulders down, feet flat and close, hips up until hip and knee are in line, arms on the mat. Breath: the hips', actor: ['torso'],
      pose: (d) => { const l = L(d), hip = [0.02, l(0.33, 0.345)], sh = [-0.3, 0.13]; const t = Math.atan2(sh[0] - hip[0], sh[1] - hip[1]) * 180 / Math.PI; return { hip, t, legs: [{ ank: [0.26, ANK], bend: 1 }, { ank: [0.32, ANK], bend: 1 }], arms: [{ el: [-0.16, 0.06], hd: [0.02, 0.06] }] }; } },
    { id: 'seatedfold', name: 'Seated Forward Fold', motion: 'still', cue: 'legs long, toes up, hinge forward with the hands to the shins. Bend the knees if the back rounds', actor: ['torso'],
      pose: () => ({ hip: [-0.24, 0.13], t: 62, legs: [{ ank: [0.3, 0.1], bend: 0, foot: -70 }], arms: [{ hand: [0.24, 0.18], bend: 1 }] }) },
    { id: 'supinetwist', name: 'Supine Twist', motion: 'still', cue: 'on the back, knees folded over to one side, one arm long overhead. The rotation is toward the camera', actor: ['thighL'],
      pose: () => ({ hip: [0, 0.12], t: -90, legs: [{ knee: [0.2, 0.28], ank: [0.42, 0.13], foot: 20 }], arms: [{ el: [-0.46, 0.07], hd: [-0.62, 0.07] }] }) },
    { id: 'downdog', name: 'Downward Dog', motion: 'breath', cue: 'hands and feet down, hips the apex, head between the arms. Breath: hips rise a dot, heels drop', actor: ['torso'],
      pose: (d) => { const l = L(d); return { hip: [0.06, l(0.6, 0.61)], t: -125, legs: [{ ank: [0.3, ANK], bend: 0 }, { ank: [0.36, ANK], bend: 0 }], arms: [{ el: [-0.34, 0.24], hd: [-0.46, 0.06] }] }; } },
    { id: 'puppy', name: 'Puppy Pose', motion: 'still', cue: 'hips stacked over the knees, chest and arms down the mat, forehead down', actor: ['torso'],
      pose: () => ({ hip: [0, 0.33], t: 118, legs: [{ knee: [0.01, 0.09], ank: [-0.24, 0.1], foot: 170 }], arms: [{ el: [0.44, 0.09], hd: [0.62, 0.06] }] }) },
    { id: 'thread', name: 'Thread the Needle', motion: 'still', cue: 'one shoulder on the mat with that arm along the floor; the free arm reaches to the ceiling', actor: ['uarmR'],
      pose: () => ({ hip: [-0.06, 0.33], t: 118, legs: [{ knee: [-0.05, 0.09], ank: [-0.3, 0.1], foot: 170 }], arms: [{ el: [0.4, 0.07], hd: [0.56, 0.06] }, { el: [0.26, 0.38], hd: [0.28, 0.58] }] }) },
    { id: 'sphinx', name: 'Sphinx', motion: 'still', cue: 'prone on the forearms, elbows under the shoulders, chest lifted, legs long', actor: ['torso'],
      pose: () => ({ hip: [0.1, 0.1], t: -66, legs: [{ knee: [0.36, 0.09], ank: [0.6, 0.09], foot: 170 }], arms: [{ el: [-0.24, 0.07], hd: [-0.44, 0.07] }] }) },
    { id: 'cowface', name: 'Cow-Face Arms', motion: 'still', cue: 'front view: one arm overhead and bent behind the head, the other bent behind the low back', actor: ['uarmL', 'uarmR'],
      pose: () => ({ view: 'front', hip: [0, 0.6], t: 0, legs: [{ ank: [-0.12, ANK], bend: 0 }, { ank: [0.12, ANK], bend: 0 }], arms: [{ el: [-0.3, 0.66], hd: [-0.1, 0.64] }, { el: [0.3, 1.02], hd: [0.1, 1.08] }] }) },
    { id: 'childreach', name: 'Child’s Pose, side reach', motion: 'still', cue: 'hips on the heels, forehead down, both arms walked to one side. The reach is toward the camera', actor: ['torso'],
      pose: () => ({ hip: [-0.12, 0.2], t: 100, legs: [{ knee: [0.1, 0.09], ank: [-0.16, 0.09], foot: 170 }], arms: [{ el: [0.4, 0.08], hd: [0.58, 0.06] }] }) },
    { id: 'savasana', name: 'Savasana', motion: 'breath', cue: 'flat on the back, toes up, arms by the sides. Breath: the chest, one dot', actor: ['torso'],
      pose: (d) => { const l = L(d); return { hip: [-0.04, 0.1], t: l(-90, -88), legs: [{ ank: [0.46, 0.09], bend: 0, foot: -70 }, { ank: [0.5, 0.09], bend: 0, foot: -70 }], arms: [{ el: [-0.2, 0.06], hd: [0.0, 0.06] }] }; } }
  );
  /* ---- bodyweight: the floor's lifts. d is the drive; the two holds breathe ---- */
  EXERCISES.push(
    { id: 'pushup', name: 'Push-up', cue: 'hands under the shoulders, one line from ear to heel; the chest drops to a fist off the floor and presses back', actor: ['uarmL', 'farmL'],
      pose: (d) => { const l = L(d); return { hip: [0.08, l(0.36, 0.17)], t: -95, legs: [{ ank: [0.54, 0.08], bend: 0, foot: 75 }], arms: [{ hand: [-0.3, 0.03], bend: 1 }] }; } },
    { id: 'splitsquat', name: 'Split Squat', cue: 'a long stance, the rear heel up; the hips drop straight down until the rear knee is a fist off the floor', actor: ['thighL', 'thighR'],
      pose: (d) => { const l = L(d); return { hip: [l(0.0, -0.02), l(0.58, 0.36)], t: l(2, 6), legs: [{ ank: [0.16, ANK], bend: 1 }, { knee: [l(-0.1, -0.12), l(0.33, 0.12)], ank: [l(-0.3, -0.36), l(0.13, 0.13)], foot: 70 }], arms: [{ hand: [l(0.06, 0.04), l(0.62, 0.4)], bend: -1 }] }; } },
    { id: 'steplunge', name: 'Step-up', cue: 'one foot flat on the step; the whole body rises onto it and the trailing foot lands beside', actor: ['thighL', 'thighR'],
      pose: (d) => { const l = L(d), top = 0.14 + 0.9 * U; return { hip: [l(-0.06, 0.18), l(0.5, 0.71)], t: l(12, 2), legs: [{ ank: [0.2, top], bend: 1 }, { ank: [l(-0.14, 0.12), l(ANK, top)], bend: 1 }], arms: [{ hand: [l(-0.02, 0.22), l(0.42, 0.61)], bend: -1 }], world: [[0.06, FLOOR, 0.06, 0.14, 0.013], [0.34, FLOOR, 0.34, 0.14, 0.013], [0.06, 0.14, 0.34, 0.14, 0.013]] }; } },
    { id: 'slrdl', name: 'Single-leg RDL Reach', cue: 'balanced on one soft knee; the hips hinge back, the free leg reaches behind and the hand toward the floor', actor: ['torso', 'thighR'],
      pose: (d) => { const l = L(d); return { hip: [l(0, -0.1), l(0.6, 0.55)], t: l(2, 78), legs: [{ ank: [0.02, ANK], bend: 1 }, { knee: [l(-0.04, -0.34), l(0.32, 0.52)], ank: [l(-0.05, -0.58), l(ANK, 0.44)], foot: l(0, 120) }], arms: [{ hand: [l(0.06, 0.16), l(0.5, 0.2)], bend: 1 }] }; } },
    { id: 'hipbridge', name: 'Single-leg Hip Bridge', cue: 'one foot flat, the other leg held long; the hips drive up until hip and knee are in line', actor: ['torso'],
      pose: (d) => { const l = L(d), hip = [0.02, l(0.17, 0.36)], sh = [-0.3, 0.13]; const t = Math.atan2(sh[0] - hip[0], sh[1] - hip[1]) * 180 / Math.PI; const knee = [hip[0] + 0.2, hip[1] + 0.21]; return { hip, t, legs: [{ ank: [0.26, ANK], bend: 1 }, { knee, ank: [knee[0] + 0.2, knee[1] + 0.18], foot: -40 }], arms: [{ el: [-0.16, 0.06], hd: [0.02, 0.06] }] }; } },
    { id: 'bearcrawl', name: 'Bear Crawl', cue: 'hands under the shoulders, knees an inch off the floor; opposite hand and foot step together', actor: ['uarmL', 'thighR'],
      pose: (d) => { const l = L(d); return { hip: [0.12, 0.44], t: -96, legs: [{ knee: [l(0.14, 0.2), 0.14], ank: [l(0.38, 0.44), 0.07], foot: 60 }, { knee: [l(0.22, 0.12), 0.14], ank: [l(0.46, 0.36), 0.07], foot: 60 }], arms: [{ hand: [l(-0.2, -0.3), 0.03], bend: 1 }, { hand: [l(-0.32, -0.22), 0.03], bend: 1 }] }; } },
    { id: 'supermanhold', name: 'Superman Hold', motion: 'breath', cue: 'prone: arms and legs lifted off the floor, chin down. Breath: everything lifts a dot', actor: ['torso'],
      pose: (d) => { const l = L(d), up = l(0, 0.015); return { hip: [0.06, 0.1], t: -80, legs: [{ knee: [0.32, 0.13 + up], ank: [0.56, 0.17 + up], foot: 0 }], arms: [{ el: [-0.44, 0.15 + up], hd: [-0.57, 0.2 + up] }] }; } },
    { id: 'hollow', name: 'Hollow Hold', motion: 'breath', cue: 'on the back, low back pressed down; shoulders and straight legs held off the floor, arms overhead. Breath: a dot higher', actor: ['torso'],
      pose: (d) => { const l = L(d), up = l(0, 0.015); return { hip: [0.04, 0.1], t: -74, legs: [{ knee: [0.3, 0.17 + up], ank: [0.55, 0.24 + up], foot: -60 }], arms: [{ el: [-0.48, 0.2 + up], hd: [-0.59, 0.27 + up] }] }; } },
    { id: 'reversecrunch', name: 'Reverse Crunch', cue: 'on the back, knees at ninety; the hips curl up off the floor and lower slowly, the low back kept down', actor: ['thighL', 'shinL'],
      pose: (d) => { const l = L(d); return { hip: [l(0.05, -0.02), l(0.12, 0.2)], t: l(-90, -78), legs: [{ knee: [l(0.12, -0.1), l(0.4, 0.44)], ank: [l(0.38, 0.14), l(0.4, 0.52)], foot: -90 }], arms: [{ el: [-0.14, 0.06], hd: [0.06, 0.06] }] }; } }
  );
  const EXERCISE_BY_NAME = {}; for (const e of EXERCISES) { EXERCISE_BY_NAME[e.name] = e; for (const a of e.aliases || []) EXERCISE_BY_NAME[a] = e; }
  const GROUPS = [
    { title: 'Lifts', ids: ['goblet', 'gobletdeep', 'chest', 'facepull', 'pulldown', 'rdl', 'kbdl', 'calf', 'plank', 'ohp', 'row', 'lunge', 'legcurl', 'cph', 'deadbug', 'bridge', 'sideplank'] },
    { title: 'Stretches', ids: ['calfstretch', 'hipflexor', 'hamstring', 'figure4', 'doorway'] },
    { title: 'Run drills', ids: ['highknees', 'carioca', 'legswing', 'askip', 'walklunge'] },
    { title: 'Yoga', ids: ['lowlunge', 'halfsplit', 'chair', 'warrior2', 'pigeon', 'bridgepose', 'seatedfold', 'supinetwist', 'downdog', 'puppy', 'thread', 'sphinx', 'cowface', 'childreach', 'savasana'] },
    { title: 'Bodyweight', ids: ['pushup', 'splitsquat', 'steplunge', 'slrdl', 'hipbridge', 'bearcrawl', 'supermanhold', 'hollow', 'reversecrunch'] }
  ];

  /* ---- rendering: one signed-distance field over the masses, lit from the upper-left, dithered ---- */
  function sdf(M, x, y) {
    let best = { d: Infinity, m: null };
    for (const m of M) {
      const dx = m.x2 - m.x1, dy = m.y2 - m.y1, LL = dx * dx + dy * dy;
      let t = LL ? ((x - m.x1) * dx + (y - m.y1) * dy) / LL : 0; t = Math.max(0, Math.min(1, t));
      const r = m.r0 + (m.r1 - m.r0) * t, dd = Math.hypot(x - (m.x1 + dx * t), y - (m.y1 + dy * t)) / r;
      if (dd < best.d) best = { d: dd, m };
    }
    return best;
  }
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const dither = (v, i, j) => v > (BAYER[j & 3][i & 3] + 0.5) / 16;
  const bodyOnly = (M) => M.filter((m) => !m.world);
  const LIGHT = [-0.6, 0.8];
  function shadedLit(M, x, y, i, j) {
    const s = sdf(M, x, y); if (s.d > 1) return false; if (s.m.world) return true;
    const B = M._body || (M._body = bodyOnly(M)), e = U * 0.6;
    const nx = sdf(B, x + e, y).d - sdf(B, x - e, y).d, ny = sdf(B, x, y + e).d - sdf(B, x, y - e).d, n = Math.hypot(nx, ny) || 1;
    const l = (nx / n) * LIGHT[0] + (ny / n) * LIGHT[1];
    return dither(0.62 - 0.4 * l + 0.25 * s.d, i, j);
  }

  /* the masses of an exercise at depth d, and whether the dot at grid (i, j) prints — j counted from the ground up */
  function massesForExercise(ex, d) { return figureAbs(ex.pose(d)); }
  function litAt(M, i, j) { return shadedLit(M, (i - 15) * U, 0.65 + (j - 15) * U, i, j); }

  window.AthleteRig = { GRID_STEP, SEQ, FRAME_MS, ANK, FLOOR, EXERCISES, EXERCISE_BY_NAME, GROUPS, figureAbs, buildMasses, massesForExercise, litAt, sdf, ik };
})();
