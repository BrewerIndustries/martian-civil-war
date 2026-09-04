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
    icon: '⚡', name: 'Laser Cannon', cost: 0, order: 0,
    r: 7, speed: 1.14, damage: 30, blast: 46, dig: 36, drag: 0.0006,
    gravityScale: 1, windScale: 1, ability: null, tracer: '#7fe8ff',
    behaviour: 'Standard arc',
    blurb: 'Standard mount. Flat, fast and honest. Digs a modest hole.',
  },
  scatter: {
    icon: '✳', name: 'Scatter Pod', cost: 10000, order: 1,
    r: 8, speed: 1.02, damage: 22, blast: 42, dig: 30, drag: 0.0009, splitFan: 8,
    gravityScale: 1, windScale: 1.3, ability: 'split', tracer: '#d8a8f0',
    behaviour: 'Splits into 3 in the air',
    blurb: 'Space fans it into three shells that crater a stretch of ground, not a single hole. Light, so the wind has opinions about it.',
  },
  fusion: {
    icon: '✸', name: 'Fusion Charge', cost: 22000, order: 2,
    r: 10, speed: 0.96, damage: 46, blast: 98, dig: 86, drag: 0.0011,
    gravityScale: 1.15, windScale: 0.7, ability: 'detonate', tracer: '#9fd93a',
    behaviour: 'Heavy, drops fast',
    blurb: 'Space detonates it early. Enormous crater — the tunneller’s pick.',
  },
  volley: {
    icon: '≡', name: 'Volley Battery', cost: 30000, order: 3,
    r: 6, speed: 1.10, damage: 18, blast: 38, dig: 26, drag: 0.0006,
    gravityScale: 1, windScale: 1, ability: null, tracer: '#7fe8ff',
    salvo: { count: 3, spread: 3.6, stagger: 0 },
    behaviour: '3 shells, fanned',
    blurb: 'Three bolts per launch in a tight fan. Forgiving when your line is good but your range is not.',
  },
  rail: {
    icon: '⌁', name: 'Rail Spike', cost: 38000, order: 4,
    r: 5, speed: 1.12, damage: 58, blast: 34, dig: 20, drag: 0.0003,
    gravityScale: 0.72, windScale: 0.3, ability: 'dive', penetrate: 340,
    tracer: '#ffd166',
    behaviour: 'Bores through rock',
    blurb: 'Flat, heavy and unbothered by wind. Bores clean through rock instead of stopping at it.',
  },
  ion: {
    icon: '⌖', name: 'Ion Lance', cost: 46000, order: 5,
    r: 5, speed: 1.85, damage: 44, blast: 30, dig: 24, drag: 0,
    gravityScale: 0, windScale: 0, range: 1000, ability: null,
    tracer: '#a8f0ff',
    behaviour: 'Dead straight, no arc',
    blurb: 'Ignores gravity and wind entirely — but it cannot arc over anything, and the beam dissipates at range. Deadly down a tunnel you have already bored.',
  },
  seeker: {
    icon: '◈', name: 'Seeker Drone', cost: 58000, order: 6,
    r: 8, speed: 1.00, damage: 40, blast: 60, dig: 48, drag: 0.0008,
    gravityScale: 0.9, windScale: 0.8, ability: 'seek', tracer: '#8fd0ff',
    behaviour: 'Homes on command',
    blurb: 'Space locks it onto the enemy platform. It will find its own way in.',
  },
  barrage: {
    icon: '∴', name: 'Barrage Mortar', cost: 66000, order: 7,
    r: 8, speed: 0.98, damage: 22, blast: 54, dig: 46, drag: 0.0010,
    gravityScale: 1.1, windScale: 0.9, ability: 'detonate', tracer: '#ffb04a',
    salvo: { count: 4, spread: 0.8, stagger: 0.055 },
    behaviour: '4 shells, walking',
    blurb: 'Four shells that walk out across the ground. Finds range and digs a trench doing it.',
  },
  singularity: {
    icon: '◍', name: 'Singularity', cost: 80000, order: 8,
    r: 9, speed: 0.95, damage: 34, blast: 155, dig: 145, drag: 0.0012,
    gravityScale: 1, windScale: 1, ability: 'implode', tracer: '#c9a0ff',
    behaviour: 'Collapses a well',
    blurb: 'Collapses a well. Removes a great deal of landscape at once.',
  },
};

const STARTING_WEAPON = 'laser';
const weaponList = () => Object.keys(WEAPONS).sort((a, b) => WEAPONS[a].order - WEAPONS[b].order);

const PLATFORM = {
  hp: 100, w: 74, h: 34,
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

// Both platforms field the same hull in a given battle: this is a duel, and an
// asymmetric hull pool just makes the late campaign arithmetic-impossible.
// Hulls grow together so heavier mounts stay meaningful rather than one-shotting.
BATTLES.forEach((b, i) => {
  b.hp = 100 + i * 8;
  b.enemyHp = b.hp;
  b.playerHp = b.hp;
  b.playerX = 210;
  b.enemyX = 1590;
});

// Kept for the campaign map and result screen, which speak in "assaults".
const LEVELS = BATTLES;
