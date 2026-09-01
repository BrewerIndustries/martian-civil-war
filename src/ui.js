/* Martian Civil War — DOM layer: HUD, overlays, campaign map and saved progress. */

const UI = (() => {
  const KEY = 'martian-civil-war:v1';
  const $ = (id) => document.getElementById(id);

  let game = null;
  let progress = { stars: {}, best: {}, faction: 'red' };
  let lastResult = null;

  function loadProgress() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        progress = { stars: p.stars || {}, best: p.best || {}, faction: FACTIONS[p.faction] ? p.faction : 'red' };
      }
    } catch (e) { /* private mode / disabled storage — play without saving */ }
  }

  function saveProgress() {
    try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch (e) {}
  }

  const starsFor = (i) => progress.stars[i] || 0;
  const bestFor = (i) => progress.best[i] || 0;
  const unlocked = (i) => i === 0 || starsFor(i - 1) > 0;
  const totalStars = () => LEVELS.reduce((n, _, i) => n + starsFor(i), 0);

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
    $('hud-level').textContent = `Assault ${s.level + 1}`;
    $('hud-name').textContent = s.name;
    $('hud-score').textContent = s.score.toLocaleString();

    const rack = $('ammo-rack');
    const spent = s.used;
    const all = LEVELS[s.level].ammo;
    let html = '';
    all.forEach((kind, i) => {
      const cls = i < spent ? 'ammo spent' : i === spent ? 'ammo current' : 'ammo';
      html += `<span class="${cls}" title="${AMMO[kind].name}">${AMMO[kind].icon}</span>`;
    });
    const next = all[spent];
    const label = s.canAbility ? 'Space!' : next ? AMMO[next].name : 'Out of ammo';
    html += `<span class="ammo-name">${label}</span>`;
    rack.innerHTML = html;

    const foe = FACTIONS[otherFaction(progress.faction)].short;
    $('target-counter').innerHTML = s.targets > 0
      ? `${foe} defenders <b>${s.targets}</b>`
      : `<b>Redoubt cleared</b>`;
  }

  /* ---------- result panel ---------- */

  function showResult(res) {
    lastResult = res;
    const prevStars = starsFor(res.level);
    const prevBest = bestFor(res.level);

    if (res.won) {
      if (res.stars > prevStars) progress.stars[res.level] = res.stars;
      if (res.total > prevBest) progress.best[res.level] = res.total;
      saveProgress();
    }

    $('result-title').textContent = res.won ? 'Redoubt Taken!' : 'Out of Ordnance';
    $('rs-demo').textContent = res.demolition.toLocaleString();
    $('rs-shots').textContent = res.won ? `${res.saved} × ${(5000).toLocaleString()}` : '—';
    $('rs-total').textContent = res.total.toLocaleString();
    $('rs-best').textContent = Math.max(prevBest, res.won ? res.total : 0).toLocaleString();

    const msgs = res.won
      ? (res.stars === 3 ? 'Textbook siege. Not a shot wasted.'
        : res.stars === 2 ? 'Taken — but the quartermaster noticed.'
        : 'Ugly, effective, expensive.')
      : 'The garrison holds. Try a different angle.';
    $('result-msg').textContent = msgs;

    const wrap = $('result-stars');
    wrap.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const s = document.createElement('span');
      s.className = 'star';
      s.textContent = '★';
      wrap.appendChild(s);
      if (i < res.stars) {
        setTimeout(() => {
          s.classList.add('on', 'pop');
          Sfx.star(i);
        }, 420 + i * 260);
      }
    }

    const next = $('btn-next');
    const hasNext = res.level + 1 < LEVELS.length;
    next.textContent = res.won ? (hasNext ? 'Next Assault' : 'Campaign Map') : 'Retry';
    next.onclick = () => {
      Sfx.click();
      hide('result');
      if (!res.won) game.restart();
      else if (hasNext) start(res.level + 1);
      else showLevels();
    };
    $('btn-replay').style.display = res.won ? '' : 'none';

    show('result');
  }

  /* ---------- level select ---------- */

  function renderGrid() {
    const grid = $('level-grid');
    grid.innerHTML = '';
    LEVELS.forEach((lv, i) => {
      const st = starsFor(i);
      const open = unlocked(i);
      const card = document.createElement('button');
      card.className = 'level-card' + (open ? '' : ' locked') + (st > 0 ? ' cleared' : '');
      card.innerHTML =
        `<span class="n">Assault ${i + 1}</span>` +
        `<span class="t">${lv.name}</span>` +
        `<span class="s">${[0, 1, 2].map((k) => `<span class="${k < st ? 'on' : ''}">★</span>`).join('')}</span>`;
      if (open) card.onclick = () => { Sfx.click(); hide('levels'); start(i); };
      grid.appendChild(card);
    });
    $('total-stars').textContent = totalStars();
  }

  function showLevels() { renderGrid(); show('levels'); }

  const show = (id) => { $(id).classList.remove('hidden'); if (game) game.paused = true; };
  const hide = (id) => {
    $(id).classList.add('hidden');
    const anyOpen = ['result', 'levels', 'title'].some((k) => !$(k).classList.contains('hidden'));
    if (game && !anyOpen) game.paused = false;
  };

  /* ---------- flow ---------- */

  function start(index) {
    hide('title'); hide('result'); hide('levels');
    game.load(index);
    const hint = $('hint');
    hint.textContent = LEVELS[index].tip || 'Drag back from the siege engine to aim & fire';
    hint.classList.remove('gone');
    clearTimeout(start._t);
    start._t = setTimeout(() => hint.classList.add('gone'), 4200);
  }

  function bind(g) {
    game = g;
    loadProgress();

    applyFaction(progress.faction);

    document.querySelectorAll('.faction-card').forEach((card) => {
      card.onclick = () => {
        Sfx.unlock(); Sfx.click();
        applyFaction(card.dataset.faction);
        const next = LEVELS.findIndex((_, i) => starsFor(i) === 0 && unlocked(i));
        start(next === -1 ? 0 : next);
      };
    });

    $('btn-switch').onclick = () => {
      Sfx.click();
      hide('levels');
      show('title');
    };
    $('btn-menu').onclick = () => { Sfx.click(); showLevels(); };
    $('btn-close-levels').onclick = () => { Sfx.click(); hide('levels'); };
    $('btn-retry').onclick = () => { Sfx.click(); hide('result'); game.restart(); };
    $('btn-replay').onclick = () => { Sfx.click(); hide('result'); game.restart(); };
    $('btn-mute').onclick = (e) => {
      const m = Sfx.toggleMute();
      e.currentTarget.textContent = m ? '🔇' : '🔊';
    };
    $('btn-wipe').onclick = () => {
      if (!confirm('Reset all stars and scores?')) return;
      progress = { stars: {}, best: {}, faction: progress.faction };
      saveProgress();
      renderGrid();
    };

    renderGrid();
    return { hud, showResult, showLevels, start, hide, isOverlayOpen: () =>
      ['result', 'levels', 'title'].some((k) => !$(k).classList.contains('hidden')) };
  }

  return { bind };
})();
