/* Martian Civil War — simulation, input and game rules.
   Matter.js does rigid-body physics; damage, destruction, explosions,
   scoring and the turn state machine all live here. */

const { Engine, Composite, Bodies, Body, Events, Vector, Sleeping } = Matter;

const STEP = 1 / 60;   // fixed physics timestep, seconds

const TUNING = {
  maxSpeed: 21,          // full draw lands a 45° shot at the far end of the field
  drawRadius: 148,       // how far the sling can be pulled
  damageScale: 0.17,     // impact energy -> hit points
  minImpact: 2.2,        // ignore gentle settling contacts
  targetFragility: 2.4,  // guards take more from the same hit than masonry
  explodeRadius: 190,
  explodeForce: 0.09,
  explodeDamage: 150,
  shotBonus: 5000,
  settleFrames: 40,
  settleSpeed: 0.42,
  maxSettleMs: 7000,
  maxSettleSteps: 600,
};

class Game {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;

    this.engine = Engine.create({ enableSleeping: true });
    this.engine.gravity.y = 1;
    this.engine.positionIterations = 10;
    this.engine.velocityIterations = 10;
    this.engine.constraintIterations = 4;
    this.world = this.engine.world;

    this.time = 0;
    this.state = 'idle';         // idle | aiming | flying | settling | over
    this.paused = true;
    this.particles = [];
    this.popups = [];
    this.pendingBlasts = [];
    this.shake = 0;
    this.armAngle = 2.35;
    this.armTarget = 2.35;
    this.dragging = false;
    this.aimV = { x: 0, y: 0 };
    this.power = 0;
    this.launchPoint = { x: 0, y: 0 };
    this.restPoint = { x: CATAPULT.x + 26, y: CATAPULT.y - 152 };
    this.lastCreak = 0;
    this.faction = 'red';          // the house you crew for; the other garrisons

    this._bindInput();
    this._bindCollisions();

    this.resize();
    window.addEventListener('resize', () => this.resize());

