import { describe, expect, it } from 'vitest'
import { CAMPAIGN } from '../src/data/campaign.ts'
import { World } from '../src/sim/world.ts'

describe('campaign maps', () => {
  for (const level of CAMPAIGN) {
    it(`${level.id} loads and ticks`, () => {
      const world = World.load(level, 2)
      expect(world.keepers[1]?.heart).toBeGreaterThanOrEqual(0)
      if (level.enemy) expect(world.keepers[2]?.alive).toBe(true)
      for (let i = 0; i < 15; i++) world.tick(0.1)
      expect(world.keepers[1]?.alive).toBe(true)
    })
  }

  it('the rival keeper tags work for its imps', () => {
    const level = CAMPAIGN.find((l) => l.id === '03-rival')!
    const world = World.load(level, 4)
    for (let i = 0; i < 80; i++) world.tick(0.1)
    const tagged = world.tiles.some((t) => t.tagOwner === 2 && t.tag > 0)
    const busy = world.creatures.some((c) => c.owner === 2 && !c.dead && (c.job !== '' || c.carry !== ''))
    expect(tagged || busy).toBe(true)
  })
})
