/* Martian Civil War — world constants, houses, weapon roster and the campaign.

   This is an artillery duel: two assault platforms on destructible ground,
   trading shots until one of them stops answering. Terrain is a real
   combatant — you can lob over a ridge, or spend shots boring through it. */

const WORLD = { w: 1800, h: 1000, baseY: 790 };

/* The two houses of the Martian civil war. The side you pick crews your
   platform; the other crews the one shooting back. Cosmetic — both fight
   with identical hardware. */
const FACTIONS = {
  red: {
    id: 'red', name: 'Red Martians', short: 'Red', crest: '◉',
    primary: '#c9503a', dark: '#8a2e1f', light: '#ef9070', trim: '#f0cba0',
    blurb: 'Canal-builders of the dead seas. Disciplined, and out of patience.',
  },
  green: {
    id: 'green', name: 'Green Martians', short: 'Green', crest: '▲',
    primary: '#63a052', dark: '#3b6a32', light: '#a3d68d', trim: '#d8e8a0',
    blurb: 'Horde of the dry sea bottoms. Six limbs, no forgiveness.',
  },
};
const otherFaction = (id) => (id === 'red' ? 'green' : 'red');

/* Weapons are permanent mounts on your assault platform: bought once with
   salvage credits, then available in every battle afterwards. You are not
   rationed shots — you and the enemy alternate turns until one platform is
   wrecked — so buying a mount buys options, not ammunition.

   `speed` stays in a narrow band so the range curve holds for the whole
   roster. `dig` is how much ground a hit removes, `blast` how far its damage
   reaches, `damage` what a dead-centre hit does to a platform's 100 hull. */
const WEAPONS = {
  /* Every mount flies differently, not just for different numbers:
       gravityScale  0 = dead straight, 1 = a normal ballistic arc
       windScale     how much the gale pushes it around
       range         px of flight before it fizzles (0 = until it hits something)
       salvo         several shells per trigger pull; `spread` fans them by
                     angle, `stagger` varies their charge so they walk out
       penetrate     px of solid rock it will bore through instead of stopping
       ability       what Space does to it mid-flight */
  laser: {
    icon: '⚡', name: 'Laser Cannon', cost: 0, order: 0, firepower: 18,
    r: 7, speed: 1.14, damage: 30, blast: 46, dig: 36, drag: 0.0006,
    gravityScale: 1, windScale: 1, ability: null, tracer: '#7fe8ff',
    behaviour: 'Standard arc',
    blurb: 'Standard mount. Flat, fast and honest. Digs a modest hole.',
  },
  scatter: {
    icon: '✳', name: 'Scatter Pod', cost: 10000, order: 1, firepower: 22,
    r: 8, speed: 1.02, damage: 22, blast: 42, dig: 30, drag: 0.0009, splitFan: 3, splitSpeed: 0.11, autoAbility: true,
    gravityScale: 1, windScale: 1.3, ability: 'split', tracer: '#d8a8f0',
    behaviour: 'Splits into 3 in the air',
    blurb: 'Bursts into three shells that crater a stretch of ground. Goes off on its own during the climb; Space bursts it early. Loft it and the pattern widens — a flat shot groups tight.',
  },
  fusion: {
    icon: '✸', name: 'Fusion Charge', cost: 22000, order: 2, firepower: 34,
    r: 10, speed: 0.96, damage: 46, blast: 98, dig: 86, drag: 0.0011,
    gravityScale: 1.15, windScale: 0.7, ability: 'detonate', tracer: '#9fd93a',
    behaviour: 'Heavy, drops fast',
    blurb: 'Space detonates it early. Enormous crater — the tunneller’s pick.',
  },
  volley: {
    icon: '≡', name: 'Volley Battery', cost: 30000, order: 3, firepower: 30,
    r: 6, speed: 1.10, damage: 18, blast: 38, dig: 26, drag: 0.0006,
    gravityScale: 1, windScale: 1, ability: null, tracer: '#7fe8ff',
    salvo: { count: 3, spread: 3.6, stagger: 0 },
    behaviour: '3 shells, fanned',
    blurb: 'Three bolts per launch in a tight fan. Forgiving when your line is good but your range is not.',
  },
  rail: {
    icon: '⌁', name: 'Rail Spike', cost: 38000, order: 4, firepower: 34,
    r: 5, speed: 1.12, damage: 58, blast: 34, dig: 20, drag: 0.0003,
    gravityScale: 0.72, windScale: 0.3, ability: 'dive', penetrate: 340,
    tracer: '#ffd166',
    behaviour: 'Bores through rock',
    blurb: 'Flat, heavy and unbothered by wind. Bores clean through rock instead of stopping at it.',
  },
  ion: {
    icon: '⌖', name: 'Ion Lance', cost: 46000, order: 5, firepower: 30,
    r: 5, speed: 1.85, damage: 44, blast: 30, dig: 24, drag: 0,
    gravityScale: 0, windScale: 0, range: 1000, ability: null,
    tracer: '#a8f0ff',
    behaviour: 'Dead straight, no arc',
    blurb: 'Ignores gravity and wind entirely — but it cannot arc over anything, and the beam dissipates at range. Deadly down a tunnel you have already bored.',
  },
  seeker: {
    icon: '◈', name: 'Seeker Drone', cost: 58000, order: 6, firepower: 38,
    r: 8, speed: 1.00, damage: 40, blast: 60, dig: 48, drag: 0.0008,
    gravityScale: 0.9, windScale: 0.8, ability: 'seek', tracer: '#8fd0ff',
    behaviour: 'Homes on command',
    blurb: 'Space locks it onto the enemy platform. It will find its own way in.',
  },
  barrage: {
    icon: '∴', name: 'Barrage Mortar', cost: 66000, order: 7, firepower: 40,
    r: 8, speed: 0.98, damage: 22, blast: 54, dig: 46, drag: 0.0010,
    gravityScale: 1.1, windScale: 0.9, ability: 'detonate', tracer: '#ffb04a',
    salvo: { count: 4, spread: 0.8, stagger: 0.055 },
    behaviour: '4 shells, walking',
    blurb: 'Four shells that walk out across the ground. Finds range and digs a trench doing it.',
  },
  singularity: {
    icon: '◍', name: 'Singularity', cost: 80000, order: 8, firepower: 46,
    r: 9, speed: 0.95, damage: 34, blast: 155, dig: 145, drag: 0.0012,
    gravityScale: 1, windScale: 1, ability: 'implode', tracer: '#c9a0ff',
    behaviour: 'Collapses a well',
    blurb: 'Collapses a well. Removes a great deal of landscape at once.',
  },
};

