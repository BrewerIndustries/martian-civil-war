/* Martian Civil War — bootstrap: wire the canvas, the UI and the keyboard. */

(() => {
  const canvas = document.getElementById('stage');
  let ui = null;

  const game = new Game(canvas, {
    onHud: (s) => ui && ui.hud(s),
    onResult: (r) => setTimeout(() => ui && ui.showResult(r), r.won ? 900 : 700),
  });

  ui = UI.bind(game);

  // Held drive keys. Movement is applied on the physics step, not per keydown,
  // so it runs at a steady rate rather than at the OS key-repeat rate.
  const drive = { left: false, right: false };
  const applyDrive = () => game.setDrive((drive.right ? 1 : 0) - (drive.left ? 1 : 0));

  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'a') { drive.left = false; applyDrive(); }
    if (k === 'd') { drive.right = false; applyDrive(); }
  });
  window.addEventListener('blur', () => { drive.left = drive.right = false; applyDrive(); });

  window.addEventListener('keydown', (e) => {
    const open = ui.isOverlayOpen();

    const k = e.key.toLowerCase();
    if (!open && (k === 'a' || k === 'd')) {
      e.preventDefault();
      if (k === 'a') drive.left = true; else drive.right = true;
      applyDrive();
      return;
    }
    if (open && (drive.left || drive.right)) { drive.left = drive.right = false; applyDrive(); }

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
