export const Terrain = {
  Rock: 0,
  Earth: 1,
  Gold: 2,
  Gem: 3,
  Water: 4,
  Lava: 5,
  Floor: 6,
} as const

export type TerrainId = (typeof Terrain)[keyof typeof Terrain]

export const JOBS = ['body', 'gold', 'dig', 'mine', 'claim', 'reinforce', 'haul'] as const
export type JobKind = (typeof JOBS)[number]

export interface Tile {
  terrain: TerrainId
  owner: number
  room: string
  reinforced: boolean
  tag: number
  tagOwner: number
  gold: number
  gem: boolean
  hp: number
  maxHp: number
  trap: string
  trapOwner: number
  trapCd: number
  door: string
  doorOwner: number
  doorHp: number
  doorMax: number
  bridge: boolean
  heart: number
  portal: number
  gate: number
  dig: number
  variant: number
  hazard: number
}

export interface Creature {
  id: number
  kind: string
  owner: number
  x: number
  y: number
  hp: number
  maxHp: number
  level: number
  xp: number
  hunger: number
  fatigue: number
  happiness: number
  anger: number
  path: number[]
  pathI: number
  job: string
  jobTile: number
  workT: number
  carry: '' | 'gold' | 'body' | 'crate'
  carryGold: number
  carryId: number
  bash: number
  target: number
  cool: number
  unconscious: number
  convert: number
  imprisoned: boolean
  dead: boolean
  held: boolean
  carried: boolean
  chicken: number
  chickenHp: number
  disease: number
  spread: boolean
  shield: number
  speedT: number
  berserk: number
  slap: number
  revenge: number
  frenzy: number
  guard: number
  steal: number
  flee: boolean
  facing: number
  think: number
  misery: number
  possessed: boolean
  order: number
  mode: string
}

export interface Order {
  id: number
  kind: 'trap' | 'door'
  item: string
  tile: number
  status: 'building' | 'ready' | 'carrying' | 'done'
  progress: number
  gold: number
}

export interface Room {
  id: number
  type: string
  owner: number
  tiles: number[]
  chickens: number
  corpses: number
  efficiency: number
  skelT: number
  spawnT: number
}

export interface Keeper {
  id: number
  name: string
  ai: boolean
  gold: number
  alive: boolean
  heart: number
  portal: number
  jobs: string[]
  researchTarget: string
  research: Record<string, number>
  unlocked: string[]
  orders: Order[]
  nextOrder: number
  rallyX: number
  rallyY: number
  rallyT: number
  paydayT: number
  attractT: number
  evil: number
  color: number
  scavenge: string
  scavengeT: number
  aiThink: number
}

export interface SideDef {
  name: string
  gold: number
  imps: number
  rooms: string[]
  spells: string[]
  traps: string[]
  doors: string[]
}

export interface WaveDef {
  at: number
  gate: number
  party: { id: string; n: number }[]
  text: string
  narration?: string
}

export interface ObjDef {
  id: string
  text: string
  type: 'goldMined' | 'room' | 'population' | 'waves' | 'lord' | 'heart'
  amount?: number
  room?: string
  tiles?: number
  count?: number
}

export interface StartTag {
  x: number
  y: number
  kind: 'dig' | 'reinforce'
}

export interface LevelDef {
  id: string
  name: string
  briefing: string
  width: number
  height: number
  map: string[]
  payday: number
  research: number
  attract: number
  player: SideDef
  enemy: SideDef | null
  waves: WaveDef[]
  objectives: ObjDef[]
  startTags?: StartTag[]
}

export interface ObjectiveState extends ObjDef {
  done: boolean
}

export interface Note {
  id: number
  text: string
  time: number
  tile: number
  narration: string | null
  channel: string
}

export interface Stats {
  goldMined: number
  dugGold: number
  heroesKilled: number
  attracted: number
  lordDead: boolean
  enemyHeartDead: boolean
}

export interface Sight {
  x: number
  y: number
  r: number
  until: number
}

export interface Boulder {
  x: number
  y: number
  dx: number
  dy: number
  left: number
  dmg: number
  owner: number
}

export interface Cloud {
  x: number
  y: number
  r: number
  t: number
  dps: number
  owner: number
}

export interface SpawnQ {
  kind: string
  gate: number
  at: number
}

export function blankTile(): Tile {
  return {
    terrain: Terrain.Rock,
    owner: 0,
    room: '',
    reinforced: false,
    tag: 0,
    tagOwner: 0,
    gold: 0,
    gem: false,
    hp: 900,
    maxHp: 900,
    trap: '',
    trapOwner: 0,
    trapCd: 0,
    door: '',
    doorOwner: 0,
    doorHp: 0,
    doorMax: 0,
    bridge: false,
    heart: 0,
    portal: 0,
    gate: 0,
    dig: 0,
    variant: 0,
    hazard: 0,
  }
}

export function blankCreature(id: number, kind: string, owner: number, x: number, y: number, hp: number): Creature {
  return {
    id,
    kind,
    owner,
    x,
    y,
    hp,
    maxHp: hp,
    level: 1,
    xp: 0,
    hunger: 12,
    fatigue: 8,
    happiness: 72,
    anger: 0,
    path: [],
    pathI: 0,
    job: '',
    jobTile: -1,
    workT: 0,
    carry: '',
    carryGold: 0,
    carryId: 0,
    bash: -1,
    target: 0,
    cool: 0.4,
    unconscious: 0,
    convert: 0,
    imprisoned: false,
    dead: false,
    held: false,
    carried: false,
    chicken: 0,
    chickenHp: 0,
    disease: 0,
    spread: false,
    shield: 0,
    speedT: 0,
    berserk: 0,
    slap: 0,
    revenge: 0,
    frenzy: 0,
    guard: -1,
    steal: 0,
    flee: false,
    facing: 0,
    think: 0,
    misery: 0,
    possessed: false,
    order: 0,
    mode: '',
  }
}
