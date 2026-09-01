/* Martian Civil War — world constants, factions, materiel and the level book.
   Levels are authored with bottom-edge coordinates so pieces stack exactly;
   any overlap at load time would make Matter.js blow the castle apart itself. */

const WORLD = { w: 1800, h: 1000, groundY: 862 };
const CATAPULT = { x: 196, y: WORLD.groundY };

/* The two houses of the Martian civil war. The side you pick crews the siege
   engine; the other garrisons every redoubt you are sent against. The choice
   is cosmetic — both sides field identical ordnance. */
const FACTIONS = {
  red: {
    id: 'red', name: 'Red Martians', short: 'Red', crest: '☉',
    primary: '#c9503a', dark: '#8a2e1f', light: '#ef9070', trim: '#f0cba0',
    blurb: 'Canal-builders of the dead seas. Disciplined, and out of patience.',
  },
  green: {
    id: 'green', name: 'Green Martians', short: 'Green', crest: '⚔️',
    primary: '#63a052', dark: '#3b6a32', light: '#a3d68d', trim: '#d8e8a0',
    blurb: 'Horde of the dry sea bottoms. Six limbs, no forgiveness.',
  },
};
const otherFaction = (id) => (id === 'red' ? 'green' : 'red');

const MATERIALS = {
  wood:  { label: 'Skeel timber', hp: 62,  density: 0.0018, friction: 0.62, restitution: 0.04, fill: '#b3733c', fill2: '#8a5228', edge: '#5c3414', sound: 'crackWood',  score: 120 },
  stone: { label: 'Basalt',       hp: 165, density: 0.0038, friction: 0.72, restitution: 0.02, fill: '#9d8f86', fill2: '#776a62', edge: '#4c433d', sound: 'crackStone', score: 220 },
  ice:   { label: 'Crystal',      hp: 28,  density: 0.0009, friction: 0.16, restitution: 0.10, fill: '#bcd8ee', fill2: '#8fb2d4', edge: '#6d8fb2', sound: 'shatterIce', score: 90,  glass: true },
  metal: { label: 'Steel',        hp: 900, density: 0.0062, friction: 0.55, restitution: 0.06, fill: '#8a8b93', fill2: '#646670', edge: '#3d3f48', sound: 'clang',      score: 400, tough: true },
  tnt:   { label: 'Radium charge',hp: 18,  density: 0.0016, friction: 0.6,  restitution: 0.04, fill: '#a8d63a', fill2: '#78a221', edge: '#415c0f', sound: 'boom',       score: 150, explodes: true, glow: '#c8ff4a' },
};

const TARGETS = {
  guard: { w: 30, h: 44, hp: 26, score: 1400, name: 'Warrior' },
  king:  { w: 42, h: 58, hp: 46, score: 3000, name: 'Warlord' },
};

const AMMO = {
  boulder: { icon: '🪨', name: 'Round Shot', r: 20, density: 0.0075, restitution: 0.22, friction: 0.5, power: 1.00, dmg: 1.00, ability: null,
             blurb: 'Quarried rock. Heavy and honest.' },
  bomb:    { icon: '💣', name: 'Radium Bomb', r: 18, density: 0.0055, restitution: 0.18, friction: 0.5, power: 0.96, dmg: 1.10, ability: 'detonate',
             blurb: 'Space to detonate it in flight.' },
  cluster: { icon: '☄️', name: 'Scatter Shell', r: 17, density: 0.0050, restitution: 0.28, friction: 0.4, power: 1.02, dmg: 0.80, ability: 'split',
             blurb: 'Space to burst it into three.' },
  iron:    { icon: '🔩', name: 'Piercer', r: 13, density: 0.0180, restitution: 0.08, friction: 0.6, power: 1.06, dmg: 3.20, ability: 'dive',
             blurb: 'Space to punch forward. Cracks steel.' },
};

/* ---------- authoring helpers (x = centre, y = bottom edge) ---------- */

const COL_W = 24;
const BEAM_H = 22;

const blk = (x, y, w, h, mat, angle = 0) => ({ x, y, w, h, mat, angle });
const col = (x, y, h, mat, w = COL_W) => blk(x, y, w, h, mat);
const beam = (x, y, w, mat, h = BEAM_H) => blk(x, y, w, h, mat);
const tnt = (x, y, w = 30, h = 30) => blk(x, y, w, h, 'tnt');
const guard = (x, y) => ({ x, y, kind: 'guard' });
const king = (x, y) => ({ x, y, kind: 'king' });

/* A room: two uprights carrying a roof slab. Returns the pieces plus the
   roof's top edge, so callers can stack another storey straight onto it. */
