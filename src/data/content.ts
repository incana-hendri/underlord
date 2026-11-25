export interface Look {
  body: 'imp' | 'humanoid' | 'beetle' | 'fly' | 'spider' | 'blob' | 'quad' | 'dragon' | 'skeleton' | 'reaper' | 'lord'
  color: number
  accent: number
  skin: number
  scale: number
  horns: boolean
  wings: boolean
  weapon: 'none' | 'club' | 'staff' | 'sword' | 'bow' | 'scythe' | 'whip'
}

export interface Attraction {
  weight: number
  rooms: { id: string; tiles: number }[]
  evil?: number
  corpses?: number
}

export interface Species {
  id: string
  name: string
  side: 'keeper' | 'hero'
  hp: number
  attack: number
  defense: number
  speed: number
  range: number
  rate: number
  wage: number
  hunger: number
  fatigue: number
  xp: number
  maxLevel: number
  train: number
  research: number
  craft: number
  dig: number
  flying: boolean
  boss: boolean
  cap: number
  attraction?: Attraction
  look: Look
  blurb: string
}

export interface RoomDef {
  id: string
  name: string
  cost: number
  ideal: number
  min: number
  color: number
  blurb: string
}

export interface SpellDef {
  id: string
  name: string
  cost: number
  blurb: string
}

export interface GearDef {
  id: string
  name: string
  kind: 'trap' | 'door'
  cost: number
  craft: number
  hp: number
  blurb: string
}

export interface ResearchDef {
  id: string
  kind: 'room' | 'spell' | 'trap' | 'door'
  name: string
  cost: number
  requires: string[]
  blurb: string
}

const look = (p: Look): Look => p

function keeper(p: Omit<Species, 'side' | 'flying' | 'boss' | 'cap' | 'hunger' | 'fatigue' | 'xp' | 'maxLevel' | 'train' | 'research' | 'craft' | 'dig' | 'range' | 'rate' | 'defense'> & Partial<Species>): Species {
  return {
    side: 'keeper',
    flying: false,
    boss: false,
    cap: 6,
    hunger: 1.05,
    fatigue: 0.62,
    xp: 36,
    maxLevel: 7,
    train: 5,
    research: 0,
    craft: 0,
    dig: 4,
    range: 1.2,
    rate: 0.95,
    defense: 1,
    ...p,
  }
}

function hero(p: Omit<Species, 'side' | 'flying' | 'boss' | 'cap' | 'hunger' | 'fatigue' | 'xp' | 'maxLevel' | 'train' | 'research' | 'craft' | 'wage' | 'range' | 'rate' | 'defense'> & Partial<Species>): Species {
  return {
    side: 'hero',
    flying: false,
    boss: false,
    cap: 8,
    hunger: 0,
    fatigue: 0,
    xp: 48,
    maxLevel: 5,
    train: 0,
    research: 0,
    craft: 0,
    wage: 0,
    range: 1.25,
    rate: 0.85,
    defense: 2,
    ...p,
  }
}

