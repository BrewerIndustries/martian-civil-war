/* Martian Civil War — DOM layer: HUD, armory, campaign map, saved progress. */

const UI = (() => {
  const KEY = 'martian-civil-war:v2';
  const $ = (id) => document.getElementById(id);

  let game = null;
  let progress = { stars: {}, best: {}, faction: 'red', credits: 0, owned: [STARTING_WEAPON] };

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

    // Mounted weapons. The HUD is emitted on every drag frame, so only rebuild
    // this when it actually changed — tearing down and recreating the buttons
    // 60 times a second restarts their CSS transitions and makes them flicker.
    const rack = $('weapon-rack');
    const yours = weaponList().filter((w) => s.owned.includes(w));
    const sig = yours.join(',') + '|' + s.weapon + '|' + (s.canAbility ? 1 : 0);
    if (sig !== hud._sig) {
      hud._sig = sig;
      rack.innerHTML = yours.map((w, i) => {
        const cls = w === s.weapon ? 'ammo current' : 'ammo';
        return `<button class="${cls}" data-weapon="${w}" title="${WEAPONS[w].name} (${i + 1})">${WEAPONS[w].icon}</button>`;
      }).join('') +
        `<span class="ammo-name">${s.canAbility ? 'Space!' : WEAPONS[s.weapon].name}</span>`;
      rack.querySelectorAll('[data-weapon]').forEach((b) => {
        b.onclick = () => game.selectWeapon(b.dataset.weapon);
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

    $('ro-turn').textContent =
      s.state === 'over' ? '—'
      : s.state === 'enemy' || (s.state === 'flight' && !s.canAbility) ? 'Incoming'
      : s.state === 'flight' ? 'In flight'
      : 'Your shot';
  }

  /* ---------- armory ---------- */

  function renderShop() {
    $('armory-credits').textContent = fmt(progress.credits);
    const shop = $('weapon-shop');
    shop.innerHTML = '';
    weaponList().forEach((id) => {
      const w = WEAPONS[id];
      const owned = progress.owned.includes(id);
      const affordable = progress.credits >= w.cost;
      const card = document.createElement('div');
      card.className = 'shop-card' + (owned ? ' owned' : affordable ? '' : ' locked');
      card.innerHTML =
        `<span class="shop-icon">${w.icon}</span>` +
        `<div class="shop-body">` +
          `<span class="shop-name">${w.name}</span>` +
          `<span class="shop-blurb">${w.blurb}</span>` +
          `<span class="shop-stats"><em>${w.behaviour}</em> · ${w.damage} dmg` +
            `${w.salvo ? ` ×${w.salvo.count}` : ''} · ${w.blast} blast · ${w.dig} dig</span>` +
        `</div>`;
      const btn = document.createElement('button');
      btn.className = 'btn tiny ' + (owned ? 'ghost' : affordable ? 'primary' : 'ghost');
      btn.textContent = owned ? 'Mounted' : `${fmt(w.cost)} cr`;
      btn.disabled = owned || !affordable;
      btn.onclick = () => buy(id);
      card.appendChild(btn);
      shop.appendChild(card);
    });
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

  function showLevels() { renderGrid(); show('levels'); }
  function showArmory() { renderShop(); show('armory'); }

  const show = (id) => { $(id).classList.remove('hidden'); if (game) game.paused = true; };
  const hide = (id) => {
    $(id).classList.add('hidden');
    const open = ['result', 'levels', 'title', 'armory'].some((k) => !$(k).classList.contains('hidden'));
    if (game && !open) game.paused = false;
  };

  /* ---------- flow ---------- */

  function start(index) {
    ['title', 'result', 'levels', 'armory'].forEach(hide);
    game.setLoadout(progress.owned);
    game.load(index);
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

  function bind(g) {
    game = g;
    loadProgress();
    const stamp = buildStamp();
    ['build-title', 'build-map'].forEach((id) => { if ($(id)) $(id).textContent = stamp; });
    applyFaction(progress.faction);
    game.setLoadout(progress.owned);

    document.querySelectorAll('.faction-card').forEach((card) => {
      card.onclick = () => {
        Sfx.unlock(); Sfx.click();
        applyFaction(card.dataset.faction);
        const next = BATTLES.findIndex((_, i) => starsFor(i) === 0 && unlocked(i));
        start(next === -1 ? 0 : next);
      };
    });

    $('btn-menu').onclick = () => { Sfx.click(); showLevels(); };
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
      if (!confirm('Reset stars, scores, credits and every mount?')) return;
      progress = { stars: {}, best: {}, faction: progress.faction, credits: 0, owned: [STARTING_WEAPON] };
      saveProgress();
      game.setLoadout(progress.owned);
      renderGrid();
    };

    renderGrid();
    return {
      hud, showResult, showLevels, showArmory, start, hide,
      ownedWeapons: () => progress.owned,
      isOverlayOpen: () =>
        ['result', 'levels', 'title', 'armory'].some((k) => !$(k).classList.contains('hidden')),
    };
  }

  return { bind };
})();
