/* Martian Civil War — DOM layer: HUD, armory, campaign map, saved progress. */

const UI = (() => {
  const KEY = 'martian-civil-war:v2';
  const $ = (id) => document.getElementById(id);

  let game = null;
  let progress = { stars: {}, best: {}, faction: 'red', credits: 0,
                   owned: [STARTING_WEAPON], modules: [] };

  function loadProgress() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        progress = {
          stars: p.stars || {},
          best: p.best || {},
          faction: FACTIONS[p.faction] ? p.faction : 'red',
          credits: Number(p.credits) || 0,
          owned: Array.isArray(p.owned) && p.owned.length
            ? p.owned.filter((w) => WEAPONS[w]) : [STARTING_WEAPON],
          modules: Array.isArray(p.modules) ? p.modules.filter((m) => MODULES[m]) : [],
        };
        if (!progress.owned.includes(STARTING_WEAPON)) progress.owned.push(STARTING_WEAPON);
      }
    } catch (e) { /* private mode — play without saving */ }
  }

  function saveProgress() {
    try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch (e) {}
  }

  const starsFor = (i) => progress.stars[i] || 0;
  const bestFor = (i) => progress.best[i] || 0;
  const unlocked = (i) => i === 0 || starsFor(i - 1) > 0;
  const totalStars = () => BATTLES.reduce((n, _, i) => n + starsFor(i), 0);
  const fmt = (n) => Math.round(n).toLocaleString();

  /* ---------- house ---------- */

  function applyFaction(id) {
    progress.faction = id;
    saveProgress();
    game.setFaction(id);
    document.body.dataset.faction = id;
    const el = $('house-name');
    if (el) el.textContent = 'the ' + FACTIONS[id].name;
    document.querySelectorAll('.faction-card').forEach((c) =>
      c.classList.toggle('chosen', c.dataset.faction === id));
  }

  /* ---------- HUD ---------- */

  function hud(s) {
    $('hud-level').textContent = `Battle ${s.level + 1}`;
    $('hud-name').textContent = s.name;
    $('hud-score').textContent = fmt(s.score);
    $('hud-credits').textContent = fmt(progress.credits);

    /* The firing rack: every mount you own, with the ones armed for this volley
       lit and the rest dimmed. Rebuilt only when it changes — the HUD is
       emitted on every drag frame, and recreating these nodes 60 times a
       second restarts their transitions and makes them flicker. */
    const rack = $('weapon-rack');
    const sig = s.owned.join(',') + '|' + (s.armed || []).join(',') + '|' +
                (s.modules || []).join(',') + '|' + s.firepower + '|' + (s.canAbility ? 1 : 0);
    if (sig !== hud._sig) {
      hud._sig = sig;
      const armed = s.armed || [];
      const mounts = s.owned.map((w) => {
        const on = armed.includes(w);
        const spec = WEAPONS[w];
        const affordable = on || (s.armedLoad + spec.firepower <= s.firepower);
        return `<button class="ammo${on ? ' current' : ''}${affordable ? '' : ' over'}" ` +
          `data-weapon="${w}" title="${spec.name} — ${spec.firepower} firepower — ${spec.behaviour}">` +
          `${spec.icon}<i>${spec.firepower}</i></button>`;
      }).join('');
      const fitted = (s.modules || []).map((m) =>
        `<span class="ammo module" title="${MODULES[m].name} — ${MODULES[m].blurb}">${MODULES[m].icon}</span>`).join('');
      rack.innerHTML = mounts + (fitted ? `<span class="rack-split"></span>${fitted}` : '') +
        `<span class="ammo-name">${s.canAbility ? 'Space!' : `${s.armedLoad}/${s.firepower} fp`}</span>`;
      rack.querySelectorAll('[data-weapon]').forEach((b) => {
        b.onclick = () => game.toggleMount(b.dataset.weapon);
      });
    }

    $('ro-angle').textContent = `${Math.round(s.angle)}°`;
    $('ro-power').textContent = `${Math.round(s.power * 100)}%`;

    const w = s.wind || 0;
    const strength = Math.abs(w);
    $('ro-wind').textContent = strength < 0.008
      ? 'calm'
      : `${w > 0 ? '▶' : '◀'} ${(strength * 100).toFixed(0)}`;

    const fuelPct = Math.max(0, Math.min(1, s.fuel / s.maxFuel));
    $('ro-fuel').textContent = Math.round(s.fuel);
    $('ro-fuel-fill').style.width = (fuelPct * 100).toFixed(0) + '%';
    $('ro-fuel-fill').style.background =
      fuelPct > 0.5 ? '#9fd93a' : fuelPct > 0.2 ? '#f0b73c' : '#e2634a';

    // which gun are we laying, and the fire bar that goes with it
    const laying = s.state === 'aim' && s.armed && s.armed.length;
    $('ro-mount').textContent = laying
      ? `${s.aimIndex + 1}/${s.armed.length} ${WEAPONS[s.currentMount].name}` : '—';
    const fb = $('firebar');
    fb.classList.toggle('hidden', !laying);
    if (laying) {
      const msig = s.armed.join(',') + '|' + s.aimIndex;
      if (msig !== hud._msig) {
        hud._msig = msig;
        $('firebar-mounts').innerHTML = s.armed.map((w, i) =>
          `<button class="fb-mount${i === s.aimIndex ? ' active' : ''}" data-mount="${w}"` +
          ` title="${WEAPONS[w].name}" style="--tracer:${WEAPONS[w].tracer}">` +
          `${WEAPONS[w].icon}</button>`).join('');
        $('firebar-mounts').querySelectorAll('[data-mount]').forEach((b) => {
          b.onclick = () => game.aimMount(b.dataset.mount);
        });
      }
    }

    $('ro-turn').textContent =
      s.state === 'over' ? '—'
      : s.state === 'arming' ? 'Arm up'
      : s.state === 'enemy' ? 'Incoming'
      : s.state === 'flight' ? 'In flight'
      : 'Lay the guns';
  }

  /* ---------- keyboard cursor ----------
     One shared highlight that whatever overlay is open hands its items to, so
     arrows move and Enter takes. Everything interactive is already a button
     with an onclick, so activating is just a click() — no parallel code path
     that can drift from what the mouse does. */

  const nav = { items: [], index: 0 };

  function navSet(selector) {
    nav.items = [...document.querySelectorAll(selector)]
      .filter((el) => !el.disabled && el.offsetParent !== null);
    nav.index = Math.min(nav.index, Math.max(0, nav.items.length - 1));
    navPaint();
  }
  function navClear() {
    document.querySelectorAll('.kb-focus').forEach((el) => el.classList.remove('kb-focus'));
    nav.items = [];
  }
  function navPaint() {
    document.querySelectorAll('.kb-focus').forEach((el) => el.classList.remove('kb-focus'));
    const el = nav.items[nav.index];
    if (el) { el.classList.add('kb-focus'); el.scrollIntoView({ block: 'nearest' }); }
  }
  function navMove(d) {
    if (!nav.items.length) return;
    nav.index = (nav.index + d + nav.items.length) % nav.items.length;
    navPaint();
  }
  // Rows are laid out in a responsive grid, so "down" means however many
  // columns actually fit right now, not a number hard-coded here.
  function navColumns() {
    if (nav.items.length < 2) return 1;
    const top = nav.items[0].getBoundingClientRect().top;
    let cols = 0;
    for (const el of nav.items) {
      if (Math.abs(el.getBoundingClientRect().top - top) > 4) break;
      cols++;
    }
    return Math.max(1, cols);
  }
  function navActivate() {
    const el = nav.items[nav.index];
    if (el) el.click();
  }

  function refreshNav() {
    if (!$('help').classList.contains('hidden')) return navSet('#help button');
    if (!$('arming').classList.contains('hidden')) return navSet('.arm-card');
    if (!$('armory').classList.contains('hidden')) return navSet('.shop-card button:not(:disabled)');
    if (!$('levels').classList.contains('hidden')) return navSet('.level-card:not(.locked)');
    if (!$('result').classList.contains('hidden')) return navSet('#result .panel-actions button');
    if (!$('title').classList.contains('hidden')) return navSet('.faction-card');
    navClear();
  }

  /* ---------- arming the volley ----------
     A deliberate step before the shot rather than a fiddle in the HUD: you
     decide what the platform powers this turn, then you aim. It opens itself
     at the start of a battle and is one key away after that — auto-opening
     every single turn would be nagging over a ten-turn fight. */

  function renderArming() {
    const cap = game.firepower;
    const used = game.armedLoad;
    $('fp-cap').textContent = cap;
    $('fp-used').textContent = used;
    const fill = $('fp-fill');
    fill.style.width = Math.min(100, (used / cap) * 100).toFixed(1) + '%';
    fill.style.background = used > cap * 0.9 ? '#ff7a4a' : used > cap * 0.6 ? '#f0b73c' : '#9fd93a';

    const grid = $('arming-grid');
    grid.innerHTML = '';
    game.owned.forEach((id, i) => {
      const w = WEAPONS[id];
      const on = game.armed.includes(id);
      const affordable = on || game.canArm(id);
      const el = document.createElement('button');
      el.className = 'arm-card' + (on ? ' armed' : '') + (affordable ? '' : ' unaffordable');
      el.innerHTML =
        `<span class="arm-key">${i + 1}</span>` +
        `<span class="arm-icon" style="color:${w.tracer}">${w.icon}</span>` +
        `<span class="arm-body">` +
          `<b>${w.name}</b>` +
          `<i>${w.behaviour}</i>` +
          `<em>${w.damage} dmg${w.salvo ? ` ×${w.salvo.count}` : ''} · ${w.blast} blast · ${w.dig} dig</em>` +
        `</span>` +
        `<span class="arm-fp">${w.firepower}<small>fp</small></span>`;
      el.onclick = () => { game.toggleMount(id); renderArming(); refreshNav(); };
      grid.appendChild(el);
    });

    const fitted = $('arming-fitted');
    fitted.innerHTML = game.modules.length
      ? '<span class="fitted-label">Fitted</span>' + game.modules.map((m) =>
          `<span class="fitted-chip" title="${MODULES[m].blurb}">${MODULES[m].icon} ${MODULES[m].name}</span>`).join('')
      : '<span class="fitted-label">No modules fitted — see the Armory</span>';
  }

  function showArming() {
    if (!game.battle || game.state === 'over') return;
    renderArming();
    show('arming');
    nav.index = 0;
    refreshNav();
  }
  function showHelp() { show('help'); refreshNav(); }

  /* ---------- armory ---------- */

  function renderShop() {
    $('armory-credits').textContent = fmt(progress.credits);
    const shop = $('weapon-shop');
    shop.innerHTML = '';

    const section = (label, note) => {
      const h = document.createElement('div');
      h.className = 'shop-section';
      h.innerHTML = `<span>${label}</span><i>${note}</i>`;
      shop.appendChild(h);
    };

    section('Mounts', 'every mount fires each turn');
    weaponList().forEach((id) => card(shop, id, WEAPONS[id], progress.owned.includes(id), buy));

    for (const kind of MODULE_KINDS) {
      const ids = moduleList().filter((m) => MODULES[m].kind === kind.id);
      if (!ids.length) continue;
      section(kind.label, 'fitted permanently');
      ids.forEach((id) => card(shop, id, MODULES[id], progress.modules.includes(id), buyModule));
    }
  }

  function statLine(spec) {
    if (spec.kind) {
      const bits = [];
      if (spec.hull) bits.push(`+${spec.hull} hull`);
      if (spec.damageReduce) bits.push(`−${Math.round(spec.damageReduce * 100)}% damage taken`);
      if (spec.splashReduce) bits.push(`−${Math.round(spec.splashReduce * 100)}% splash`);
      if (spec.regen) bits.push(`+${spec.regen} hull / turn`);
      if (spec.fuel) bits.push(`+${spec.fuel} fuel`);
      if (spec.climb) bits.push(`+${spec.climb} climb`);
      if (spec.fallReduce) bits.push(`−${Math.round(spec.fallReduce * 100)}% fall damage`);
      return bits.join(' · ');
    }
    return `<em>${spec.behaviour}</em> · ${spec.damage} dmg` +
      `${spec.salvo ? ` ×${spec.salvo.count}` : ''} · ${spec.blast} blast · ${spec.dig} dig`;
  }

  function card(shop, id, spec, owned, onBuy) {
    const affordable = progress.credits >= spec.cost;
    const el = document.createElement('div');
    el.className = 'shop-card' + (owned ? ' owned' : affordable ? '' : ' locked');
    el.innerHTML =
      `<span class="shop-icon">${spec.icon}</span>` +
      `<div class="shop-body">` +
        `<span class="shop-name">${spec.name}</span>` +
        `<span class="shop-blurb">${spec.blurb}</span>` +
        `<span class="shop-stats">${statLine(spec)}</span>` +
      `</div>`;
    const btn = document.createElement('button');
    btn.className = 'btn tiny ' + (owned ? 'ghost' : affordable ? 'primary' : 'ghost');
    btn.textContent = owned ? 'Fitted' : `${fmt(spec.cost)} cr`;
    btn.disabled = owned || !affordable;
    btn.onclick = () => onBuy(id);
    el.appendChild(btn);
    shop.appendChild(el);
  }

  function buyModule(id) {
    const m = MODULES[id];
    if (progress.modules.includes(id) || progress.credits < m.cost) return;
    progress.credits -= m.cost;
    progress.modules.push(id);
    saveProgress();
    game.setModules(progress.modules);
    Sfx.star(1);
    renderShop();
    $('hud-credits').textContent = fmt(progress.credits);
  }

  function buy(id) {
    const w = WEAPONS[id];
    if (progress.owned.includes(id) || progress.credits < w.cost) return;
    progress.credits -= w.cost;
    progress.owned.push(id);
    saveProgress();
    game.setLoadout(progress.owned);
    Sfx.star(1);
    renderShop();
    $('hud-credits').textContent = fmt(progress.credits);
  }

  /* ---------- result ---------- */

  function showResult(res) {
    const prevBest = bestFor(res.level);
    let earned = 0;

    if (res.won) {
      if (res.stars > starsFor(res.level)) progress.stars[res.level] = res.stars;
      // Salvage is banked on improvement only, so a battle can't be farmed.
      earned = Math.max(0, res.total - prevBest);
      if (res.total > prevBest) progress.best[res.level] = res.total;
      progress.credits += earned;
      saveProgress();
    }

    $('result-title').textContent = res.won ? 'Enemy Platform Destroyed' : 'Platform Lost';
    $('rs-damage').textContent = fmt(res.damage);
    $('rs-hull').textContent = res.won ? `${res.hpLeft} × 120` : '—';
    $('rs-speed').textContent = res.won ? fmt(res.speedBonus) : '—';
    $('rs-total').textContent = fmt(res.total);
    $('rs-credits').textContent = earned > 0 ? `+${fmt(earned)}` : '—';

    $('result-msg').textContent = res.won
      ? (res.stars === 3 ? 'Barely scratched. Textbook gunnery.'
        : res.stars === 2 ? `Won it in ${res.turns} rounds, and felt every one.`
        : 'Wreckage on both sides. But theirs is bigger.')
      : 'Your platform is scrap. The ridge is still theirs.';

    const wrap = $('result-stars');
    wrap.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const st = document.createElement('span');
      st.className = 'star';
      st.textContent = '★';
      wrap.appendChild(st);
      if (i < res.stars) setTimeout(() => { st.classList.add('on', 'pop'); Sfx.star(i); }, 420 + i * 260);
    }

    const next = $('btn-next');
    const hasNext = res.level + 1 < BATTLES.length;
    next.textContent = res.won ? (hasNext ? 'Next Battle' : 'Campaign Map') : 'Retry';
    next.onclick = () => {
      Sfx.click(); hide('result');
      if (!res.won) game.restart();
      else if (hasNext) start(res.level + 1);
      else showLevels();
    };
    $('btn-replay').style.display = res.won ? '' : 'none';
    show('result');
  }

  /* ---------- campaign map ---------- */

  function renderGrid() {
    const grid = $('level-grid');
    grid.innerHTML = '';
    BATTLES.forEach((lv, i) => {
      const st = starsFor(i);
      const open = unlocked(i);
      const card = document.createElement('button');
      card.className = 'level-card' + (open ? '' : ' locked') + (st > 0 ? ' cleared' : '');
      card.innerHTML =
        `<span class="n">Battle ${i + 1}</span>` +
        `<span class="t">${lv.name}</span>` +
        `<span class="s">${[0, 1, 2].map((k) => `<span class="${k < st ? 'on' : ''}">★</span>`).join('')}</span>`;
      if (open) card.onclick = () => { Sfx.click(); hide('levels'); start(i); };
      grid.appendChild(card);
    });
    $('total-stars').textContent = totalStars();
    $('map-credits').textContent = fmt(progress.credits);
  }

  function showLevels() { renderGrid(); show('levels'); nav.index = 0; refreshNav(); }
  function showArmory() { renderShop(); show('armory'); nav.index = 0; refreshNav(); }

  const show = (id) => { $(id).classList.remove('hidden'); if (game) game.paused = true; };
  const anyOpen = () =>
    ['result', 'levels', 'title', 'armory', 'arming', 'help']
      .some((k) => !$(k).classList.contains('hidden'));
  const topOverlay = () =>
    ['help', 'arming', 'armory', 'result', 'levels', 'title']
      .find((k) => !$(k).classList.contains('hidden'));
  const hide = (id) => {
    $(id).classList.add('hidden');
    if (game && !anyOpen()) game.paused = false;
    refreshNav();
  };

  /* ---------- flow ---------- */

  function start(index) {
    ['title', 'result', 'levels', 'armory', 'arming', 'help'].forEach(hide);
    game.setLoadout(progress.owned);
    game.setModules(progress.modules);
    game.load(index);
    showArming();          // every turn opens with the arming panel
    const hint = $('hint');
    hint.textContent = BATTLES[index].tip || 'Drag back from your platform to aim & fire';
    hint.classList.remove('gone');
    clearTimeout(start._t);
    start._t = setTimeout(() => hint.classList.add('gone'), 5200);
  }

  /* Which build is this page actually running? serve.py stamps every script
     URL with the file's mtime, so the newest stamp is the build. Worth showing:
     a stale cached page is otherwise indistinguishable from a broken feature,
     which is exactly how an hour gets lost. */
  function buildStamp() {
    const versions = [...document.querySelectorAll('script[src]')]
      .map((el) => Number((el.getAttribute('src').match(/\?v=(\d+)/) || [])[1] || 0));
    const newest = Math.max(0, ...versions);
    if (!newest) return 'build: unstamped (served without cache-busting)';
    const d = new Date(newest * 1000);
    return 'build ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function onTurnStart() { showArming(); }

  function bind(g) {
    game = g;
    g.hooks.onTurnStart = onTurnStart;
    loadProgress();
    const stamp = buildStamp();
    ['build-title', 'build-map'].forEach((id) => { if ($(id)) $(id).textContent = stamp; });
    applyFaction(progress.faction);
    game.setLoadout(progress.owned);
    game.setModules(progress.modules);

    document.querySelectorAll('.faction-card').forEach((card) => {
      card.onclick = () => {
        Sfx.unlock(); Sfx.click();
        applyFaction(card.dataset.faction);
        const next = BATTLES.findIndex((_, i) => starsFor(i) === 0 && unlocked(i));
        start(next === -1 ? 0 : next);
      };
    });

    $('btn-menu').onclick = () => { Sfx.click(); showLevels(); };
    $('btn-arm').onclick = () => { Sfx.click(); showArming(); };
    $('btn-keys').onclick = () => { Sfx.click(); showHelp(); };
    $('btn-close-help').onclick = () => { Sfx.click(); hide('help'); };
    $('btn-close-help-2').onclick = () => { Sfx.click(); hide('help'); };
    $('btn-ready').onclick = () => { Sfx.click(); hide('arming'); game.beginAiming(); };
    $('btn-close-arming').onclick = () => { Sfx.click(); hide('arming'); game.beginAiming(); };
    $('btn-fire').onclick = () => { Sfx.click(); game.fireAll(); };
    $('btn-next-mount').onclick = () => game.nextMount();
    $('btn-prev-mount').onclick = () => game.cycleMount(-1);
    $('btn-close-levels').onclick = () => { Sfx.click(); hide('levels'); };
    $('btn-armory').onclick = () => { Sfx.click(); hide('levels'); showArmory(); };
    $('btn-armory-2').onclick = () => { Sfx.click(); showArmory(); };
    $('btn-close-armory').onclick = () => {
      Sfx.click(); hide('armory');
      if ($('result').classList.contains('hidden') && game.state === 'over') showLevels();
    };
    $('btn-retry').onclick = () => { Sfx.click(); hide('result'); game.restart(); };
    $('btn-replay').onclick = () => { Sfx.click(); hide('result'); game.restart(); };
    $('btn-switch').onclick = () => { Sfx.click(); hide('levels'); show('title'); };
    $('btn-mute').onclick = (e) => { e.currentTarget.textContent = Sfx.toggleMute() ? '🔇' : '🔊'; };
    $('btn-wipe').onclick = () => {
      if (!confirm('Reset stars, scores, credits, mounts and modules?')) return;
      progress = { stars: {}, best: {}, faction: progress.faction, credits: 0,
                   owned: [STARTING_WEAPON], modules: [] };
      saveProgress();
      game.setLoadout(progress.owned);
      game.setModules(progress.modules);
      renderGrid();
    };

    renderGrid();
    refreshNav();
    return {
      hud, showResult, showLevels, showArmory, showArming, renderArming, onTurnStart, start, hide,
      ownedWeapons: () => progress.owned,
      isOverlayOpen: anyOpen,
      topOverlay,
      showHelp,
      nav: { move: navMove, activate: navActivate, columns: navColumns, refresh: refreshNav },
    };
  }

  return { bind };
})();