export const SPECIES: Record<string, Species> = {
  imp: keeper({
    id: 'imp', name: 'Imp', hp: 22, attack: 2, defense: 0, speed: 2.35, wage: 0, hunger: 0, fatigue: 0,
    dig: 0, cap: 16, train: 0, blurb: 'Digs, hauls, claims and reinforces. Summon more from the heart.',
    look: look({ body: 'imp', color: 0x6faf45, accent: 0x2d4a18, skin: 0x8fd15a, scale: 0.52, horns: true, wings: false, weapon: 'none' }),
  }),
  beetle: keeper({
    id: 'beetle', name: 'Beetle', hp: 78, attack: 8, defense: 3, speed: 1.55, wage: 40, cap: 8,
    attraction: { weight: 12, rooms: [{ id: 'lair', tiles: 1 }] },
    blurb: 'The first thing to crawl out of a lair. Slow, sturdy, and cheap.',
    look: look({ body: 'beetle', color: 0x8a5a2a, accent: 0x3a2410, skin: 0xc4894a, scale: 0.72, horns: true, wings: false, weapon: 'none' }),
  }),
  fly: keeper({
    id: 'fly', name: 'Fly', hp: 36, attack: 5, defense: 0, speed: 2.5, wage: 28, cap: 8, flying: true, range: 1.15, rate: 1.2,
    attraction: { weight: 9, rooms: [{ id: 'lair', tiles: 1 }, { id: 'hatchery', tiles: 1 }] },
    blurb: 'Needs a hatchery. Fast, fragile, and happy to cross lava.',
    look: look({ body: 'fly', color: 0x7a4c86, accent: 0x2a1838, skin: 0xc080c8, scale: 0.5, horns: false, wings: true, weapon: 'none' }),
  }),
  goblin: keeper({
    id: 'goblin', name: 'Goblin', hp: 64, attack: 9, defense: 1, speed: 1.85, wage: 48, cap: 8,
    attraction: { weight: 8, rooms: [{ id: 'lair', tiles: 1 }, { id: 'training', tiles: 1 }] },
    blurb: 'Arrives once a training room stands. Eager, and fond of a slap.',
    look: look({ body: 'humanoid', color: 0x4e8a32, accent: 0x243818, skin: 0x7aaa58, scale: 0.72, horns: false, wings: false, weapon: 'club' }),
  }),
  warlock: keeper({
    id: 'warlock', name: 'Warlock', hp: 52, attack: 13, defense: 1, speed: 1.45, wage: 80, cap: 4,
    range: 4.8, rate: 0.62, research: 1.25,
    attraction: { weight: 6, rooms: [{ id: 'lair', tiles: 1 }, { id: 'library', tiles: 9 }] },
    blurb: 'Researches in the library and burns foes from a distance.',
    look: look({ body: 'humanoid', color: 0x3a4e9a, accent: 0xc8b060, skin: 0xd8c8a8, scale: 0.86, horns: false, wings: false, weapon: 'staff' }),
  }),
  troll: keeper({
    id: 'troll', name: 'Troll', hp: 120, attack: 11, defense: 3, speed: 1.25, wage: 70, cap: 4, craft: 1.3,
    attraction: { weight: 6, rooms: [{ id: 'lair', tiles: 1 }, { id: 'workshop', tiles: 9 }] },
    blurb: 'Builds traps and doors in the workshop. Hits like a sack of anvils.',
    look: look({ body: 'humanoid', color: 0x7c7a70, accent: 0x4a4038, skin: 0xa8a090, scale: 1.08, horns: false, wings: false, weapon: 'club' }),
  }),
  spider: keeper({
    id: 'spider', name: 'Spider', hp: 58, attack: 8, defense: 1, speed: 1.9, wage: 55, cap: 6,
    attraction: { weight: 5, rooms: [{ id: 'lair', tiles: 9 }] },
    blurb: 'A larger lair draws them. Their bite spreads disease.',
    look: look({ body: 'spider', color: 0x241c22, accent: 0x8a2438, skin: 0x3a3038, scale: 0.86, horns: false, wings: false, weapon: 'none' }),
  }),
  hellhound: keeper({
    id: 'hellhound', name: 'Hellhound', hp: 90, attack: 12, defense: 2, speed: 2.15, wage: 68, cap: 4,
    attraction: { weight: 5, rooms: [{ id: 'lair', tiles: 1 }, { id: 'barracks', tiles: 9 }] },
    blurb: 'Barracks beasts. Fast melee with a burning bite.',
    look: look({ body: 'quad', color: 0x8a3420, accent: 0xff6a28, skin: 0xc06030, scale: 0.82, horns: true, wings: false, weapon: 'none' }),
  }),
  bile: keeper({
    id: 'bile', name: 'Bile Demon', hp: 210, attack: 16, defense: 4, speed: 1.05, wage: 130, cap: 3,
    hunger: 1.8, range: 1.35, rate: 0.7,
    attraction: { weight: 4, rooms: [{ id: 'lair', tiles: 15 }, { id: 'hatchery', tiles: 15 }] },
    blurb: 'Vast, hungry, and worth the chickens. Needs a huge lair and hatchery.',
    look: look({ body: 'blob', color: 0x6a8a28, accent: 0xc8d060, skin: 0x8aaa40, scale: 1.2, horns: true, wings: false, weapon: 'none' }),
  }),
  mistress: keeper({
    id: 'mistress', name: 'Dark Mistress', hp: 96, attack: 15, defense: 2, speed: 2.05, wage: 110, cap: 4, rate: 1.15,
    attraction: { weight: 4, rooms: [{ id: 'lair', tiles: 9 }, { id: 'torture', tiles: 9 }] },
    blurb: 'Comes for a torture chamber. Fast, cruel, and hard to keep happy.',
    look: look({ body: 'humanoid', color: 0x4a1848, accent: 0xd0a0c8, skin: 0xc898b0, scale: 0.98, horns: true, wings: false, weapon: 'whip' }),
  }),
  vampire: keeper({
    id: 'vampire', name: 'Vampire', hp: 130, attack: 14, defense: 3, speed: 1.7, wage: 120, cap: 3, range: 1.3,
    attraction: { weight: 3, rooms: [{ id: 'lair', tiles: 1 }, { id: 'graveyard', tiles: 9 }, { id: 'library', tiles: 9 }], corpses: 1 },
    blurb: 'Graveyard, library, and a corpse. Heals a little with every strike.',
    look: look({ body: 'humanoid', color: 0x2a2030, accent: 0x8a1828, skin: 0xe4d8dc, scale: 0.94, horns: false, wings: false, weapon: 'none' }),
  }),
  skeleton: keeper({
    id: 'skeleton', name: 'Skeleton', hp: 48, attack: 7, defense: 1, speed: 1.5, wage: 18, cap: 8,
    hunger: 0, fatigue: 0.2,
    blurb: 'Rises from the graveyard when the dead are piled high.',
    look: look({ body: 'skeleton', color: 0xe6e0d4, accent: 0x8a8478, skin: 0xf2eee6, scale: 0.8, horns: false, wings: false, weapon: 'sword' }),
  }),
  dragon: keeper({
    id: 'dragon', name: 'Dragon', hp: 280, attack: 20, defense: 5, speed: 1.4, wage: 190, cap: 2,
    range: 3.8, rate: 0.55, hunger: 1.4,
    attraction: { weight: 2, rooms: [{ id: 'lair', tiles: 25 }, { id: 'treasury', tiles: 15 }] },
    blurb: 'A hoard and a cavernous lair. Breathes a short cone of fire.',
    look: look({ body: 'dragon', color: 0x2a6a38, accent: 0xe8c040, skin: 0x3a8a48, scale: 1.28, horns: true, wings: true, weapon: 'none' }),
  }),
  reaper: keeper({
    id: 'reaper', name: 'Horned Reaper', hp: 340, attack: 26, defense: 6, speed: 1.7, wage: 220, cap: 1,
    boss: true, rate: 0.8, range: 1.45, hunger: 0.4,
    blurb: 'Only a sacrifice at a great temple calls one. It grows furious if idle.',
    look: look({ body: 'reaper', color: 0x8a1618, accent: 0x1a1010, skin: 0xc04030, scale: 1.22, horns: true, wings: false, weapon: 'scythe' }),
  }),
  thief: hero({
    id: 'thief', name: 'Thief', hp: 40, attack: 5, defense: 0, speed: 2.2, dig: 6,
    blurb: 'Runs for the treasury, pockets gold, and tries to flee.',
    look: look({ body: 'humanoid', color: 0x5c5848, accent: 0xc8b060, skin: 0xd0b898, scale: 0.68, horns: false, wings: false, weapon: 'none' }),
  }),
  archer: hero({
    id: 'archer', name: 'Archer', hp: 55, attack: 10, defense: 1, speed: 1.6, dig: 5, range: 5.2, rate: 0.7,
    blurb: 'Keeps a distance and picks off your creatures.',
    look: look({ body: 'humanoid', color: 0x8a7048, accent: 0x4a3820, skin: 0xd8c0a0, scale: 0.8, horns: false, wings: false, weapon: 'bow' }),
  }),
  knight: hero({
    id: 'knight', name: 'Knight', hp: 130, attack: 13, defense: 5, speed: 1.45, dig: 8,
    blurb: 'The backbone of a hero party. Armour, sword, and no imagination.',
    look: look({ body: 'humanoid', color: 0xc4c8d0, accent: 0x8a1e28, skin: 0xd8c8b0, scale: 0.9, horns: false, wings: false, weapon: 'sword' }),
  }),
  dwarf: hero({
    id: 'dwarf', name: 'Dwarf', hp: 90, attack: 10, defense: 3, speed: 1.35, dig: 24,
    blurb: 'Chews through earth. The reason your walls do not stay walls.',
    look: look({ body: 'humanoid', color: 0xb88848, accent: 0x6a4820, skin: 0xe0c0a0, scale: 0.62, horns: false, wings: false, weapon: 'club' }),
  }),
  wizard: hero({
    id: 'wizard', name: 'Wizard', hp: 60, attack: 16, defense: 1, speed: 1.4, dig: 4, range: 5, rate: 0.55,
    blurb: 'Glass and lightning. Kill them before they find a firing line.',
    look: look({ body: 'humanoid', color: 0x4060c0, accent: 0xf0e8c0, skin: 0xe0d0c0, scale: 0.86, horns: false, wings: false, weapon: 'staff' }),
  }),
  barbarian: hero({
    id: 'barbarian', name: 'Barbarian', hp: 170, attack: 15, defense: 2, speed: 1.55, dig: 12,
    blurb: 'A lot of hit points and a bigger axe.',
    look: look({ body: 'humanoid', color: 0xa04830, accent: 0x6a2818, skin: 0xd8a888, scale: 1.05, horns: false, wings: false, weapon: 'club' }),
  }),
  monk: hero({
    id: 'monk', name: 'Monk', hp: 80, attack: 7, defense: 2, speed: 1.5, dig: 4,
    blurb: 'Heals the party. Annoying, then essential to remove.',
    look: look({ body: 'humanoid', color: 0xd8c898, accent: 0x8a7040, skin: 0xe8d8c0, scale: 0.8, horns: false, wings: false, weapon: 'staff' }),
  }),
  fairy: hero({
    id: 'fairy', name: 'Fairy', hp: 34, attack: 8, defense: 0, speed: 2.4, dig: 3, flying: true, range: 3.4, rate: 1,
    blurb: 'Flits over lava and stings from just out of reach.',
    look: look({ body: 'humanoid', color: 0x88e0c8, accent: 0xf0f8ff, skin: 0xe8fff4, scale: 0.48, horns: false, wings: true, weapon: 'none' }),
  }),
  giant: hero({
    id: 'giant', name: 'Giant', hp: 320, attack: 18, defense: 4, speed: 1.05, dig: 36, range: 1.5, rate: 0.55,
    blurb: 'Smashes rock. Do not let one reach the heart.',
    look: look({ body: 'humanoid', color: 0x8a7a68, accent: 0x5a4a3a, skin: 0xc8b8a0, scale: 1.48, horns: false, wings: false, weapon: 'club' }),
  }),
  lord: hero({
    id: 'lord', name: 'Lord of the Land', hp: 1100, attack: 24, defense: 8, speed: 1.3, dig: 28,
    boss: true, range: 1.45, rate: 0.75,
    blurb: 'The surface made flesh. Immune to chickens. Destroy him or lose the heart.',
    look: look({ body: 'lord', color: 0xd4c078, accent: 0x7a1420, skin: 0xf0e0c8, scale: 1.32, horns: false, wings: false, weapon: 'sword' }),
  }),
}

