import { describe, expect, it } from 'vitest'
import { findPath } from '../src/sim/grid.ts'
import { roomEfficiency } from '../src/sim/sim.ts'
import {
  castSpell,
  countRoom,
  placeRoom,
  population,
  sellTile,
  slap,
  tagTiles,
} from '../src/sim/sim.ts'
import { Terrain } from '../src/sim/types.ts'
import { spawnCreature } from '../src/sim/world.ts'
import { run, world } from './helpers.ts'

describe('pathfinding', () => {
  it('walks around a wall and refuses a blocked corridor', () => {
    const blocked = new Set([1, 2, 3])
    const path = findPath(5, 1, 0, 4, (i) => (blocked.has(i) ? Infinity : 1))
    expect(path).toBeNull()

    const grid = ['.#.#.', '.....', '.....']
    const width = 5
    const solid = (i: number) => grid[(i / width) | 0]![i % width] === '#'
    const around = findPath(width, 3, 0, 4, (i) => (solid(i) ? Infinity : 1))
    expect(around).not.toBeNull()
    expect(around!.length).toBeGreaterThan(4)
    expect(around!.every((i) => !solid(i))).toBe(true)
  })

  it('does not cut a solid corner', () => {
    const map = ['#.', '.#']
    const width = 2
    const solid = (i: number) => map[(i / width) | 0]![i % width] === '#'
    const path = findPath(width, 2, 1, 2, (i) => (solid(i) ? Infinity : 1))
    expect(path).toBeNull()
  })
})

describe('imps and gold', () => {
  it('digs a tagged earth tile into floor', () => {
    const w = world(['#####', '#+++#', '#+h+#', '#e++#', '#####'])
    tagTiles(w, 1, 1, 3, 1, 3, 'set')
    run(w, 6)
    expect(w.tiles[3 * 5 + 1]!.terrain).toBe(Terrain.Floor)
  })

  it('mines a gold seam and banks it in a treasury', () => {
    const w = world(['######', '#++++#', '#+h++#', '#g+++#', '######'])
    tagTiles(w, 1, 1, 3, 1, 3, 'set')
    run(w, 8)
    const seam = w.tiles[3 * 6 + 1]!
    expect(seam.terrain).toBe(Terrain.Floor)
    expect(seam.gold).toBeGreaterThan(0)
    expect(placeRoom(w, 1, 'treasury', 3, 1)).toBe(true)
    expect(placeRoom(w, 1, 'treasury', 4, 1)).toBe(true)
    w.keepers[1]!.gold = 400
    const before = w.keepers[1]!.gold
    run(w, 20)
    expect(w.keepers[1]!.gold).toBeGreaterThan(before)
    expect(w.stats.goldMined).toBeGreaterThan(0)
  })
})

describe('rooms and wages', () => {
  it('merges a room, scores enclosure, and refunds a sale', () => {
    const w = world(['######', '#++++#', '#+h++#', '#++++#', '######'])
    expect(placeRoom(w, 1, 'lair', 3, 1)).toBe(true)
    expect(placeRoom(w, 1, 'lair', 4, 1)).toBe(true)
    expect(countRoom(w, 1, 'lair')).toBe(2)
    expect(w.rooms.filter((r) => r.type === 'lair')).toHaveLength(1)
    const open = roomEfficiency(w, w.rooms[0]!.tiles, 'lair')
    expect(open).toBeGreaterThan(0)
    expect(open).toBeLessThanOrEqual(1)
    const gold = w.keepers[1]!.gold
    expect(sellTile(w, 1, 4, 1)).toBe(true)
    expect(w.keepers[1]!.gold).toBeGreaterThan(gold)
  })

  it('angers creatures who miss payday', () => {
    const w = world(['#####', '#+h+#', '#+++#', '#####'])
    w.keepers[1]!.gold = 0
    w.keepers[1]!.paydayT = 0.05
    const beetle = spawnCreature(w, 'beetle', 1, 2.5, 1.5)
    const anger = beetle.anger
    run(w, 0.2)
    expect(beetle.anger).toBeGreaterThan(anger)
  })
})

describe('creatures and combat', () => {
  it('attracts a beetle once a lair exists', () => {
    const w = world(['#######', '#+p+h+#', '#+++++#', '#######'])
    placeRoom(w, 1, 'lair', 1, 2)
    placeRoom(w, 1, 'lair', 2, 2)
    w.keepers[1]!.attractT = 0.05
    run(w, 1)
    expect(population(w, 1)).toBeGreaterThan(0)
    expect(w.creatures.some((c) => c.kind === 'beetle')).toBe(true)
  })

  it('trades blows until someone drops', () => {
    const w = world(['#######', '#+++++#', '#++h++#', '#+++++#', '#######'])
    const beetle = spawnCreature(w, 'beetle', 1, 2.2, 2.2)
    const knight = spawnCreature(w, 'knight', 0, 2.8, 2.2)
    run(w, 25)
    const down = beetle.dead || beetle.unconscious > 0 || knight.dead || knight.unconscious > 0 || beetle.hp < beetle.maxHp
    expect(down).toBe(true)
    expect(knight.hp).toBeLessThan(knight.maxHp)
  })

  it('slaps a creature faster and angrier', () => {
    const w = world(['#####', '#+h+#', '#####'])
    const b = spawnCreature(w, 'goblin', 1, 2.5, 1.5)
    slap(w, b.id)
    expect(b.slap).toBeGreaterThan(0)
    expect(b.anger).toBeGreaterThan(0)
  })

  it('lightning hurts a hero and refuses a pauper', () => {
    const w = world(['#####', '#+h+#', '#+++#', '#####'])
    const knight = spawnCreature(w, 'knight', 0, 2.5, 2.5)
    const hp = knight.hp
    expect(castSpell(w, 1, 'lightning', 2, 2)).toBe(true)
    expect(knight.hp).toBeLessThan(hp)
    w.keepers[1]!.gold = 0
    expect(castSpell(w, 1, 'lightning', 2, 2)).toBe(false)
  })
})
