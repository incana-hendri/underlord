import { allContentIds } from '../src/data/content.ts'
import type { LevelDef } from '../src/sim/types.ts'
import { World } from '../src/sim/world.ts'

export function level(map: string[], patch: Partial<LevelDef> = {}): LevelDef {
  const ids = allContentIds()
  return {
    id: 'test',
    name: 'Test',
    briefing: 'Test.',
    width: map[0]?.length ?? 0,
    height: map.length,
    map,
    payday: 100,
    research: 4,
    attract: 2,
    player: {
      name: 'You',
      gold: 8000,
      imps: 3,
      rooms: ids.filter((id) => id in { treasury: 1, lair: 1, hatchery: 1, training: 1, library: 1, workshop: 1, prison: 1, torture: 1, barracks: 1, guard: 1, bridge: 1, temple: 1, graveyard: 1, scavenger: 1 }),
      spells: ['create_imp', 'heal', 'lightning', 'sight', 'speed', 'call_to_arms', 'possess', 'cave_in', 'protect', 'hold_audience', 'chicken', 'disease', 'destroy_walls', 'armageddon'],
      traps: ['alarm', 'poison', 'boulder', 'lightning_trap', 'lava_trap', 'word'],
      doors: ['wooden', 'braced', 'iron', 'magic'],
    },
    enemy: null,
    waves: [],
    objectives: [],
    ...patch,
  }
}

export function world(map: string[], seed = 1): World {
  return World.load(level(map), seed)
}

export function run(w: World, seconds: number, dt = 0.1): void {
  const steps = Math.round(seconds / dt)
  for (let i = 0; i < steps; i++) w.tick(dt)
}
