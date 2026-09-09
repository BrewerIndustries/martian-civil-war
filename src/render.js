/* Martian Civil War — all drawing. The terrain paints itself from its own
   offscreen canvas (see terrain.js); everything else is hand-drawn here. */

const R = (() => {

  function rr(ctx, x, y, w, h, r) {
    const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  // Deterministic pseudo-random so a block's grain never flickers between frames.
  function seeded(seed) {
    let s = seed * 9301 + 49297;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }

  /* ---------- the Martian backdrop ---------- */

  const SUN = { x: 1500, y: WORLD.baseY - 232 };

  // Flat-topped mesas rather than rolling hills — this is a dead sea bottom.
  let mesas = null;
  function buildMesas() {
    const layers = [];
    for (let l = 0; l < 3; l++) {
      const rnd = seeded(23 + l * 47);
      const pts = [];
      const baseY = WORLD.baseY - 96 - l * 68;
      let x = -140;
      while (x < WORLD.w + 140) {
        const w = 130 + rnd() * 230;
        const top = baseY - rnd() * (46 + l * 30);
        pts.push({ x, y: baseY });
        pts.push({ x: x + 26, y: top });
        pts.push({ x: x + w - 26, y: top });
        pts.push({ x: x + w, y: baseY });
        x += w + rnd() * 90;
      }
      layers.push(pts);
    }
    return layers;
  }

  const DUST = Array.from({ length: 9 }, (_, i) => {
    const rnd = seeded(310 + i * 29);
    return { x: rnd() * WORLD.w, y: 210 + rnd() * 320, s: 0.8 + rnd() * 1.4, v: 4 + rnd() * 9 };
  });

  const STARS = Array.from({ length: 34 }, (_, i) => {
    const rnd = seeded(910 + i * 17);
    return { x: rnd() * WORLD.w, y: rnd() * 300, r: 0.6 + rnd() * 1.2, tw: rnd() * 6.28 };
  });

  function moon(ctx, x, y, r, tint, seed) {
    ctx.save();
    const g = ctx.createRadialGradient(x - r * .3, y - r * .3, r * .2, x, y, r);
    g.addColorStop(0, tint[0]);
    g.addColorStop(1, tint[1]);
    ctx.fillStyle = g;
    // lumpy, not spherical — Phobos and Deimos are captured rubble
    const rnd = seeded(seed);
    ctx.beginPath();
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * 6.283;
      const rad = r * (0.82 + rnd() * 0.3);
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad * 0.88;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(60,40,34,.3)';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(x + (rnd() - .5) * r * 1.1, y + (rnd() - .5) * r, r * (0.1 + rnd() * 0.16), 0, 6.283);
      ctx.fill();
    }
    ctx.restore();
  }

  function background(ctx, t) {
    // Butterscotch daytime sky that cools toward the horizon — on Mars the
    // dust scatters red outward, leaving the light near the sun blue.
    const sky = ctx.createLinearGradient(0, 0, 0, WORLD.baseY);
    sky.addColorStop(0, '#2e1b1a');
    sky.addColorStop(0.28, '#5d3327');
    sky.addColorStop(0.55, '#94553a');
    sky.addColorStop(0.8, '#bd8154');
    sky.addColorStop(1, '#d6a271');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WORLD.w, WORLD.baseY);

    for (const s of STARS) {
      ctx.globalAlpha = (0.2 + 0.3 * Math.sin(t * 1.3 + s.tw)) * Math.max(0, 1 - s.y / 340);
      ctx.fillStyle = '#ffeede';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;

    moon(ctx, 430, 150, 44, ['#d9c8b4', '#8f7d69'], 41);   // Phobos
    moon(ctx, 980, 96, 15, ['#cbbfae', '#877b6c'], 77);                      // Deimos

    // the blue halo of a Martian sunset
    const halo = ctx.createRadialGradient(SUN.x, SUN.y, 8, SUN.x, SUN.y, 420);
    halo.addColorStop(0, 'rgba(232,240,255,.98)');
    halo.addColorStop(0.11, 'rgba(163,190,224,.7)');
    halo.addColorStop(0.3, 'rgba(126,136,172,.34)');
    halo.addColorStop(0.6, 'rgba(120,104,116,.12)');
    halo.addColorStop(1, 'rgba(110,90,100,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(SUN.x - 430, SUN.y - 430, 860, 860);
    ctx.fillStyle = '#f2f5ff';
    ctx.beginPath(); ctx.arc(SUN.x, SUN.y, 23, 0, 6.283); ctx.fill();

    // drifting dust veils
    for (const d of DUST) {
      const x = ((d.x + t * d.v) % (WORLD.w + 600)) - 300;
      ctx.globalAlpha = 0.13;
      ctx.fillStyle = '#e8b98c';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const f = 1 - Math.abs(i - 2) * 0.28;
        ctx.ellipse(x + (i - 2) * 52 * d.s, d.y + Math.sin(i * 1.9) * 8 * d.s,
                    58 * d.s * f, 13 * d.s * f, 0, 0, 6.283);
      }
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (!mesas) mesas = buildMesas();
    const tints = ['#5b3323', '#77452f', '#95614a'];   // near -> far
    for (let l = mesas.length - 1; l >= 0; l--) {
      ctx.fillStyle = tints[l];
      ctx.beginPath();
      ctx.moveTo(-160, WORLD.baseY + 10);
      for (const p of mesas[l]) ctx.lineTo(p.x, p.y);
      ctx.lineTo(WORLD.w + 160, WORLD.baseY + 10);
      ctx.closePath();
      ctx.fill();
    }
  }

  /* ---------- assault platforms ---------- */

  /* An assault platform is a building on wheels — a rolling fortress, not a
     tank. Every mount the platform owns is drawn on it, so the silhouette
     itself tells you how much firepower is about to go downrange. */
  function platform(ctx, pl, game, isPlayer) {
    if (!pl) return;
    const f = pl.faction;
    const dead = pl.hp <= 0;
    const x = pl.x, y = pl.y;
    const recoil = pl.recoil || 0;
    const aim = (isPlayer ? game.aimAngle : pl.barrel);
    const roster = isPlayer ? game.owned : (game.foeMounts || ['laser']);
    const armedSet = isPlayer ? game.armed : roster;

    const W = 96, storeyH = 26, storeys = 3;
    const bodyTop = -34 - storeys * storeyH;

    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.beginPath(); ctx.ellipse(0, 0, W * 0.6, 9, 0, 0, 6.283); ctx.fill();
    if (dead) ctx.globalAlpha = 0.5;

    // running gear: a row of heavy wheels under a track skirt
    ctx.fillStyle = '#2b2426';
    rr(ctx, -W / 2 - 4, -22, W + 8, 20, 8); ctx.fill();
    ctx.strokeStyle = '#181415'; ctx.lineWidth = 2;
    rr(ctx, -W / 2 - 4, -22, W + 8, 20, 8); ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const wx = -W / 2 + 10 + i * (W - 20) / 4;
      ctx.fillStyle = '#3d3437';
      ctx.beginPath(); ctx.arc(wx, -11, 8.5, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#514548'; ctx.lineWidth = 2;
      ctx.beginPath();
      const a = game.time * 0.6 + i;
      ctx.moveTo(wx - Math.cos(a) * 5, -11 - Math.sin(a) * 5);
      ctx.lineTo(wx + Math.cos(a) * 5, -11 + Math.sin(a) * 5);
      ctx.stroke();
    }

    // hull: stacked storeys with lit windows
    for (let sIdx = 0; sIdx < storeys; sIdx++) {
      const inset = sIdx * 7;
      const top = -34 - (sIdx + 1) * storeyH;
      const w = W - inset * 2;
      const g = ctx.createLinearGradient(0, top, 0, top + storeyH);
      g.addColorStop(0, '#7c8290');
      g.addColorStop(1, '#4c515b');
      ctx.fillStyle = g;
      rr(ctx, -w / 2, top, w, storeyH, 3); ctx.fill();
      ctx.strokeStyle = '#2b2f37'; ctx.lineWidth = 2;
      rr(ctx, -w / 2, top, w, storeyH, 3); ctx.stroke();

      const lit = !dead;
      const cols = Math.max(2, Math.floor(w / 20));
      for (let c = 0; c < cols; c++) {
        const wx = -w / 2 + 9 + c * (w - 18) / (cols - 1 || 1);
        ctx.fillStyle = lit ? 'rgba(255,206,132,.85)' : 'rgba(40,36,38,.9)';
        ctx.fillRect(wx - 3.5, top + 8, 7, 9);
      }
    }

    // parapet and house banner on the roof
    ctx.fillStyle = '#5b616c';
    rr(ctx, -W / 2 + 12, bodyTop - 7, W - 24, 8, 2); ctx.fill();
    ctx.fillStyle = f.primary;
    ctx.fillRect(-W / 2 + 14, -36 - storeyH, W - 28, 4);
    if (!dead) {
      const bx = -W / 2 + 16, by = bodyTop - 40;
      ctx.strokeStyle = '#6b512c'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, bodyTop - 6); ctx.stroke();
      ctx.fillStyle = f.primary;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + 30 + Math.sin(game.time * 2.4) * 4, by + 7);
      ctx.lineTo(bx + 27, by + 17);
      ctx.lineTo(bx, by + 23);
      ctx.closePath(); ctx.fill();
    }

    // one barrel per mount, ranged up the face of the building
    const n = roster.length;
    roster.forEach((id, i) => {
      const w = WEAPONS[id];
      if (!w) return;
      const t = n === 1 ? 0.5 : i / (n - 1);
      const my = -30 - 12 - t * (storeys * storeyH - 16);
      const mx = (W / 2 - 8 - (i % 2) * 9) * pl.facing;
      ctx.save();
      ctx.translate(mx, my);
      ctx.scale(pl.facing, 1);
      ctx.rotate(-aim * Math.PI / 180);
      ctx.translate(-recoil * 5, 0);

      ctx.fillStyle = '#3f444d';
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, 6.283); ctx.fill();
      const bar = ctx.createLinearGradient(0, -4, 0, 4);
      bar.addColorStop(0, '#98a0ac'); bar.addColorStop(1, '#535963');
      ctx.fillStyle = bar;
      rr(ctx, 2, -3.6, 26, 7.2, 2); ctx.fill();
      ctx.strokeStyle = '#2d3138'; ctx.lineWidth = 1.2;
      rr(ctx, 2, -3.6, 26, 7.2, 2); ctx.stroke();
      // an armed mount lights its emitter; an unarmed one sits cold
      const live = armedSet.includes(id) && !dead;
      ctx.fillStyle = live ? w.tracer : '#3a3f47';
      if (live) { ctx.shadowColor = w.tracer; ctx.shadowBlur = 7; }
      rr(ctx, 25, -4.4, 4, 8.8, 1.5); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    });

    if (dead) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#1d1a19'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-24, bodyTop + 20); ctx.lineTo(-6, bodyTop + 44);
      ctx.moveTo(14, bodyTop + 16); ctx.lineTo(30, bodyTop + 40);
      ctx.stroke();
    }
    ctx.restore();

    // hull bar above the roof
    if (!dead) {
      const bw = 78, bh = 7, by = y + bodyTop - 54;
      ctx.save();
      ctx.fillStyle = 'rgba(10,7,6,.75)';
      rr(ctx, x - bw / 2, by, bw, bh, 3); ctx.fill();
      const frac = pl.hp / pl.maxHp;
      ctx.fillStyle = frac > 0.5 ? f.light : frac > 0.25 ? '#f0b04a' : '#e2634a';
      rr(ctx, x - bw / 2 + 1, by + 1, (bw - 2) * frac, bh - 2, 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.font = 'bold 9px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      const live = isPlayer ? game.armed.length : roster.length;
      ctx.fillText(`${Math.ceil(pl.hp)} · ${live}/${roster.length} armed`, x, by - 3);
      ctx.restore();
    }
  }

  /* ---------- shells ---------- */

  function shell(ctx, s) {
    const w = WEAPONS[s.weapon];
    ctx.save();
    // tracer
    ctx.lineCap = 'round';
    for (let i = 1; i < s.trail.length; i++) {
      const a = i / s.trail.length;
      ctx.globalAlpha = a * 0.55;
      ctx.strokeStyle = w.tracer;
      ctx.lineWidth = a * 3.4;
      ctx.beginPath();
      ctx.moveTo(s.trail[i - 1].x, s.trail[i - 1].y);
      ctx.lineTo(s.trail[i].x, s.trail[i].y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const r = w.r * (s.shard ? 0.7 : 1);
    ctx.shadowColor = w.tracer;
    ctx.shadowBlur = 14;
    ctx.fillStyle = w.tracer;
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 6.283); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(s.x, s.y, r * 0.45, 0, 6.283); ctx.fill();
    ctx.restore();
  }

  /* ---------- aiming ----------
     Deliberately a SHORT indicator, not a full arc. Ranging the enemy in over
     a couple of shots is the game; drawing the whole trajectory would hand the
     answer over and there would be nothing left to play. */

  function aim(ctx, game) {
    const pl = game.player;
    if (!pl || pl.hp <= 0 || !game.armed.length) return;

    /* Each armed mount is laid separately, so every one gets its own arc: the
       gun you are currently laying is drawn bright, the ones already set sit
       dim behind it. Targeting modules extend what you are allowed to see —
       a Ballistic Computer plots all the way to impact instead of stopping at
       the apex, which is a genuine upgrade to how well you can shoot. */
    const full = game.mods.fullArc;
    const marker = game.mods.impactMarker || full;

    game.armed.forEach((id, idx) => {
      const w = WEAPONS[id];
      const sol = game._sol(id);
      const active = id === game.currentMount;
      const salvo = w.salvo;
      const count = salvo ? salvo.count : 1;

      for (let k = 0; k < count; k++) {
        const t = count === 1 ? 0 : (k / (count - 1)) * 2 - 1;
        const prev = game.aimPreview(
          sol.angle + t * (salvo ? salvo.spread : 0),
          sol.power + t * (salvo ? salvo.stagger : 0) / 2, id, full);
        if (!prev || prev.points.length < 2) continue;
        const pts = prev.points;
        const hue = prev.blocked ? '#ff8a5c' : (w.tracer || '#ffe0a0');

        ctx.save();
        ctx.lineCap = 'round';
        for (let i = 1; i < pts.length; i++) {
          const f = 1 - (i / pts.length) * 0.7;
          ctx.globalAlpha = f * (active ? 0.8 : 0.22);
          ctx.strokeStyle = hue;
          ctx.lineWidth = (1 + f * 2.2) * (active ? 1 : 0.6);
          ctx.beginPath();
          ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
          ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        }

        if (k === 0) {
          const tip = prev.tip;
          ctx.globalAlpha = active ? 0.95 : 0.35;
          if (prev.blocked) {
            ctx.strokeStyle = '#ff8a5c'; ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.moveTo(tip.x - 6, tip.y - 6); ctx.lineTo(tip.x + 6, tip.y + 6);
            ctx.moveTo(tip.x + 6, tip.y - 6); ctx.lineTo(tip.x - 6, tip.y + 6);
            ctx.stroke();
          } else if (marker && (prev.reason === 'blocked' || full)) {
            ctx.fillStyle = hue;
            ctx.beginPath(); ctx.arc(tip.x, tip.y, active ? 5 : 3, 0, 6.283); ctx.fill();
          } else {
            ctx.strokeStyle = hue; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(tip.x, tip.y, active ? 6 : 4, 0, 6.283); ctx.stroke();
          }
        }
        ctx.restore();
      }

      // a tag on the active gun so you know which one you are laying
      if (active) {
        const o = game.muzzle(pl, sol.angle);
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = w.tracer;
        ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${idx + 1}/${game.armed.length} ${w.name}`, o.x + 12, o.y - 12);
        ctx.restore();
      }
    });

    ctx.save();
    const pw = 66, ph = 7, bx = pl.x - pw / 2, by = pl.y + 12;
    ctx.fillStyle = 'rgba(10,7,6,.72)';
    rr(ctx, bx, by, pw, ph, 3); ctx.fill();
    const power = game.aimPower;
    ctx.fillStyle = power > 0.85 ? '#ff7a4a' : power > 0.55 ? '#f0b73c' : '#9fd93a';
    rr(ctx, bx + 1, by + 1, (pw - 2) * power, ph - 2, 2); ctx.fill();
    ctx.restore();
  }

  /* A mount's trick is worthless if the player never learns it exists. The
     HUD label alone was too easy to miss, so prompt on the shell itself
     while the window to use it is actually open. */
  function abilityPrompt(ctx, game, t) {
    if (game.abilityUsed) return;
    const mine = game.shells.filter((s) => s.owner === game.player &&
                                           WEAPONS[s.weapon].ability && !s.burst);
    if (!mine.length) return;
    const s = mine[0];
    const w = WEAPONS[s.weapon];

    const pulse = 0.5 + 0.5 * Math.sin(t * 7);
    const label = { split: 'BURST', detonate: 'DETONATE', dive: 'PUNCH',
                    seek: 'LOCK ON', implode: 'COLLAPSE' }[w.ability] || 'TRIGGER';
    const x = s.x, y = s.y - 34;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
    const text = mine.length > 1 ? `SPACE · ${mine.length} MOUNTS` : `SPACE · ${label}`;
    const pad = 9;
    const tw = ctx.measureText(text).width;

    ctx.globalAlpha = 0.72 + pulse * 0.28;
    ctx.fillStyle = 'rgba(12,8,6,.82)';
    rr(ctx, x - tw / 2 - pad, y - 13, tw + pad * 2, 22, 11); ctx.fill();
    ctx.strokeStyle = w.tracer; ctx.lineWidth = 1.5 + pulse;
    rr(ctx, x - tw / 2 - pad, y - 13, tw + pad * 2, 22, 11); ctx.stroke();
    ctx.fillStyle = w.tracer;
    ctx.fillText(text, x, y + 3);
    ctx.restore();
  }

  /* ---------- effects ---------- */

  function particles(ctx, list) {
    for (const p of list) {
      const f = p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, f) * (p.alpha ?? 1);
      if (p.type === 'ring') {
        const grown = p.size + (1 - f) * p.size * (p.grow || 3);
        ctx.globalAlpha = Math.max(0, f) * 0.9;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1 + f * 3.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, grown, 0, 6.283); ctx.stroke();
      } else if (p.type === 'debris') {
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.8);
        ctx.restore();
      } else if (p.type === 'smoke') {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - f * 0.7), 0, 6.283); ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * f, 0, 6.283); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function popups(ctx, list) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px "Trebuchet MS", sans-serif';
    for (const p of list) {
      const f = p.life / p.maxLife;
      ctx.globalAlpha = Math.min(1, f * 1.6);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(12,8,8,.75)';
      ctx.fillStyle = p.color || '#ffd469';
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
  }

  return { background, platform, shell, aim, abilityPrompt, particles, popups, rr };
})();