    this._frame = this._frame.bind(this);
    requestAnimationFrame(this._frame);
  }

  setFaction(id) {
    if (FACTIONS[id]) this.faction = id;
  }
  get house() { return FACTIONS[this.faction]; }
  get enemy() { return FACTIONS[otherFaction(this.faction)]; }

  /* ---------- viewport ---------- */

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.dpr = dpr;
    this.viewW = w;
    this.viewH = h;
    this.scale = Math.min(w / WORLD.w, h / WORLD.h);
    this.offX = (w - WORLD.w * this.scale) / 2;
    this.offY = (h - WORLD.h * this.scale) / 2;
  }

  toWorld(sx, sy) {
    return { x: (sx - this.offX) / this.scale, y: (sy - this.offY) / this.scale };
  }

  /* ---------- level lifecycle ---------- */

  load(index) {
    const spec = LEVELS[index];
    if (!spec) return;
    this.levelIndex = index;
    this.level = spec;

    Composite.clear(this.world, false);
    this.blocks = [];
    this.targets = [];
    this.shots = [];
    this.projectiles = [];
    this.particles.length = 0;
    this.popups.length = 0;
    this.pendingBlasts.length = 0;

    this.score = 0;
    this.shotsUsed = 0;
    this.ammoQueue = spec.ammo.slice();
    this.abilityUsed = false;
    this.shake = 0;
    this.state = 'aiming';
    this.paused = false;
    this.armAngle = this.armTarget = 2.35;
    this.launchPoint = { ...this.restPoint };
    this.dragging = false;

    // ground + a floor of static geometry
    const ground = Bodies.rectangle(WORLD.w / 2, WORLD.groundY + 220, WORLD.w * 3, 440, {
      isStatic: true, friction: 0.9, restitution: 0.02,
    });
    ground.cb = { type: 'ground' };
    Composite.add(this.world, ground);

    this.platforms = (spec.platforms || []).map((p) => {
      const body = Bodies.rectangle(p.x, p.y, p.w, p.h, { isStatic: true, friction: 0.85 });
      body.cb = { type: 'platform' };
      Composite.add(this.world, body);
      return p;
    });

    for (const b of spec.blocks) this._addBlock(b);
    for (const t of spec.targets) this._addTarget(t);

    this._emitHud();
    if (this.hooks.onLevel) this.hooks.onLevel(index, spec);
  }

  restart() { this.load(this.levelIndex); }

  _addBlock(spec) {
    const m = MATERIALS[spec.mat];
    const body = Bodies.rectangle(spec.x, spec.y - spec.h / 2, spec.w, spec.h, {
      density: m.density,
      friction: m.friction,
      frictionStatic: 1.1,
      restitution: m.restitution,
      angle: spec.angle || 0,
      sleepThreshold: 30,
    });
    const scale = Math.min(2.2, Math.max(0.6, Math.sqrt(spec.w * spec.h) / 50));
    const hp = m.hp * scale;
    body.cb = { type: 'block', mat: spec.mat, w: spec.w, h: spec.h, hp, maxHp: hp };
    this.blocks.push(body);
    Composite.add(this.world, body);
  }

  _addTarget(spec) {
    const t = TARGETS[spec.kind];
    const body = Bodies.rectangle(spec.x, spec.y - t.h / 2, t.w, t.h, {
      density: 0.0013, friction: 0.65, frictionStatic: 1.0, restitution: 0.12,
      sleepThreshold: 30,
    });
    body.cb = { type: 'target', kind: spec.kind, w: t.w, h: t.h, hp: t.hp, maxHp: t.hp };
    this.targets.push(body);
    Composite.add(this.world, body);
  }

  get targetsLeft() { return this.targets.length; }

  /* ---------- input ---------- */

  _bindInput() {
    const c = this.canvas;
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return this.toWorld(p.clientX - r.left, p.clientY - r.top);
    };

    const down = (e) => {
      if (this.paused || this.state !== 'aiming') return;
      e.preventDefault();
      Sfx.unlock();
      this.dragging = true;
      this._drag(pos(e));
    };
    const move = (e) => {
      if (!this.dragging) return;
      e.preventDefault();
      this._drag(pos(e));
    };
    const up = (e) => {
      if (!this.dragging) return;
      e.preventDefault();
      this.dragging = false;
      if (this.power > 0.06) this.fire();
      else { this.launchPoint = { ...this.restPoint }; this.power = 0; }
    };

    c.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    c.addEventListener('touchstart', down, { passive: false });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up, { passive: false });
  }

  _drag(p) {
    const o = this.restPoint;
    let dx = p.x - o.x, dy = p.y - o.y;
    const d = Math.hypot(dx, dy);
    const max = TUNING.drawRadius;
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    this.launchPoint = { x: o.x + dx, y: o.y + dy };

    const pull = Math.min(d, max) / max;
    this.power = pull;
    const ammo = AMMO[this.ammoQueue[0]] || AMMO.boulder;
    const speed = pull * TUNING.maxSpeed * ammo.power;
    const len = Math.hypot(dx, dy) || 1;
    this.aimV = { x: (-dx / len) * speed, y: (-dy / len) * speed };

    this.armTarget = Math.atan2(-(this.launchPoint.x - (CATAPULT.x + 2)),
                                 this.launchPoint.y - (CATAPULT.y - 104));

    if (this.time - this.lastCreak > 0.07 && pull > 0.05) {
      this.lastCreak = this.time;
      Sfx.stretch(pull);
    }
  }

  fire() {
    if (this.state !== 'aiming' || !this.ammoQueue.length) return;
    const kind = this.ammoQueue.shift();
    const spec = AMMO[kind];
    const p = this.launchPoint;

    const body = Bodies.circle(p.x, p.y, spec.r, {
      density: spec.density,
      restitution: spec.restitution,
      friction: spec.friction,
      frictionAir: 0.0012,
      sleepThreshold: 60,
    });
    body.cb = { type: 'ammo', ammo: kind, r: spec.r, restFrames: 0 };
    Body.setVelocity(body, this.aimV);
    Body.setAngularVelocity(body, this.aimV.x * 0.012);
    Composite.add(this.world, body);
    this.projectiles.push(body);

    this.shotsUsed++;
    this.abilityUsed = false;
    this.state = 'flying';
    this.flyStart = performance.now();
    this.launchPoint = { ...this.restPoint };
    this.power = 0;
    this.armTarget = -0.85;
    this.shake = Math.min(this.shake + 5, 14);
    Sfx.launch();
    this._puff(p.x, p.y, 10, '#d8c6a4');
    this._emitHud();
  }

  useAbility() {
    if (this.state !== 'flying' || this.abilityUsed) return;
    const body = this.projectiles[0];
    if (!body) return;
    const spec = AMMO[body.cb.ammo];
    if (!spec.ability) return;
    this.abilityUsed = true;

    if (spec.ability === 'detonate') {
      this._blast(body.position.x, body.position.y, TUNING.explodeRadius * 1.05, TUNING.explodeDamage * 1.15);
      this._removeProjectile(body);
    } else if (spec.ability === 'split') {
      const v = body.velocity;
      const { x, y } = body.position;
      this._removeProjectile(body);
      for (let i = -1; i <= 1; i++) {
        const shard = Bodies.circle(x, y + i * 26, spec.r * 0.62, {
          density: spec.density * 1.35, restitution: 0.2, friction: 0.5, frictionAir: 0.0012,
        });
        shard.cb = { type: 'ammo', ammo: 'cluster', r: spec.r * 0.62, restFrames: 0 };
        Body.setVelocity(shard, { x: v.x * 1.06, y: v.y * 1.06 + i * 3.4 });
        Composite.add(this.world, shard);
        this.projectiles.push(shard);
      }
      this._puff(x, y, 14, '#c3a6ff');
      Sfx.click();
    } else if (spec.ability === 'dive') {
      const v = body.velocity;
      const len = Math.hypot(v.x, v.y) || 1;
      Body.setVelocity(body, { x: (v.x / len) * 38, y: (v.y / len) * 38 + 3 });
      this._puff(body.position.x, body.position.y, 12, '#ffd469');
      Sfx.launch();
    }
    this._emitHud();
  }

  /* ---------- damage ---------- */

  _bindCollisions() {
    Events.on(this.engine, 'collisionStart', (ev) => {
      for (const pair of ev.pairs) {
        const a = pair.bodyA, b = pair.bodyB;
        if (!a.cb || !b.cb) continue;

        const rel = Vector.magnitude(Vector.sub(a.velocity, b.velocity));
        if (rel < TUNING.minImpact) continue;

        const ma = a.isStatic ? Infinity : a.mass;
        const mb = b.isStatic ? Infinity : b.mass;
        const reduced = (ma === Infinity) ? mb : (mb === Infinity) ? ma : (ma * mb) / (ma + mb);
        const energy = 0.5 * reduced * rel * rel;

        // an ammo body concentrates its hit
        let mul = 1;
        if (a.cb.type === 'ammo') mul *= AMMO[a.cb.ammo].dmg;
        if (b.cb.type === 'ammo') mul *= AMMO[b.cb.ammo].dmg;
        const dmg = energy * TUNING.damageScale * mul;

        this._hurt(a, dmg, pair);
        this._hurt(b, dmg, pair);

        if (rel > 6) {
          const p = pair.collision.supports[0] || a.position;
          this._puff(p.x, p.y, Math.min(8, Math.round(rel / 3)), '#cfc3ad', 0.6);
          Sfx.thud(Math.min(1, rel / 22));
        }
      }
    });
  }

  _hurt(body, dmg, pair) {
    const d = body.cb;
    if (!d || body.isStatic || d.dead) return;
    if (d.type === 'ammo' || d.type === 'ground' || d.type === 'platform') return;

    let amount = dmg;
    if (d.type === 'target') amount *= TUNING.targetFragility;
    else if (MATERIALS[d.mat].tough) amount *= 0.5;

    d.hp -= amount;
    if (d.hp <= 0) this._destroy(body, pair);
  }

  _destroy(body, pair) {
    const d = body.cb;
    if (d.dead) return;
    d.dead = true;

    const { x, y } = body.position;

    if (d.type === 'target') {
      const spec = TARGETS[d.kind];
      this._award(spec.score, x, y, d.kind === 'king' ? '#ffd469' : this.enemy.light);
      this._debris(x, y, this.enemy.primary, 16, d.w);
      this._puff(x, y, 16, '#ffffff', 0.8);
      Sfx.guardDown();
      this.targets = this.targets.filter((t) => t !== body);
    } else {
      const m = MATERIALS[d.mat];
      this._award(m.score, x, y, '#ffe0a0');
      this._debris(x, y, m.fill, Math.min(22, 8 + Math.round((d.w * d.h) / 900)), Math.max(d.w, d.h));
      if (m.sound && Sfx[m.sound] && !m.explodes) Sfx[m.sound]();
      if (m.explodes) this.pendingBlasts.push({ x, y, r: TUNING.explodeRadius, dmg: TUNING.explodeDamage });
      this.blocks = this.blocks.filter((t) => t !== body);
    }

    Composite.remove(this.world, body);
  }

  _blast(x, y, radius, damage) {
    Sfx.boom();
    this.shake = Math.min(this.shake + 22, 34);
    this._puff(x, y, 34, '#ffb04a', 1.4);
    this._debris(x, y, '#e2634a', 20, 30);
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * 6.283, s = 3 + Math.random() * 7;
      this.particles.push({
        type: 'smoke', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5,
        size: 12 + Math.random() * 22, color: 'rgba(70,64,60,.55)',
        life: 0.9 + Math.random() * 0.7, maxLife: 1.5, grav: -0.02, drag: 0.94,
      });
    }

    const bodies = Composite.allBodies(this.world);
    for (const b of bodies) {
      if (b.isStatic || !b.cb || b.cb.dead) continue;
      const dx = b.position.x - x, dy = b.position.y - y;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) continue;
      const falloff = 1 - dist / radius;
      const n = { x: dx / (dist || 1), y: dy / (dist || 1) };
      Sleeping.set(b, false);
      Body.applyForce(b, b.position, {
        x: n.x * TUNING.explodeForce * falloff * b.mass,
        y: (n.y - 0.32) * TUNING.explodeForce * falloff * b.mass,
      });
      if (b.cb.type !== 'ammo') this._hurt(b, damage * falloff * falloff);
    }
  }

  _award(points, x, y, color) {
    this.score += points;
    this.popups.push({ x, y, text: `+${points}`, color, life: 1.1, maxLife: 1.1, vy: -0.9 });
    this._emitHud();
  }

  /* ---------- effects ---------- */

  _debris(x, y, color, count, spread = 30) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.283, s = 2 + Math.random() * 8;
      this.particles.push({
        type: 'debris', x: x + (Math.random() - .5) * spread, y: y + (Math.random() - .5) * spread,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 3,
        size: 3 + Math.random() * 7, color, rot: Math.random() * 6.283, vr: (Math.random() - .5) * 0.4,
        life: 0.9 + Math.random(), maxLife: 1.9, grav: 0.34, drag: 0.995, bounce: true,
      });
    }
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
      p.vx *= (p.drag ?? 0.99);
      p.vy *= (p.drag ?? 0.99);
      p.x += p.vx; p.y += p.vy;
      if (p.rot !== undefined) p.rot += p.vr;
      if (p.bounce && p.y > WORLD.groundY - 2) {
        p.y = WORLD.groundY - 2; p.vy *= -0.34; p.vx *= 0.72;
      }
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      p.y += p.vy;
      p.vy *= 0.97;
      if (p.life <= 0) this.popups.splice(i, 1);
    }
    this.shake *= 0.88;
  }

  /* ---------- turn state ---------- */

  _removeProjectile(body) {
    Composite.remove(this.world, body);
    this.projectiles = this.projectiles.filter((p) => p !== body);
  }

  _updateTurn(now) {
    // retire spent projectiles
    for (const b of this.projectiles.slice()) {
      const p = b.position;
      if (p.x < -400 || p.x > WORLD.w + 500 || p.y > WORLD.h + 400) {
        this._removeProjectile(b);
        continue;
      }
      const speed = Vector.magnitude(b.velocity);
      b.cb.restFrames = speed < 0.6 ? b.cb.restFrames + 1 : 0;
      if (b.cb.restFrames > 70) this._removeProjectile(b);
    }

    if (this.state === 'flying' && this.projectiles.length === 0) {
      this.state = 'settling';
      this.settleFrames = 0;
      this.settleSteps = 0;
      this.settleStart = now;
    }

    if (this.state === 'settling') {
      if (this.targetsLeft === 0) { this._finish(true); return; }
      const calm = this._isCalm();
      this.settleFrames = calm ? this.settleFrames + 1 : 0;
      this.settleSteps = (this.settleSteps || 0) + 1;
      // Wall clock alone is not enough: something still rolling would stall the
      // turn forever, so cap the wait in physics steps too.
      const timedOut = now - this.settleStart > TUNING.maxSettleMs ||
                       this.settleSteps > TUNING.maxSettleSteps;
      if (this.settleFrames > TUNING.settleFrames || timedOut) {
        if (this.targetsLeft === 0) this._finish(true);
        else if (this.ammoQueue.length === 0) this._finish(false);
        else { this.state = 'aiming'; this.armTarget = 2.35; this._emitHud(); }
      }
    }

    if (this.state === 'flying' && this.targetsLeft === 0) {
      this.state = 'settling';
      this.settleFrames = TUNING.settleFrames - 12;   // brief beat, then win
      this.settleStart = now;
    }
  }

  // Rest is a property of the bodies, not of the dust. Particles are cosmetic
  // and are stepped by the render loop, so they must not gate the turn.
  _isCalm() {
    if (this.pendingBlasts.length) return false;
    for (const b of Composite.allBodies(this.world)) {
      if (b.isStatic || !b.cb) continue;
      if (Vector.magnitude(b.velocity) > TUNING.settleSpeed) return false;
      if (Math.abs(b.angularVelocity) > 0.05) return false;
    }
    return true;
  }

  _finish(won) {
    if (this.state === 'over') return;
    this.state = 'over';
    const saved = won ? this.ammoQueue.length : 0;
    const bonus = saved * TUNING.shotBonus;
    const demolition = this.score;
    this.score += bonus;

    let stars = 0;
    if (won) stars = this.shotsUsed <= this.level.par ? 3 : this.shotsUsed === this.level.par + 1 ? 2 : 1;

    setTimeout(() => (won ? Sfx.win() : Sfx.lose()), 260);
    this._emitHud();
    if (this.hooks.onResult) {
      this.hooks.onResult({
        won, stars, demolition, bonus, saved,
        total: this.score, level: this.levelIndex,
      });
    }
  }

  _emitHud() {
    if (!this.hooks.onHud) return;
    this.hooks.onHud({
      level: this.levelIndex,
      name: this.level ? this.level.name : '',
      score: this.score,
      queue: this.ammoQueue,
      used: this.shotsUsed,
      total: this.level ? this.level.ammo.length : 0,
      targets: this.targetsLeft,
      state: this.state,
      canAbility: this.state === 'flying' && !this.abilityUsed &&
        this.projectiles[0] && AMMO[this.projectiles[0].cb.ammo].ability,
    });
  }

  /* ---------- main loop ---------- */

  /* One physics tick. Split out of the render loop so a level can be
     simulated headlessly (see devStep) without waiting on the compositor. */
  step(now = performance.now()) {
    Engine.update(this.engine, 1000 / 60);
    while (this.pendingBlasts.length) {
      const b = this.pendingBlasts.shift();
      this._blast(b.x, b.y, b.r, b.dmg);
    }
    this._updateTurn(now);
  }

  devStep(n = 120) {
    for (let i = 0; i < n && this.state !== 'over'; i++) this.step();
    return { state: this.state, targets: this.targetsLeft, score: this.score };
  }

  _frame(now) {
    requestAnimationFrame(this._frame);
    const dt = Math.min(0.05, (now - (this.lastNow || now)) / 1000);
    this.lastNow = now;
    this.time += dt;

    if (!this.paused && this.level) {
      // Fixed 60Hz physics on an accumulator: a 120Hz display would otherwise
      // run the whole simulation at double speed.
      this.acc = (this.acc || 0) + dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 5) { this.step(now); this.acc -= STEP; steps++; }
      if (this.acc > STEP * 5) this.acc = 0;   // tab was backgrounded: don't catch up

      this.armAngle += (this.armTarget - this.armAngle) * 0.24;
      if (this.state === 'flying' && Math.abs(this.armAngle - this.armTarget) < 0.15) this.armTarget = 2.35;
    }
    this._stepEffects(dt);
    this._draw();
  }

  _draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.viewW, this.viewH);
    ctx.fillStyle = '#0d1017';
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

    if (this.level) {
      for (const p of this.platforms) R.platform(ctx, p);
      R.catapult(ctx, { time: this.time, armAngle: this.armAngle, faction: this.house });
      if (this.state === 'aiming') {
        if (this.power > 0.01) R.aim(ctx, this);
        else this._drawReadyShot(ctx);
      }
      for (const b of this.blocks) R.block(ctx, b);
      for (const t of this.targets) R.target(ctx, t, this.time, this.enemy);
      for (const p of this.projectiles) R.projectile(ctx, p);
    }

    R.ground(ctx);
    R.particles(ctx, this.particles);
    R.popups(ctx, this.popups);
    ctx.restore();
  }

  _drawReadyShot(ctx) {
    const kind = this.ammoQueue[0];
    if (!kind) return;
    const p = this.restPoint;
    ctx.save();
    ctx.strokeStyle = 'rgba(40,28,14,.85)';
    ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(CATAPULT.x - 22, CATAPULT.y - 96);
    ctx.lineTo(p.x, p.y);
    ctx.lineTo(CATAPULT.x + 26, CATAPULT.y - 96);
    ctx.stroke();
    ctx.restore();
    R.projectile(ctx, { position: p, angle: 0, cb: { ammo: kind, r: AMMO[kind].r } });

    // gentle "pull me back" nudge before the first shot of a level
    if (this.shotsUsed === 0) {
      const t = (this.time * 1.6) % 2.4;
      if (t < 1.2) {
        ctx.save();
        ctx.globalAlpha = 0.35 * Math.sin(t * Math.PI);
        ctx.strokeStyle = '#ffd469'; ctx.lineWidth = 3; ctx.setLineDash([7, 8]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 108, p.y + 46);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
}

/* ---------- level authoring check (dev tool, run from the console) ----------
   Castles are hand-placed, and the two mistakes that ruin one are pieces that
   overlap (Matter blows them apart on frame one) and pieces that float (the
   whole structure jolts as it drops). This finds both without playing. */

function validateLevels() {
  const report = [];

  LEVELS.forEach((lv, li) => {
    const rects = [];
    (lv.platforms || []).forEach((p, i) =>
      rects.push({ id: `platform#${i}`, l: p.x - p.w / 2, r: p.x + p.w / 2, t: p.y - p.h / 2, b: p.y + p.h / 2, static: true }));
    lv.blocks.forEach((b, i) =>
      rects.push({ id: `${b.mat}#${i}`, l: b.x - b.w / 2, r: b.x + b.w / 2, t: b.y - b.h, b: b.y }));
    lv.targets.forEach((t, i) => {
      const s = TARGETS[t.kind];
      rects.push({ id: `${t.kind}#${i}`, l: t.x - s.w / 2, r: t.x + s.w / 2, t: t.y - s.h, b: t.y });
    });

    const issues = [];

    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], c = rects[j];
        const ox = Math.min(a.r, c.r) - Math.max(a.l, c.l);
        const oy = Math.min(a.b, c.b) - Math.max(a.t, c.t);
        if (ox > 2 && oy > 2) {
          issues.push(`OVERLAP ${a.id} ∩ ${c.id} (${ox.toFixed(0)}×${oy.toFixed(0)}px)`);
        }
      }
    }

    for (const a of rects) {
      if (a.static) continue;
      if (a.b > WORLD.groundY + 1) { issues.push(`BELOW GROUND ${a.id} (bottom ${a.b})`); continue; }
      if (Math.abs(a.b - WORLD.groundY) <= 2) continue;
      const supported = rects.some((c) =>
        c !== a && Math.abs(c.t - a.b) <= 2 && Math.min(a.r, c.r) - Math.max(a.l, c.l) > 4);
      if (!supported) {
        let bestGap = WORLD.groundY - a.b;
        for (const c of rects) {
          if (c === a || c.t < a.b) continue;
          if (Math.min(a.r, c.r) - Math.max(a.l, c.l) <= 4) continue;
          bestGap = Math.min(bestGap, c.t - a.b);
        }
        issues.push(`FLOATS ${a.id} by ${bestGap.toFixed(0)}px`);
      }
    }

    if (issues.length) report.push(`L${li + 1} ${lv.name}:\n  ` + issues.join('\n  '));
  });

  if (!report.length) console.log('%cAll levels stack cleanly.', 'color:#6fce8f');
  else console.warn(report.join('\n\n'));
  return report;
}
