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

  function platform(ctx, pl, game, isPlayer) {
    if (!pl) return;
    const f = pl.faction;
    const dead = pl.hp <= 0;
    const x = pl.x, y = pl.y;
    const recoil = pl.recoil || 0;
    const ang = (isPlayer ? game.aimAngle : pl.barrel) * Math.PI / 180;

    ctx.save();
    ctx.translate(x, y);

    // shadow pooled under the hull
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(0, 0, 44, 8, 0, 0, 6.283); ctx.fill();

    if (dead) ctx.globalAlpha = 0.55;

    // tracks
    ctx.fillStyle = '#2f2a2c';
    rr(ctx, -38, -18, 76, 16, 7); ctx.fill();
    ctx.strokeStyle = '#1b1718'; ctx.lineWidth = 2;
    rr(ctx, -38, -18, 76, 16, 7); ctx.stroke();
    ctx.fillStyle = '#4a4245';
    for (let i = -3; i <= 3; i++) { ctx.fillRect(i * 10 - 3, -16, 5, 12); }

    // hull
    const hull = ctx.createLinearGradient(0, -34, 0, -16);
    hull.addColorStop(0, '#7d838f');
    hull.addColorStop(1, '#4a4f59');
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(-32, -18); ctx.lineTo(-24, -34); ctx.lineTo(26, -34);
    ctx.lineTo(34, -18); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2c3038'; ctx.lineWidth = 2; ctx.stroke();

    // house stripe + running lights
    ctx.fillStyle = f.primary;
    ctx.fillRect(-24, -26, 48, 4);
    const blink = 0.55 + 0.45 * Math.sin(game.time * 3 + (isPlayer ? 0 : 1.6));
    ctx.globalAlpha = (dead ? 0.2 : blink) * (ctx.globalAlpha || 1);
    ctx.fillStyle = f.light;
    ctx.beginPath(); ctx.arc(-28, -30, 2.6, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(30, -30, 2.6, 0, 6.283); ctx.fill();
    ctx.globalAlpha = dead ? 0.55 : 1;

    // barrel, kicking back on recoil
    ctx.save();
    ctx.translate(0, -30);
    ctx.scale(pl.facing, 1);
    ctx.rotate(-ang);
    ctx.translate(-recoil * 7, 0);
    const bar = ctx.createLinearGradient(0, -5, 0, 5);
    bar.addColorStop(0, '#9aa2ae'); bar.addColorStop(1, '#565c66');
    ctx.fillStyle = bar;
    rr(ctx, 4, -5, 40, 10, 3); ctx.fill();
    ctx.strokeStyle = '#31353d'; ctx.lineWidth = 1.6;
    rr(ctx, 4, -5, 40, 10, 3); ctx.stroke();
    ctx.fillStyle = f.primary;                 // emitter ring at the mouth
    rr(ctx, 40, -6, 5, 12, 2); ctx.fill();
    ctx.restore();

    // turret cap
    ctx.fillStyle = '#6c727d';
    ctx.beginPath(); ctx.arc(0, -30, 9, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#2c3038'; ctx.lineWidth = 2; ctx.stroke();

    if (dead) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#1d1a19'; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-18, -40); ctx.lineTo(-6, -26); ctx.moveTo(10, -42); ctx.lineTo(20, -28);
      ctx.stroke();
    }
    ctx.restore();

    // hull bar floating above
    if (!dead) {
      const w = 62, h = 6, by = y - 56;
      ctx.save();
      ctx.fillStyle = 'rgba(10,7,6,.75)';
      rr(ctx, x - w / 2, by, w, h, 3); ctx.fill();
      const frac = pl.hp / pl.maxHp;
      ctx.fillStyle = frac > 0.5 ? f.light : frac > 0.25 ? '#f0b04a' : '#e2634a';
      rr(ctx, x - w / 2 + 1, by + 1, (w - 2) * frac, h - 2, 2); ctx.fill();
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
    if (!pl || pl.hp <= 0) return;
    const w = WEAPONS[game.weapon];
    const salvo = w.salvo;
    const count = salvo ? salvo.count : 1;

    // One arc per shell the trigger will actually launch, so an additive
    // mount shows its whole fan before you commit to it.
    const arcs = [];
    for (let k = 0; k < count; k++) {
      const t = count === 1 ? 0 : (k / (count - 1)) * 2 - 1;
      const p = game.aimPreview(
        game.aimAngle + t * (salvo ? salvo.spread : 0),
        game.aimPower + t * (salvo ? salvo.stagger : 0));
      if (p && p.points.length > 1) arcs.push(p);
    }
    if (!arcs.length) return;

    ctx.save();
    ctx.lineCap = 'round';

    arcs.forEach((prev, idx) => {
      const pts = prev.points;
      const lead = count === 1 || idx === 0 || idx === arcs.length - 1;
      const hue = prev.blocked ? '#ff8a5c' : prev.reason === 'spent' ? '#a8f0ff' : '#ffe0a0';

      for (let i = 1; i < pts.length; i++) {
        const f = 1 - (i / pts.length) * 0.75;
        ctx.globalAlpha = f * (count === 1 ? 0.75 : 0.5);
        ctx.strokeStyle = hue;
        ctx.lineWidth = (1 + f * 2.4) * (count === 1 ? 1 : 0.72);
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }

      if (count === 1) {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = hue;
        for (let i = 8; i < pts.length - 4; i += 8) {
          ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 1.9, 0, 6.283); ctx.fill();
        }
      }
      if (!lead) return;

      const tip = prev.tip;
      if (prev.blocked) {
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = '#ff8a5c'; ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(tip.x - 7, tip.y - 7); ctx.lineTo(tip.x + 7, tip.y + 7);
        ctx.moveTo(tip.x + 7, tip.y - 7); ctx.lineTo(tip.x - 7, tip.y + 7);
        ctx.stroke();
      } else if (prev.reason === 'spent') {
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = '#a8f0ff'; ctx.lineWidth = 2;
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.arc(tip.x, tip.y, 8, 0, 6.283); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.65;
        ctx.fillStyle = '#a8f0ff';
        ctx.font = 'bold 10px "Trebuchet MS", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('RANGE', tip.x, tip.y - 15);
      } else if (prev.reason === 'apex') {
        ctx.globalAlpha = 0.3;
        ctx.setLineDash([3, 6]);
        ctx.strokeStyle = '#ffe0a0'; ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(tip.x, Math.min(prev.groundY, WORLD.h));
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = '#ffe0a0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(tip.x, tip.y, 6, 0, 6.283); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tip.x - 11, tip.y); ctx.lineTo(tip.x - 7, tip.y);
        ctx.moveTo(tip.x + 7, tip.y); ctx.lineTo(tip.x + 11, tip.y);
        ctx.moveTo(tip.x, tip.y - 11); ctx.lineTo(tip.x, tip.y - 7);
        ctx.stroke();

        if (count === 1) {
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = '#ffe0a0';
          ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('APEX', tip.x, tip.y - 17);
        }
      }
    });
    ctx.globalAlpha = 1;

    // power gauge under the hull
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
    const w = WEAPONS[game.weapon];
    if (!w.ability || game.abilityUsed) return;
    const mine = game.shells.filter((s) => s.owner === game.player);
    if (!mine.length) return;
    const s = mine[0];

    const pulse = 0.5 + 0.5 * Math.sin(t * 7);
    const label = { split: 'BURST', detonate: 'DETONATE', dive: 'PUNCH',
                    seek: 'LOCK ON', implode: 'COLLAPSE' }[w.ability] || 'TRIGGER';
    const x = s.x, y = s.y - 34;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
    const text = `SPACE · ${label}`;
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
