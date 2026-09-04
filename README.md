# Martian Civil War

An artillery duel on a dying Mars. The Red Martians and the Green Martians are
at each other's throats; you pick a house, crew its assault platform, and trade
shots with the enemy platform across broken ground until one of you stops
answering.

The terrain is a combatant, not scenery. Every shell removes real ground, so
the ridge between you and them is a problem you can solve two ways: arc over
it, or spend shots boring a tunnel straight through and fire down the corridor.

**Play:** drag back from your platform to aim, release to fire. The preview
shows the shot's real arc up to its **apex** — enough to judge shape and reach,
not enough to tell you where it lands. **A/D** drive the platform (costs fuel),
**Space** triggers the loaded mount's trick mid-flight. Arrow keys make fine
gunnery adjustments (**←→** elevation, **↑↓** charge, hold **Shift** for
coarse), **Enter** fires, **1–9** select a mount, **R** restarts, **Esc** opens
the campaign map, **M** mutes.

- **Live (prod):** not yet published
- **Dev:** http://localhost:4791

## What's in it

- **Two houses.** Pick Red or Green on the title screen; the other crews the
  platform shooting back. Cosmetic — both fight with identical hardware — and
  switchable any time from the campaign map.
- **Destructible bitmask terrain.** Not a heightmap: one byte per world pixel,
  which is what makes tunnels, overhangs and caverns possible at all. Craters
  cut through painted rock strata and scorch their own rims.
- **12 battles** across six terrain profiles (ridge, twin, canyon, plateau,
  spires, crater) with an enemy gunner that ranges you better as you progress.
  Stars are awarded on hull remaining; each battle unlocks the next.
- **An armory.** Mounts are permanent — bought once with salvage credits, then
  yours for every battle after. You are not rationed shots; buying a mount buys
  options, not ammunition.

  | Mount | Cost | Behaviour |
  |---|---|---|
  | Laser Cannon | free | standard arc — flat, fast, honest |
  | Scatter Pod | 10,000 | **Space** fans it into three, cratering a stretch of ground; light, so wind pushes it |
  | Fusion Charge | 22,000 | heavy and drops fast; **Space** detonates early. Huge crater |
  | Volley Battery | 30,000 | **3 shells per launch**, fanned |
  | Rail Spike | 38,000 | flat, wind-proof, **bores through rock**; **Space** punches forward |
  | Ion Lance | 46,000 | **dead straight — no arc at all**, immune to wind, dissipates at range |
  | Seeker Drone | 58,000 | **Space** locks it onto the enemy platform |
  | Barrage Mortar | 66,000 | **4 shells** that walk out across the ground |
  | Singularity | 80,000 | collapses a well; removes a great deal of landscape |

  Mounts differ in how they *fly*, not just in their numbers. Each has its own
  gravity and wind response, so a Rail Spike shoots flat through a gale while a
  Fusion Charge lobs and drops. The Ion Lance cannot arc over anything at
  all — which is exactly why it pairs with tunnelling: bore a corridor through
  the ridge with the Rail Spike, then fire the lance straight down it.

- **Fuel.** You get an allowance each turn (spent per pixel, refilled at the
  start of every turn), so **A/D** reposition the platform onto better ground.
  Drive off a ledge and you fall — and take the landing damage.

- **Wind**, re-rolled each round and shown in the firing readout, plus a hull
  bar over each platform. Undermine the ground beneath a platform and it falls
  — and takes damage on landing.

## Running it

No build step and no dependencies — it's a static site.

```bash
python3 -m http.server 4791
```

Then open http://localhost:4791.

### Dev / test split

Two local instances run side by side off separate git worktrees, so you can
break things on `dev` while still having a stable build to play and compare
against:

| Instance | Branch | Directory | URL |
|---|---|---|---|
| dev | `dev` | `martian-civil-war/` | http://localhost:4791 |
| test | `test` | `martian-civil-war-test/` | http://localhost:4792 |

They are different origins, so each keeps its **own** saved progress in
`localStorage` — clearing one does not touch the other.

