# Martian Civil War

An artillery duel on a dying Mars. The Red Martians and the Green Martians are
at each other's throats; you pick a house, crew its **assault platform** — a
building on wheels, bristling with guns — and trade broadsides with the enemy
platform across broken ground until one of you stops answering.

**Every turn runs the same three beats:**

1. **Arm** — the arming panel opens. Choose which mounts to power this volley
   against your **firepower budget**; a big arsenal buys options, not raw
   output.
2. **Lay the guns** — aim each armed mount in turn, one firing solution each.
   Dig with one, go for the hull with another, walk a third onto the ridge.
3. **Fire all** — the whole volley goes at once.

Shields are adjusted in that same panel, so where your armour sits is a
decision you can revisit every turn.

The terrain is a combatant, not scenery. Every shell removes real ground, so
the ridge between you and them is a problem you can solve two ways: arc over
it, or spend shots boring a tunnel straight through and fire down the corridor.

**Play:** the arming panel opens each turn (**Tab** reopens it, **1–9** toggle
mounts). Then drag back from the platform to lay the current gun; **Enter**
confirms it and moves to the next, and **Enter** on the last one fires the
volley. **F** fires immediately, **[** and **]** step between mounts. The
preview draws every armed mount's arc — the gun you are laying bright, the
ones already set dim — each stopping at its **apex** unless you have bought
better targeting. **A/D** drive the platform (costs fuel), **Space** triggers
every mid-flight trick in the volley at once. Arrow keys fine-tune (**←→**
elevation, **↑↓** charge, **Shift** for coarse), **R** restarts, **Esc** opens
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
- **18 battles** across six terrain profiles (ridge, twin, canyon, plateau,
  spires, crater) with an enemy gunner that ranges you better as you progress.
  Stars are awarded on hull remaining; each battle unlocks the next.
- **Fortresses.** Every sixth battle the enemy is not a platform at all but a
  three-tower gun house dug into the ridge: far more hull, a heavier volley,
  and a roster from two battles further on. It cannot be driven off its
  ground — but it is a much wider target, and the rock under it can still be
  taken away.
- **Weak spots and shields.** Both structures are divided into nine zones —
  bridge, magazine, reactor, drive train and so on. Two of them are weak spots
  that take **double damage**, rerolled each battle. You fit shield segments
  over your own grid in the arming panel:

  | Segment | Behaviour |
  |---|---|
  | Armour Plate | soaks damage outright until it is gone, and does not come back mid-battle |
  | Energy Screen | cuts 55% in its zone and recharges between volleys, until it is overloaded |

  Your weak spots are always visible. The enemy's are there whether you can see
  them or not — a **Structural Scanner** buys the sight, not the vulnerability.
- **An armory.** Everything is permanent — bought once with salvage credits,
  then fitted for every battle after. Mounts cost **firepower** to arm, and the
  platform can only power so much per volley, so owning more is about having
  the right tool available rather than firing everything at once.
- **Buy more than one of any gun**, up to four. Each copy is a separate mount:
  it costs its own firepower to arm and is laid with its own firing solution,
  so three Rail Spikes are three guns you aim independently. Repeat copies get
  dearer, and the free Laser Cannon is deliberately the least firepower-
  efficient mount in the game — it costs nothing in credits, so it should not
  also be the best use of the power bus.

  | Mount | Cost | fp | Behaviour |
  |---|---|---|---|
  | Laser Cannon | free | 18 | standard arc — flat, fast, honest |
  | Scatter Pod | 10,000 | 22 | bursts into three during the climb |
  | Fusion Charge | 22,000 | 34 | heavy, drops fast, enormous crater |
  | Volley Battery | 30,000 | 30 | 3 shells, fanned |
  | Flak Battery | 34,000 | 32 | 5 shells, wide fan |
  | Rail Spike | 38,000 | 34 | flat, wind-proof, **bores through rock** |
  | Thermite Charge | 40,000 | 30 | small bite, colossal hole — the tunneller's tool |
  | Ion Lance | 46,000 | 30 | **dead straight, no arc**, dissipates at range |
  | Gauss Repeater | 48,000 | 36 | 6 flat shells that walk across the target |
  | EMP Burst | 56,000 | 34 | barely scratches, but cuts their next volley by 45% |
  | Seeker Drone | 58,000 | 38 | **Space** locks it onto the enemy platform |
  | Bunker Buster | 62,000 | 44 | drives into rock *then* detonates |
  | Barrage Mortar | 66,000 | 40 | 4 shells walking out across the ground |
  | MIRV Cluster | 88,000 | 50 | five independent warheads off one launch |
  | Siege Howitzer | 96,000 | 54 | one enormous shell; ends arguments |
  | Singularity | 110,000 | 48 | collapses a well; removes a lot of landscape |

  Mounts differ in how they *fly*, not just in their numbers. Each has its own
  gravity and wind response, so a Rail Spike shoots flat through a gale while a
  Fusion Charge lobs and drops. The Ion Lance cannot arc over anything at
  all — which is exactly why it pairs with tunnelling: bore a corridor through
  the ridge with the Rail Spike, then fire the lance straight down it.