export const ROOMS: Record<string, RoomDef> = {
  treasury: { id: 'treasury', name: 'Treasury', cost: 70, ideal: 9, min: 1, color: 0xc6a15a, blurb: 'Stores gold. Each tile holds 280 beyond the heart vault.' },
  lair: { id: 'lair', name: 'Lair', cost: 80, ideal: 9, min: 1, color: 0x8a5040, blurb: 'Beds. One creature per tile. Without it, nothing stays.' },
  hatchery: { id: 'hatchery', name: 'Hatchery', cost: 110, ideal: 9, min: 1, color: 0xd8c060, blurb: 'Grows chickens. Hungry creatures eat here or they leave.' },
  training: { id: 'training', name: 'Training Room', cost: 140, ideal: 9, min: 1, color: 0xb45040, blurb: 'Creatures spar for experience. Draws goblins.' },
  library: { id: 'library', name: 'Library', cost: 130, ideal: 9, min: 1, color: 0x6070c0, blurb: 'Warlocks research here. A little progress happens even alone.' },
  workshop: { id: 'workshop', name: 'Workshop', cost: 140, ideal: 9, min: 1, color: 0xc07838, blurb: 'Trolls forge traps and doors. Draws trolls.' },
  prison: { id: 'prison', name: 'Prison', cost: 100, ideal: 5, min: 1, color: 0x808890, blurb: 'Imps drag unconscious enemies here. They do not wake.' },
  torture: { id: 'torture', name: 'Torture Chamber', cost: 180, ideal: 5, min: 1, color: 0xa02840, blurb: 'Turns prisoners. Draws dark mistresses.' },
  barracks: { id: 'barracks', name: 'Barracks', cost: 150, ideal: 9, min: 1, color: 0x803030, blurb: 'Creatures inside hit harder and heal. Draws hellhounds.' },
  guard: { id: 'guard', name: 'Guard Post', cost: 60, ideal: 1, min: 1, color: 0xd0d4dc, blurb: 'Drop a creature to station it. Longer sight, tougher hide.' },
  bridge: { id: 'bridge', name: 'Bridge', cost: 40, ideal: 1, min: 1, color: 0xa07848, blurb: 'Lay it on water or lava, touching your own ground.' },
  temple: { id: 'temple', name: 'Temple', cost: 200, ideal: 9, min: 1, color: 0x7040a0, blurb: 'Feeds your evil. Shift-drop a creature on 9 tiles to sacrifice.' },
  graveyard: { id: 'graveyard', name: 'Graveyard', cost: 160, ideal: 9, min: 1, color: 0x687058, blurb: 'Keeps corpses, raises skeletons, and calls vampires.' },
  scavenger: { id: 'scavenger', name: 'Scavenger Room', cost: 220, ideal: 9, min: 1, color: 0x3a7878, blurb: 'Pays gold to steal or conjure one chosen species.' },
}