function room(cx, base, span, h, mat, roofMat = mat) {
  const pieces = [
    col(cx - span / 2, base, h, mat),
    col(cx + span / 2, base, h, mat),
    beam(cx, base - h, span + COL_W, roofMat),
  ];
  pieces.top = base - h - BEAM_H;
  return pieces;
}

/* Stack `storeys` rooms on top of each other, narrowing as they rise. */
function tower(cx, base, span, h, storeys, mat, roofMat) {
  let y = base, out = [];
  for (let i = 0; i < storeys; i++) {
    const r = room(cx, y, span, h, mat, roofMat || mat);
    out = out.concat(r);
    y = r.top;
  }
  out.top = y;
  return out;
}

/* ---------- the level book ----------
   Each castle is built by a function so every piece can be placed relative to
   the top of the piece under it (`room()` / `tower()` hand back a `.top`).
   Run CB.validateLevels() in the console after editing — it catches overlaps
   and floating pieces before you ever fire a shot. */

const G = WORLD.groundY;

const LEVEL_BOOK = [

  () => {
    const gate = room(1080, G, 120, 150, 'wood');
    return {
      name: 'Border Outpost',
      tip: 'Drag back from the siege engine, let go to fire.',
      par: 2, ammo: ['boulder', 'boulder', 'boulder'],
      blocks: [...gate],
      targets: [guard(1080, gate.top)],
    };
  },

  () => {
    const left = room(980, G, 110, 140, 'wood');
    const right = room(1240, G, 110, 140, 'wood');
    const deck = beam(1110, left.top, 400, 'wood');
    const deckTop = left.top - BEAM_H;
    return {
      name: 'Canal Station',
      tip: 'Knock the legs out and the deck does the rest.',
      par: 2, ammo: ['boulder', 'boulder', 'boulder'],
      blocks: [...left, ...right, deck],
      targets: [guard(1040, deckTop), guard(1180, deckTop), guard(870, G)],
    };
  },

  () => {
    const spire = tower(1020, G, 100, 120, 2, 'ice');
    const shed = room(1300, G, 100, 120, 'ice', 'wood');
    const post = col(1160, G, 90, 'wood');
    return {
      name: 'The Crystal Works',
      tip: 'Crystal shatters at a touch — but it carries no weight either.',
      par: 2, ammo: ['boulder', 'boulder', 'boulder'],
      blocks: [...spire, ...shed, post],
      targets: [guard(1020, spire.top), guard(1300, shed.top), guard(1160, G - 90)],
    };
  },

  () => {
    const lower = room(1120, G, 130, 150, 'wood');
    const upper = room(1120, lower.top, 130, 130, 'wood');
    return {
      name: 'Radium Depot',
      tip: 'Radium charges go off. Turn the redoubt against itself.',
      par: 2, ammo: ['boulder', 'bomb', 'boulder'],
      blocks: [...lower, tnt(1120, G), tnt(1120, G - 30), ...upper],
      targets: [guard(1120, upper.top), guard(960, G), guard(1290, G)],
    };
  },

  () => {
    const west = room(1050, G, 140, 130, 'stone');
    const east = room(1370, G, 110, 130, 'stone');
    const span = beam(1210, west.top, 460, 'wood');
    const watch = room(1210, west.top - BEAM_H, 120, 120, 'wood');
    return {
      name: 'The Watchgate',
      tip: 'Basalt under, timber over. Aim where it changes.',
      par: 3, ammo: ['boulder', 'boulder', 'bomb', 'boulder'],
      blocks: [...west, ...east, span, ...watch],
      targets: [guard(1210, watch.top), guard(1180, G), guard(1260, G)],
    };
  },

  () => {
    const west = tower(980, G, 96, 130, 2, 'wood');
    const east = tower(1340, G, 96, 130, 2, 'wood');
    const keep = room(1160, G, 120, 150, 'stone');
    return {
      name: 'Twin Spires',
      tip: 'One good hit can topple a tower into its neighbour.',
      par: 3, ammo: ['boulder', 'boulder', 'bomb', 'boulder'],
      blocks: [...west, ...east, ...keep, tnt(1160, keep.top)],
      targets: [guard(980, west.top), guard(1340, east.top), king(1160, keep.top - 30)],
    };
  },

  () => {
    const xs = [900, 1090, 1280, 1470];
    const huts = xs.map((x) => room(x, G, 100, 110, 'wood'));
    const deck = beam(1190, huts[0].top, 720, 'ice');
    const deckTop = huts[0].top - BEAM_H;
    return {
      name: 'Dust Camp Row',
      tip: 'Space bursts the scatter shell into three. Spread the damage.',
      par: 3, ammo: ['cluster', 'cluster', 'boulder', 'cluster'],
      blocks: [...huts.flat(), deck],
      targets: xs.map((x) => guard(x, deckTop)),
    };
  },

  () => {
    const west = room(1000, G, 120, 140, 'stone');
    const east = room(1330, G, 120, 140, 'ice', 'stone');
    const span = beam(1165, west.top, 460, 'wood');
    const spanTop = west.top - BEAM_H;
    const spire = tower(1165, spanTop, 100, 110, 2, 'ice');
    return {
      name: 'Polar Redoubt',
      tip: 'Crystal is slick — things slide right off it.',
      par: 3, ammo: ['boulder', 'bomb', 'cluster', 'boulder'],
      blocks: [...west, ...east, span, ...spire, tnt(1030, spanTop)],
      targets: [king(1165, spire.top), guard(1000, G), guard(1330, G)],
    };
  },

  () => {
    const lidBase = G - 200;
    const inner = room(1095, G, 110, 130, 'wood');
    return {
      name: 'The Steel Vault',
      tip: 'The piercer cracks steel — Space to punch through.',
      par: 3, ammo: ['iron', 'iron', 'bomb', 'iron'],
      blocks: [
        col(940, G, 200, 'stone'),      // the soft side — this is the way in
        col(1250, G, 200, 'metal'),
        beam(1095, lidBase, 340, 'metal'),
        ...inner,
        tnt(1095, inner.top),
      ],
      targets: [king(1095, lidBase - BEAM_H), guard(1000, G), guard(1200, G)],
    };
  },

  () => {
    const piers = tower(980, G, 96, 120, 2, 'stone');
    const deckY = piers.top;                       // both ends must meet here
    const span = beam(1180, deckY, 460, 'wood');
    const spanTop = deckY - BEAM_H;
    const hut = room(1330, spanTop, 110, 120, 'wood');
    return {
      name: 'Skyway Span',
      tip: 'The span is only as good as what holds it up.',
      par: 3, ammo: ['boulder', 'cluster', 'bomb', 'boulder'],
      platforms: [{ x: 1420, y: deckY + 20, w: 360, h: 40 }],
      blocks: [...piers, span, ...hut, tnt(1330, spanTop), col(1290, G, 150, 'ice')],
      targets: [guard(980, spanTop), king(1330, hut.top), guard(1560, deckY)],
    };
  },

  () => {
    const lidBase = G - 200;
    const lidTop = lidBase - BEAM_H;
    const halls = [1020, 1220, 1420].map((x, i) =>
      room(x, G, 110, 140, i === 1 ? 'ice' : 'wood'));
    const spire = tower(1220, lidTop, 110, 110, 2, 'wood');
    return {
      name: 'The Citadel',
      tip: 'Everything you have learned, in one wall.',
      par: 4, ammo: ['boulder', 'bomb', 'cluster', 'iron', 'boulder'],
      blocks: [
        col(880, G, 200, 'stone'),
        col(1560, G, 200, 'stone'),
        beam(1220, lidBase, 720, 'stone'),
        ...halls.flat(),
        tnt(1120, G), tnt(1320, G),
        ...spire,
      ],
      targets: [king(1220, spire.top), guard(1020, G), guard(1220, G), guard(1420, G)],
    };
  },

  () => {
    const pillarTop = G - 240;
    const deckTop = pillarTop - BEAM_H;      // a real slab, not scenery: it falls
    const undercroft = room(1240, G, 150, 150, 'stone');
    const throne = room(1240, deckTop, 130, 130, 'stone');
    const westSpire = tower(1060, deckTop, 90, 80, 2, 'ice');
    const eastSpire = tower(1420, deckTop, 90, 80, 2, 'ice');
    return {
      name: 'Seat of the Warlord',
      tip: 'The warlord sits high. Take the legs out from under him.',
      par: 4, ammo: ['iron', 'bomb', 'cluster', 'bomb', 'boulder'],
      blocks: [
        col(1000, G, 240, 'stone'),
        col(1480, G, 240, 'stone'),
        beam(1240, pillarTop, 520, 'stone'),
        ...undercroft,
        tnt(1180, undercroft.top), tnt(1300, undercroft.top),
        ...throne, ...westSpire, ...eastSpire,
      ],
      targets: [
        king(1240, throne.top),
        guard(1240, undercroft.top),
        guard(1060, westSpire.top),
        guard(1420, eastSpire.top),
      ],
    };
  },
];

const LEVELS = LEVEL_BOOK.map((build) => build());
