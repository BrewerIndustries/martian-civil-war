/* Martian Civil War — destructible terrain.

   The terrain is a BITMASK, not a heightmap: one byte per world pixel saying
   solid or empty. A heightmap would be smaller and faster, but it can only
   describe a surface — it cannot represent a tunnel bored through a mountain,
   an overhang, or a cavern, which is the whole point of the battlefield here.

   Two representations are kept in sync:
     - `mask`   Uint8Array, the truth used for collision
     - `canvas` an offscreen canvas, the pixels used for drawing
   Carving clears a circle from both. */

const mulberry32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

class Terrain {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.mask = new Uint8Array(w * h);
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });
  }

  /* ---------- generation ---------- */

  // Height profiles for the battlefield. Each returns surface y for a given x
  // (smaller y is higher ground).
  static PROFILES = {
    // A single ridge between the two platforms: shoot over it, or dig through.
    ridge(x, w, base, rnd, amp) {
      const c = w * 0.5;
      const bell = Math.exp(-Math.pow((x - c) / (w * 0.15), 2));
      return base - bell * amp - Math.sin(x * 0.004) * 14;
    },
    // Two shoulders with a dip in the middle — long shots or bank shots.
    twin(x, w, base, rnd, amp) {
      const a = Math.exp(-Math.pow((x - w * 0.36) / (w * 0.1), 2));
      const b = Math.exp(-Math.pow((x - w * 0.66) / (w * 0.1), 2));
      return base - (a + b) * amp * 0.86 - Math.sin(x * 0.005) * 12;
    },
    // A gulf in the middle: nothing to tunnel, everything to clear.
    canyon(x, w, base, rnd, amp) {
      const c = w * 0.5;
      const gap = Math.exp(-Math.pow((x - c) / (w * 0.13), 2));
      return base - amp * 0.45 + gap * amp * 0.95;
    },
    // Stepped ground — cover at several heights.
    plateau(x, w, base, rnd, amp) {
      const steps = [0.3, 0.45, 0.58, 0.72];
      let y = base - amp * 0.2;
      steps.forEach((s, i) => { if (x > w * s) y -= amp * (i % 2 ? 0.14 : 0.22); });
      return y + Math.sin(x * 0.01) * 6;
    },
    // Thin towers: narrow gaps to thread, easy to topple through.
    spires(x, w, base, rnd, amp) {
      const t = Math.sin(x * 0.016) * Math.sin(x * 0.006 + 1.2);
      return base - amp * 0.28 - Math.max(0, t) * amp * 0.78;
    },
    // A wide bowl; both sides shoot uphill.
    crater(x, w, base, rnd, amp) {
      const c = w * 0.5;
      const d = Math.abs(x - c) / (w * 0.5);
      return base - amp * 0.62 * (1 - Math.pow(1 - d, 2));
    },
  };

  /* Build the battlefield. `flatten` lists x positions that need a level pad
     (the two platforms), so nobody spawns on a 40° slope. */
  generate({ profile = 'ridge', seed = 1, amplitude = 300, base = 780, flatten = [] } = {}) {
    const { w, h, mask } = this;
    const rnd = mulberry32(seed);
    const fn = Terrain.PROFILES[profile] || Terrain.PROFILES.ridge;

    // roughness layered on top of the profile
    const bumps = Array.from({ length: 6 }, () => ({
      f: 0.002 + rnd() * 0.02, a: 4 + rnd() * 16, p: rnd() * 6.283,
    }));

    const surface = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      let y = fn(x, w, base, rnd, amplitude);
      for (const b of bumps) y += Math.sin(x * b.f + b.p) * b.a;
      surface[x] = y;
    }

    // level pads so platforms sit flat and level
    for (const fx of flatten) {
      const pad = 46;
      const lo = Math.max(0, Math.round(fx - pad));
      const hi = Math.min(w - 1, Math.round(fx + pad));
      let sum = 0;
      for (let x = lo; x <= hi; x++) sum += surface[x];
      const level = sum / (hi - lo + 1);
      for (let x = lo; x <= hi; x++) {
        // ease the pad into the surrounding ground
        const d = Math.min(x - lo, hi - x) / pad;
        const blend = Math.min(1, d * 2.4);
        surface[x] = surface[x] * (1 - blend) + level * blend;
      }

      // Firing lane: nothing immediately beside a platform may stand taller
      // than its own pad. Without this a profile like `spires` can throw up a
      // tower right next to a gun and wall it in — no shot exists at any
      // angle, and the enemy gunner just lobs into its own doorstep.
      const lane = 150;
      const lo2 = Math.max(0, Math.round(fx - lane));
      const hi2 = Math.min(w - 1, Math.round(fx + lane));
      for (let x = lo2; x <= hi2; x++) {
        const t = Math.abs(x - fx) / lane;            // allow a rise further out
        const ceiling = level - 6 - t * t * 90;
        if (surface[x] < ceiling) surface[x] = ceiling;
      }
    }

    this.surface = surface;
    mask.fill(0);
    for (let x = 0; x < w; x++) {
      const top = Math.max(0, Math.min(h - 1, Math.round(surface[x])));
      for (let y = top; y < h; y++) mask[y * w + x] = 1;
    }

    this._paint(seed);
  }

  /* Paint the terrain pixels once. Carving punches holes in this canvas, so
     the strata below the crust show through as craters deepen. */
  _paint(seed) {
    const { ctx, w, h } = this;
    const rnd = mulberry32(seed ^ 0x9e37);
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    // clip to the solid region so strata only paint inside the ground
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x < w; x += 2) ctx.lineTo(x, this.surface[x]);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.clip();

    // Key the strata to the actual terrain, not to the canvas: spanning 0..h
    // buried every visible surface in the dark end of the ramp and the ground
    // read as a flat silhouette against the background ridges.
    let peak = h;
    for (let x = 0; x < w; x++) if (this.surface[x] < peak) peak = this.surface[x];
    const g = ctx.createLinearGradient(0, peak - 30, 0, h);
    g.addColorStop(0, '#b06a42');
    g.addColorStop(0.18, '#8f5330');
    g.addColorStop(0.45, '#6b3a21');
    g.addColorStop(0.75, '#4a2415');
    g.addColorStop(1, '#2b150d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // sediment bands, so a fresh crater reads as cut rock
    for (let i = 0; i < 26; i++) {
      const y = rnd() * h;
      ctx.fillStyle = `rgba(${140 + rnd() * 60 | 0},${70 + rnd() * 40 | 0},${40 + rnd() * 30 | 0},.16)`;
      ctx.fillRect(0, y, w, 4 + rnd() * 16);
    }
    // mineral speckle
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * w, y = rnd() * h;
      ctx.fillStyle = rnd() > 0.55 ? 'rgba(0,0,0,.22)' : 'rgba(206,132,86,.22)';
      ctx.fillRect(x, y, 1 + rnd() * 2.5, 1 + rnd() * 2.5);
    }
    ctx.restore();

    // dusty crust along the original surface
    ctx.save();
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#a8623c';
    ctx.beginPath();
    for (let x = 0; x < w; x += 2) x ? ctx.lineTo(x, this.surface[x]) : ctx.moveTo(x, this.surface[x]);
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#c07c50';
    ctx.stroke();
    ctx.restore();
  }

  /* ---------- queries ---------- */

  solidAt(x, y) {
    const xi = x | 0, yi = y | 0;
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return false;
    return this.mask[yi * this.w + xi] === 1;
  }

  // Highest solid pixel in a column — where something standing there rests.
  topAt(x, from = 0) {
    const xi = Math.max(0, Math.min(this.w - 1, x | 0));
    for (let y = Math.max(0, from | 0); y < this.h; y++) {
      if (this.mask[y * this.w + xi] === 1) return y;
    }
    return this.h;
  }

  // Is anything solid under this footprint within `depth` px?
  supported(x, y, halfWidth, depth = 3) {
    for (let dx = -halfWidth; dx <= halfWidth; dx += 2) {
      for (let d = 0; d <= depth; d++) if (this.solidAt(x + dx, y + d)) return true;
    }
    return false;
  }

  /* ---------- destruction ---------- */

  carve(cx, cy, r) {
    const { w, h, mask } = this;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
    const r2 = r * r;
    let removed = 0;
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= r2) {
          const i = y * w + x;
          if (mask[i]) { mask[i] = 0; removed++; }
        }
      }
    }
    if (!removed) return 0;

    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.fill();
    // scorch the rim: source-atop only paints where ground still exists
    ctx.globalCompositeOperation = 'source-atop';
    const ring = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.45);
    ring.addColorStop(0, 'rgba(20,10,6,.62)');
    ring.addColorStop(1, 'rgba(20,10,6,0)');
    ctx.fillStyle = ring;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.45, 0, 6.283); ctx.fill();
    ctx.restore();
    return removed;
  }

  draw(ctx) {
    ctx.drawImage(this.canvas, 0, 0);
  }
}