/* Modules are the other half of the armory: a rolling fortress is a structure,
   so it can carry more than guns. Bought once, fitted permanently, and unlike
   mounts they never fire — they change what the platform *is*.

   Kept deliberately modest. A duel where one side simply cannot be hurt is not
   a duel, so shields shave damage rather than negate it. */
const MODULES = {
  plating: {
    kind: 'hull', icon: '▤', name: 'Ablative Plating', cost: 14000, order: 0,
    hull: 70, blurb: 'Sacrificial layers across the face. +70 hull.',
  },
  frame: {
    kind: 'hull', icon: '▩', name: 'Reinforced Frame', cost: 34000, order: 1,
    hull: 150, blurb: 'Rebuilds the load-bearing structure. +150 hull.',
  },
  baffles: {
    kind: 'shield', icon: '◫', name: 'Blast Baffles', cost: 18000, order: 2,
    splashReduce: 0.45, blurb: 'Vents blast pressure around the hull. Near misses hurt 45% less.',
  },
  deflector: {
    kind: 'shield', icon: '◉', name: 'Deflector Screen', cost: 26000, order: 3,
    damageReduce: 0.15, blurb: 'A charged screen bleeds off 15% of everything that lands.',
  },
  gantry: {
    kind: 'shield', icon: '✚', name: 'Repair Gantry', cost: 42000, order: 4,
    regen: 14, blurb: 'Crews patch the structure between volleys. +14 hull each turn.',
  },
  reactor: {
    kind: 'engine', icon: '⌬', name: 'Reactor Uprate', cost: 12000, order: 5,
    fuel: 60, blurb: 'More power to the drives. +60 fuel every turn.',
  },
  capacitor: {
    kind: 'power', icon: '⚡', name: 'Capacitor Bank', cost: 16000, order: 8,
    firepower: 22, blurb: 'Dumps more charge into a single volley. +22 firepower.',
  },
  core: {
    kind: 'power', icon: '◎', name: 'Fusion Core', cost: 44000, order: 9,
    firepower: 46, blurb: 'A second reactor feeding the gun decks. +46 firepower.',
  },
  treads: {
    kind: 'engine', icon: '⚙', name: 'Heavy Treads', cost: 20000, order: 6,
    climb: 9, driveSpeed: 0.7, blurb: 'Climbs steeper ground and moves quicker over it.',
  },
  dampers: {
    kind: 'engine', icon: '⩌', name: 'Inertial Dampers', cost: 16000, order: 7,
    fallReduce: 0.65, blurb: 'Takes 65% less damage when the ground gives way under you.',
  },
};

const MODULE_KINDS = [
  { id: 'hull', label: 'Hull' },
  { id: 'shield', label: 'Shields' },
  { id: 'power', label: 'Power' },
  { id: 'engine', label: 'Drive' },
];

const moduleList = () => Object.keys(MODULES).sort((a, b) => MODULES[a].order - MODULES[b].order);

const STARTING_WEAPON = 'laser';
const weaponList = () => Object.keys(WEAPONS).sort((a, b) => WEAPONS[a].order - WEAPONS[b].order);

