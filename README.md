# Martian Civil War

An artillery duel on a dying Mars. The Red Martians and the Green Martians are
at each other's throats; you pick a house, crew its **assault platform** — a
building on wheels, bristling with guns — and trade broadsides with the enemy
platform across broken ground until one of you stops answering.

A turn is a **broadside, not a shot**. Every mount you own fires on the same
firing solution, and because each flies differently the volley scatters across
the target. Early on, with one mount, it is a precise duel; a full arsenal
turns it into a barrage. You do not snipe with a fortress, you saturate.

The terrain is a combatant, not scenery. Every shell removes real ground, so
the ridge between you and them is a problem you can solve two ways: arc over
it, or spend shots boring a tunnel straight through and fire down the corridor.

**Play:** drag back from your platform to aim, release to fire the whole
broadside. The preview draws one arc per mount, each stopping at its **apex** —
enough to judge shape and reach, not enough to tell you where they land.
**A/D** drive the platform (costs fuel), **Space** triggers every mid-flight
trick in the volley at once. Arrow keys make fine gunnery adjustments
(**←→** elevation, **↑↓** charge, hold **Shift** for coarse), **Enter** fires,
**R** restarts, **Esc** opens the campaign map, **M** mutes.

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
- **An armory.** Everything is permanent — bought once with salvage credits,
  then fitted for every battle after. Buying a mount adds a barrel to the
  broadside, so firepower scales directly with what you own.

  | Mount | Cost | Behaviour |
  |---|---|---|
  | Laser Cannon | free | standard arc — flat, fast, honest |
  | Scatter Pod | 10,000 | bursts into three during the climb (**Space** to burst early); loft it for a wide pattern, flat for a tight one |
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

- **Modules**, alongside the mounts — a fortress is a structure, so it can
  carry more than guns:

  | Module | Cost | Effect |
  |---|---|---|
  | Ablative Plating | 14,000 | +70 hull |
  | Reinforced Frame | 34,000 | +150 hull |
  | Blast Baffles | 18,000 | near misses hurt 45% less |
  | Deflector Screen | 26,000 | −15% of all damage taken |
  | Repair Gantry | 42,000 | +14 hull per turn |
  | Reactor Uprate | 12,000 | +60 fuel per turn |
  | Heavy Treads | 20,000 | climbs steeper, drives quicker |
  | Inertial Dampers | 16,000 | −65% fall damage |

- **Fuel.** You get an allowance each turn (spent per pixel, refilled at the
  start of every turn), so **A/D** reposition the platform onto better ground.
  Drive off a ledge and you fall — and take the landing damage.

- **Wind**, re-rolled each round and shown in the firing readout, plus a hull
  bar over each platform. Undermine the ground beneath a platform and it falls
  — and takes damage on landing.

## Running it

No build step and no dependencies — it's a static site.

```bash
python3 serve.py 4791
```

Then open http://localhost:4791.

Use `serve.py` rather than `python3 -m http.server`: the built-in server sends
no cache directives, so browsers apply heuristic caching and keep serving a
stale `.js` after you edit it, even through a normal reload. `serve.py` sends
`no-store`, so a reload always gets what is on disk.

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
# serve the test copy
python3 ../martian-civil-war-test/serve.py 4792 ../martian-civil-war-test
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
| `serve.py` | No-cache static dev server |

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
  prompt rides on the shell while the window to use it is open. A mount whose
  entire identity is its trick (the Scatter Pod) also fires itself part way up
  the climb if untriggered, so it can never look like a dud; Space bursts it
  early, which is how you actually aim the spread.
- **Scatter spread comes from speed, not angle.** Range goes as v², so a speed
  differential separates the shards smoothly at any launch angle. Perturbing
  the angle as well was wildly erratic — measured 28px to 621px across the
  angle range — because the two effects interact nonlinearly and then meet
  uneven ground. The residual angular fan is cosmetic: it separates the shards
  visibly in the air without driving where they land.
- **The build stamp is on the title screen and campaign map.** A stale cached
  page is otherwise indistinguishable from a broken feature.
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
- **Symmetric hulls, sized for broadsides.** Both platforms field the same base
  hull in a given battle (your modules are then yours alone). Hulls are far
  larger than when a turn meant one shell — a late volley puts a couple of
  hundred points downrange, and the old 188 hull would have ended a battle in
  two exchanges. Hull grows with the *battle*, never with the player's arsenal,
  so buying mounts genuinely tilts the fight; that is what credits are for.
  Verified: battle 12 is unwinnable with one or two mounts (0/5) and
  comfortable with six plus modules (5/5, ~42% hull left).
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
