/* Martian Civil War — all drawing. Matter.js handles simulation only; every
   pixel here is hand-drawn so a redoubt can show damage as it takes it. */

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

  const SUN = { x: 1500, y: WORLD.groundY - 232 };

  // Flat-topped mesas rather than rolling hills — this is a dead sea bottom.
  let mesas = null;
  function buildMesas() {
    const layers = [];
    for (let l = 0; l < 3; l++) {
      const rnd = seeded(23 + l * 47);
      const pts = [];
      const baseY = WORLD.groundY - 26 - l * 54;
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
    const sky = ctx.createLinearGradient(0, 0, 0, WORLD.groundY);
    sky.addColorStop(0, '#2e1b1a');
    sky.addColorStop(0.28, '#5d3327');
    sky.addColorStop(0.55, '#94553a');
    sky.addColorStop(0.8, '#bd8154');
    sky.addColorStop(1, '#d6a271');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WORLD.w, WORLD.groundY);

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
    const tints = ['#4d2a1d', '#6a3d2a', '#8b5a41'];   // near -> far
    for (let l = mesas.length - 1; l >= 0; l--) {
      ctx.fillStyle = tints[l];
      ctx.beginPath();
      ctx.moveTo(-160, WORLD.groundY + 10);
      for (const p of mesas[l]) ctx.lineTo(p.x, p.y);
      ctx.lineTo(WORLD.w + 160, WORLD.groundY + 10);
      ctx.closePath();
      ctx.fill();
    }
  }

  function ground(ctx) {
    const h = WORLD.h - WORLD.groundY + 60;
    const regolith = ctx.createLinearGradient(0, WORLD.groundY, 0, WORLD.groundY + h);
    regolith.addColorStop(0, '#8a4a2e');
    regolith.addColorStop(0.35, '#65331f');
    regolith.addColorStop(1, '#331810');
    ctx.fillStyle = regolith;
    ctx.fillRect(-200, WORLD.groundY, WORLD.w + 400, h);

    ctx.fillStyle = '#a35c38';
    ctx.fillRect(-200, WORLD.groundY, WORLD.w + 400, 9);
    ctx.fillStyle = '#bd7048';
    ctx.fillRect(-200, WORLD.groundY, WORLD.w + 400, 3);

    // loose rock scattered over the sea bottom
    const rnd = seeded(11);
    for (let i = 0; i < 90; i++) {
      const x = rnd() * (WORLD.w + 300) - 150;
      const y = WORLD.groundY + 4 + rnd() * 26;
      const s = 2 + rnd() * 7;
      ctx.fillStyle = rnd() > .5 ? 'rgba(58,28,18,.7)' : 'rgba(180,110,74,.5)';
      ctx.beginPath();
      ctx.ellipse(x, y, s, s * 0.66, rnd() * 3, 0, 6.283);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    for (let i = 0; i < 130; i++) {
      const x = rnd() * (WORLD.w + 300) - 150;
      const y = WORLD.groundY + 22 + rnd() * (h - 34);
      ctx.beginPath(); ctx.arc(x, y, 1 + rnd() * 3, 0, 6.283); ctx.fill();
    }
  }

  function platform(ctx, p) {
    ctx.save();
    ctx.fillStyle = '#6a5a50';
    rr(ctx, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 6); ctx.fill();
    ctx.fillStyle = '#867368';
    ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, 6);
    ctx.strokeStyle = '#453a33'; ctx.lineWidth = 2;
    rr(ctx, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 6); ctx.stroke();
    ctx.restore();
  }

  /* ---------- redoubt pieces ---------- */

  function block(ctx, b) {
    const d = b.cb, m = MATERIALS[d.mat];
    const w = d.w, h = d.h;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);

    if (m.glow) {                       // radium charges light their own crate
      ctx.shadowColor = m.glow;
      ctx.shadowBlur = 18;
    } else {
      ctx.shadowColor = 'rgba(0,0,0,.35)';
      ctx.shadowBlur = 9;
      ctx.shadowOffsetY = 4;
    }

    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, m.fill);
    g.addColorStop(1, m.fill2);
    ctx.fillStyle = g;
    ctx.globalAlpha = m.glass ? 0.82 : 1;
    rr(ctx, -w / 2, -h / 2, w, h, m.glass ? 3 : 4);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetY = 0;

    const rnd = seeded(b.id * 31 + 7);
    if (d.mat === 'wood') {
      ctx.strokeStyle = 'rgba(74,40,16,.34)';
      ctx.lineWidth = 1.4;
      const along = w > h;
      const n = Math.max(2, Math.floor((along ? h : w) / 9));
      for (let i = 1; i < n; i++) {
        const o = (along ? -h / 2 : -w / 2) + i * ((along ? h : w) / n) + (rnd() - .5) * 2;
        ctx.beginPath();
        if (along) { ctx.moveTo(-w / 2 + 3, o); ctx.lineTo(w / 2 - 3, o); }
        else { ctx.moveTo(o, -h / 2 + 3); ctx.lineTo(o, h / 2 - 3); }
        ctx.stroke();
      }
    } else if (d.mat === 'stone') {
      ctx.strokeStyle = 'rgba(58,48,42,.42)';
      ctx.lineWidth = 1.3;
      const rows = Math.max(1, Math.round(h / 26));
      for (let i = 1; i < rows; i++) {
        const y = -h / 2 + (i * h) / rows;
        ctx.beginPath(); ctx.moveTo(-w / 2 + 2, y); ctx.lineTo(w / 2 - 2, y); ctx.stroke();
        const x = -w / 2 + rnd() * w;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h / rows + 2); ctx.stroke();
      }
    } else if (d.mat === 'metal') {
      ctx.fillStyle = 'rgba(255,255,255,.13)';
      ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, 3);
      ctx.fillStyle = 'rgba(34,32,38,.55)';
      const studs = Math.max(2, Math.floor(Math.max(w, h) / 30));
      for (let i = 0; i < studs; i++) {
        const f = (i + 0.5) / studs;
        const px = w > h ? -w / 2 + f * w : 0;
        const py = w > h ? 0 : -h / 2 + f * h;
        ctx.beginPath(); ctx.arc(px, py, 3, 0, 6.283); ctx.fill();
      }
    } else if (d.mat === 'ice') {
      ctx.fillStyle = 'rgba(255,255,255,.42)';
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 4, h / 2 - 4);
      ctx.lineTo(-w / 2 + 4 + w * .34, -h / 2 + 4);
      ctx.lineTo(-w / 2 + 10 + w * .34, -h / 2 + 4);
      ctx.lineTo(-w / 2 + 10, h / 2 - 4);
      ctx.closePath(); ctx.fill();
    } else if (d.mat === 'tnt') {
      ctx.fillStyle = 'rgba(24,34,8,.85)';
      ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('RAD', 0, 1);
      ctx.strokeStyle = 'rgba(230,255,160,.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8);
    }

    const dmg = 1 - d.hp / d.maxHp;
    if (dmg > 0.12) {
      ctx.globalAlpha = Math.min(0.85, dmg);
      ctx.strokeStyle = m.glass ? 'rgba(255,255,255,.85)' : 'rgba(20,12,8,.8)';
      ctx.lineWidth = 1.6;
      const n = Math.ceil(dmg * 5);
      for (let i = 0; i < n; i++) {
        let x = (rnd() - .5) * w * .8, y = (rnd() - .5) * h * .8;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 0; k < 3; k++) {
          x += (rnd() - .5) * w * .35;
          y += (rnd() - .5) * h * .35;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = m.edge;
    ctx.lineWidth = 2;
    rr(ctx, -w / 2, -h / 2, w, h, m.glass ? 3 : 4);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* A garrison soldier of the enemy house. Red Martians are copper-skinned and
     helmeted; green Martians are tusked and olive. */
  function target(ctx, b, t, faction) {
    const d = b.cb;
    const w = d.w, h = d.h;
    const hurt = 1 - d.hp / d.maxHp;
    const green = faction.id === 'green';
    const skin = green ? '#84b06a' : '#c98a63';
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);

    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;

    // harness / cloak in the house colours
    const body = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    body.addColorStop(0, faction.light);
    body.addColorStop(1, faction.dark);
    ctx.fillStyle = body;
    rr(ctx, -w / 2, -h / 2 + h * 0.28, w, h * 0.72, 5); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;

    ctx.fillStyle = faction.primary;
    ctx.fillRect(-w * 0.12, -h / 2 + h * 0.3, w * 0.24, h * 0.7);

    // head
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(0, -h / 2 + h * 0.2, w * 0.31, 0, 6.283); ctx.fill();

    if (green) {                                    // tusks
      ctx.fillStyle = '#f2ecd8';
      const ty = -h / 2 + h * 0.28;
      ctx.beginPath(); ctx.moveTo(-w * .2, ty); ctx.lineTo(-w * .12, ty + 9); ctx.lineTo(-w * .08, ty); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(w * .2, ty); ctx.lineTo(w * .12, ty + 9); ctx.lineTo(w * .08, ty); ctx.closePath(); ctx.fill();
    } else {                                        // burnished helm
      ctx.fillStyle = '#b9a888';
      ctx.beginPath();
      ctx.arc(0, -h / 2 + h * 0.2, w * 0.34, Math.PI, 0);
      ctx.lineTo(w * 0.34, -h / 2 + h * 0.2);
      ctx.lineTo(-w * 0.34, -h / 2 + h * 0.2);
      ctx.closePath(); ctx.fill();
    }

    if (d.kind === 'king') {                        // warlord's circlet
      ctx.fillStyle = '#f0cd6e';
      const cy = -h / 2 + h * 0.03;
      ctx.beginPath();
      ctx.moveTo(-w * 0.36, cy);
      for (let i = 0; i < 3; i++) {
        const x0 = -w * 0.36 + (i * w * 0.72) / 3;
        ctx.lineTo(x0 + w * 0.12, cy - 12);
        ctx.lineTo(x0 + w * 0.24, cy);
      }
      ctx.closePath(); ctx.fill();
    } else {                                        // long rifle / lance
      ctx.strokeStyle = '#6d4a26'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(w * 0.52, -h * 0.55); ctx.lineTo(w * 0.52, h * 0.5); ctx.stroke();
      ctx.fillStyle = '#cdd2da';
      ctx.beginPath();
      ctx.moveTo(w * 0.52, -h * 0.72); ctx.lineTo(w * 0.66, -h * 0.5);
      ctx.lineTo(w * 0.38, -h * 0.5); ctx.closePath(); ctx.fill();
    }

    ctx.fillStyle = '#1e1a18';
    const ey = -h / 2 + h * 0.19, er = 2 + hurt * 1.6;
    ctx.beginPath(); ctx.arc(-w * 0.13, ey, er, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.13, ey, er, 0, 6.283); ctx.fill();

    if (hurt > 0.25) {
      ctx.globalAlpha = hurt * 0.55;
      ctx.fillStyle = '#ffb347';
      ctx.beginPath(); ctx.arc(0, 0, w * 0.62, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // marker ring so the last defender stays findable in a wrecked redoubt
    const p = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.save();
    ctx.globalAlpha = 0.18 + p * 0.22;
    ctx.strokeStyle = faction.light;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(b.position.x, b.position.y, Math.max(w, h) * 0.75 + p * 5, 0, 6.283);
    ctx.stroke();
    ctx.restore();
  }

  function projectile(ctx, b) {
    const d = b.cb, r = d.r;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;

    if (d.ammo === 'bomb') {
      ctx.fillStyle = '#2f3327';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;
      ctx.fillStyle = '#9fd93a';
      ctx.beginPath(); ctx.arc(-r * .3, -r * .3, r * .32, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#a8763c'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.quadraticCurveTo(r * .6, -r * 1.7, r * 1.1, -r * 1.2); ctx.stroke();
      ctx.fillStyle = '#d8ff6a';
      ctx.beginPath(); ctx.arc(r * 1.1, -r * 1.2, 3 + Math.random() * 2, 0, 6.283); ctx.fill();
    } else if (d.ammo === 'cluster') {
      ctx.fillStyle = '#7a4a86';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;
      ctx.fillStyle = '#d8a8f0';
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * 6.283;
        ctx.beginPath(); ctx.arc(Math.cos(a) * r * .42, Math.sin(a) * r * .42, r * .3, 0, 6.283); ctx.fill();
      }
    } else if (d.ammo === 'iron') {
      ctx.fillStyle = '#5c5f66';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = '#3b3e45'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, r * .55, 0, 6.283); ctx.stroke();
      ctx.fillStyle = '#9aa1ab';
      ctx.beginPath(); ctx.arc(-r * .32, -r * .32, r * .26, 0, 6.283); ctx.fill();
    } else {
      const g = ctx.createRadialGradient(-r * .35, -r * .35, r * .2, 0, 0, r);
      g.addColorStop(0, '#a4907f'); g.addColorStop(1, '#645247');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowOffsetY = 0;
      ctx.fillStyle = 'rgba(44,32,26,.5)';
      ctx.beginPath(); ctx.arc(r * .3, r * .2, r * .22, 0, 6.283); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(22,18,16,.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.stroke();
    ctx.restore();
  }

  /* ---------- your siege engine ---------- */

  function catapult(ctx, st) {
    const x = CATAPULT.x, y = CATAPULT.y;
    const f = st.faction;
    ctx.save();

    [[-34, -18], [30, -18]].forEach(([dx, dy]) => {
      ctx.fillStyle = '#5c4225';
      ctx.beginPath(); ctx.arc(x + dx, y + dy, 19, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#3c2b17'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x + dx, y + dy, 19, 0, 6.283); ctx.stroke();
      ctx.strokeStyle = '#7a5a33'; ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        const a = i * 0.785 + st.time * 0.4;
        ctx.beginPath();
        ctx.moveTo(x + dx - Math.cos(a) * 14, y + dy - Math.sin(a) * 14);
        ctx.lineTo(x + dx + Math.cos(a) * 14, y + dy + Math.sin(a) * 14);
        ctx.stroke();
      }
    });

    ctx.fillStyle = '#7d5a30';
    rr(ctx, x - 52, y - 46, 104, 22, 5); ctx.fill();
    ctx.strokeStyle = '#4c3519'; ctx.lineWidth = 2.5;
    rr(ctx, x - 52, y - 46, 104, 22, 5); ctx.stroke();

    // house colours along the chassis
    ctx.fillStyle = f.primary;
    ctx.fillRect(x - 48, y - 42, 96, 5);

    ctx.strokeStyle = '#8a6435'; ctx.lineWidth = 11; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 26, y - 42); ctx.lineTo(x + 2, y - 104);
    ctx.moveTo(x + 30, y - 42); ctx.lineTo(x + 2, y - 104);
    ctx.stroke();
    ctx.strokeStyle = '#4c3519'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 26, y - 42); ctx.lineTo(x + 2, y - 104);
    ctx.moveTo(x + 30, y - 42); ctx.lineTo(x + 2, y - 104);
    ctx.stroke();

    const px = x + 2, py = y - 104;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(st.armAngle);
    ctx.strokeStyle = '#9a7240'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 62); ctx.stroke();
    ctx.strokeStyle = '#5b4120'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 62); ctx.stroke();
    ctx.fillStyle = '#6b4c25';
    ctx.beginPath(); ctx.arc(0, 62, 8, 0, 6.283); ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#c9a35c';
    ctx.beginPath(); ctx.arc(px, py, 7, 0, 6.283); ctx.fill();

    // your banner, snapping in the thin Martian wind
    const bx = x - 62, by = y - 150;
    ctx.strokeStyle = '#6b512c'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, y - 40); ctx.stroke();
    ctx.fillStyle = f.primary;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + 46 + Math.sin(st.time * 2.4) * 5, by + 9 + Math.sin(st.time * 3) * 3);
    ctx.lineTo(bx + 42, by + 22);
    ctx.lineTo(bx, by + 30);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = f.trim;
    ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(f.crest, bx + 9, by + 15);
    ctx.restore();
  }

  /* ---------- aiming ---------- */

  function aim(ctx, st) {
    const o = st.launchPoint;
    ctx.save();
    ctx.strokeStyle = 'rgba(40,28,14,.85)';
    ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(CATAPULT.x - 22, CATAPULT.y - 96);
    ctx.lineTo(o.x, o.y);
    ctx.lineTo(CATAPULT.x + 26, CATAPULT.y - 96);
    ctx.stroke();

    // predicted arc — a hint, not the whole answer
    let vx = st.aimV.x, vy = st.aimV.y;
    let px = o.x, py = o.y;
    const g = 0.278, drag = 1 - 0.0012;
    for (let i = 0; i < 90; i++) {
      vy += g; vx *= drag; vy *= drag;
      px += vx; py += vy;
      if (i % 6 === 0) {
        const f = 1 - i / 90;
        ctx.globalAlpha = f * 0.75;
        ctx.fillStyle = '#ffe0a0';
        ctx.beginPath(); ctx.arc(px, py, 3.4 * f + 1.4, 0, 6.283); ctx.fill();
      }
      if (py > WORLD.groundY || px > WORLD.w) break;
    }
    ctx.globalAlpha = 1;

    const pw = 74, ph = 8;
    const bx = o.x - pw / 2, by = o.y + 34;
    ctx.fillStyle = 'rgba(10,8,10,.7)';
    rr(ctx, bx, by, pw, ph, 4); ctx.fill();
    const pcol = st.power > 0.85 ? '#ff7a4a' : st.power > 0.55 ? '#f0b73c' : '#9fd93a';
    ctx.fillStyle = pcol;
    rr(ctx, bx + 1, by + 1, (pw - 2) * st.power, ph - 2, 3); ctx.fill();
    ctx.restore();
  }

  /* ---------- effects ---------- */

  function particles(ctx, list) {
    for (const p of list) {
      const f = p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, f) * (p.alpha ?? 1);
      if (p.type === 'debris') {
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.8);
        ctx.restore();
      } else if (p.type === 'smoke') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - f * 0.7), 0, 6.283);
        ctx.fill();
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

  return { background, ground, platform, block, target, projectile, catapult, aim, particles, popups, rr };
})();
