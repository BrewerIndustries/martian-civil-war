# Martian Civil War

A physics demolition puzzle set on a dying Mars. The Red Martians and the Green
Martians are at each other's throats; you pick a house, crew its siege engine,
and knock the other side's redoubts down with a strictly limited supply of
ordnance.

**Play:** drag back from the siege engine to aim, let go to fire. **Space**
triggers the loaded shell's trick mid-flight. **R** restarts, **Esc** opens the
campaign map, **M** mutes.

- **Live (prod):** https://martian-civil-war.dabrewer.dev/
- **Dev:** https://martian-civil-war.dabrewer.dev/dev/

## What's in it

- **Two houses.** Pick Red or Green on the title screen; the other side
  garrisons every redoubt. The choice is cosmetic — both fight identically —
  and you can switch sides any time from the campaign map.
- **12 hand-built assaults** with a par shot count and 1–3 star ratings.
  Progress, stars and best scores persist in `localStorage`; each assault
  unlocks the next.
- **Four kinds of ordnance**, three with an ability on **Space**:
  | Shell | Trick |
  |---|---|
  | Round Shot | — heavy and honest |
  | Radium Bomb | detonates in flight |
  | Scatter Shell | bursts into three |
  | Piercer | punches forward; the only thing that reliably cracks steel |
- **Five materials** that behave differently: skeel timber, basalt, crystal
  (shatters at a touch, carries no weight), steel (near indestructible) and
  radium charges, which go off and chain-react.
- Damage is real: blocks accumulate cracks and collapse under load, so the
  best shots take a structure's legs out rather than hitting defenders directly.

## Running it

No build step — it's a static site.

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
`localStorage` — clearing stars on one does not touch the other.

Set the test worktree up once:

```bash
git branch test dev && git worktree add ../martian-civil-war-test test
```

Promote dev to test when a build is worth keeping:

```bash
git -C ../martian-civil-war-test merge --ff-only dev
```

Serve them (or use the `martian-civil-war-dev` / `-test` entries in
`.claude/launch.json`):

```bash
python3 -m http.server 4792 --directory ../martian-civil-war-test
```

## Layout

| Path | What |
|---|---|
| `index.html` | Shell: canvas, HUD, overlays |
| `src/levels.js` | World constants, factions, materials, ordnance, the level book |
| `src/game.js` | Physics, damage model, explosions, turn state machine |
| `src/render.js` | All drawing — sky, terrain, blocks, warriors, effects |
| `src/ui.js` | HUD, campaign map, saved progress |
| `src/audio.js` | Synthesised sound (WebAudio, no audio files) |
| `src/main.js` | Bootstrap and keyboard |
| `vendor/matter.min.js` | Matter.js 0.20.0 (MIT), vendored so there's no CDN dependency |

## Authoring levels

Levels live in `LEVEL_BOOK` in `src/levels.js`. Each is a function so pieces can
be placed relative to the piece beneath them — `room()` and `tower()` hand back
a `.top`, which is the surface the next thing stacks onto. Coordinates are
**bottom-edge** (`y` is where a piece rests), and canvas Y grows *downward*, so
stacking upward means subtracting.

Two mistakes ruin a castle: pieces that **overlap** (Matter blows them apart on
frame one) and pieces that **float** (the structure jolts as it drops). After
editing, run this in the browser console:

```js
CB.validateLevels()
```

It reports both, per level, without you firing a shot. `CB` also exposes
`game`, `LEVELS` and `TUNING` for live tinkering, plus `game.devStep(n)` to
advance the simulation headlessly — useful for checking that a redesigned level
is still winnable without waiting on animation.

## Notes

- Physics runs on a fixed 60 Hz accumulator, so the game plays at the same
  speed on a 120 Hz display.
- Turn resolution waits on the *bodies* coming to rest, capped in both wall
  clock and physics steps so a stray rolling block can never stall a turn.
- All 12 assaults were verified winnable with an automated greedy shot search
  before shipping.
