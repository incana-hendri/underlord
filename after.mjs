import { chromium } from '@playwright/test'
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page.on('pageerror', (e) => console.log('PAGE', e.message))
page.on('console', (m) => { if (m.type() === 'error') console.log('CON', m.text().slice(0, 400)) })
const dir = '/opt/cursor/artifacts'
await page.goto('http://127.0.0.1:41773/?play=01-cradle', { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__underlord && window.__underlord.time > 0.25, { timeout: 20000 })
await page.waitForTimeout(1000)
const fps = await page.evaluate(() => new Promise((resolve) => {
  let n = 0
  const t0 = performance.now()
  function frame(t) {
    n++
    if (t - t0 < 1000) requestAnimationFrame(frame)
    else resolve(Math.round(n * 1000 / (t - t0)))
  }
  requestAnimationFrame(frame)
}))
console.log('fps-medium', fps)
await page.screenshot({ path: dir + '/after_overview.png' })
const box = await page.locator('#gl').boundingBox()
await page.mouse.move(box.x + box.width * 0.48, box.y + box.height * 0.58)
for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -150)
await page.waitForTimeout(400)
await page.screenshot({ path: dir + '/after_close.png' })
await page.locator('#minimap').click({ position: { x: 100, y: 32 } })
await page.waitForTimeout(700)
await page.screenshot({ path: dir + '/after_lava.png' })
await page.locator('#gold').click()
await page.keyboard.press('Space')
await page.getByRole('button', { name: /Treasury/ }).click()
await page.getByRole('button', { name: /^Lair/ }).click()
const spot = await page.evaluate(() => {
  const g = window.__underlord
  for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
    const t = g.tile(x, y)
    if (t && t.terrain === 6 && t.owner === 1 && !t.room && !t.heart && !t.portal) {
      const p = g.screen(x + 0.5, y + 0.5, 0.4)
      if (p) return p
    }
  }
  return null
})
if (spot) await page.mouse.click(spot.x, spot.y)
await page.waitForTimeout(300)
await page.screenshot({ path: dir + '/after_rooms.png' })
const imp = await page.evaluate(() => window.__underlord.creatures().find(c => c.kind === 'imp' && c.owner === 1))
if (imp) {
  await page.getByRole('button', { name: 'Hand', exact: true }).click()
  const at = await page.evaluate((c) => window.__underlord.screen(c.x, c.y, 0.7), imp)
  if (at) await page.mouse.click(at.x, at.y)
  await page.waitForTimeout(250)
  const mid = await page.evaluate(() => window.__underlord.screen(10, 30, 1))
  if (mid) await page.mouse.move(mid.x, mid.y)
  await page.waitForTimeout(300)
  await page.screenshot({ path: dir + '/after_hand.png' })
  console.log('held', await page.evaluate(() => window.__underlord.held))
}
await browser.close()
