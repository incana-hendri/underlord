import type { LevelDef } from './types.ts'
import { World } from './world.ts'
import type { Creature, Keeper, Room, Sight, Stats, Tile } from './types.ts'

export interface SaveBlob {
  v: 1
  levelId: string
  time: number
  rng: number
  outcome: World['outcome']
  tiles: Tile[]
  creatures: Creature[]
  rooms: Room[]
  keepers: Keeper[]
  stats: Stats
  waveOn: boolean[]
  objectiveDone: string[]
  revealed: number[]
  sights: Sight[]
  possessId: number
  possessUntil: number
}

const KEY = (id: string) => `underlord-save:${id}`

export function capture(world: World): SaveBlob {
  return {
    v: 1,
    levelId: world.level.id,
    time: world.time,
    rng: world.rand.getState(),
    outcome: world.outcome,
    tiles: world.tiles,
    creatures: world.creatures.map((c) => ({ ...c, path: [], pathI: 0 })),
    rooms: world.rooms,
    keepers: world.keepers.filter((k): k is Keeper => !!k),
    stats: world.stats,
    waveOn: world.waveOn,
    objectiveDone: world.objectives.filter((o) => o.done).map((o) => o.id),
    revealed: Array.from(world.revealed),
    sights: world.sights,
    possessId: 0,
    possessUntil: 0,
  }
}

export function persist(world: World): void {
  localStorage.setItem(KEY(world.level.id), JSON.stringify(capture(world)))
}

export function hasSave(id: string): boolean {
  return !!localStorage.getItem(KEY(id))
}

export function clearSave(id: string): void {
  localStorage.removeItem(KEY(id))
}

export function restore(level: LevelDef, raw: string): World {
  const data = JSON.parse(raw) as SaveBlob
  if (data.v !== 1 || data.levelId !== level.id) throw new Error('save does not match this level')
  const world = World.load(level, 1)
  world.time = data.time
  world.rand.setState(data.rng)
  world.outcome = data.outcome
  world.tiles = data.tiles
  world.creatures = data.creatures
  world.rooms = data.rooms
  world.keepers = [null]
  for (const k of data.keepers) world.keepers[k.id] = k
  world.stats = data.stats
  world.waveOn = data.waveOn
  world.sights = data.sights ?? []
  world.revealed = Uint8Array.from(data.revealed)
  for (const o of world.objectives) o.done = data.objectiveDone.includes(o.id)
  world.notes = []
  world.visAcc = 1
  world.mapRevision++
  return world
}

export function loadSave(level: LevelDef): World | null {
  const raw = localStorage.getItem(KEY(level.id))
  if (!raw) return null
  return restore(level, raw)
}
