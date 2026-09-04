/* Martian Civil War — artillery duel: simulation, input and rules.

   No rigid-body engine here. Shells are integrated by hand against a
   destructible bitmask, which is both faster and far more controllable than a
   physics library for this genre — and it is what lets a Rail Spike bore a
   tunnel through a ridge instead of merely bouncing off it. */

const G = 0.28;              // gravity, px per step^2
const MAX_SPEED = 21;        // px per step at full power
const WIND_ACCEL = 0.06;     // wind units -> px per step^2
const STEP = 1 / 60;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

class Game {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;

    this.terrain = new Terrain(WORLD.w, WORLD.h);
    this.time = 0;
    this.state = 'idle';       // idle | aim | flight | resolve | enemy | over
    this.paused = true;
    this.particles = [];
    this.popups = [];
    this.shells = [];
    this.shake = 0;
    this.faction = 'red';

    this.owned = [STARTING_WEAPON];
    this.weapon = STARTING_WEAPON;
    this.aimAngle = 42;        // degrees above horizontal
    this.aimPower = 0.7;       // 0..1
    this.fuel = PLATFORM.fuel;
    this.driveDir = 0;
    this.dragging = false;
    this.abilityUsed = false;
    this.lastCreak = 0;

    this._bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this._frame = this._frame.bind(this);
    requestAnimationFrame(this._frame);
  }

  setFaction(id) { if (FACTIONS[id]) this.faction = id; }
  get house() { return FACTIONS[this.faction]; }
  get enemyHouse() { return FACTIONS[otherFaction(this.faction)]; }

  setLoadout(owned) {
    this.owned = owned && owned.length ? owned.slice() : [STARTING_WEAPON];
    if (!this.owned.includes(this.weapon)) this.weapon = this.owned[0];
    this._emitHud();
  }

  selectWeapon(id) {
    if (!this.owned.includes(id) || this.state !== 'aim') return;
    this.weapon = id;
    Sfx.click();
    this._emitHud();
  }

  /* ---------- viewport ---------- */

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.dpr = dpr;
    this.viewW = w; this.viewH = h;
    this._frozen = false;            // a resize always needs one more paint
    this.scale = Math.min(w / WORLD.w, h / WORLD.h);
    this.offX = (w - WORLD.w * this.scale) / 2;
    this.offY = (h - WORLD.h * this.scale) / 2;
  }

  toWorld(sx, sy) {
    return { x: (sx - this.offX) / this.scale, y: (sy - this.offY) / this.scale };
  }

  /* ---------- battle lifecycle ---------- */

  load(index) {
    const spec = BATTLES[index];
    if (!spec) return;
    this.battleIndex = index;
    this.battle = spec;

    this.terrain.generate({
      profile: spec.profile, seed: spec.seed, amplitude: spec.amplitude,
      base: WORLD.baseY, flatten: [spec.playerX, spec.enemyX],
    });

    this.player = this._makePlatform(spec.playerX, this.faction, spec.playerHp, 1);
    this.foe = this._makePlatform(spec.enemyX, otherFaction(this.faction), spec.enemyHp, -1);

    this.shells.length = 0;
    this.particles.length = 0;
    this.popups.length = 0;
    this.score = 0;
    this.damageDealt = 0;
    this.turns = 0;
    this.shake = 0;
    this.abilityUsed = false;
    this.lastShooter = null;
    this.aimAngle = 42;
    this.aimPower = 0.7;
    this.fuel = PLATFORM.fuel;
    this.driveDir = 0;
    this.state = 'aim';
    this.paused = false;
    this._rollWind();
    this._emitHud();
    if (this.hooks.onLevel) this.hooks.onLevel(index, spec);
  }

  restart() { this.load(this.battleIndex); }

  _makePlatform(x, factionId, hp, facing) {
    return {
      x, y: this.terrain.topAt(x), facing,
      faction: FACTIONS[factionId], hp, maxHp: hp,
      recoil: 0, barrel: facing > 0 ? 42 : 138,
    };
  }

  _rollWind() {
    const max = this.battle ? this.battle.wind : 0;
    this.wind = (Math.random() * 2 - 1) * max;
  }

  /* ---------- input ---------- */

  _bindInput() {
    const c = this.canvas;
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return this.toWorld(p.clientX - r.left, p.clientY - r.top);
    };
    const down = (e) => {
      if (this.paused || this.state !== 'aim') return;
      e.preventDefault(); Sfx.unlock();
      this.dragging = true; this._drag(pos(e));
    };
    const move = (e) => { if (!this.dragging) return; e.preventDefault(); this._drag(pos(e)); };
    const up = (e) => {
      if (!this.dragging) return;
      e.preventDefault(); this.dragging = false;
      if (this.aimPower > 0.06) this.fire();
    };
    c.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    c.addEventListener('touchstart', down, { passive: false });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up, { passive: false });
  }

  // Drag back from the muzzle, catapult-style: direction sets angle, distance
  // sets power. Artillery players also want exact numbers, so the HUD shows
  // both and the arrow keys nudge them.
  _drag(p) {
    const o = this.muzzle(this.player);
    const dx = o.x - p.x, dy = o.y - p.y;
    const d = Math.hypot(dx, dy);
    this.aimPower = clamp(d / 150, 0, 1);
    if (d > 6) this.aimAngle = clamp(Math.atan2(dy, Math.abs(dx) || 1) * 180 / Math.PI, -10, 89);
    if (this.time - this.lastCreak > 0.07 && this.aimPower > 0.05) {
      this.lastCreak = this.time; Sfx.stretch(this.aimPower);
    }
    this._emitHud();
  }

  setDrive(dir) { this.driveDir = dir; }

  /* Drive the platform along the surface. Fuel is spent per pixel travelled
     and refills at the start of each of your turns, so repositioning is a
     per-turn decision rather than a resource you can hoard. The tracks can
     climb a step but not a wall, and driving off a ledge is allowed — the
     platform simply falls, and takes the landing damage like any other drop. */
  _drive() {
    const pl = this.player;
    if (!pl || pl.hp <= 0 || this.fuel <= 0 || !this.driveDir) return;
    const step = Math.min(PLATFORM.speed, this.fuel);
    const nx = clamp(pl.x + this.driveDir * step, 46, WORLD.w - 46);
    if (nx === pl.x) return;

    // a wall at head height is not climbable
    const ceiling = pl.y - PLATFORM.climb;
    if (this.terrain.solidAt(nx, ceiling)) return;

    const ny = this.terrain.topAt(nx, Math.max(0, ceiling));
    const moved = Math.abs(nx - pl.x);
    pl.x = nx;
    pl.y = ny;                       // falls are settled after the shot resolves
    this.fuel = Math.max(0, this.fuel - moved);

    if (Math.random() < 0.4) {
      this.particles.push({
        type: 'spark', x: pl.x - this.driveDir * 26, y: pl.y - 2,
        vx: -this.driveDir * (0.6 + Math.random()), vy: -Math.random() * 0.8,
        size: 2 + Math.random() * 3, color: '#a8623c',
        life: 0.35, maxLife: 0.35, grav: 0.05, drag: 0.94,
      });
    }
    this._emitHud();
  }

  nudge(dAngle, dPower) {
    if (this.state !== 'aim') return;
    this.aimAngle = clamp(this.aimAngle + dAngle, -10, 89);
    this.aimPower = clamp(this.aimPower + dPower, 0, 1);
    this._emitHud();
  }

  muzzle(pl, angle) {
    const deg = angle !== undefined ? angle : (pl === this.player ? this.aimAngle : pl.barrel);
    const a = deg * Math.PI / 180;
    return {
      x: pl.x + Math.cos(a) * 34 * pl.facing,
      y: pl.y - 20 - Math.sin(a) * 34,
    };
  }

  /* ---------- firing ---------- */

  fire(owner = this.player, angle = this.aimAngle, power = this.aimPower, weaponId = this.weapon) {
    if (this.state !== 'aim' && owner === this.player) return;
    const w = WEAPONS[weaponId];
    const o = this.muzzle(owner, angle);

    // An additive mount puts several shells up on one trigger pull: `spread`
    // fans them by angle, `stagger` varies their charge so they walk out to
    // different ranges rather than landing on top of one another.
    const salvo = w.salvo;
    const count = salvo ? salvo.count : 1;
    for (let k = 0; k < count; k++) {
      const t = count === 1 ? 0 : (k / (count - 1)) * 2 - 1;   // -1 .. 1
      const ang = (angle + t * (salvo ? salvo.spread : 0)) * Math.PI / 180;
      const pw = clamp(power + t * (salvo ? salvo.stagger : 0), 0.05, 1);
      const speed = pw * MAX_SPEED * w.speed;
      this.shells.push({
        x: o.x, y: o.y,
        vx: Math.cos(ang) * speed * owner.facing,
        vy: -Math.sin(ang) * speed,
        weapon: weaponId, owner,
        bore: w.penetrate || 0, trail: [], life: 0, travelled: 0,
        shard: count > 1,
        // Bursting exactly at the crest leaves the shards no time to diverge —
        // measured a 49px spread, which reads as a single crater. Fire it part
        // way up the climb instead, where the fan still has flight left to open.
        burstAt: w.autoAbility
          ? Math.max(4, Math.round(0.6 * (Math.abs(Math.sin(ang) * speed) / (G * (w.gravityScale ?? 1)))))
          : 0,
        age: 0,
      });
    }

    owner.recoil = 1;
    this.lastShooter = owner;
    this.abilityUsed = false;
    this.state = 'flight';
    this.shake = Math.min(this.shake + 5, 14);
    Sfx.launch();
    this._puff(o.x, o.y, 12, '#e8c9a0');
    this._emitHud();
  }

  useAbility() {
    if (this.state !== 'flight' || this.abilityUsed) return;
    const mine = this.shells.filter((sh) => sh.owner === this.player);
    if (!mine.length) return;
    const w = WEAPONS[mine[0].weapon];
    if (!w.ability) return;
    this.abilityUsed = true;
    // a salvo triggers as one — every shell in the air answers the button
    for (const s of mine) this._triggerAbility(s, w);
    this._emitHud();
  }

  _triggerAbility(s, w) {

    if (w.ability === 'detonate' || w.ability === 'implode') {
      this._impact(s, s.x, s.y);
      this.shells = this.shells.filter((x) => x !== s);
    } else if (w.ability === 'split') {
      // Fan the shards by rotating the velocity, not by nudging vy. Scaling
      // the vector barely diverged them: all three landed inside ~100px and
      // piled into what looked like a single crater, so splitting appeared to
      // do nothing at all. A real angular fan spreads the craters out.
      this.shells = this.shells.filter((x) => x !== s);
      const heading = Math.atan2(s.vy, s.vx);
      const speed = Math.hypot(s.vx, s.vy);

      /* Spread is driven by SPEED, not angle. Range goes as v², so a speed
         differential spreads the shards smoothly and proportionally at any
         launch angle. Perturbing the angle as well made it wildly erratic —
         measured anywhere from 28px to 621px across the angle range, because
         the two effects interact nonlinearly and then meet uneven ground. The
         small angular fan that remains is for show: it separates the shards
         visibly in the air without driving where they land. */
      const fan = (w.splitFan || 13) * Math.PI / 180;
      const spd = w.splitSpeed || 0.07;
      for (let i = -1; i <= 1; i++) {
        const a = heading + i * fan;
        const v = speed * (1 - i * spd);   // note the sign: rotating a shard
        // flatter already shortens its range, so the slower shard must be the
        // flatter one or the two effects cancel and nothing spreads
        this.shells.push({
          x: s.x, y: s.y,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          weapon: s.weapon, owner: s.owner, bore: 0, trail: [], life: 0,
          travelled: s.travelled || 0, shard: true, burst: true,
        });
      }
      this._burst(s.x, s.y, WEAPONS[s.weapon].tracer);
      Sfx.click();
    } else if (w.ability === 'dive') {
      const len = Math.hypot(s.vx, s.vy) || 1;
      s.vx = (s.vx / len) * 34; s.vy = (s.vy / len) * 34 + 2;
      this._puff(s.x, s.y, 14, '#ffd166');
      Sfx.launch();
    } else if (w.ability === 'seek') {
      const t = s.owner === this.player ? this.foe : this.player;
      const dx = t.x - s.x, dy = (t.y - 18) - s.y;
      const len = Math.hypot(dx, dy) || 1;
      const sp = Math.max(14, Math.hypot(s.vx, s.vy));
      s.vx = (dx / len) * sp; s.vy = (dy / len) * sp;
      s.homing = true;
      this._puff(s.x, s.y, 14, '#8fd0ff');
      Sfx.click();
    }
  }

  /* ---------- ballistics ----------
     One integrator, used for live flight, the aim preview and the enemy
     gunner's search, so what the AI predicts is what actually happens. */

  _advance(s, mutate) {
    const w = WEAPONS[s.weapon];
    // gravityScale 0 means a dead-straight beam; windScale 0 means the gale
    // has no purchase on it. This is what separates an Ion Lance from a shell.
    s.vy += G * (w.gravityScale ?? 1);
    s.vx += this.wind * WIND_ACCEL * (w.windScale ?? 1);
    const d = 1 - (w.drag || 0);
    s.vx *= d; s.vy *= d;
    if (s.homing) {
      const t = s.owner === this.player ? this.foe : this.player;
      const dx = t.x - s.x, dy = (t.y - 18) - s.y;
      const len = Math.hypot(dx, dy) || 1;
      s.vx += (dx / len) * 0.9; s.vy += (dy / len) * 0.9;
    }

    // Sub-step so a fast shell cannot tunnel through thin ground by accident.
    const dist = Math.hypot(s.vx, s.vy);
    const n = Math.max(1, Math.ceil(dist / 2));
    for (let i = 0; i < n; i++) {
      s.x += s.vx / n; s.y += s.vy / n;
      s.travelled = (s.travelled || 0) + dist / n;
      // an energy weapon dissipates rather than flying forever
      if (w.range && s.travelled > w.range) return { type: 'spent' };
      if (s.x < -300 || s.x > WORLD.w + 300 || s.y > WORLD.h + 400) return { type: 'out' };

      for (const pl of [this.player, this.foe]) {
        if (!pl || pl.hp <= 0) continue;
        if (pl === s.owner && s.life < 6) continue;      // don't hit your own muzzle
        if (Math.abs(s.x - pl.x) < PLATFORM.w / 2 && s.y > pl.y - PLATFORM.h && s.y < pl.y + 8) {
          return { type: 'platform', platform: pl };
        }
      }

      if (s.y > 0 && this.terrain.solidAt(s.x, s.y)) {
        if (s.bore > 0) {                                 // Rail Spike keeps going
          s.bore -= dist / n;
          if (mutate) this.terrain.carve(s.x, s.y, WEAPONS[s.weapon].r + 6);
          s.vx *= 0.985; s.vy *= 0.985;
          if (s.bore <= 0) return { type: 'terrain' };
          continue;
        }
        return { type: 'terrain' };
      }
    }
    s.life++;
    return null;
  }

  /* Trace a shot without touching the world. Used by the aim preview and the
     enemy gunner. Terrain is read-only here, so boring is approximated by
     passing through. */
  trace(owner, angle, power, weaponId, maxSteps = 420) {
    const w = WEAPONS[weaponId];
    const a = angle * Math.PI / 180;
    const speed = power * MAX_SPEED * w.speed;
    const o = this.muzzle(owner, angle);
    const ghost = {
      x: o.x, y: o.y,
      vx: Math.cos(a) * speed * owner.facing, vy: -Math.sin(a) * speed,
      weapon: weaponId, owner, bore: w.penetrate || 0, life: 0,
    };
    const path = [];
    for (let i = 0; i < maxSteps; i++) {
      const hit = this._advance(ghost, false);
      if (i % 3 === 0) path.push({ x: ghost.x, y: ghost.y });
      if (hit) return { hit, x: ghost.x, y: ghost.y, steps: i, path };
    }
    return { hit: { type: 'timeout' }, x: ghost.x, y: ghost.y, steps: maxSteps, path };
  }

  /* The aim preview: the real predicted arc, but cut at the APEX.

     It runs through the same `_advance` as live shells and the enemy gunner,
     so the curve drawn is exactly the curve the shell will fly — including
     wind and this mount's drag. Stopping at the top of the arc is the point:
     you get honest feedback on the shape and reach of a shot without being
     handed the impact point, so ranging the enemy in is still yours to do.

     If the arc meets ground before the apex, it stops there instead and says
     so — that is the "over the ridge or through it?" question, answered. */
  aimPreview(angleOverride, powerOverride) {
    const pl = this.player;
    if (!pl || pl.hp <= 0) return null;
    const w = WEAPONS[this.weapon];
    const angle = angleOverride === undefined ? this.aimAngle : angleOverride;
    const power = clamp(powerOverride === undefined ? this.aimPower : powerOverride, 0.02, 1);
    const a = angle * Math.PI / 180;
    const speed = power * MAX_SPEED * w.speed;
    const o = this.muzzle(pl, this.aimAngle);

    const ghost = {
      x: o.x, y: o.y,
      vx: Math.cos(a) * speed * pl.facing, vy: -Math.sin(a) * speed,
      weapon: this.weapon, owner: pl, bore: w.penetrate || 0, life: 0, travelled: 0,
    };

    /* A direct-fire beam has no apex to stop at, and hiding its path would be
       pointless — line of sight IS its whole character, so draw the lot out to
       where it dissipates. An arcing shell stops at the crest, which gives
       honest feedback on shape and reach without handing over the impact
       point. A flat or depressed arcing shot has no useful crest either, so it
       gets a short lead-out instead of its whole descending flight. */
    const noArc = (w.gravityScale ?? 1) === 0;
    const cap = noArc ? 220 : (ghost.vy < 0 ? 130 : 26);

    const pts = [{ x: ghost.x, y: ghost.y }];
    let reason = 'cap';
    for (let i = 0; i < cap; i++) {
      const rising = ghost.vy < 0;
      const hit = this._advance(ghost, false);
      pts.push({ x: ghost.x, y: ghost.y });
      if (hit) {
        reason = hit.type === 'spent' ? 'spent' : hit.type === 'out' ? 'cap' : 'blocked';
        break;
      }
      if (!noArc && rising && ghost.vy >= 0) { reason = 'apex'; break; }
    }

    const tip = pts[pts.length - 1];
    return {
      points: pts, tip, reason,
      blocked: reason === 'blocked',
      groundY: this.terrain.topAt(tip.x, tip.y),
    };
  }

  /* ---------- impact ---------- */

  _impact(s, x, y, hitPlatform = null) {
    const w = WEAPONS[s.weapon];
    const dig = w.dig * (s.shard ? 0.7 : 1);
    const blast = w.blast * (s.shard ? 0.7 : 1);

    if (w.ability === 'implode') {
      // Drag the landscape inward first, then take the whole well out.
      for (let i = 0; i < 28; i++) {
        const a = Math.random() * 6.283, r = 40 + Math.random() * blast;
        this.particles.push({
          type: 'spark', x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
          vx: -Math.cos(a) * (4 + Math.random() * 6), vy: -Math.sin(a) * (4 + Math.random() * 6),
          size: 3 + Math.random() * 5, color: '#c9a0ff',
          life: 0.5, maxLife: 0.5, grav: 0, drag: 0.99,
        });
      }
    }

    this.terrain.carve(x, y, dig);
    Sfx.boom();
    this.shake = Math.min(this.shake + 12 + blast * 0.08, 34);
    this._puff(x, y, 30, '#ffb04a', 1.3);
    this._debris(x, y, '#8a4a2e', 22, dig * 0.8);
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * 6.283, sp = 2 + Math.random() * 6;
      this.particles.push({
        type: 'smoke', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.4,
        size: 10 + Math.random() * 20, color: 'rgba(74,58,48,.5)',
        life: 0.8 + Math.random() * 0.6, maxLife: 1.4, grav: -0.02, drag: 0.94,
      });
    }

    // Splash damage: full at the centre, tapering to nothing at blast radius.
    for (const pl of [this.player, this.foe]) {
      if (!pl || pl.hp <= 0) continue;
      const d = Math.hypot(pl.x - x, (pl.y - PLATFORM.h / 2) - y);
      if (d > blast && pl !== hitPlatform) continue;
      const falloff = pl === hitPlatform ? 1 : clamp(1 - d / blast, 0, 1);
      const dmg = Math.round(w.damage * (0.35 + 0.65 * falloff));
      if (dmg > 0) this._damage(pl, dmg, s.owner);
    }
  }

  _damage(pl, amount, source) {
    pl.hp = Math.max(0, pl.hp - amount);
    const hostile = pl !== source;
    this.popups.push({
      x: pl.x, y: pl.y - 46, text: `-${amount}`,
      color: pl === this.player ? '#ff8a6a' : '#ffd469',
      life: 1.1, maxLife: 1.1, vy: -0.9,
    });
    if (pl === this.foe) {
      this.damageDealt += amount;
      this.score += amount * 80;
    }
    Sfx.guardDown();
    this._debris(pl.x, pl.y - 14, pl.faction.primary, 14, 30);
    if (pl.hp <= 0) this._wreck(pl);
    this._emitHud();
  }

  _wreck(pl) {
    this._puff(pl.x, pl.y - 16, 30, '#ffb04a', 1.6);
    this._debris(pl.x, pl.y - 16, pl.faction.primary, 30, 60);
    this.shake = Math.min(this.shake + 26, 36);
  }

  // Ground shot out from under a platform drops it, and the landing hurts.
  _settlePlatforms() {
    for (const pl of [this.player, this.foe]) {
      if (!pl || pl.hp <= 0) continue;
      let fell = 0;
      while (pl.y < WORLD.h - 2 && !this.terrain.supported(pl.x, pl.y, PLATFORM.w / 2 - 6, 3)) {
        pl.y += 2; fell += 2;
        if (fell > 460) break;
      }
      if (fell > 26) {
        const dmg = Math.min(38, Math.round(fell / 14));
        this.popups.push({ x: pl.x, y: pl.y - 60, text: 'FELL', color: '#ffb04a', life: 1, maxLife: 1, vy: -0.8 });
        this._damage(pl, dmg, null);
        Sfx.thud(1);
        this._puff(pl.x, pl.y, 16, '#a8623c');
      }
    }
  }

  /* ---------- the enemy gunner ---------- */

  /* On broken ground the set of shots that actually reach you can be a needle
     — a narrow band of high angle and near-maximum charge. A coarse grid finds
     that band only by luck, which made skill meaningless on some maps. So the
     gunner searches coarse, refines around its best few, and only THEN degrades
     the solution by its skill. A poor gunner is a good gunner with shaky
     hands: its shots land near you and miss, rather than landing nowhere. */
  _enemyShot() {
    const skill = this.battle.skill;
    const weaponId = this._enemyWeapon();
    const aimX = this.player.x, aimY = this.player.y - 14;
    const err = (ang, pw) => {
      const r = this.trace(this.foe, ang, pw, weaponId, 600);
      return Math.hypot(r.x - aimX, r.y - aimY);
    };

    let coarse = [];
    for (let ang = 12; ang <= 86; ang += 2.5) {
      for (let pw = 0.3; pw <= 1.001; pw += 0.05) coarse.push({ ang, pw, e: err(ang, pw) });
    }
    coarse.sort((a, b) => a.e - b.e);

    let best = coarse[0];
    for (const seed of coarse.slice(0, 5)) {
      for (let da = -2.5; da <= 2.5; da += 0.5) {
        for (let dp = -0.05; dp <= 0.05; dp += 0.0125) {
          const ang = clamp(seed.ang + da, 5, 88);
          const pw = clamp(seed.pw + dp, 0.2, 1);
          const e = err(ang, pw);
          if (e < best.e) best = { ang, pw, e };
        }
      }
    }

    const slop = 1 - skill;
    return {
      weaponId,
      angle: clamp(best.ang + (Math.random() * 2 - 1) * slop * 9, 5, 88),
      power: clamp(best.pw + (Math.random() * 2 - 1) * slop * 0.12, 0.2, 1),
    };
  }

  // The enemy fields heavier mounts as the campaign goes on.
  _enemyWeapon() {
    const tier = this.battleIndex;
    const pool = ['laser'];
    if (tier >= 3) pool.push('scatter');
    if (tier >= 6) pool.push('fusion');
    if (tier >= 9) pool.push('fusion', 'rail');
    if (tier >= 11) pool.push('seeker');
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* ---------- turn machine ---------- */

  step(now = performance.now()) {
    if (this.state === 'aim') this._drive();

    if (this.state === 'flight') {
      for (const s of this.shells.slice()) {
        s.trail.push({ x: s.x, y: s.y });
        if (s.trail.length > 40) s.trail.shift();

        /* A mount whose whole identity is its mid-flight trick is
           indistinguishable from a dud if the player never discovers Space.
           So it fires itself at the crest of the arc if untriggered — Space
           still bursts it early, which is how you actually aim the spread. */
        const wpn = WEAPONS[s.weapon];
        const owner = s.owner;
        s.age = (s.age || 0) + 1;
        const dueToBurst = wpn.autoAbility && !s.burst && !s.shard &&
                           s.burstAt && s.age >= s.burstAt;
        const hit = this._advance(s, true);
        if (dueToBurst && this.shells.includes(s)) {
          s.burst = true;
          if (owner === this.player) this.abilityUsed = true;
          this._triggerAbility(s, wpn);
          this._emitHud();
          continue;
        }
        if (hit) {
          this.shells = this.shells.filter((x) => x !== s);
          if (hit.type === 'spent') {
            this._puff(s.x, s.y, 10, WEAPONS[s.weapon].tracer, 0.7);
          } else if (hit.type !== 'out') {
            this._impact(s, s.x, s.y, hit.platform || null);
          }
        }
      }
      if (!this.shells.length) {
        this.state = 'resolve';
        this.resolveAt = now + 620;
        this._settlePlatforms();
      }
      return;
    }

    if (this.state === 'resolve' && now >= this.resolveAt) {
      if (this.foe.hp <= 0) return this._finish(true);
      if (this.player.hp <= 0) return this._finish(false);
      if (this.lastShooter === this.player) {
        this.state = 'enemy';
        this.enemyAt = now + 700;                 // a beat, so the turn reads
      } else {
        this.turns++;
        this._rollWind();
        this.fuel = PLATFORM.fuel;
        this.state = 'aim';
      }
      this._emitHud();
      return;
    }

    if (this.state === 'enemy' && now >= this.enemyAt) {
      const shot = this._enemyShot();
      this.foe.barrel = shot.angle;
      this.fire(this.foe, shot.angle, shot.power, shot.weaponId);
      return;
    }
  }

  _finish(won) {
    if (this.state === 'over') return;
    this.state = 'over';
    const hpLeft = Math.max(0, this.player.hp);
    const hpBonus = won ? hpLeft * 120 : 0;
    const winBonus = won ? 4000 : 0;
    const speedBonus = won ? Math.max(0, 12 - this.turns) * 500 : 0;
    const damage = this.score;
    this.score += hpBonus + winBonus + speedBonus;

    let stars = 0;
    if (won) {
      const frac = hpLeft / this.player.maxHp;
      stars = frac >= 0.7 ? 3 : frac >= 0.35 ? 2 : 1;
    }
    setTimeout(() => (won ? Sfx.win() : Sfx.lose()), 260);
    this._emitHud();
    if (this.hooks.onResult) {
      this.hooks.onResult({
        won, stars, damage, hpBonus, winBonus, speedBonus,
        hpLeft, turns: this.turns, total: this.score, level: this.battleIndex,
      });
    }
  }

  _emitHud() {
    if (!this.hooks.onHud) return;
    this.hooks.onHud({
      level: this.battleIndex,
      name: this.battle ? this.battle.name : '',
      score: this.score,
      state: this.state,
      fuel: this.fuel,
      maxFuel: PLATFORM.fuel,
      owned: this.owned,
      weapon: this.weapon,
      angle: this.aimAngle,
      power: this.aimPower,
      wind: this.wind,
      turns: this.turns,
      player: this.player ? { hp: this.player.hp, max: this.player.maxHp } : null,
      foe: this.foe ? { hp: this.foe.hp, max: this.foe.maxHp } : null,
      canAbility: this.state === 'flight' && !this.abilityUsed &&
        this.shells.some((s) => s.owner === this.player) && !!WEAPONS[this.weapon].ability,
    });
  }

  /* ---------- effects ---------- */

  _debris(x, y, color, count, spread = 30) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.283, s = 2 + Math.random() * 8;
      this.particles.push({
        type: 'debris', x: x + (Math.random() - .5) * spread, y: y + (Math.random() - .5) * spread,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 3,
        size: 3 + Math.random() * 7, color, rot: Math.random() * 6.283, vr: (Math.random() - .5) * 0.4,
        life: 0.9 + Math.random(), maxLife: 1.9, grav: 0.34, drag: 0.995, land: true,
      });
    }
  }

  // An expanding shock ring plus a shower of sparks, so a mid-air split reads
  // as an event rather than a shell quietly becoming three shells.
  _burst(x, y, color) {
    this.particles.push({
      type: 'ring', x, y, vx: 0, vy: 0, size: 8, grow: 4.4,
      color, life: 0.45, maxLife: 0.45, grav: 0, drag: 1,
    });
    this.particles.push({
      type: 'ring', x, y, vx: 0, vy: 0, size: 4, grow: 2.6,
      color: '#ffffff', life: 0.3, maxLife: 0.3, grav: 0, drag: 1,
    });
    this._puff(x, y, 26, color, 1.5);
    this.shake = Math.min(this.shake + 6, 34);
  }

  _puff(x, y, count, color, scale = 1) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.283, s = 1 + Math.random() * 4 * scale;
      this.particles.push({
        type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        size: (3 + Math.random() * 6) * scale, color,
        life: 0.35 + Math.random() * 0.5, maxLife: 0.85, grav: 0.06, drag: 0.93,
      });
    }
  }

  _stepEffects(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy += (p.grav ?? 0.2);
      p.vx *= (p.drag ?? 0.99); p.vy *= (p.drag ?? 0.99);
      p.x += p.vx; p.y += p.vy;
      if (p.rot !== undefined) p.rot += p.vr;
      if (p.land && this.terrain.solidAt(p.x, p.y)) { p.vy *= -0.3; p.vx *= 0.7; p.y -= 2; }
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt; p.y += p.vy; p.vy *= 0.97;
      if (p.life <= 0) this.popups.splice(i, 1);
    }
    this.shake *= 0.88;
    for (const pl of [this.player, this.foe]) if (pl) pl.recoil *= 0.88;
  }

  devStep(n = 120) {
    for (let i = 0; i < n && this.state !== 'over'; i++) this.step(performance.now() + i * 16);
    return { state: this.state, player: this.player.hp, foe: this.foe.hp };
  }

  /* ---------- loop ---------- */

  _frame(now) {
    requestAnimationFrame(this._frame);
    const dt = Math.min(0.05, (now - (this.lastNow || now)) / 1000);
    this.lastNow = now;
    this.time += dt;

    if (!this.paused && this.battle) {
      this.acc = (this.acc || 0) + dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 5) { this.step(now); this.acc -= STEP; steps++; }
      if (this.acc > STEP * 5) this.acc = 0;
    }

    /* Overlays sit on a backdrop-filter blur. Re-blurring a canvas that is
       still animating underneath makes the panel shimmer and flash on every
       frame, which is what you see between battles and while a menu is open.
       Once an overlay is up we paint one last frame and then hold perfectly
       still, so the blur has a static backdrop to work against. */
    if (this.paused) {
      if (this._frozen) return;
      this._frozen = true;
    } else {
      this._frozen = false;
    }

    this._stepEffects(dt);
    this._draw();
  }

  _draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.viewW, this.viewH);
    ctx.fillStyle = '#150b08';
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    const sx = (Math.random() - .5) * this.shake;
    const sy = (Math.random() - .5) * this.shake;

    ctx.save();
    ctx.translate(this.offX + sx, this.offY + sy);
    ctx.scale(this.scale, this.scale);
    ctx.beginPath();
    ctx.rect(-this.offX / this.scale, -this.offY / this.scale,
             this.viewW / this.scale, this.viewH / this.scale);
    ctx.clip();

    R.background(ctx, this.time);
    if (this.battle) {
      this.terrain.draw(ctx);
      R.platform(ctx, this.foe, this, false);
      R.platform(ctx, this.player, this, true);
      if (this.state === 'aim') R.aim(ctx, this);
      for (const s of this.shells) R.shell(ctx, s);
      if (this.state === 'flight') R.abilityPrompt(ctx, this, this.time);
    }
    R.particles(ctx, this.particles);
    R.popups(ctx, this.popups);
    ctx.restore();
  }
}