export const SPELLS: Record<string, SpellDef> = {
  create_imp: { id: 'create_imp', name: 'Create Imp', cost: 0, blurb: 'Spend gold that rises with each imp already in the dungeon.' },
  sight: { id: 'sight', name: 'Sight of Evil', cost: 200, blurb: 'Reveal a wide disc and see through it for a short time.' },
  speed: { id: 'speed', name: 'Speed Monster', cost: 160, blurb: 'A creature moves much faster for a while.' },
  call_to_arms: { id: 'call_to_arms', name: 'Call to Arms', cost: 280, blurb: 'Plant a banner. Your creatures gather and fight there.' },
  possess: { id: 'possess', name: 'Possess', cost: 380, blurb: 'Ride a creature in first person. Esc to leave. WASD and click.' },
  cave_in: { id: 'cave_in', name: 'Cave-In', cost: 520, blurb: 'Collapse open floor back into earth. Cruel to anyone standing there.' },
  heal: { id: 'heal', name: 'Heal Creature', cost: 150, blurb: 'Mends an ally, and wakes them if they are down.' },
  lightning: { id: 'lightning', name: 'Lightning', cost: 340, blurb: 'A bolt into a small area. Hurts enemies only.' },
  protect: { id: 'protect', name: 'Protect Monster', cost: 200, blurb: 'A shield that soaks the next blows.' },
  hold_audience: { id: 'hold_audience', name: 'Hold Audience', cost: 400, blurb: 'Your creatures remember why they fear you, fondly.' },
  chicken: { id: 'chicken', name: 'Chicken', cost: 300, blurb: 'Turn a lesser foe into a chicken. Lords and reapers laugh.' },
  disease: { id: 'disease', name: 'Disease', cost: 260, blurb: 'A sickness that spreads once to a neighbour.' },
  destroy_walls: { id: 'destroy_walls', name: 'Destroy Walls', cost: 460, blurb: 'Chew a hole through rock and earth.' },
  armageddon: { id: 'armageddon', name: 'Armageddon', cost: 1800, blurb: 'Every creature on the map goes berserk. Yours included.' },
}

