import { expect, test, type Page } from '@playwright/test'

const Earth = 1
const Floor = 6

interface Tile {
  terrain: number
  owner: number
  tag: number
  tagOwner: number
  gold: number
  room: string
  heart: number
  portal: number
  dig: number
}

interface Actor {
  id: number
  kind: string
  owner: number
  x: number
  y: number
  held: boolean
  carry: string
  job: string
  hp: number
  mode: string
}

declare global {
  interface Window {
    __underlord: {
      time: number
      gold: number
      held: number
      outcome: string
      width: number
      height: number
      heart: number
      tile: (x: number, y: number) => Tile | null
      creatures: () => Actor[]
      notes: () => string[]
      chickens: () => number
      screen: (x: number, y: number, height?: number) => { x: number; y: number } | null
    }
  }
}

async function ready(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await page.waitForSelector('#gl')
  await page.waitForFunction(() => window.__underlord && window.__underlord.time > 0.2)
  await page.waitForTimeout(800)
}

async function press(page: Page, key: string): Promise<void> {
  await page.locator('#gold').click()
  await page.keyboard.press(key)
}

test('the hand tags earth, an imp digs, gold rises, a room costs gold, and a creature can be carried', async ({ page }) => {
  await ready(page, '/?play=01-cradle')
  expect(await page.evaluate(() => window.__underlord.time)).toBeGreaterThan(0.2)

  const earth = await page.evaluate((earthId) => {
    const g = window.__underlord
    const spots: { x: number; y: number }[] = []
    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        const t = g.tile(x, y)
        if (!t || t.terrain !== earthId || t.tag) continue
        let touch = false
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const n = g.tile(x + dx, y + dy)
          if (n && n.terrain === 6 && n.owner === 1) touch = true
        }
        if (touch) spots.push({ x, y })
      }
    }
    spots.sort((a, b) => Math.abs(a.x - 8) + Math.abs(a.y - 31) - (Math.abs(b.x - 8) + Math.abs(b.y - 31)))
    return spots[0] ?? null
  }, Earth)
  expect(earth).toBeTruthy()

  await press(page, 'Space')
  const pointed = await page.evaluate(({ x, y }) => window.__underlord.screen(x + 0.5, y + 0.5, 1.15), earth!)
  expect(pointed).toBeTruthy()
  await page.mouse.move(pointed!.x, pointed!.y)
  await expect(page.locator('#inspector')).toContainText(/Earth/)
  await page.mouse.click(pointed!.x, pointed!.y)
  expect((await page.evaluate(({ x, y }) => window.__underlord.tile(x, y), earth!))!.tag).toBe(1)

  const goldBefore = await page.evaluate(() => window.__underlord.gold)
  await press(page, '3')
  await expect.poll(async () => page.evaluate(({ x, y }) => window.__underlord.tile(x, y)!.terrain, earth!), { timeout: 15_000 }).toBe(Floor)
  await expect.poll(async () => page.evaluate(() => window.__underlord.gold), { timeout: 20_000 }).toBeGreaterThan(goldBefore)

  await press(page, 'Space')
  const goldRoom = await page.evaluate(() => window.__underlord.gold)
  await page.getByRole('button', { name: /Treasury/ }).click()
  const spot = await page.evaluate((floorId) => {
    const g = window.__underlord
    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        const t = g.tile(x, y)
        if (!t || t.terrain !== floorId || t.owner !== 1 || t.room || t.heart || t.portal) continue
        if (g.screen(x + 0.5, y + 0.5, 0.4)) return { x, y }
      }
    }
    return null
  }, Floor)
  expect(spot).toBeTruthy()
  const buildAt = await page.evaluate(({ x, y }) => window.__underlord.screen(x + 0.5, y + 0.5, 0.4), spot!)
  await page.mouse.click(buildAt!.x, buildAt!.y)
  expect(await page.evaluate(() => window.__underlord.gold)).toBe(goldRoom - 70)
  expect((await page.evaluate(({ x, y }) => window.__underlord.tile(x, y), spot!))!.room).toBe('treasury')

  await page.getByRole('button', { name: 'Hand', exact: true }).click()
  const imp = await page.evaluate(() => {
    const g = window.__underlord
    return g.creatures().find((c) => c.kind === 'imp' && c.owner === 1 && g.screen(c.x, c.y, 0.7)) ?? null
  })
  expect(imp).toBeTruthy()
  const impAt = await page.evaluate((c) => window.__underlord.screen(c.x, c.y, 0.7), imp!)
  await page.mouse.click(impAt!.x, impAt!.y)
  if ((await page.evaluate(() => window.__underlord.held)) === 0) {
    await page.mouse.click(impAt!.x, impAt!.y - 12)
  }
  expect(await page.evaluate(() => window.__underlord.held)).toBeGreaterThan(0)

  const drop = await page.evaluate((from) => {
    const g = window.__underlord
    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        const t = g.tile(x, y)
        if (!t || t.terrain !== 6 || t.owner !== 1 || t.heart || t.portal) continue
        if (Math.hypot(x + 0.5 - from.x, y + 0.5 - from.y) < 1.2) continue
        if (g.screen(x + 0.5, y + 0.5, 0.4)) return { x, y }
      }
    }
    return null
  }, imp!)
  expect(drop).toBeTruthy()
  const dropAt = await page.evaluate(({ x, y }) => window.__underlord.screen(x + 0.5, y + 0.5, 0.4), drop!)
  await page.mouse.click(dropAt!.x, dropAt!.y, { button: 'right' })
  expect(await page.evaluate(() => window.__underlord.held)).toBe(0)
  const carried = await page.evaluate((id) => window.__underlord.creatures().find((c) => c.id === id) ?? null, imp!.id)
  expect(carried).toBeTruthy()
  expect(Math.hypot(carried!.x - (drop!.x + 0.5), carried!.y - (drop!.y + 0.5))).toBeLessThan(0.8)

  const slapAt = await page.evaluate((c) => window.__underlord.screen(c.x, c.y, 0.55), carried!)
  expect(slapAt).toBeTruthy()
  await page.mouse.click(slapAt!.x, slapAt!.y, { button: 'right' })
  await expect.poll(async () => page.evaluate(() => window.__underlord.notes())).toEqual(expect.arrayContaining([expect.stringMatching(/slap the Imp/i)]))
})