const PLATFORM = {
  storeys: 3,      // it is a building on wheels, not a tank
  hp: 100, w: 96, h: 112,   // hit box must cover the whole structure
  /* Firepower is the per-volley budget. You own every mount you have bought,
     but the platform can only power so many of them at once, so each turn is a
     choice about what to bring to bear rather than "fire everything". This is
     what keeps a big arsenal interesting instead of merely additive. */
  firepower: 56,
  fuel: 80,        // drive allowance, refilled at the start of each of your turns
  climb: 13,       // tallest step the tracks can take, in px
  speed: 1.5,      // px per physics step
};

/* ---------- the campaign ----------
   `skill` is how well the enemy gunner ranges you: it picks from the best
   `skill` fraction of its candidate shots, so 0 is wild and 1 is deadly.
   `wind` is the strongest gust the battlefield will throw, re-rolled each
   round. Mars has thin air, so wind nudges rather than shoves. */

const BATTLES = [
  { name: 'First Contact',      profile: 'ridge',   seed: 101, amplitude: 190, skill: 0.30, wind: 0.00,
    tip: 'Drag back to aim. Range them with a first shot — nobody hits cold.' },
  { name: 'The Long Shot',      profile: 'canyon',  seed: 204, amplitude: 260, skill: 0.38, wind: 0.02,
    tip: 'Nothing in the way but distance. Power matters more than angle here.' },
  { name: 'Twin Shoulders',     profile: 'twin',    seed: 311, amplitude: 280, skill: 0.44, wind: 0.03,
    tip: 'Two crests to clear. Go high, or carve the near one down.' },
  { name: 'Hollow Ridge',       profile: 'ridge',   seed: 417, amplitude: 340, skill: 0.50, wind: 0.03,
    tip: 'That ridge is thick. Over the top, or straight through it.' },
  { name: 'Stonecutter',        profile: 'plateau', seed: 522, amplitude: 300, skill: 0.55, wind: 0.05,
    tip: 'Cut the steps out from under them and the platform drops.' },
  { name: 'The Spires',         profile: 'spires',  seed: 634, amplitude: 320, skill: 0.60, wind: 0.05,
    tip: 'Thread the gaps, or knock a spire flat and shoot through the hole.' },
  { name: 'Iron Basin',         profile: 'crater',  seed: 741, amplitude: 300, skill: 0.64, wind: 0.06,
    tip: 'Both of you are shooting uphill out of a bowl.' },
  { name: 'The Gale',           profile: 'twin',    seed: 858, amplitude: 290, skill: 0.68, wind: 0.13,
    tip: 'Hard wind. Watch the drift and lead into it.' },
  { name: 'The Wall',           profile: 'ridge',   seed: 963, amplitude: 400, skill: 0.70, wind: 0.06,
    tip: 'You will not clear this cleanly. Dig.' },
  { name: 'Broken Country',     profile: 'spires',  seed: 1077, amplitude: 360, skill: 0.74, wind: 0.12,
    tip: 'Broken ground and a shifting wind. Range them again every turn.' },
  { name: 'Deep Cut',           profile: 'canyon',  seed: 1188, amplitude: 380, skill: 0.79, wind: 0.09,
    tip: 'Long, low and exposed. Whoever ranges first wins.' },
  { name: "Warlord's Redoubt",  profile: 'ridge',   seed: 1291, amplitude: 430, skill: 0.85, wind: 0.10,
    tip: 'Their best gunner, behind their best ground. Bring everything.' },
];

/* Both platforms field the same hull in a given battle: this is a duel, and an
   asymmetric hull pool just makes the late campaign arithmetic-impossible.

   Hulls are much larger than they were when a turn meant one shell. A turn is
   now a full broadside from every mount on the platform, so a late-campaign
   volley can put a couple of hundred points downrange; a 188 hull would end
   the battle in two exchanges. Hull grows with the battle, not with the
   player's arsenal, so buying mounts still tilts the fight your way — that is
   what the credits are for. */
const enemyRoster = (i) => {
  if (i < 2) return ['laser'];
  if (i < 4) return ['laser', 'scatter'];
  if (i < 6) return ['laser', 'scatter', 'fusion'];
  if (i < 8) return ['laser', 'volley', 'fusion', 'rail'];
  if (i < 10) return ['laser', 'volley', 'fusion', 'rail', 'ion'];
  return ['laser', 'volley', 'fusion', 'rail', 'seeker', 'barrage'];
};

BATTLES.forEach((b, i) => {
  b.hp = 130 + i * 34;
  b.enemyHp = b.hp;
  b.playerHp = b.hp;
  b.playerX = 210;
  b.enemyX = 1590;
  b.enemyMounts = enemyRoster(i);
  /* Grows slowly on purpose. The player's budget only rises when they BUY a
     power module, so an enemy budget that climbed every battle left the
     mid-campaign hopelessly out-volleyed — battle 6 was unwinnable with a
     sensible three-mount loadout. This tracks a player who has bought one
     power module by the middle of the campaign. */
  b.enemyFirepower = 38 + i * 4.5;
});

// Kept for the campaign map and result screen, which speak in "assaults".
const LEVELS = BATTLES;
