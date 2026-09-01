/* Martian Civil War — bootstrap: wire the canvas, the UI and the keyboard. */

(() => {
  const canvas = document.getElementById('stage');
  let ui = null;

  const game = new Game(canvas, {
    onHud: (s) => ui && ui.hud(s),
    onResult: (r) => setTimeout(() => ui && ui.showResult(r), r.won ? 900 : 600),
  });

  ui = UI.bind(game);

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const open = ui.isOverlayOpen();

    if (e.code === 'Space') {
      e.preventDefault();
      if (!open) game.useAbility();
      return;
    }
    if (e.key === 'r' || e.key === 'R') { if (!open) game.restart(); return; }
    if (e.key === 'm' || e.key === 'M') {
      const m = Sfx.toggleMute();
      document.getElementById('btn-mute').textContent = m ? '🔇' : '🔊';
      return;
    }
    if (e.key === 'Escape') {
      if (document.getElementById('levels').classList.contains('hidden')) ui.showLevels();
      else ui.hide('levels');
    }
  });

  // Expose for quick console tinkering while building levels.
  window.CB = { game, LEVELS, TUNING, validateLevels };
})();
