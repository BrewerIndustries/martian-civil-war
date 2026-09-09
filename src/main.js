/* Martian Civil War — bootstrap: wire the canvas, the UI and the keyboard.

   Everything in the game is reachable from the keyboard alone. Overlays hand
   a shared cursor to the UI layer (arrows move it, Enter takes it), and the
   field has its own set for driving, laying guns and firing. */

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
  const releaseDrive = () => { drive.left = drive.right = false; applyDrive(); };

  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'a') { drive.left = false; applyDrive(); }
    if (k === 'd') { drive.right = false; applyDrive(); }
  });
  window.addEventListener('blur', releaseDrive);

  const isOpen = (id) => !document.getElementById(id).classList.contains('hidden');

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    const open = ui.isOverlayOpen();
    const top = ui.topOverlay();

    // ---- always available ----
    if (k === '?' || (k === '/' && e.shiftKey) || k === 'h') {
      e.preventDefault();
      if (isOpen('help')) ui.hide('help'); else ui.showHelp();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (top) ui.hide(top === 'arming' ? 'arming' : top);
      else ui.showLevels();
      if (top === 'arming') game.beginAiming();
      return;
    }
    if (k === 'm') {
      document.getElementById('btn-mute').textContent = Sfx.toggleMute() ? '🔇' : '🔊';
      return;
    }

    // ---- an overlay owns the keyboard while it is up ----
    if (open) {
      releaseDrive();
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const cols = ui.nav.columns();
        if (e.key === 'ArrowLeft') ui.nav.move(-1);
        if (e.key === 'ArrowRight') ui.nav.move(1);
        if (e.key === 'ArrowUp') ui.nav.move(-cols);
        if (e.key === 'ArrowDown') ui.nav.move(cols);
        return;
      }
      if (top === 'arming') {
        if (e.code === 'Space') { e.preventDefault(); ui.nav.activate(); return; }
        if (e.key === 'Enter') {
          e.preventDefault();
          ui.hide('arming'); game.beginAiming();
          return;
        }
        if (e.key >= '1' && e.key <= '9') {
          const pick = game.owned[Number(e.key) - 1];
          if (pick) { game.toggleMount(pick); ui.renderArming(); ui.nav.refresh(); }
          return;
        }
        if (k === 'v') { e.preventDefault(); ui.hide('arming'); game.beginAiming(); return; }
        return;
      }
      if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); ui.nav.activate(); return; }
      if (k === 'b' && top !== 'armory') { e.preventDefault(); ui.showArmory(); return; }
      return;
    }

    // ---- the field ----
    if (k === 'a' || k === 'd') {
      e.preventDefault();
      if (k === 'a') drive.left = true; else drive.right = true;
      applyDrive();
      return;
    }
    if (e.code === 'Space') { e.preventDefault(); game.useAbility(); return; }
    if (e.key === 'Enter') { e.preventDefault(); game.nextMount(); return; }
    if (k === 'f') { e.preventDefault(); game.fireAll(); return; }
    if (k === 'v') { e.preventDefault(); ui.showArming(); return; }
    if (k === 'b') { e.preventDefault(); ui.showArmory(); return; }
    if (k === 'c') { e.preventDefault(); ui.showLevels(); return; }
    if (e.key === '[' || k === 'q') { e.preventDefault(); game.cycleMount(-1); return; }
    if (e.key === ']' || k === 'e') { e.preventDefault(); game.cycleMount(1); return; }

    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      const big = e.shiftKey ? 5 : 1;
      if (e.key === 'ArrowLeft') game.nudge(big, 0);
      if (e.key === 'ArrowRight') game.nudge(-big, 0);
      if (e.key === 'ArrowUp') game.nudge(0, 0.01 * big);
      if (e.key === 'ArrowDown') game.nudge(0, -0.01 * big);
      return;
    }

    if (e.repeat) return;
    if (e.key >= '1' && e.key <= '9') {
      const pick = game.owned[Number(e.key) - 1];
      if (pick) game.toggleMount(pick);
      return;
    }
    if (k === 'r') { game.restart(); return; }
  });

  window.MCW = { game, BATTLES, WEAPONS, MODULES, ui };
})();