- **Modules**, alongside the mounts — a fortress is a structure, so it can
  carry more than guns:

  | Module | Cost | Effect |
  |---|---|---|
  | **Hull** | | |
  | Ablative Plating | 14,000 | +70 hull |
  | Ceramic Composite | 28,000 | +120 hull |
  | Reinforced Frame | 46,000 | +190 hull |
  | Redundant Bulkheads | 78,000 | +300 hull |
  | **Shields** | | |
  | Reactive Armour | 12,000 | −10% damage taken |
  | Blast Baffles | 18,000 | near misses hurt 45% less |
  | Deflector Screen | 30,000 | −15% damage taken |
  | Deflector Lattice | 68,000 | −22% damage, −20% splash |
  | Repair Gantry | 42,000 | +14 hull per turn |
  | Nanoforge | 86,000 | +34 hull per turn |
  | **Power** | | |
  | Capacitor Bank | 16,000 | +22 firepower per volley |
  | Superconductor Bus | 34,000 | +30 firepower per volley |
  | Fusion Core | 44,000 | +46 firepower per volley |
  | **Targeting** | | |
  | Rangefinder | 20,000 | marks where the gun you are laying comes down |
  | Gyro Stabilisers | 26,000 | wind moves your shells 60% less |
  | Ballistic Computer | 54,000 | plots the whole arc to impact, not just to the apex |
  | **Drive** | | |
  | Reactor Uprate | 12,000 | +60 fuel per turn |
  | Heavy Treads | 20,000 | climbs steeper, drives quicker |
  | Inertial Dampers | 16,000 | −65% fall damage |

  Plus **Shield Segments** (Plate Rack, Screen Emitters, Shield Grid) which
  give you more to place on the zone grid, and a **Structural Scanner** that
  marks the enemy's weak spots.

  Targeting modules are worth calling out: they upgrade what you are allowed to
  *see*, which in an artillery game is indistinguishable from skill. The
  Ballistic Computer turning the apex-limited preview into a full plot to
  impact is the single biggest purchase in the game.

- **Fuel.** You get an allowance each turn (spent per pixel, refilled at the
  start of every turn), so **A/D** reposition the platform onto better ground.
  Drive off a ledge and you fall — and take the landing damage.

- **Wind**, re-rolled each round and shown in the firing readout, plus a hull
  bar over each platform. Undermine the ground beneath a platform and it falls
  — and takes damage on landing.

## Hosting

GitHub Pages, one site for both builds (`.github/workflows/pages.yml`, lives on `dev`):

| Build | Branch | URL |
|---|---|---|
| prod | `main` | https://martian-civil-war.dabrewer.dev/ |
| dev | `dev` | https://martian-civil-war.dabrewer.dev/dev/ |

Every push to `dev` redeploys both (it checks out `main` into `/` and `dev` into
`/dev/`). Merging to `main` does **not** redeploy on its own — push to `dev` or
use "Run workflow". Promote `dev` → `main` by PR. DNS is a DNS-only
`CNAME martian-civil-war → brewerindustries.github.io` on Cloudflare.

