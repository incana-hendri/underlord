import { mulberry32, type Rng } from './rng.ts'
import { gx, gy, ix } from './grid.ts'
import { boot, step } from './sim.ts'
import {
  blankCreature,
  blankTile,
  JOBS,
  Terrain,
  type Boulder,
  type Cloud,
  type Creature,
  type Keeper,
  type LevelDef,
  type Note,
  type ObjectiveState,
  type Room,
  type Sight,
  type SpawnQ,
  type Stats,
  type Tile,
} from './types.ts'
import { species } from '../data/content.ts'

export class World {
  level: LevelDef
  width: number
  height: number
  tiles: Tile[]
  keepers: (Keeper | null)[]
  creatures: Creature[] = []
  rooms: Room[] = []
  nextId = 1
  nextRoom = 1
  time = 0
  rand: Rng
  seed: number
  notes: Note[] = []
  nextNote = 1
  noteAt = new Map<string, number>()
  outcome: 'playing' | 'victory' | 'defeat' = 'playing'
  objectives: ObjectiveState[]
  waveOn: boolean[]
  mapRevision = 1
  visRevision = 1
  animDirty = false
  revealed: Uint8Array
  visible: Uint8Array
  sights: Sight[] = []
  sounds: string[] = []
  stats: Stats = {
    goldMined: 0,
    dugGold: 0,
    heroesKilled: 0,
    attracted: 0,
    lordDead: false,
    enemyHeartDead: false,
  }
  gates: number[] = [0, -1, -1]
  spawnQ: SpawnQ[] = []
  boulders: Boulder[] = []
  clouds: Cloud[] = []
  reserved = new Map<number, number>()
  assignAcc = 1
  visAcc = 1
  possessId = 0
  possessUntil = 0
  possessX = 0
  possessY = 0
  possessAtk = false
  heartAlarm = 0
  camHint = -1

  private constructor(level: LevelDef, seed: number) {
    this.level = level
    this.width = level.width
    this.height = level.height
    this.seed = seed
    this.rand = mulberry32(seed)
    this.tiles = []
    this.keepers = [null]
    this.revealed = new Uint8Array(level.width * level.height)
    this.visible = new Uint8Array(level.width * level.height)
    this.objectives = level.objectives.map((o) => ({ ...o, done: false }))
    this.waveOn = level.waves.map(() => false)
  }

  static load(level: LevelDef, seed = 1): World {
    if (level.map.length !== level.height) throw new Error(`${level.id}: height mismatch`)
    const world = new World(level, seed)
    const w = level.width
    for (let y = 0; y < level.height; y++) {
      const row = level.map[y] ?? ''
      if (row.length !== w) throw new Error(`${level.id}: row ${y} is ${row.length}, want ${w}`)
      for (let x = 0; x < w; x++) {
        const t = blankTile()
        const ch = row[x]!
        paint(t, ch, x, y, world)
        t.variant = (x * 17 + y * 13) & 3
        world.tiles.push(t)
      }
    }
    world.keepers[1] = makeKeeper(world, 1, level.player, false)
    if (level.enemy) world.keepers[2] = makeKeeper(world, 2, level.enemy, true)
    for (let i = 0; i < world.tiles.length; i++) {
      const t = world.tiles[i]!
      if (t.heart) {
        const k = world.keepers[t.heart]
        if (k) k.heart = i
      }
      if (t.portal) {
        const k = world.keepers[t.portal]
        if (k) k.portal = i
      }
      if (t.gate) world.gates[t.gate] = i
    }
    const player = world.keepers[1]
    if (!player || player.heart < 0) throw new Error(`${level.id}: player heart missing`)
    if (level.enemy) {
      const enemy = world.keepers[2]
      if (!enemy || enemy.heart < 0) throw new Error(`${level.id}: enemy heart missing`)
    }
    spawnImps(world, 1, level.player.imps)
    if (level.enemy) spawnImps(world, 2, level.enemy.imps)
    for (const tag of level.startTags ?? []) {
      const idx = ix(w, tag.x, tag.y)
      const t = world.tiles[idx]
      if (!t) continue
      t.tag = tag.kind === 'dig' ? 1 : 2
      t.tagOwner = 1
    }
    boot(world)
    return world
  }

  tick(dt: number): void {
    if (this.outcome !== 'playing' || dt <= 0) return
    step(this, dt)
  }

  creature(id: number): Creature | undefined {
    return this.creatures.find((c) => c.id === id)
  }
}