export const GEAR: Record<string, GearDef> = {
  wooden: { id: 'wooden', name: 'Wooden Door', kind: 'door', cost: 100, craft: 8, hp: 150, blurb: 'A door. Friends pass, enemies knock.' },
  braced: { id: 'braced', name: 'Braced Door', kind: 'door', cost: 180, craft: 14, hp: 280, blurb: 'Iron bands. Takes a real party to break.' },
  iron: { id: 'iron', name: 'Iron Door', kind: 'door', cost: 320, craft: 22, hp: 520, blurb: 'The serious door.' },
  magic: { id: 'magic', name: 'Magic Door', kind: 'door', cost: 420, craft: 26, hp: 340, blurb: 'Regrows, and shocks whoever beats on it.' },
  alarm: { id: 'alarm', name: 'Alarm Trap', kind: 'trap', cost: 120, craft: 10, hp: 0, blurb: 'Rings, reveals, and calls your creatures. Reusable.' },
  poison: { id: 'poison', name: 'Poison Gas', kind: 'trap', cost: 180, craft: 12, hp: 0, blurb: 'A cloud. One use.' },
  boulder: { id: 'boulder', name: 'Boulder Trap', kind: 'trap', cost: 220, craft: 16, hp: 0, blurb: 'Rolls down the longest corridor. One use.' },
  lightning_trap: { id: 'lightning_trap', name: 'Lightning Trap', kind: 'trap', cost: 240, craft: 16, hp: 0, blurb: 'Zaps on a cooldown.' },
  lava_trap: { id: 'lava_trap', name: 'Lava Trap', kind: 'trap', cost: 260, craft: 18, hp: 0, blurb: 'The tile burns for a few seconds. One use.' },
  word: { id: 'word', name: 'Word of Power', kind: 'trap', cost: 480, craft: 28, hp: 0, blurb: 'A devastating burst. One use. Mind your own.' },
}