Prod and dev share an origin, so they share saved progress in `localStorage`.

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

## Keyboard

The whole game is playable without a mouse — press **?** in game for the card.
Overlays hand a shared cursor to the UI layer (arrows move it, **Enter** takes
it) rather than each panel growing its own key handling, and activating simply
clicks the same button the mouse would, so there is no second code path to
drift out of step.

| | |
|---|---|
| **V** | arming panel · **Space** arms the highlighted mount · **Enter** done |
| **A** / **D** | drive (spends fuel) |
| **←→** / **↑↓** | elevation / charge, **Shift** for coarse |
| **[** **]** | previous / next mount to lay |
| **Enter** | confirm this gun, move to the next |
| **F** | fire the volley · **Space** triggers mid-flight tricks |
| **B** / **C** | armory / campaign map · **Esc** closes · **R** restart · **M** mute |

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
- **Every mount must be able to cross the field.** Fire control ranges against
  a notional standard mount, and anything slower simply clamps at full charge
  and falls short forever. Six mounts were in that state, including a
  96,000-credit Siege Howitzer that topped out at 997px on a field 1,380px
  wide — it could not reach the enemy at any angle, which is why a howitzer
  build lost every game. A mount's character lives in its `gravityScale` (a
  heavy shell still lobs and drops); `speed` only decides whether it can make
  the distance, and now all of them can.
- **Fire control converges the volley.** Every mount fires on one firing
  solution but each flies differently, so at first adding mounts just scattered
  more of the volley into the dirt — a lone accurate gun beat a full arsenal
  outright (a single laser took battle 12 while six mounts and four modules
  lost it). Each mount now trims its own charge to land where the aim says.
  It is solved by bisection against **flat-ground** range, because pure
  ballistic range is monotonic in charge while real terrain makes landing
  distance jump wherever a shot just clears a crest. A closed form (range ∝
  v²/g) was tried first and was not good enough — it ignores drag, and the
  low-drag mounts overshot by 400-600px; it survives as the opening guess.
  Direct-fire mounts are exempt: an Ion Lance has no arc to match.
- **The gunner ranges through fire control too.** It has to solve for where a
  *trimmed* shell lands, or it aims one place and shoots another. Missing this
  made the enemy miss every shot and left the player on 100% hull.
- **The enemy's firepower budget grows slowly.** Yours only rises when you buy
  a power module, so an enemy budget climbing every battle left the mid
  campaign hopelessly out-volleyed — battle 6 was unwinnable with a sensible
  three-mount loadout. It now tracks a player who has bought one power module
  by mid campaign.
- **Symmetric hulls, sized for broadsides.** Both platforms field the same base
  hull in a given battle (your modules are then yours alone). Hulls are far
  larger than when a turn meant one shell — a late volley puts a couple of
  hundred points downrange, and the old 188 hull would have ended a battle in
  two exchanges. Hull grows with the *battle*, never with the player's arsenal,
  so buying mounts genuinely tilts the fight; that is what credits are for.
  Verified across the campaign: battle 1 with the free mount alone is 4/4,
  the middle battles sit at 4/4 with a loadout that keeps pace, battle 12 is
  unwinnable if you never invested (0/3 on one mount) and a real fight when you
  did (4/4 at ~31% hull). Note the test harness never uses mid-flight
  abilities, so a human plays better than these numbers.
- **Fixed 60 Hz accumulator**, so the game plays at the same speed on a 120 Hz
  display.
- **No `backdrop-filter` anywhere.** Frosted panels flashed twice, for two
  different reasons. HUD chrome sits over a canvas that never stops animating,
  so its blur re-sampled every frame; and panel cards lift on hover, and
  transforming a child inside a backdrop-filtered container makes the browser
  re-composite the blur, which reads as a glitch. Solid backgrounds throughout
  instead. The canvas still freezes while an overlay is open (one final frame,
  then it holds still, with a resize forcing a repaint) because that is worth
  doing on its own.
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