function paint(t: Tile, ch: string, x: number, y: number, world: World): void {
  void x
  void y
  void world
  switch (ch) {
    case '#':
      t.terrain = Terrain.Rock
      t.hp = t.maxHp = 900
      break
    case 'R':
      t.terrain = Terrain.Rock
      t.reinforced = true
      t.hp = t.maxHp = 640
      break
    case 'e':
      t.terrain = Terrain.Earth
      t.hp = t.maxHp = 80
      break
    case 'g':
      t.terrain = Terrain.Gold
      t.hp = t.maxHp = 110
      t.gold = 1100
      break
    case 'm':
      t.terrain = Terrain.Gem
      t.hp = t.maxHp = 150
      break
    case 'w':
      t.terrain = Terrain.Water
      t.hp = t.maxHp = 0
      break
    case 'l':
      t.terrain = Terrain.Lava
      t.hp = t.maxHp = 0
      break
    case '.':
      t.terrain = Terrain.Floor
      t.hp = t.maxHp = 0
      break
    case '+':
      t.terrain = Terrain.Floor
      t.owner = 1
      t.hp = t.maxHp = 0
      break
    case '1':
      t.terrain = Terrain.Floor
      t.owner = 2
      t.hp = t.maxHp = 0
      break
    case 'h':
      t.terrain = Terrain.Floor
      t.owner = 1
      t.heart = 1
      t.hp = t.maxHp = 4800
      break
    case 'p':
      t.terrain = Terrain.Floor
      t.owner = 1
      t.portal = 1
      t.hp = t.maxHp = 0
      break
    case 'H':
      t.terrain = Terrain.Floor
      t.owner = 2
      t.heart = 2
      t.hp = t.maxHp = 4800
      break
    case 'P':
      t.terrain = Terrain.Floor
      t.owner = 2
      t.portal = 2
      t.hp = t.maxHp = 0
      break
    case 'G':
      t.terrain = Terrain.Floor
      t.gate = 1
      t.hp = t.maxHp = 0
      break
    case 'A':
      t.terrain = Terrain.Floor
      t.gate = 2
      t.hp = t.maxHp = 0
      break
    default:
      throw new Error(`bad map char '${ch}'`)
  }
}

function makeKeeper(world: World, id: number, side: LevelDef['player'], ai: boolean): Keeper {
  const heart = world.tiles.findIndex((t) => t.heart === id)
  return {
    id,
    name: side.name,
    ai,
    gold: side.gold,
    alive: true,
    heart,
    portal: -1,
    jobs: [...JOBS],
    researchTarget: '',
    research: {},
    unlocked: [...side.rooms, ...side.spells, ...side.traps, ...side.doors],
    orders: [],
    nextOrder: 1,
    rallyX: -1,
    rallyY: -1,
    rallyT: 0,
    paydayT: world.level.payday,
    attractT: 12,
    evil: 0,
    color: id === 1 ? 0xa02838 : 0x2a3c78,
    scavenge: '',
    scavengeT: 20,
    aiThink: 1,
  }
}

export function spawnCreature(world: World, kind: string, owner: number, x: number, y: number): Creature {
  const spec = species(kind)
  const c = blankCreature(world.nextId++, kind, owner, x, y, spec.hp)
  if (kind === 'reaper') c.anger = 28
  if (kind === 'skeleton') c.happiness = 55
  world.creatures.push(c)
  return c
}

function spawnImps(world: World, owner: number, n: number): void {
  const k = world.keepers[owner]
  if (!k) return
  const spots: number[] = []
  for (let i = 0; i < world.tiles.length; i++) {
    const t = world.tiles[i]!
    if (t.owner === owner && t.terrain === Terrain.Floor) spots.push(i)
  }
  const hx = gx(world.width, k.heart)
  const hy = gy(world.width, k.heart)
  spots.sort((a, b) => Math.abs(gx(world.width, a) - hx) + Math.abs(gy(world.width, a) - hy) - (Math.abs(gx(world.width, b) - hx) + Math.abs(gy(world.width, b) - hy)))
  for (let i = 0; i < n; i++) {
    const s = spots[i % Math.max(1, spots.length)] ?? k.heart
    const c = spawnCreature(world, 'imp', owner, gx(world.width, s) + 0.5, gy(world.width, s) + 0.5)
    c.x += ((i % 5) - 2) * 0.08
    c.y += (((i / 5) | 0) % 3 - 1) * 0.08
  }
}
