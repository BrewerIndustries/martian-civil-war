/* Martian Civil War — artillery duel: simulation, input and rules.

   No rigid-body engine here. Shells are integrated by hand against a
   destructible bitmask, which is both faster and far more controllable than a
   physics library for this genre — and it is what lets a Rail Spike bore a
   tunnel through a ridge instead of merely bouncing off it. */

const G = 0.28;              // gravity, px per step^2
const MAX_SPEED = 21;        // px per step at full power
const WIND_ACCEL = 0.06;     // wind units -> px per step^2
const STEP = 1 / 60;

/* The notional mount the fire-control system ranges against: charge on the
   HUD means "this far", and every real mount trims itself to match it. */
const FIRE_CONTROL_STANDARD = { speed: 1, gravityScale: 1, drag: 0.0008, windScale: 1 };

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
    this.modules = [];
    this.mods = this._rollUpModules();
    this.armed = [STARTING_WEAPON];
    /* Each armed mount carries its own firing solution. A turn is: arm the
       volley, lay each gun in turn, then fire everything at once — so the
       platform can dig with one mount and go for the hull with another in the
       same breath. */
    this.solutions = {};
    this.aimIndex = 0;
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

  _sol(id) {
    if (!this.solutions[id]) this.solutions[id] = { angle: 42, power: 0.7 };
    return this.solutions[id];
  }
  get currentMount() {
    if (!this.armed || !this.armed.length) return this.owned ? this.owned[0] : STARTING_WEAPON;
    return this.armed[Math.min(this.aimIndex, this.armed.length - 1)];
  }
  get aimAngle() { return this._sol(this.currentMount).angle; }
  set aimAngle(v) { this._sol(this.currentMount).angle = v; }
  get aimPower() { return this._sol(this.currentMount).power; }
  set aimPower(v) { this._sol(this.currentMount).power = v; }

  // Lay the next gun; past the last one, the whole volley goes.
  nextMount() {
    if (this.state !== 'aim') return;
    if (this.aimIndex >= this.armed.length - 1) { this.fireAll(); return; }
    this.aimIndex++;
    Sfx.click();
    this._emitHud();
  }
  cycleMount(dir) {
    if (this.state !== 'aim' || !this.armed.length) return;
    this.aimIndex = (this.aimIndex + dir + this.armed.length) % this.armed.length;
    Sfx.click();
    this._emitHud();
  }
  aimMount(id) {
    const i = this.armed.indexOf(id);
    if (i < 0 || this.state !== 'aim') return;
    this.aimIndex = i;
    this._emitHud();
  }

  // Called by the UI when the arming panel is dismissed.
  beginAiming() {
    if (this.state !== 'arming') return;
    this.aimIndex = 0;
    this.state = 'aim';
    this._emitHud();
  }

  fireAll() {
    if (this.state !== 'aim' || !this.armed.length) return;
    for (const id of this.armed) {
      const sol = this._sol(id);
      this._launch(this.player, sol.angle, sol.power, id);
    }
    this.player.recoil = 1;
    this.lastShooter = this.player;
    this.abilityUsed = false;
    this.state = 'flight';
    this.shake = Math.min(this.shake + 4 + this.armed.length * 1.6, 22);
    Sfx.launch();
    const o = this.muzzle(this.player, this.aimAngle);
    this._puff(o.x, o.y, 10 + this.armed.length * 3, '#e8c9a0');
    this._emitHud();
  }

  setFaction(id) { if (FACTIONS[id]) this.faction = id; }
  get house() { return FACTIONS[this.faction]; }
  get enemyHouse() { return FACTIONS[otherFaction(this.faction)]; }

  setLoadout(owned) {
    // Ordered so the broadside always launches in the same sequence.
    const list = owned && owned.length ? owned.slice() : [STARTING_WEAPON];
    this.owned = weaponList().filter((w) => list.includes(w));
    if (!this.owned.length) this.owned = [STARTING_WEAPON];
    this._refitArmed();
    this._emitHud();
  }

  /* ---------- the firing budget ----------
     You own every mount you have bought, but the platform can only power so
     many in one volley. Arming is therefore a per-turn decision — breadth of
     arsenal buys options, not raw output. */

  get firepower() { return PLATFORM.firepower + this.mods.firepower; }
  get armedLoad() {
    return this.armed.reduce((n, id) => n + (WEAPONS[id] ? WEAPONS[id].firepower : 0), 0);
  }
  canArm(id) {
    const w = WEAPONS[id];
    return !!w && this.owned.includes(id) &&
           this.armedLoad + w.firepower <= this.firepower;
  }

  toggleMount(id) {
    // The panel runs in 'arming'; mounts can also be swapped while laying.
    if ((this.state !== 'arming' && this.state !== 'aim') || !this.owned.includes(id)) return;
    if (this.armed.includes(id)) {
      this.armed = this.armed.filter((w) => w !== id);
      Sfx.click();
    } else if (this.canArm(id)) {
      this.armed = weaponList().filter((w) => this.armed.includes(w) || w === id);
      Sfx.click();
    } else {
      Sfx.thud(0.4);          // over budget — nothing to arm it with
      return;
    }
    this._emitHud();
  }

  // Drop anything no longer affordable or no longer owned, then top up with
  // whatever else fits, so the player is never left with an empty rack.
  _refitArmed() {
    const keep = [];
    let load = 0;
    for (const id of weaponList()) {
      if (!this.owned.includes(id) || !this.armed.includes(id)) continue;
      const w = WEAPONS[id];
      if (load + w.firepower <= this.firepower) { keep.push(id); load += w.firepower; }
    }
    if (!keep.length) {
      for (const id of weaponList()) {
        if (!this.owned.includes(id)) continue;
        const w = WEAPONS[id];
        if (load + w.firepower <= this.firepower) { keep.push(id); load += w.firepower; }
      }
    }
    this.armed = keep;
  }

  selectWeapon(id) { this.toggleMount(id); }

  setModules(ids) {
    this.modules = (ids || []).filter((m) => MODULES[m]);
    this.mods = this._rollUpModules();
    this._refitArmed();
    if (this.player) {
      // refit mid-campaign: keep damage taken, raise the ceiling
      const taken = this.player.maxHp - this.player.hp;
      this.player.maxHp = this.battle.playerHp + this.mods.hull;
      this.player.hp = Math.max(1, this.player.maxHp - taken);
    }
    this._emitHud();
  }

  _rollUpModules() {
    const m = { hull: 0, damageReduce: 0, splashReduce: 0, regen: 0,
                fuel: 0, climb: 0, driveSpeed: 0, fallReduce: 0, firepower: 0,
                windResist: 0, impactMarker: false, fullArc: false };
    for (const id of this.modules || []) {
      const mod = MODULES[id];
      if (!mod) continue;
      for (const k of Object.keys(m)) {
        if (!mod[k]) continue;
        if (typeof m[k] === 'boolean') m[k] = true; else m[k] += mod[k];
      }
    }
    // fractions stack additively but must never reach total immunity
    m.damageReduce = Math.min(0.6, m.damageReduce);
    m.splashReduce = Math.min(0.75, m.splashReduce);
    m.fallReduce = Math.min(0.85, m.fallReduce);
    m.windResist = Math.min(0.85, m.windResist);
    return m;
  }

  get maxFuel() { return PLATFORM.fuel + this.mods.fuel; }

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

    this.foeMounts = (spec.enemyMounts || ['laser']).slice();
    this._refitArmed();
    this.player = this._makePlatform(spec.playerX, this.faction, spec.playerHp + this.mods.hull, 1);
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
    this.fuel = this.maxFuel;
    this.driveDir = 0;
    this.state = 'arming';
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
    const step = Math.min(PLATFORM.speed + this.mods.driveSpeed, this.fuel);
    const nx = clamp(pl.x + this.driveDir * step, 46, WORLD.w - 46);
    if (nx === pl.x) return;

    // a wall at head height is not climbable
    const ceiling = pl.y - (PLATFORM.climb + this.mods.climb);
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
    // Guns sit up the face of the building, not on a turret at ground level.
    return {
      x: pl.x + (40 + Math.cos(a) * 22) * pl.facing,
      y: pl.y - 74 - Math.sin(a) * 22,
    };
  }

  /* ---------- firing ---------- */

  /* A turn is a broadside, not a shot. Every mount on the platform fires on
     the same firing solution — and because each flies differently (a lance is
     dead straight, a mortar lobs, a rail spike shoots flat) the same solution
     scatters them across the target. That is the point of a rolling fortress:
     you do not snipe, you saturate. Early on, with one mount, it is a precise
     duel; a full arsenal turns it into a barrage. */
  fire(owner = this.foe, angle = 42, power = 0.7, mounts = null) {
    if (owner === this.player) return this.fireAll();
    const roster = mounts || this.rosterFor(owner);
    if (!roster.length) return;

    for (const id of roster) this._launch(owner, angle, power, id);

    owner.recoil = 1;
    this.lastShooter = owner;
    this.abilityUsed = false;
    this.state = 'flight';
    this.shake = Math.min(this.shake + 4 + roster.length * 1.6, 20);
    Sfx.launch();
    const o = this.muzzle(owner, angle);
    this._puff(o.x, o.y, 10 + roster.length * 3, '#e8c9a0');
    this._emitHud();
  }

  /* Fire control. Every mount fires on one firing solution, but each flies
     differently — so without this, adding mounts to a volley just scattered
     more of it into the dirt, and a lone accurate gun beat a full arsenal
     outright. Each mount now trims its own charge to land where the aim says.

     Solved against FLAT-GROUND range, not against the terrain: pure ballistic
     range is monotonic in charge, so a bisection is safe, whereas real ground
     makes landing distance jump discontinuously wherever a shot just clears a
     crest. Terrain then does what terrain does.

     A closed form (range ∝ v²/g) was tried first and was not good enough — it
     ignores drag, and the low-drag mounts overshot the rest of the volley by
     400-600px. It survives as the opening guess.

     Direct-fire mounts are exempt: an Ion Lance has no arc to match, and
     pretending otherwise would erase what makes it distinct. */
  _flatRange(spec, angle, power) {
    const a = angle * Math.PI / 180;
    const speed = power * MAX_SPEED * (spec.speed || 1);
    let vx = Math.cos(a) * speed, vy = -Math.sin(a) * speed;
    let x = 0, y = 0;
    const gs = spec.gravityScale ?? 1;
    const drag = 1 - (spec.drag || 0);
    const wind = this.wind * WIND_ACCEL * (spec.windScale ?? 1);
    for (let i = 0; i < 1500; i++) {
      vy += G * gs;
      vx += wind;
      vx *= drag; vy *= drag;
      x += vx; y += vy;
      if (i > 2 && y >= 0) break;        // back down to launch height
    }
    return x;
  }

  trimPower(weaponId, angle, power) {
    const w = WEAPONS[weaponId];
    if (!w) return power;
    const gs = w.gravityScale ?? 1;
    if (gs <= 0) return power;

    const key = `${weaponId}|${angle.toFixed(1)}|${power.toFixed(3)}|${this.wind.toFixed(3)}`;
    this._trimCache = this._trimCache || new Map();
    if (this._trimCache.has(key)) return this._trimCache.get(key);

    const target = this._flatRange(FIRE_CONTROL_STANDARD, angle, power);
    let lo = 0.05, hi = 1;
    // seed from the drag-free closed form, then bisect on true flat range
    let p = clamp(power * Math.sqrt(gs) / (w.speed || 1), lo, hi);
    for (let i = 0; i < 12; i++) {
      const got = this._flatRange(w, angle, p);
      if (Math.abs(got - target) < 4) break;
      if (got > target) hi = p; else lo = p;
      p = (lo + hi) / 2;
    }
    if (this._trimCache.size > 400) this._trimCache.clear();
    this._trimCache.set(key, p);
    return p;
  }

  rosterFor(owner) {
    return owner === this.player ? this.armed : (this.foeMounts || ['laser']);
  }

  /* The enemy runs the same budget: it arms what it can afford from its roster,
     shuffled, so successive volleys are not identical. */
  _armFoe() {
    // an EMP hit last turn takes a bite out of what they can power
    let budget = this.battle.enemyFirepower || 40;
    if (this.foeEmp) { budget = Math.round(budget * (1 - this.foeEmp)); this.foeEmp = 0; }
    const pool = (this.foeMounts || ['laser']).slice().sort(() => Math.random() - 0.5);
    const picked = [];
    let load = 0;
    for (const id of pool) {
      const w = WEAPONS[id];
      if (w && load + w.firepower <= budget) { picked.push(id); load += w.firepower; }
    }
    return picked.length ? picked : ['laser'];
  }

  _launch(owner, angle, power, weaponId) {
    const w = WEAPONS[weaponId];
    if (!w) return;
    const o = this.muzzle(owner, angle);

    // An additive mount puts several shells up on its own: `spread` fans them
    // by angle, `stagger` varies their charge so they walk out.
    const salvo = w.salvo;
    const count = salvo ? salvo.count : 1;
    for (let k = 0; k < count; k++) {
      const t = count === 1 ? 0 : (k / (count - 1)) * 2 - 1;
      const ang = (angle + t * (salvo ? salvo.spread : 0)) * Math.PI / 180;
      const pw = clamp(this.trimPower(weaponId, angle, power) + t * (salvo ? salvo.stagger : 0), 0.05, 1);
      const speed = pw * MAX_SPEED * w.speed;
      this.shells.push({
        x: o.x, y: o.y,
        vx: Math.cos(ang) * speed * owner.facing,
        vy: -Math.sin(ang) * speed,
        weapon: weaponId, owner,
        bore: w.penetrate || 0, trail: [], life: 0, travelled: 0,
        shard: count > 1,
        burstAt: w.autoAbility
          ? Math.max(4, Math.round(0.6 * (Math.abs(Math.sin(ang) * speed) / (G * (w.gravityScale ?? 1)))))
          : 0,
        age: 0,
      });
    }
  }

  useAbility() {
    if (this.state !== 'flight' || this.abilityUsed) return;
    const mine = this.shells.filter((sh) => sh.owner === this.player &&
                                          WEAPONS[sh.weapon].ability && !sh.burst);
    if (!mine.length) return;
    this.abilityUsed = true;
    // The whole broadside answers one button: every shell in the air that has
    // a trick performs it at once.
    for (const s of mine) {
      s.burst = true;
      this._triggerAbility(s, WEAPONS[s.weapon]);
    }
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
      const n = w.splitCount || 3;
      const half = (n - 1) / 2;
      for (let k = 0; k < n; k++) {
        const i = (k - half) / half;
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
    const steady = (s.owner === this.player) ? (1 - this.mods.windResist) : 1;
    s.vx += this.wind * WIND_ACCEL * (w.windScale ?? 1) * steady;
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
        if (pl === s.owner && s.life < 9) continue;      // don't hit your own building
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
  aimPreview(angleOverride, powerOverride, weaponId, fullArc) {
    const pl = this.player;
    if (!pl || pl.hp <= 0) return null;
    const w = WEAPONS[weaponId || this.owned[0]];
    if (!w) return null;
    const angle = angleOverride === undefined ? this.aimAngle : angleOverride;
    const raw = powerOverride === undefined ? this.aimPower : powerOverride;
    // preview through the same fire control the guns use, or it lies
    const power = clamp(this.trimPower(weaponId || this.owned[0], angle, raw), 0.02, 1);
    const a = angle * Math.PI / 180;
    const speed = power * MAX_SPEED * w.speed;
    const o = this.muzzle(pl, this.aimAngle);

    const ghost = {
      x: o.x, y: o.y,
      vx: Math.cos(a) * speed * pl.facing, vy: -Math.sin(a) * speed,
      weapon: weaponId || this.owned[0], owner: pl, bore: w.penetrate || 0, life: 0, travelled: 0,
    };

    /* A direct-fire beam has no apex to stop at, and hiding its path would be
       pointless — line of sight IS its whole character, so draw the lot out to
       where it dissipates. An arcing shell stops at the crest, which gives
       honest feedback on shape and reach without handing over the impact
       point. A flat or depressed arcing shot has no useful crest either, so it
       gets a short lead-out instead of its whole descending flight. */
    const noArc = (w.gravityScale ?? 1) === 0;
    const showAll = fullArc || this.mods.fullArc;
    const cap = noArc ? 220 : (showAll ? 400 : (ghost.vy < 0 ? 130 : 26));

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
      if (!showAll && !noArc && rising && ghost.vy >= 0) { reason = 'apex'; break; }
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
      const direct = pl === hitPlatform;
      const falloff = direct ? 1 : clamp(1 - d / blast, 0, 1);
      let raw = w.damage * (0.35 + 0.65 * falloff);
      if (pl === this.player) {
        raw *= (1 - this.mods.damageReduce);
        if (!direct) raw *= (1 - this.mods.splashReduce);   // baffles vent near misses
      }
      const dmg = Math.round(raw);
      if (dmg > 0) this._damage(pl, dmg, s.owner);
      if (w.emp && pl === this.foe && s.owner === this.player) {
        this.foeEmp = Math.max(this.foeEmp || 0, w.emp);
        this.popups.push({ x: pl.x, y: pl.y - 140, text: 'POWER DOWN',
                           color: '#7fe8ff', life: 1.3, maxLife: 1.3, vy: -0.8 });
      }
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
        let dmg = Math.min(38, Math.round(fell / 14));
        if (pl === this.player) dmg = Math.round(dmg * (1 - this.mods.fallReduce));
        this.popups.push({ x: pl.x, y: pl.y - 60, text: 'FELL', color: '#ffb04a', life: 1, maxLife: 1, vy: -0.8 });
        if (dmg > 0) this._damage(pl, dmg, null);
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
    // Range with one representative mount; the rest of the broadside follows
    // the same solution and lands where its own ballistics take it.
    const weaponId = this.foeMounts.includes('laser') ? 'laser' : this.foeMounts[0];
    const aimX = this.player.x, aimY = this.player.y - 14;
    // Range through the same fire control the guns use. Without this the
    // gunner solves for where an untrimmed shell would land and then fires a
    // trimmed one, so every shot misses by the width of the correction.
    const err = (ang, pw) => {
      const r = this.trace(this.foe, ang, this.trimPower(weaponId, ang, pw), weaponId, 600);
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
        this.fuel = this.maxFuel;
        if (this.mods.regen && this.player.hp > 0 && this.player.hp < this.player.maxHp) {
          const healed = Math.min(this.mods.regen, this.player.maxHp - this.player.hp);
          this.player.hp += healed;
          this.popups.push({ x: this.player.x, y: this.player.y - 120, text: `+${healed}`,
                             color: '#9fd93a', life: 1.1, maxLife: 1.1, vy: -0.9 });
        }
        this.state = 'aim';
      }
      this._emitHud();
      return;
    }

    if (this.state === 'enemy' && now >= this.enemyAt) {
      const shot = this._enemyShot();
      this.foe.barrel = shot.angle;
      this.fire(this.foe, shot.angle, shot.power, this._armFoe());
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
      maxFuel: this.maxFuel,
      modules: this.modules,
      mods: this.mods,
      owned: this.owned,
      armed: this.armed,
      aimIndex: this.aimIndex,
      currentMount: this.currentMount,
      firepower: this.firepower,
      armedLoad: this.armedLoad,
      foeMounts: this.foeMounts || [],
      angle: this.aimAngle,
      power: this.aimPower,
      wind: this.wind,
      turns: this.turns,
      player: this.player ? { hp: this.player.hp, max: this.player.maxHp } : null,
      foe: this.foe ? { hp: this.foe.hp, max: this.foe.maxHp } : null,
      canAbility: this.state === 'flight' && !this.abilityUsed &&
        this.shells.some((s) => s.owner === this.player &&
                                WEAPONS[s.weapon].ability && !s.burst),
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
