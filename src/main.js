/* Martian Civil War — bootstrap: wire the canvas, the UI and the keyboard. */

(() => {
  const canvas = document.getElementById('stage');
  let ui = null;

  const game = new Game(canvas, {
    onHud: (s) => ui && ui.hud(s),
    onResult: (r) => setTimeout(() => ui && ui.showResult(r), r.won ? 900 : 700),
  });

  ui = UI.bind(game);

  window.addEventListener('keydown', (e) => {
    const open = ui.isOverlayOpen();

    if (e.code === 'Space') {                 // mount's trick, mid-flight
      e.preventDefault();
      if (!open) game.useAbility();
      return;
    }
    if (!open && e.key === 'Enter') { e.preventDefault(); game.fire(); return; }

    // Fine gunnery. Hold Shift for coarse adjustment.
    if (!open && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      const big = e.shiftKey ? 5 : 1;
      if (e.key === 'ArrowLeft')  game.nudge(big, 0);
      if (e.key === 'ArrowRight') game.nudge(-big, 0);
      if (e.key === 'ArrowUp')    game.nudge(0, 0.01 * big);
      if (e.key === 'ArrowDown')  game.nudge(0, -0.01 * big);
      return;
    }

    if (e.repeat) return;

    if (!open && e.key >= '1' && e.key <= '6') {
      const list = weaponList().filter((w) => ui.ownedWeapons().includes(w));
      const pick = list[Number(e.key) - 1];
      if (pick) game.selectWeapon(pick);
      return;
    }
    if (e.key === 'r' || e.key === 'R') { if (!open) game.restart(); return; }
    if (e.key === 'm' || e.key === 'M') {
      document.getElementById('btn-mute').textContent = Sfx.toggleMute() ? '🔇' : '🔊';
      return;
    }
    if (e.key === 'Escape') {
      if (document.getElementById('levels').classList.contains('hidden')) ui.showLevels();
      else ui.hide('levels');
    }
  });

  window.MCW = { game, BATTLES, WEAPONS, ui };
})();