```bash
# set up once
git branch test dev && git worktree add ../martian-civil-war-test test
# promote a build worth keeping
git -C ../martian-civil-war-test merge --ff-only dev
```

## Layout

| Path | What |
|---|---|
| `index.html` | Shell: canvas, HUD, firing readout, overlays |
| `src/levels.js` | World constants, houses, weapon roster, the campaign |
| `src/terrain.js` | Destructible bitmask terrain: generation, collision, carving |
| `src/game.js` | Ballistics, damage, turn machine, the enemy gunner |
| `src/render.js` | All drawing — sky, platforms, shells, effects |
| `src/ui.js` | HUD, armory, campaign map, saved progress |
| `src/audio.js` | Synthesised sound (WebAudio, no audio files) |
| `src/main.js` | Bootstrap and keyboard |

## Design notes

Things that are the way they are on purpose:

- **Bitmask, not heightmap.** A heightmap is smaller and faster but can only
  describe a surface. It cannot represent a hole bored through a mountain,
  which is the whole point of the battlefield.
- **The preview stops at the apex.** It draws the *real* predicted arc — same
  integrator, same wind, same per-mount drag — but cuts it at the crest. You
  get honest feedback on the shape and reach of a shot without being handed the
  impact point, so ranging the enemy in is still yours to do. If the arc meets
  ground before it crests it stops there and says so, which answers the "over
  the ridge or through it?" question directly. Direct-fire mounts have no apex
  to stop at and line of sight is their whole character, so they draw their
  full beam out to where it dissipates.
- **Additive mounts show their whole fan.** A salvo weapon previews one arc per
  shell it will actually launch, so you can see the spread before committing.
- **Mid-flight tricks prompt on the shell.** A mount's ability is worthless if
  nobody learns it exists, and a small HUD label was too easy to miss, so the
  prompt rides on the shell while the window to use it is open.
- **One integrator.** Live flight, the aim indicator and the enemy gunner's
  search all run through the same `_advance`, so what the AI predicts is
  exactly what happens.
- **Guaranteed firing lanes.** Terrain generation clamps the ground beside each
  platform. Without it, a profile like `spires` can throw up a tower next to a
  gun and wall it in — no shot exists at any angle.
- **The gunner solves, then misses.** It searches coarse, refines around its
  best few solutions, and only then degrades the result by its skill. On broken
  ground the set of shots that reach you can be a narrow needle; a coarse grid
  found it only by luck, which made the difficulty setting meaningless on some
  maps. A poor gunner is now a good gunner with shaky hands.
- **Symmetric hulls.** Both platforms field the same hull in a given battle.
  Growing only the enemy's made the late campaign arithmetic-impossible.
- **Fixed 60 Hz accumulator**, so the game plays at the same speed on a 120 Hz
  display.
- **The canvas freezes while an overlay is open.** Overlays sit on a
  `backdrop-filter` blur; re-blurring a canvas that is still animating
  underneath makes the panel shimmer and flash every frame. Once an overlay is
  up the game paints one last frame and then holds still, giving the blur a
  static backdrop. A resize still forces a repaint.
- **The HUD only rebuilds when it changes.** It is emitted on every drag frame,
  and tearing down the weapon buttons 60 times a second restarted their CSS
  transitions and made them flicker.

## Tinkering

`window.MCW` exposes `game`, `BATTLES` and `WEAPONS`. Useful handles:

```js
MCW.game.devStep(600)                       // advance the battle headlessly
MCW.game.trace(MCW.game.foe, 45, 0.9, 'laser')   // where would that shot land?
MCW.game.setLoadout(Object.keys(WEAPONS))   // mount everything
```

`trace` is the same integrator the game and the AI use, which makes it a
reliable way to check balance changes without playing them out.

## Notes

- Balance was verified headlessly: every battle is winnable with the free Laser
  Cannon alone through battle 9, and the finale is winnable but genuinely tight
  with a bought-up arsenal — which is the intended shape.
- Enemy accuracy runs from ~25% hits in battle 1 to ~92% in battle 12; the
  gunner's search costs about 11 ms per shot.