test('Create Imp spends gold and another imp crawls out', async ({ page }) => {
  await ready(page, '/?play=01-cradle')
  await press(page, 'Space')
  const before = await page.evaluate(() => window.__underlord.gold)
  const imps = await page.evaluate(() => window.__underlord.creatures().filter((c) => c.kind === 'imp' && c.owner === 1).length)
  await page.getByRole('button', { name: 'Spells' }).click()
  await page.getByRole('button', { name: /Create Imp/ }).click()
  expect(await page.evaluate(() => window.__underlord.gold)).toBeLessThan(before)
  expect(await page.evaluate(() => window.__underlord.creatures().filter((c) => c.kind === 'imp' && c.owner === 1).length)).toBe(imps + 1)
  await expect.poll(async () => page.evaluate(() => window.__underlord.notes())).toEqual(expect.arrayContaining([expect.stringMatching(/imp/i)]))
})

test('a lair attracts a creature and a hatchery grows a chicken', async ({ page }) => {
  await ready(page, '/?play=01-cradle')
  await press(page, 'Space')
  await page.getByRole('button', { name: /^Lair/ }).click()
  expect(await paint(page, 'lair', 4)).toBeGreaterThan(0)
  await page.getByRole('button', { name: /Hatchery/ }).click()
  expect(await paint(page, 'hatchery', 6)).toBeGreaterThanOrEqual(4)
  await press(page, '3')
  await expect.poll(async () => page.evaluate(() => window.__underlord.creatures().some((c) => c.kind === 'beetle' && c.owner === 1)), { timeout: 25_000 }).toBe(true)
  await expect.poll(async () => page.evaluate(() => window.__underlord.chickens()), { timeout: 40_000 }).toBeGreaterThan(0)
  await expect.poll(async () => page.evaluate(() => window.__underlord.notes())).toEqual(expect.arrayContaining([expect.stringMatching(/joins your dungeon/i)]))
})

test('the rival keeper sends imps to work', async ({ page }) => {
  await ready(page, '/?play=03-rival')
  await press(page, '3')
  await expect.poll(async () => page.evaluate(() => {
    const g = window.__underlord
    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        const t = g.tile(x, y)
        if (t && t.tagOwner === 2 && t.tag > 0) return true
      }
    }
    return g.creatures().some((c) => c.owner === 2 && (c.job !== '' || c.carry !== ''))
  }), { timeout: 15_000 }).toBe(true)
})

test('heroes enter the first vein and start moving', async ({ page }) => {
  test.setTimeout(200_000)
  await ready(page, '/?play=01-cradle')
  await press(page, '3')
  await expect.poll(async () => page.evaluate(() => window.__underlord.notes().some((n) => /entered the deep/.test(n))), { timeout: 160_000 }).toBe(true)
  const hero = await page.evaluate(() => window.__underlord.creatures().find((c) => c.owner === 0) ?? null)
  expect(hero).toBeTruthy()
  await page.waitForTimeout(2500)
  const moved = await page.evaluate((id) => window.__underlord.creatures().find((c) => c.id === id) ?? null, hero!.id)
  expect(moved).toBeTruthy()
  const acted = Math.hypot(moved!.x - hero!.x, moved!.y - hero!.y) > 0.2 || moved!.mode === 'fight' || moved!.hp !== hero!.hp
  expect(acted).toBe(true)
})

async function paint(page: Page, room: string, want: number): Promise<number> {
  let placed = 0
  for (let n = 0; n < 40 && placed < want; n++) {
    const spot = await page.evaluate(() => {
      const g = window.__underlord
      for (let y = 0; y < g.height; y++) {
        for (let x = 0; x < g.width; x++) {
          const t = g.tile(x, y)
          if (!t || t.terrain !== 6 || t.owner !== 1 || t.room || t.heart || t.portal) continue
          if (g.screen(x + 0.5, y + 0.5, 0.35)) return { x, y }
        }
      }
      return null
    })
    if (!spot) break
    const at = await page.evaluate(({ x, y }) => window.__underlord.screen(x + 0.5, y + 0.5, 0.35), spot)
    if (!at) break
    await page.mouse.click(at.x, at.y)
    const now = await page.evaluate(({ x, y }) => window.__underlord.tile(x, y)!.room, spot)
    if (now === room) placed++
  }
  return placed
}