export const RESEARCH: ResearchDef[] = [
  { id: 'training', kind: 'room', name: 'Training Room', cost: 26, requires: [], blurb: ROOMS.training!.blurb },
  { id: 'workshop', kind: 'room', name: 'Workshop', cost: 34, requires: [], blurb: ROOMS.workshop!.blurb },
  { id: 'guard', kind: 'room', name: 'Guard Post', cost: 18, requires: [], blurb: ROOMS.guard!.blurb },
  { id: 'bridge', kind: 'room', name: 'Bridge', cost: 16, requires: [], blurb: ROOMS.bridge!.blurb },
  { id: 'prison', kind: 'room', name: 'Prison', cost: 30, requires: [], blurb: ROOMS.prison!.blurb },
  { id: 'barracks', kind: 'room', name: 'Barracks', cost: 40, requires: ['training'], blurb: ROOMS.barracks!.blurb },
  { id: 'torture', kind: 'room', name: 'Torture Chamber', cost: 48, requires: ['prison'], blurb: ROOMS.torture!.blurb },
  { id: 'temple', kind: 'room', name: 'Temple', cost: 56, requires: [], blurb: ROOMS.temple!.blurb },
  { id: 'graveyard', kind: 'room', name: 'Graveyard', cost: 52, requires: [], blurb: ROOMS.graveyard!.blurb },
  { id: 'scavenger', kind: 'room', name: 'Scavenger Room', cost: 64, requires: ['graveyard'], blurb: ROOMS.scavenger!.blurb },
  { id: 'sight', kind: 'spell', name: 'Sight of Evil', cost: 22, requires: [], blurb: SPELLS.sight!.blurb },
  { id: 'speed', kind: 'spell', name: 'Speed Monster', cost: 24, requires: [], blurb: SPELLS.speed!.blurb },
  { id: 'heal', kind: 'spell', name: 'Heal Creature', cost: 20, requires: [], blurb: SPELLS.heal!.blurb },
  { id: 'lightning', kind: 'spell', name: 'Lightning', cost: 36, requires: [], blurb: SPELLS.lightning!.blurb },
  { id: 'call_to_arms', kind: 'spell', name: 'Call to Arms', cost: 32, requires: [], blurb: SPELLS.call_to_arms!.blurb },
  { id: 'protect', kind: 'spell', name: 'Protect Monster', cost: 34, requires: ['speed'], blurb: SPELLS.protect!.blurb },
  { id: 'possess', kind: 'spell', name: 'Possess', cost: 40, requires: ['sight'], blurb: SPELLS.possess!.blurb },
  { id: 'hold_audience', kind: 'spell', name: 'Hold Audience', cost: 38, requires: ['temple'], blurb: SPELLS.hold_audience!.blurb },
  { id: 'cave_in', kind: 'spell', name: 'Cave-In', cost: 46, requires: [], blurb: SPELLS.cave_in!.blurb },
  { id: 'chicken', kind: 'spell', name: 'Chicken', cost: 42, requires: ['hatchery_dummy'], blurb: SPELLS.chicken!.blurb },
  { id: 'disease', kind: 'spell', name: 'Disease', cost: 44, requires: [], blurb: SPELLS.disease!.blurb },
  { id: 'destroy_walls', kind: 'spell', name: 'Destroy Walls', cost: 54, requires: ['cave_in'], blurb: SPELLS.destroy_walls!.blurb },
  { id: 'armageddon', kind: 'spell', name: 'Armageddon', cost: 80, requires: ['temple', 'lightning'], blurb: SPELLS.armageddon!.blurb },
  { id: 'wooden', kind: 'door', name: 'Wooden Door', cost: 14, requires: ['workshop'], blurb: GEAR.wooden!.blurb },
  { id: 'braced', kind: 'door', name: 'Braced Door', cost: 26, requires: ['wooden'], blurb: GEAR.braced!.blurb },
  { id: 'iron', kind: 'door', name: 'Iron Door', cost: 40, requires: ['braced'], blurb: GEAR.iron!.blurb },
  { id: 'magic', kind: 'door', name: 'Magic Door', cost: 52, requires: ['iron'], blurb: GEAR.magic!.blurb },
  { id: 'alarm', kind: 'trap', name: 'Alarm Trap', cost: 18, requires: ['workshop'], blurb: GEAR.alarm!.blurb },
  { id: 'poison', kind: 'trap', name: 'Poison Gas', cost: 24, requires: ['alarm'], blurb: GEAR.poison!.blurb },
  { id: 'boulder', kind: 'trap', name: 'Boulder Trap', cost: 30, requires: ['workshop'], blurb: GEAR.boulder!.blurb },
  { id: 'lightning_trap', kind: 'trap', name: 'Lightning Trap', cost: 34, requires: ['alarm'], blurb: GEAR.lightning_trap!.blurb },
  { id: 'lava_trap', kind: 'trap', name: 'Lava Trap', cost: 40, requires: ['boulder'], blurb: GEAR.lava_trap!.blurb },
  { id: 'word', kind: 'trap', name: 'Word of Power', cost: 60, requires: ['lightning_trap', 'temple'], blurb: GEAR.word!.blurb },
]

// Chicken spell should not require a fake id. Fix requires to empty — hatchery is a room you build, not research.
const chicken = RESEARCH.find((r) => r.id === 'chicken')
if (chicken) chicken.requires = []

export const RESEARCH_BY_ID: Record<string, ResearchDef> = Object.fromEntries(RESEARCH.map((r) => [r.id, r]))

export function species(id: string): Species {
  const s = SPECIES[id]
  if (!s) throw new Error(`unknown species ${id}`)
  return s
}

export function hasUnlock(list: readonly string[], id: string): boolean {
  return list.includes(id)
}

export function allContentIds(): string[] {
  return [
    ...Object.keys(ROOMS),
    ...Object.keys(SPELLS),
    ...Object.keys(GEAR),
  ]
}
