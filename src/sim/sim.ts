import { GEAR, RESEARCH, RESEARCH_BY_ID, ROOMS, SPECIES, SPELLS, species } from '../data/content.ts'
import { DIR4, findPath, gx, gy, inMap, ix, manhattan } from './grid.ts'
import { irand } from './rng.ts'
import { Terrain, type Creature, type Keeper, type Room, type Tile } from './types.ts'
import { spawnCreature, type World } from './world.ts'

const CLAIM_T = 0.8
const REINFORCE_T = 2.4

export function say(world: World, channel: string, text: string, narration: string | null, tile = -1, cd = 10): void {
  const last = world.noteAt.get(channel) ?? -1e9
  if (world.time - last < cd) return
  world.noteAt.set(channel, world.time)
  world.notes.push({ id: world.nextNote++, text, time: world.time, tile, narration, channel })
  if (world.notes.length > 40) world.notes.shift()
  if (tile >= 0 && (channel === 'heart' || channel === 'lord' || channel === 'heroes' || channel === 'enemy_heart')) {
    world.camHint = tile
  }
}

export function ping(world: World, id: string): void {
  world.sounds.push(id)
  if (world.sounds.length > 24) world.sounds.shift()
}

export function isSolid(t: number): boolean {
  return t === Terrain.Rock || t === Terrain.Earth || t === Terrain.Gold || t === Terrain.Gem
}

export function tileAt(world: World, x: number, y: number): Tile | null {
  if (!inMap(world.width, world.height, x, y)) return null
  return world.tiles[ix(world.width, x, y)] ?? null
}

function tindex(world: World, c: Creature): number {
  const x = Math.floor(c.x)
  const y = Math.floor(c.y)
  if (!inMap(world.width, world.height, x, y)) return -1
  return ix(world.width, x, y)
}

function keeper(world: World, id: number): Keeper | null {
  return world.keepers[id] ?? null
}

export function countRoom(world: World, owner: number, type: string): number {
  let n = 0
  for (const r of world.rooms) if (r.owner === owner && r.type === type) n += r.tiles.length
  return n
}

export function population(world: World, owner: number): number {
  let n = 0
  for (const c of world.creatures) {
    if (c.owner === owner && !c.dead && c.kind !== 'imp' && !c.imprisoned) n++
  }
  return n
}

export function countKind(world: World, owner: number, kind: string): number {
  let n = 0
  for (const c of world.creatures) if (c.owner === owner && c.kind === kind && !c.dead) n++
  return n
}

export function goldCap(world: World, owner: number): number {
  return 4500 + countRoom(world, owner, 'treasury') * 280
}

export function impPrice(world: World, owner: number): number {
  return 220 + countKind(world, owner, 'imp') * 45
}

function living(c: Creature): boolean {
  return !c.dead && c.unconscious <= 0 && !c.imprisoned && !c.held && !c.carried
}

function doorBlocks(t: Tile, owner: number): boolean {
  return !!t.door && t.doorHp > 0 && t.doorOwner !== 0 && t.doorOwner !== owner
}

function canStand(t: Tile, flying: boolean): boolean {
  if (t.terrain === Terrain.Floor) return true
  if (t.terrain === Terrain.Water || t.terrain === Terrain.Lava) return t.bridge || flying
  return false
}

function impWalk(world: World, owner: number, index: number): boolean {
  const t = world.tiles[index]
  if (!t || !canStand(t, false)) return false
  if (t.owner !== owner && t.owner !== 0) return false
  if (doorBlocks(t, owner)) return false
  return true
}

function fightWalk(world: World, c: Creature, index: number): boolean {
  const t = world.tiles[index]
  if (!t) return false
  const fly = species(c.kind).flying
  if (!canStand(t, fly)) return false
  if (doorBlocks(t, c.owner)) return false
  return true
}

function attackCost(world: World, owner: number, index: number): number {
  const t = world.tiles[index]!
  if (t.terrain === Terrain.Rock) return t.reinforced ? 26 : 12
  if (t.terrain === Terrain.Earth) return 3.2
  if (t.terrain === Terrain.Gold || t.terrain === Terrain.Gem) return 3.5
  if (t.terrain === Terrain.Water) return t.bridge ? 1 : 16
  if (t.terrain === Terrain.Lava) return t.bridge ? 1 : 20
  if (doorBlocks(t, owner)) return 5
  return 1
}

export function roomEfficiency(world: World, tiles: number[], type: string): number {
  const def = ROOMS[type]
  if (!def || tiles.length < def.min) return 0
  const size = Math.min(1, tiles.length / def.ideal)
  let edges = 0
  let walled = 0
  const w = world.width
  for (const i of tiles) {
    const x = gx(w, i)
    const y = gy(w, i)
    for (const [dx, dy] of DIR4) {
      edges++
      const nx = x + dx
      const ny = y + dy
      if (!inMap(w, world.height, nx, ny)) {
        walled++
        continue
      }
      const nb = world.tiles[ix(w, nx, ny)]!
      if (isSolid(nb.terrain) || (nb.door && nb.doorHp > 0)) walled++
    }
  }
  const wall = 0.55 + 0.45 * (walled / Math.max(1, edges))
  return size * wall
}

export function rebuildRooms(world: World, owner: number): void {
  const old = world.rooms.filter((r) => r.owner === owner)
  const oldByTile = new Map<number, Room>()
  for (const r of old) for (const t of r.tiles) oldByTile.set(t, r)
  world.rooms = world.rooms.filter((r) => r.owner !== owner)
  const seen = new Uint8Array(world.tiles.length)
  const w = world.width
  for (let i = 0; i < world.tiles.length; i++) {
    const t = world.tiles[i]!
    if (t.owner !== owner || !t.room || seen[i]) continue
    const type = t.room
    const tiles: number[] = []
    const stack = [i]
    seen[i] = 1
    while (stack.length) {
      const cur = stack.pop()!
      tiles.push(cur)
      const x = gx(w, cur)
      const y = gy(w, cur)
      for (const [dx, dy] of DIR4) {
        const nx = x + dx
        const ny = y + dy
        if (!inMap(w, world.height, nx, ny)) continue
        const ni = ix(w, nx, ny)
        if (seen[ni]) continue
        const nb = world.tiles[ni]!
        if (nb.owner === owner && nb.room === type) {
          seen[ni] = 1
          stack.push(ni)
        }
      }
    }
    const used = new Set<Room>()
    let chickens = 0
    let corpses = 0
    for (const ti of tiles) {
      const prev = oldByTile.get(ti)
      if (prev && prev.type === type && !used.has(prev)) {
        used.add(prev)
        chickens += prev.chickens
        corpses += prev.corpses
      }
    }
    const room: Room = {
      id: world.nextRoom++,
      type,
      owner,
      tiles,
      chickens,
      corpses,
      efficiency: roomEfficiency(world, tiles, type),
      skelT: 0,
      spawnT: 0,
    }
    const cap = chickenCap(room)
    room.chickens = Math.min(chickens, cap)
    for (const ti of tiles) world.tiles[ti]!.room = type
    world.rooms.push(room)
  }
}

function chickenCap(room: Room): number {
  return Math.max(0, Math.floor(room.tiles.length * Math.max(0.25, room.efficiency) * 2))
}

function bestRoom(world: World, owner: number, type: string): Room | null {
  let best: Room | null = null
  for (const r of world.rooms) {
    if (r.owner === owner && r.type === type && (!best || r.tiles.length > best.tiles.length)) best = r
  }
  return best
}

function touch(world: World): void {
  world.mapRevision++
  world.animDirty = true
  world.visAcc = 1
}

function moveSpeed(c: Creature): number {
  const s = species(c.kind)
  let v = s.speed
  if (c.slap > 0) v *= 1.7
  if (c.speedT > 0) v *= 1.85
  if (c.berserk > 0) v *= 1.35
  if (c.chicken > 0) v = 1.7
  if (c.kind !== 'imp') {
    if (c.happiness < 28) v *= 0.72
    else if (c.happiness > 80) v *= 1.12
  }
  return v
}

function workRate(c: Creature): number {
  let r = 1
  if (c.slap > 0) r *= 1.75
  if (c.happiness > 78) r *= 1.15
  if (c.happiness < 30 && c.kind !== 'imp') r *= 0.7
  return r
}

function hostile(a: Creature, b: Creature): boolean {
  if (a.id === b.id || !living(b)) return false
  if (a.chicken > 0) return false
  if (a.frenzy > 0) return true
  if (a.owner === 0 && b.owner === 0) return false
  return a.owner !== b.owner
}

function dist(a: Creature, b: Creature): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function nearestHostile(world: World, c: Creature, radius: number): Creature | null {
  let best: Creature | null = null
  let bestD = radius
  for (const o of world.creatures) {
    if (!hostile(c, o)) continue
    const d = dist(c, o)
    if (d < bestD) {
      bestD = d
      best = o
    }
  }
  return best
}

function los(world: World, x0: number, y0: number, x1: number, y1: number): boolean {
  let x = Math.floor(x0)
  let y = Math.floor(y0)
  const tx = Math.floor(x1)
  const ty = Math.floor(y1)
  const dx = Math.abs(tx - x)
  const dy = Math.abs(ty - y)
  const sx = x < tx ? 1 : -1
  const sy = y < ty ? 1 : -1
  let err = dx - dy
  while (x !== tx || y !== ty) {
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
    if (x === tx && y === ty) return true
    if (!inMap(world.width, world.height, x, y)) return false
    if (isSolid(world.tiles[ix(world.width, x, y)]!.terrain)) return false
  }
  return true
}

function damageTile(world: World, index: number, amount: number, by: Creature | null): void {
  const t = world.tiles[index]
  if (!t || amount <= 0) return
  if (t.heart) {
    t.hp -= amount
    const owner = t.heart
    if (owner === 1) {
      world.heartAlarm = 10
      say(world, 'heart', 'Your dungeon heart is under attack.', 'heart', index, 14)
      ping(world, 'heart')
    } else {
      const k = keeper(world, owner)
      if (k) {
        k.rallyX = gx(world.width, index)
        k.rallyY = gy(world.width, index)
        k.rallyT = 8
      }
    }
    if (by && by.owner === 0) say(world, 'breaching', 'The enemy is breaching your walls.', 'breaching', index, 18)
    if (t.hp <= 0) destroyHeart(world, owner)
    touch(world)
    return
  }
  if (t.door && t.doorHp > 0) {
    t.doorHp -= amount
    if (by && t.door === 'magic') by.hp -= amount * 0.12
    if (t.doorHp <= 0) {
      t.door = ''
      t.doorHp = 0
      t.doorOwner = 0
      ping(world, 'door')
      touch(world)
    }
    return
  }
  if (!isSolid(t.terrain)) return
  t.hp -= amount
  t.dig = Math.min(0.85, 1 - t.hp / Math.max(1, t.maxHp))
  world.animDirty = true
  if (t.hp <= 0) collapse(world, index, t.terrain === Terrain.Gold ? Math.floor(t.gold * 0.45) : 0)
}

function collapse(world: World, index: number, pile: number): void {
  const t = world.tiles[index]!
  const wasRoom = t.room
  t.terrain = Terrain.Floor
  t.owner = 0
  t.room = ''
  t.reinforced = false
  t.tag = 0
  t.gold = pile
  t.gem = false
  t.hp = 0
  t.maxHp = 0
  t.dig = 0
  t.bridge = false
  if (wasRoom) {
    const owners = new Set<number>()
    for (const r of world.rooms) if (r.tiles.includes(index)) owners.add(r.owner)
    for (const o of owners) rebuildRooms(world, o)
  }
  touch(world)
}

function destroyHeart(world: World, owner: number): void {
  const k = keeper(world, owner)
  if (!k || !k.alive) return
  k.alive = false
  const t = world.tiles[k.heart]
  if (t) {
    t.heart = 0
    t.hp = 0
  }
  if (owner === 1) {
    world.outcome = 'defeat'
    say(world, 'defeat', 'Your dungeon heart has fallen.', 'defeat', k.heart, 0)
    ping(world, 'lose')
  } else {
    world.stats.enemyHeartDead = true
    say(world, 'enemy_heart', 'The rival heart is silent.', 'enemy_heart', k.heart, 0)
    ping(world, 'spell')
    for (const c of world.creatures) {
      if (c.owner === owner && !c.dead) {
        c.berserk = 8
        c.happiness = 8
        c.anger = 100
      }
    }
  }
}

function dropCarry(world: World, c: Creature): void {
  if (c.carry === 'gold' && c.carryGold > 0) {
    const i = tindex(world, c)
    if (i >= 0) world.tiles[i]!.gold += c.carryGold
  }
  if (c.carry === 'body') {
    const v = world.creature(c.carryId)
    if (v) v.carried = false
  }
  if (c.carry === 'crate') {
    const k = keeper(world, c.owner)
    const order = k?.orders.find((o) => o.id === c.order)
    if (order && order.status === 'carrying') order.status = 'ready'
  }
  c.carry = ''
  c.carryGold = 0
  c.carryId = 0
  c.order = 0
}

function kill(world: World, c: Creature): void {
  if (c.dead) return
  dropCarry(world, c)
  c.dead = true
  c.hp = 0
  c.held = false
  c.path = []
  c.job = ''
  if (world.possessId === c.id) world.possessId = 0
  if (c.kind === 'lord') world.stats.lordDead = true
  if (c.owner === 0) world.stats.heroesKilled++
  const spec = species(c.kind)
  if (c.kind !== 'imp' && !spec.boss) {
    const who = c.owner === 0 ? 1 : c.owner
    const yard = bestRoom(world, who, 'graveyard')
    if (yard) yard.corpses++
  }
  ping(world, 'die')
}

function strike(world: World, a: Creature, b: Creature): void {
  const A = species(a.kind)
  const B = species(b.kind)
  let dmg = A.attack * (1 + (a.level - 1) * 0.2)
  if (a.berserk > 0) dmg *= 1.65
  dmg -= B.defense * (1 + (b.level - 1) * 0.12) * 0.28
  if (b.guard >= 0) dmg *= 0.82
  const onBarracks = (() => {
    const i = tindex(world, a)
    return i >= 0 && world.tiles[i]!.room === 'barracks' && world.tiles[i]!.owner === a.owner
  })()
  if (onBarracks) dmg *= 1.12
  dmg *= 0.86 + world.rand.next() * 0.28
  if (b.shield > 0) {
    const absorbed = Math.min(b.shield, dmg)
    b.shield -= absorbed
    dmg -= absorbed
  }
  dmg = Math.max(1, dmg)
  b.hp -= dmg
  b.revenge = 6
  if (a.kind === 'spider') b.disease = Math.max(b.disease, 7)
  if (a.kind === 'vampire') a.hp = Math.min(a.maxHp, a.hp + dmg * 0.3)
  ping(world, 'hit')
  if (b.hp <= 0) down(world, b)
}

function down(world: World, c: Creature): void {
  const spec = species(c.kind)
  if (c.kind === 'imp' || spec.boss || c.chicken > 0) {
    kill(world, c)
    return
  }
  c.hp = 0
  c.unconscious = 22
  c.path = []
  c.job = ''
  c.mode = 'down'
  c.target = 0
  ping(world, 'hit')
}

function bashDps(c: Creature): number {
  const s = species(c.kind)
  const base = Math.max(s.dig, s.attack * 0.45) * (1 + (c.level - 1) * 0.12)
  return base * (c.berserk > 0 ? 1.4 : 1)
}

function moveAlong(world: World, c: Creature, dt: number): void {
  if (c.bash >= 0) {
    const t = world.tiles[c.bash]
    if (!t || (!isSolid(t.terrain) && !(t.door && t.doorHp > 0) && !t.heart)) {
      c.bash = -1
    } else {
      damageTile(world, c.bash, bashDps(c) * dt, c)
      return
    }
  }
  if (c.pathI >= c.path.length) return
  const next = c.path[c.pathI]!
  const walk = c.kind === 'imp' ? impWalk(world, c.owner, next) : fightWalk(world, c, next)
  if (!walk) {
    const t = world.tiles[next]
    if (c.kind !== 'imp' && t && (isSolid(t.terrain) || (t.door && t.doorHp > 0) || t.heart)) c.bash = next
    else c.path = []
    return
  }
  const tx = gx(world.width, next) + 0.5
  const ty = gy(world.width, next) + 0.5
  const dx = tx - c.x
  const dy = ty - c.y
  const d = Math.hypot(dx, dy) || 1
  const stepLen = moveSpeed(c) * dt
  if (d <= stepLen) {
    c.x = tx
    c.y = ty
    c.pathI++
  } else {
    c.x += (dx / d) * stepLen
    c.y += (dy / d) * stepLen
  }
  if (Math.abs(dx) + Math.abs(dy) > 0.01) c.facing = Math.atan2(dx, dy)
}

function route(world: World, c: Creature, goal: number, bash: boolean): boolean {
  const start = tindex(world, c)
  if (start < 0 || goal < 0) return false
  const cost = (i: number) => (c.kind === 'imp' ? (impWalk(world, c.owner, i) ? 1 : Infinity) : fightWalk(world, c, i) ? 1 : Infinity)
  let path = findPath(world.width, world.height, start, goal, cost)
  if (!path && bash && c.kind !== 'imp') {
    path = findPath(world.width, world.height, start, goal, (i) => attackCost(world, c.owner, i))
  }
  if (!path) return false
  c.path = path
  c.pathI = 0
  c.bash = -1
  return true
}

function standNear(world: World, owner: number, tileIndex: number, fromX: number, fromY: number): number {
  const w = world.width
  const x = gx(w, tileIndex)
  const y = gy(w, tileIndex)
  let best = -1
  let bestD = 1e9
  for (const [dx, dy] of DIR4) {
    const nx = x + dx
    const ny = y + dy
    if (!inMap(w, world.height, nx, ny)) continue
    const ni = ix(w, nx, ny)
    if (!impWalk(world, owner, ni)) continue
    const d = Math.abs(nx + 0.5 - fromX) + Math.abs(ny + 0.5 - fromY)
    if (d < bestD) {
      bestD = d
      best = ni
    }
  }
  return best
}

function assignJobs(world: World): void {
  world.reserved.clear()
  for (const c of world.creatures) {
    if (c.kind === 'imp' && !c.dead && c.job && c.jobTile >= 0) world.reserved.set(c.jobTile, c.id)
  }
  for (const k of world.keepers) {
    if (!k || !k.alive) continue
    const imps = world.creatures.filter((c) => c.kind === 'imp' && c.owner === k.id && !c.dead && !c.held && c.unconscious <= 0 && c.carry === '' && !c.job && c.pathI >= c.path.length)
    if (!imps.length) continue
    const tasks = collectTasks(world, k)
    tasks.sort((a, b) => a.prio - b.prio || a.dist - b.dist)
    const used = new Set<number>()
    for (const task of tasks) {
      if (world.reserved.has(task.tile)) continue
      const near = imps.filter((c) => !used.has(c.id)).sort((a, b) => Math.abs(a.x - task.x) + Math.abs(a.y - task.y) - (Math.abs(b.x - task.x) + Math.abs(b.y - task.y)))
      let taken = false
      for (const imp of near.slice(0, 2)) {
        const goal = task.onto ? task.tile : standNear(world, k.id, task.tile, imp.x, imp.y)
        if (goal < 0) continue
        const start = tindex(world, imp)
        if (start < 0) continue
        if (start !== goal) {
          const path = findPath(world.width, world.height, start, goal, (i) => (impWalk(world, k.id, i) ? 1 : Infinity))
          if (!path) continue
          imp.path = path
          imp.pathI = 0
        }
        imp.job = task.kind
        imp.jobTile = task.tile
        imp.workT = 0
        imp.order = task.order
        imp.mode = task.kind === 'haul' ? 'toShop' : ''
        if (task.kind === 'haul') {
          const order = k.orders.find((o) => o.id === task.order)
          if (order) order.status = 'carrying'
          const shop = nearestRoomTile(world, k.id, 'workshop', imp.x, imp.y)
          if (shop >= 0 && tindex(world, imp) !== shop) {
            const path = findPath(world.width, world.height, tindex(world, imp), shop, (i) => (impWalk(world, k.id, i) ? 1 : Infinity))
            if (path) {
              imp.path = path
              imp.pathI = 0
            }
          } else imp.mode = 'toSite'
        }
        world.reserved.set(task.tile, imp.id)
        used.add(imp.id)
        taken = true
        break
      }
      if (!taken) continue
      if (used.size === imps.length) break
    }
  }
}

interface Task { kind: string; tile: number; prio: number; dist: number; x: number; y: number; onto: boolean; order: number }

function collectTasks(world: World, k: Keeper): Task[] {
  const tasks: Task[] = []
  const w = world.width
  const hx = gx(w, Math.max(0, k.heart))
  const hy = gy(w, Math.max(0, k.heart))
  const prio = (kind: string) => {
    const i = k.jobs.indexOf(kind)
    return i < 0 ? 50 : i
  }
  const push = (kind: string, tile: number, onto: boolean, order = 0) => {
    const x = gx(w, tile)
    const y = gy(w, tile)
    tasks.push({ kind, tile, prio: prio(kind), dist: manhattan(hx, hy, x, y), x: x + 0.5, y: y + 0.5, onto, order })
  }
  let digs = 0
  let claims = 0
  let golds = 0
  for (let i = 0; i < world.tiles.length; i++) {
    const t = world.tiles[i]!
    if (t.tag === 1 && t.tagOwner === k.id && (t.terrain === Terrain.Earth || t.terrain === Terrain.Gold || t.terrain === Terrain.Gem)) {
      if (digs < 24 && standNear(world, k.id, i, hx, hy) >= 0) {
        push('dig', i, false)
        digs++
      }
    } else if (t.tag === 2 && t.tagOwner === k.id && t.terrain === Terrain.Rock && !t.reinforced) {
      if (standNear(world, k.id, i, hx, hy) >= 0) push('reinforce', i, false)
    } else if (t.terrain === Terrain.Floor && t.gem && t.owner === k.id) {
      push('mine', i, false)
    } else if (t.terrain === Terrain.Floor && t.gold > 0 && (t.owner === 0 || t.owner === k.id)) {
      if (golds < 16) {
        push('gold', i, true)
        golds++
      }
    } else if (t.terrain === Terrain.Floor && t.owner === 0 && !t.heart && !t.portal && !t.bridge) {
      let touchOwn = false
      const x = gx(w, i)
      const y = gy(w, i)
      for (const [dx, dy] of DIR4) {
        const nb = tileAt(world, x + dx, y + dy)
        if (nb && nb.owner === k.id && canStand(nb, false)) touchOwn = true
      }
      if (touchOwn && claims < 20) {
        push('claim', i, true)
        claims++
      }
    }
  }
  const space = prisonFree(world, k.id)
  if (space > 0) {
    for (const c of world.creatures) {
      if (c.dead || c.owner === k.id || c.unconscious <= 0 || c.imprisoned || c.carried || c.held) continue
      const ti = tindex(world, c)
      if (ti >= 0) push('body', ti, false)
    }
  }
  for (const order of k.orders) {
    if (order.status === 'ready') push('haul', order.tile, true, order.id)
  }
  return tasks
}

function prisonFree(world: World, owner: number): number {
  const tiles = countRoom(world, owner, 'prison')
  let used = 0
  for (const c of world.creatures) {
    if (c.dead) continue
    if (c.imprisoned) {
      const i = tindex(world, c)
      if (i >= 0 && world.tiles[i]!.owner === owner) used++
    }
    if (c.kind === 'imp' && c.owner === owner && c.carry === 'body') used++
  }
  return tiles - used
}

function nearestRoomTile(world: World, owner: number, type: string, x: number, y: number): number {
  let best = -1
  let bestD = 1e9
  for (const r of world.rooms) {
    if (r.owner !== owner || r.type !== type) continue
    for (const i of r.tiles) {
      const d = Math.abs(gx(world.width, i) + 0.5 - x) + Math.abs(gy(world.width, i) + 0.5 - y)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
  }
  return best
}

function finishDig(world: World, index: number, owner: number): void {
  const t = world.tiles[index]!
  const terrain = t.terrain
  const gold = t.gold
  if (terrain === Terrain.Gold) {
    t.terrain = Terrain.Floor
    t.owner = 0
    t.gold = gold || 1000
    t.hp = 0
    t.maxHp = 0
    world.stats.dugGold++
    ping(world, 'dig')
  } else if (terrain === Terrain.Gem) {
    t.terrain = Terrain.Floor
    t.gem = true
    t.owner = owner
    t.gold = 0
    t.hp = 0
    t.maxHp = 0
    ping(world, 'dig')
  } else if (terrain === Terrain.Earth) {
    t.terrain = Terrain.Floor
    t.owner = 0
    t.gold = 0
    t.hp = 0
    t.maxHp = 0
    ping(world, 'dig')
  }
  t.tag = 0
  t.dig = 0
  t.room = ''
  touch(world)
}

function tickImp(world: World, c: Creature, dt: number): void {
  const foe = nearestHostile(world, c, 2.4)
  if (foe && c.carry !== 'body') {
    const k = keeper(world, c.owner)
    if (k && k.heart >= 0) {
      c.job = ''
      c.jobTile = -1
      c.workT = 0
      route(world, c, k.heart, false)
    }
  }
  if (c.carry === 'gold') {
    haulGold(world, c, dt)
    return
  }
  if (c.carry === 'body') {
    haulBody(world, c, dt)
    return
  }
  if (c.carry === 'crate' || (c.job === 'haul' && c.mode)) {
    haulCrate(world, c, dt)
    return
  }
  if (c.path.length && c.pathI < c.path.length) {
    moveAlong(world, c, dt)
    if (c.pathI >= c.path.length && c.job) beginImpWork(world, c)
    return
  }
  if (c.job) doImpWork(world, c, dt)
}

function beginImpWork(world: World, c: Creature): void {
  const t = world.tiles[c.jobTile]
  if (!t) {
    c.job = ''
    return
  }
    if (c.job === 'gold') {
    const take = Math.min(200, t.gold)
    t.gold -= take
    c.carryGold = take
    c.carry = 'gold'
    c.job = ''
    c.jobTile = -1
    c.path = []
    c.pathI = 0
    if (t.gold <= 0) t.gold = 0
    world.animDirty = true
    ping(world, 'gold')
    return
  }
  if (c.job === 'body') {
    const v = world.creatures.find((o) => !o.dead && o.unconscious > 0 && !o.carried && !o.imprisoned && tindex(world, o) === c.jobTile)
    if (!v) {
      c.job = ''
      return
    }
    v.carried = true
    c.carry = 'body'
    c.carryId = v.id
    c.job = ''
    return
  }
  c.workT = 0
}

function doImpWork(world: World, c: Creature, dt: number): void {
  const t = world.tiles[c.jobTile]
  if (!t) {
    c.job = ''
    return
  }
  if (c.job === 'gold' || c.job === 'body') {
    beginImpWork(world, c)
    return
  }
  const x = gx(world.width, c.jobTile)
  const y = gy(world.width, c.jobTile)
  const near = Math.abs(c.x - (x + 0.5)) + Math.abs(c.y - (y + 0.5)) < 1.45
  if (!near && c.job !== 'claim' && c.job !== 'gold') {
    const stand = standNear(world, c.owner, c.jobTile, c.x, c.y)
    if (stand >= 0) route(world, c, stand, false)
    else c.job = ''
    return
  }
  if (c.job === 'dig') {
    if (t.tag !== 1 || !(t.terrain === Terrain.Earth || t.terrain === Terrain.Gold || t.terrain === Terrain.Gem)) {
      c.job = ''
      return
    }
    const need = t.terrain === Terrain.Gold ? 1.65 : t.terrain === Terrain.Gem ? 2.05 : 1.15
    c.workT += dt * workRate(c)
    t.dig = Math.min(1, c.workT / need)
    world.animDirty = true
    if (c.workT >= need) {
      finishDig(world, c.jobTile, c.owner)
      c.job = ''
      c.jobTile = -1
    }
    return
  }
  if (c.job === 'claim') {
    if (t.owner !== 0 || t.terrain !== Terrain.Floor) {
      c.job = ''
      return
    }
    c.workT += dt * workRate(c)
    if (c.workT >= CLAIM_T) {
      let touchOwn = false
      for (const [dx, dy] of DIR4) {
        const nb = tileAt(world, x + dx, y + dy)
        if (nb && nb.owner === c.owner && canStand(nb, false)) touchOwn = true
      }
      if (touchOwn) {
        t.owner = c.owner
        ping(world, 'claim')
        touch(world)
      }
      c.job = ''
      c.jobTile = -1
    }
    return
  }
  if (c.job === 'reinforce') {
    if (t.terrain !== Terrain.Rock || t.tag !== 2) {
      c.job = ''
      return
    }
    c.workT += dt * workRate(c)
    t.dig = Math.min(1, c.workT / REINFORCE_T)
    world.animDirty = true
    if (c.workT >= REINFORCE_T) {
      t.reinforced = true
      t.hp = t.maxHp = 2100
      t.tag = 0
      t.dig = 0
      ping(world, 'build')
      touch(world)
      c.job = ''
      c.jobTile = -1
    }
    return
  }
  if (c.job === 'mine') {
    if (!t.gem || t.owner !== c.owner) {
      c.job = ''
      return
    }
    c.workT += dt * workRate(c)
    if (c.workT >= 1.35) {
      c.workT = 0
      c.carryGold += 48
      world.stats.goldMined += 0
      if (c.carryGold >= 160) {
        c.carry = 'gold'
        c.job = ''
        c.jobTile = -1
      }
    }
  }
}

function deposit(world: World, owner: number, amount: number): number {
  const k = keeper(world, owner)
  if (!k) return amount
  const room = Math.max(0, goldCap(world, owner) - k.gold)
  const put = Math.min(amount, room)
  k.gold += put
  world.stats.goldMined += put
  if (put > 0) ping(world, 'gold')
  if (put < amount) say(world, 'treasury_full', 'Your treasury can hold no more gold.', 'treasury_full', k.heart, 16)
  if (countRoom(world, owner, 'treasury') === 0 && put === 0) {
    say(world, 'need_treasury', 'Gold is piling up. Build a treasury.', 'need_treasury', k.heart, 16)
  }
  return amount - put
}

function haulGold(world: World, c: Creature, dt: number): void {
  const k = keeper(world, c.owner)
  if (!k) return
  const treas = nearestRoomTile(world, c.owner, 'treasury', c.x, c.y)
  const space = goldCap(world, c.owner) - k.gold
  const dest = treas >= 0 ? treas : space > 0 && k.heart >= 0 ? k.heart : -1
  if (dest < 0) {
    const i = tindex(world, c)
    if (i >= 0) world.tiles[i]!.gold += c.carryGold
    say(world, 'need_treasury', 'Gold is piling up. Build a treasury.', 'need_treasury', k.heart, 12)
    c.carry = ''
    c.carryGold = 0
    c.path = []
    c.pathI = 0
    touch(world)
    return
  }
  const here = tindex(world, c)
  const tile = here >= 0 ? world.tiles[here]! : null
  const inTreasury = !!tile && treas >= 0 && tile.room === 'treasury' && tile.owner === c.owner
  if (here === dest || inTreasury) {
    const left = deposit(world, c.owner, c.carryGold)
    if (left > 0 && here >= 0) world.tiles[here]!.gold += left
    c.carryGold = 0
    c.carry = ''
    c.path = []
    c.pathI = 0
    world.animDirty = true
    return
  }
  if (c.pathI >= c.path.length) route(world, c, dest, false)
  moveAlong(world, c, dt)
}

function haulBody(world: World, c: Creature, dt: number): void {
  const v = world.creature(c.carryId)
  if (!v || v.dead) {
    c.carry = ''
    c.carryId = 0
    return
  }
  v.x = c.x
  v.y = c.y
  const cell = nearestRoomTile(world, c.owner, 'prison', c.x, c.y)
  if (cell < 0) {
    v.carried = false
    c.carry = ''
    c.carryId = 0
    return
  }
  if (tindex(world, c) === cell) {
    v.carried = false
    v.imprisoned = true
    v.unconscious = 999
    v.x = gx(world.width, cell) + 0.5
    v.y = gy(world.width, cell) + 0.5
    c.carry = ''
    c.carryId = 0
    ping(world, 'drop')
    return
  }
  if (c.pathI >= c.path.length) route(world, c, cell, false)
  moveAlong(world, c, dt)
  v.x = c.x
  v.y = c.y
}

function haulCrate(world: World, c: Creature, dt: number): void {
  const k = keeper(world, c.owner)
  const order = k?.orders.find((o) => o.id === c.order)
  if (!k || !order || order.status === 'done') {
    c.job = ''
    c.carry = ''
    c.mode = ''
    return
  }
  if (c.mode === 'toShop') {
    const shop = nearestRoomTile(world, c.owner, 'workshop', c.x, c.y)
    if (shop < 0 || tindex(world, c) === shop) {
      c.mode = 'toSite'
      c.carry = 'crate'
      c.path = []
    } else {
      if (c.pathI >= c.path.length) route(world, c, shop, false)
      moveAlong(world, c, dt)
      return
    }
  }
  if (tindex(world, c) === order.tile) {
    placeGear(world, k, order.tile, order.item)
    order.status = 'done'
    c.carry = ''
    c.job = ''
    c.mode = ''
    c.order = 0
    ping(world, 'build')
    return
  }
  if (c.pathI >= c.path.length) route(world, c, order.tile, false)
  moveAlong(world, c, dt)
}

function placeGear(world: World, k: Keeper, index: number, item: string): void {
  const t = world.tiles[index]
  const gear = GEAR[item]
  if (!t || !gear) return
  if (gear.kind === 'door') {
    t.door = item
    t.doorOwner = k.id
    t.doorHp = gear.hp
    t.doorMax = gear.hp
  } else {
    t.trap = item
    t.trapOwner = k.id
    t.trapCd = 0
  }
  touch(world)
}

function tickCreature(world: World, c: Creature, dt: number): void {
  if (c.dead || c.held) return
  if (c.slap > 0) c.slap = Math.max(0, c.slap - dt)
  if (c.speedT > 0) c.speedT = Math.max(0, c.speedT - dt)
  if (c.berserk > 0) c.berserk = Math.max(0, c.berserk - dt)
  if (c.revenge > 0) c.revenge = Math.max(0, c.revenge - dt)
  if (c.frenzy > 0) c.frenzy = Math.max(0, c.frenzy - dt)
  if (c.chicken > 0) {
    c.chicken -= dt
    if (c.chicken <= 0) {
      c.maxHp = c.chickenHp || species(c.kind).hp
      c.hp = Math.max(1, Math.min(c.maxHp, c.maxHp * 0.4))
      c.chicken = 0
    }
  }
  if (c.disease > 0 && c.unconscious <= 0) {
    c.disease -= dt
    c.hp -= 3.2 * dt
    if (!c.spread && c.disease < 5) {
      c.spread = true
      const n = nearestHostile(world, c, 1.6) ?? nearestFriend(world, c, 1.6)
      if (n) n.disease = Math.max(n.disease, 6)
    }
    if (c.hp <= 0) down(world, c)
  }
  if (c.unconscious > 0) {
    if (c.imprisoned) {
      const i = tindex(world, c)
      const tile = i >= 0 ? world.tiles[i]! : null
      if (!tile || tile.room !== 'prison') {
        c.imprisoned = false
        c.unconscious = 0.2
        c.hp = Math.max(8, c.maxHp * 0.35)
        c.anger = 70
      } else if (countRoom(world, tile.owner, 'torture') > 0) {
        const eff = bestRoom(world, tile.owner, 'torture')?.efficiency ?? 0.4
        c.convert += dt * (0.45 + eff)
        if (c.convert >= 16) {
          c.owner = tile.owner
          c.imprisoned = false
          c.unconscious = 0
          c.hp = c.maxHp * 0.55
          c.happiness = 38
          c.anger = 22
          c.convert = 0
          say(world, 'converted', 'A prisoner has been turned to your cause.', 'converted', i, 6)
          ping(world, 'spell')
        }
      }
      return
    }
    c.unconscious -= dt
    if (c.unconscious <= 0) kill(world, c)
    return
  }
  if (c.carried) return
  if (c.possessed) {
    const spd = moveSpeed(c) * dt
    c.x += world.possessX * spd
    c.y += world.possessY * spd
    if (world.possessX || world.possessY) c.facing = Math.atan2(world.possessX, world.possessY)
    clampCreature(world, c)
    if (world.possessAtk) {
      const foe = nearestHostile(world, c, species(c.kind).range + 0.3)
      if (foe && c.cool <= 0) {
        strike(world, c, foe)
        c.cool = 1 / species(c.kind).rate
      }
    }
    if (c.cool > 0) c.cool -= dt
    return
  }
  const spec = species(c.kind)
  if (c.kind !== 'imp' && c.owner !== 0) {
    c.hunger = Math.min(100, c.hunger + spec.hunger * dt)
    c.fatigue = Math.min(100, c.fatigue + spec.fatigue * dt)
    if (c.hunger > 88) {
      c.happiness = Math.max(0, c.happiness - 3 * dt)
      c.anger += 2 * dt
      if (c.owner === 1) say(world, 'hungry', 'Your creatures are hungry.', 'hungry', tindex(world, c), 22)
    }
  }
  if (c.kind === 'reaper' && c.mode !== 'fight') {
    const i = tindex(world, c)
    const onTemple = i >= 0 && world.tiles[i]!.room === 'temple' && world.tiles[i]!.owner === c.owner
    if (onTemple) c.anger = Math.max(0, c.anger - 18 * dt)
    else c.anger = Math.min(100, c.anger + 1.6 * dt)
    if (c.anger > 90) c.frenzy = 6
  }
  if (c.kind === 'imp') {
    tickImp(world, c, dt)
  } else if (c.owner === 0) {
    tickHero(world, c, dt)
  } else {
    tickMinion(world, c, dt)
  }
  const i = tindex(world, c)
  if (i >= 0) {
    const t = world.tiles[i]!
    if ((t.terrain === Terrain.Lava && !t.bridge && !spec.flying) || t.hazard > 0) {
      c.hp -= (t.hazard > 0 ? 22 : 28) * dt
      if (c.hp <= 0) down(world, c)
    }
    if (t.room === 'barracks' && t.owner === c.owner && c.kind !== 'imp') c.hp = Math.min(c.maxHp, c.hp + 2.2 * dt)
    checkTrap(world, c, i, t)
  }
  const heart = enemyHeartNear(world, c)
  if (heart >= 0 && c.kind !== 'imp' && (c.owner === 0 || c.berserk > 0 || c.revenge > 0)) {
    const foe = c.target ? world.creature(c.target) : undefined
    const busy = foe && living(foe) && dist(c, foe) <= species(c.kind).range
    if (!busy) damageTile(world, heart, species(c.kind).attack * 0.9 * dt, c)
  }
}

function nearestFriend(world: World, c: Creature, radius: number): Creature | null {
  let best: Creature | null = null
  let bestD = radius
  for (const o of world.creatures) {
    if (o.id === c.id || o.dead || o.owner !== c.owner) continue
    const d = dist(c, o)
    if (d < bestD) {
      bestD = d
      best = o
    }
  }
  return best
}

function clampCreature(world: World, c: Creature): void {
  c.x = Math.max(0.2, Math.min(world.width - 0.2, c.x))
  c.y = Math.max(0.2, Math.min(world.height - 0.2, c.y))
}

function enemyHeartNear(world: World, c: Creature): number {
  const x = Math.floor(c.x)
  const y = Math.floor(c.y)
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const t = tileAt(world, x + dx, y + dy)
      if (t && t.heart && t.heart !== c.owner) return ix(world.width, x + dx, y + dy)
    }
  }
  return -1
}

function checkTrap(world: World, c: Creature, index: number, t: Tile): void {
  if (!t.trap || t.trapOwner === 0 || t.trapOwner === c.owner || t.trapCd > 0) return
  if (c.kind === 'imp' && c.owner === t.trapOwner) return
  const kind = t.trap
  if (kind === 'alarm') {
    t.trapCd = 14
    const k = keeper(world, t.trapOwner)
    if (k) {
      k.rallyX = gx(world.width, index)
      k.rallyY = gy(world.width, index)
      k.rallyT = 12
    }
    say(world, 'alarm', 'A trap screams. Something is inside.', 'breaching', index, 8)
    ping(world, 'ui')
    forRadius(world, gx(world.width, index), gy(world.width, index), 6, (i) => {
      world.revealed[i] = 1
    })
    return
  }
  if (kind === 'poison') {
    t.trap = ''
    world.clouds.push({ x: gx(world.width, index) + 0.5, y: gy(world.width, index) + 0.5, r: 1.6, t: 6, dps: 9, owner: t.trapOwner })
    ping(world, 'spell')
  } else if (kind === 'boulder') {
    t.trap = ''
    launchBoulder(world, index, t.trapOwner)
  } else if (kind === 'lightning_trap') {
    t.trapCd = 7
    hurtHostiles(world, t.trapOwner, gx(world.width, index) + 0.5, gy(world.width, index) + 0.5, 1.4, 38)
    ping(world, 'thunder')
  } else if (kind === 'lava_trap') {
    t.trap = ''
    t.hazard = 8
    ping(world, 'spell')
  } else if (kind === 'word') {
    t.trap = ''
    hurtHostiles(world, t.trapOwner, c.x, c.y, 2.3, 96)
    ping(world, 'thunder')
  }
  touch(world)
}

function launchBoulder(world: World, index: number, owner: number): void {
  const w = world.width
  const x = gx(w, index)
  const y = gy(w, index)
  let bestDx = 1
  let bestDy = 0
  let best = -1
  for (const [dx, dy] of DIR4) {
    let n = 0
    for (let s = 1; s <= 8; s++) {
      const t = tileAt(world, x + dx * s, y + dy * s)
      if (!t || !canStand(t, false)) break
      n++
    }
    if (n > best) {
      best = n
      bestDx = dx
      bestDy = dy
    }
  }
  world.boulders.push({ x: x + 0.5, y: y + 0.5, dx: bestDx, dy: bestDy, left: 8, dmg: 70, owner })
  ping(world, 'build')
}

function hurtHostiles(world: World, owner: number, x: number, y: number, r: number, dmg: number): void {
  for (const c of world.creatures) {
    if (!living(c) || c.owner === owner) continue
    if (c.owner === 0 && owner === 0) continue
    if (Math.hypot(c.x - x, c.y - y) <= r) {
      c.hp -= dmg
      c.revenge = 5
      if (c.hp <= 0) down(world, c)
    }
  }
}

function forRadius(world: World, x: number, y: number, r: number, fn: (index: number, tile: Tile) => void): void {
  const R = Math.ceil(r)
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      if (Math.hypot(dx, dy) > r) continue
      const xx = x + dx
      const yy = y + dy
      if (!inMap(world.width, world.height, xx, yy)) continue
      const i = ix(world.width, xx, yy)
      fn(i, world.tiles[i]!)
    }
  }
}

function tickHero(world: World, c: Creature, dt: number): void {
  if (c.berserk > 0) {
    const foe = nearestHostile(world, c, 12)
    if (foe) fightCreature(world, c, foe, dt)
    return
  }
  if (c.kind === 'monk') {
    c.cool -= dt
    if (c.cool <= 0) {
      c.cool = 1.1
      let patient: Creature | null = null
      let missing = 0
      for (const o of world.creatures) {
        if (o.owner !== 0 || o.dead || o.id === c.id) continue
        const gap = o.maxHp - o.hp
        if (gap > missing && dist(c, o) < 4) {
          missing = gap
          patient = o
        }
      }
      if (patient && missing > 8) patient.hp = Math.min(patient.maxHp, patient.hp + 12)
    }
  }
  const foe = nearestHostile(world, c, c.kind === 'thief' ? 2.2 : c.revenge > 0 ? 8 : 5.6)
  if (foe && c.kind !== 'thief') {
    fightCreature(world, c, foe, dt)
    return
  }
  const player = keeper(world, 1)
  if (!player || !player.alive) return
  if (c.kind === 'thief') {
    if (c.flee) {
      const gate = world.gates[1] ?? -1
      if (gate >= 0 && Math.hypot(c.x - (gx(world.width, gate) + 0.5), c.y - (gy(world.width, gate) + 0.5)) < 0.8) {
        kill(world, c)
        say(world, 'thief', 'A thief escaped with your gold.', null, gate, 8)
        return
      }
      if (gate >= 0) {
        if (c.think <= 0) {
          c.think = 0.8
          route(world, c, gate, true)
        }
        c.think -= dt
        moveAlong(world, c, dt)
      }
      return
    }
    const treas = nearestRoomTile(world, 1, 'treasury', c.x, c.y)
    const here = tindex(world, c)
    if (here >= 0 && world.tiles[here]!.room === 'treasury' && world.tiles[here]!.owner === 1) {
      const take = Math.min(75, player.gold)
      player.gold -= take
      c.steal += take
      ping(world, 'gold')
      if (c.steal > 380 || player.gold <= 0) c.flee = true
      return
    }
    const goal = treas >= 0 ? treas : player.heart
    if (c.think <= 0) {
      c.think = 0.7
      route(world, c, goal, true)
    }
    c.think -= dt
    moveAlong(world, c, dt)
    return
  }
  if (c.think <= 0) {
    c.think = 0.65
    route(world, c, player.heart, true)
  }
  c.think -= dt
  moveAlong(world, c, dt)
}

function fightCreature(world: World, c: Creature, foe: Creature, dt: number): void {
  c.target = foe.id
  c.mode = 'fight'
  const spec = species(c.kind)
  const d = dist(c, foe)
  const range = c.chicken > 0 ? 0 : spec.range
  if (d <= range && (range < 1.6 || los(world, c.x, c.y, foe.x, foe.y))) {
    c.path = []
    c.facing = Math.atan2(foe.x - c.x, foe.y - c.y)
    c.cool -= dt
    if (c.cool <= 0) {
      strike(world, c, foe)
      c.cool = 1 / spec.rate
      const gain = 3 + foe.level
      c.xp += gain
      const need = spec.xp * c.level
      if (c.xp >= need && c.level < spec.maxLevel) {
        c.level++
        c.xp = 0
        c.maxHp = Math.round(c.maxHp + spec.hp * 0.16)
        c.hp = c.maxHp
        c.happiness = Math.min(100, c.happiness + 6)
      }
    }
    return
  }
  if (d < range + 1.35) {
    const step = Math.min(moveSpeed(c) * dt, Math.max(0, d - range * 0.8))
    const len = d || 1
    const nx = c.x + ((foe.x - c.x) / len) * step
    const ny = c.y + ((foe.y - c.y) / len) * step
    const stand = tileAt(world, Math.floor(nx), Math.floor(ny))
    if (stand && canStand(stand, spec.flying) && !doorBlocks(stand, c.owner)) {
      c.x = nx
      c.y = ny
      c.facing = Math.atan2(foe.x - c.x, foe.y - c.y)
      c.path = []
      return
    }
  }
  if (c.think <= 0) {
    c.think = 0.45
    const ti = tindex(world, foe)
    if (ti >= 0) route(world, c, ti, true)
  }
  c.think -= dt
  moveAlong(world, c, dt)
}

function tickMinion(world: World, c: Creature, dt: number): void {
  const spec = species(c.kind)
  if (c.berserk > 0 || c.frenzy > 0) {
    const foe = nearestHostile(world, c, 14)
    if (foe) fightCreature(world, c, foe, dt)
    else moveAlong(world, c, dt)
    return
  }
  const foe = nearestHostile(world, c, c.revenge > 0 ? 8 : 5.4)
  if (foe && c.chicken <= 0) {
    fightCreature(world, c, foe, dt)
    return
  }
  const k = keeper(world, c.owner)
  if (!k) return
  if (c.mode === 'research') {
    const i = tindex(world, c)
    const room = i >= 0 ? roomOf(world, i) : null
    if (!room || room.type !== 'library' || !k.researchTarget) c.mode = ''
    else return
  }
  if (c.mode === 'craft') {
    const i = tindex(world, c)
    const room = i >= 0 ? roomOf(world, i) : null
    if (!room || room.type !== 'workshop' || !k.orders.some((o) => o.status === 'building')) c.mode = ''
    else return
  }
  if (c.mode === 'eat') {
    c.workT -= dt
    if (c.workT <= 0) {
      const room = bestRoom(world, c.owner, 'hatchery')
      if (room && room.chickens > 0) {
        room.chickens--
        c.hunger = Math.max(0, c.hunger - 52)
        c.happiness = Math.min(100, c.happiness + 4)
      }
      c.mode = ''
    }
    return
  }
  if (c.mode === 'sleep') {
    c.fatigue = Math.max(0, c.fatigue - 26 * dt)
    c.happiness = Math.min(100, c.happiness + 2 * dt)
    if (c.fatigue <= 8) c.mode = ''
    return
  }
  if (c.mode === 'train') {
    const i = tindex(world, c)
    const room = i >= 0 ? roomOf(world, i) : null
    if (!room || room.type !== 'training') c.mode = ''
    else {
      c.xp += spec.train * room.efficiency * dt
      c.fatigue = Math.min(100, c.fatigue + 2.2 * dt)
      c.hunger = Math.min(100, c.hunger + 1.4 * dt)
      if (world.rand.next() < dt * 0.4) c.hp = Math.max(1, c.hp - 1)
      const need = spec.xp * c.level
      if (c.xp >= need && c.level < spec.maxLevel) {
        c.level++
        c.xp = 0
        c.maxHp = Math.round(c.maxHp + spec.hp * 0.16)
        c.hp = c.maxHp
        ping(world, 'ui')
      }
      if (c.hunger > 75 || c.fatigue > 85) c.mode = ''
      return
    }
  }
  if (c.think > 0 && c.path.length) {
    c.think -= dt
    moveAlong(world, c, dt)
    arriveSpecial(world, c)
    return
  }
  c.think = 0.55
  if ((k.rallyT > 0 || (c.owner === 1 && world.heartAlarm > 4)) && c.hunger < 92) {
    const tx = k.rallyT > 0 ? k.rallyX : gx(world.width, k.heart)
    const ty = k.rallyT > 0 ? k.rallyY : gy(world.width, k.heart)
    if (inMap(world.width, world.height, tx, ty)) {
      route(world, c, ix(world.width, tx, ty), true)
      c.mode = 'rally'
      moveAlong(world, c, dt)
      return
    }
  }
  if (c.hunger > 70) {
    const room = bestRoom(world, c.owner, 'hatchery')
    if (room && room.chickens > 0) {
      const tile = room.tiles[0]!
      route(world, c, tile, false)
      c.mode = 'goto-eat'
      moveAlong(world, c, dt)
      return
    }
    if (c.hunger > 96) {
      c.misery += 0.55
      if (c.misery > 18 && k.portal >= 0) {
        route(world, c, k.portal, false)
        c.mode = 'leave'
      }
    }
  } else if (c.fatigue > 74 && countRoom(world, c.owner, 'lair') > 0) {
    const tile = nearestRoomTile(world, c.owner, 'lair', c.x, c.y)
    if (tile >= 0) {
      route(world, c, tile, false)
      c.mode = 'goto-sleep'
      moveAlong(world, c, dt)
      return
    }
  } else if (c.happiness < 14) {
    c.misery += 0.55
    if (c.misery > 16 && k.portal >= 0) {
      route(world, c, k.portal, false)
      c.mode = 'leave'
      say(world, 'angry', 'Your creatures are growing furious.', 'angry', -1, 20)
    }
  } else if (c.guard >= 0 && world.tiles[c.guard] && world.tiles[c.guard]!.room === 'guard') {
    if (Math.hypot(c.x - (gx(world.width, c.guard) + 0.5), c.y - (gy(world.width, c.guard) + 0.5)) > 0.4) {
      route(world, c, c.guard, false)
    }
    c.mode = 'guard'
  } else if (spec.research > 0 && countRoom(world, c.owner, 'library') > 0 && k.researchTarget) {
    const tile = nearestRoomTile(world, c.owner, 'library', c.x, c.y)
    if (tile >= 0) {
      route(world, c, tile, false)
      c.mode = 'goto-research'
    }
  } else if (spec.craft > 0 && k.orders.some((o) => o.status === 'building')) {
    const tile = nearestRoomTile(world, c.owner, 'workshop', c.x, c.y)
    if (tile >= 0) {
      route(world, c, tile, false)
      c.mode = 'goto-craft'
    }
  } else if (c.level < spec.maxLevel && countRoom(world, c.owner, 'training') > 0 && c.hunger < 60 && spec.train > 0 && c.kind !== 'reaper') {
    const tile = nearestRoomTile(world, c.owner, 'training', c.x, c.y)
    if (tile >= 0) {
      route(world, c, tile, false)
      c.mode = 'goto-train'
    }
  } else {
    const lair = nearestRoomTile(world, c.owner, 'lair', c.x, c.y)
    if (lair >= 0 && world.rand.next() < 0.4) route(world, c, lair, false)
    else if (k.heart >= 0 && world.rand.next() < 0.5) route(world, c, k.heart, false)
    c.mode = 'wander'
  }
  if (c.mode === 'leave') {
    moveAlong(world, c, dt)
    if (k.portal >= 0) {
      const px = gx(world.width, k.portal) + 0.5
      const py = gy(world.width, k.portal) + 0.5
      if (Math.hypot(c.x - px, c.y - py) < 0.7) {
        say(world, 'leaving', `${spec.name} has abandoned your dungeon.`, 'leaving', k.portal, 8)
        kill(world, c)
      }
    }
    return
  }
  moveAlong(world, c, dt)
  arriveSpecial(world, c)
}

function roomOf(world: World, index: number): Room | null {
  for (const r of world.rooms) if (r.tiles.includes(index)) return r
  return null
}

function arriveSpecial(world: World, c: Creature): void {
  if (c.pathI < c.path.length && c.path.length) return
  const i = tindex(world, c)
  if (i < 0) return
  const t = world.tiles[i]!
  if (c.mode === 'goto-eat' && t.room === 'hatchery') {
    c.mode = 'eat'
    c.workT = 1.5
  } else if (c.mode === 'goto-sleep' && t.room === 'lair') {
    c.mode = 'sleep'
  } else if (c.mode === 'goto-train' && t.room === 'training') {
    c.mode = 'train'
  } else if (c.mode === 'goto-research' && t.room === 'library') {
    c.mode = 'research'
  } else if (c.mode === 'goto-craft' && t.room === 'workshop') {
    c.mode = 'craft'
  }
}

function tickRooms(world: World, dt: number): void {
  for (const room of world.rooms) {
    if ((world.time * 2) % 2 < dt) room.efficiency = roomEfficiency(world, room.tiles, room.type)
    if (room.type === 'hatchery') {
      room.spawnT += dt * Math.max(0.2, room.efficiency)
      const cap = chickenCap(room)
      if (room.spawnT > 7 && room.chickens < cap) {
        room.chickens++
        room.spawnT = 0
      }
    } else if (room.type === 'graveyard' && room.corpses > 0) {
      room.skelT += dt * Math.max(0.3, room.efficiency)
      if (room.skelT > 20 && countKind(world, room.owner, 'skeleton') < 8 && population(world, room.owner) < countRoom(world, room.owner, 'lair')) {
        room.skelT = 0
        room.corpses--
        const tile = room.tiles[irand(world.rand, room.tiles.length)]!
        spawnCreature(world, 'skeleton', room.owner, gx(world.width, tile) + 0.5, gy(world.width, tile) + 0.5)
        say(world, 'skeleton', 'The graveyard gives up a skeleton.', 'arrived', tile, 8)
        ping(world, 'spell')
      }
    } else if (room.type === 'temple') {
      const k = keeper(world, room.owner)
      if (k) k.evil += dt * room.tiles.length * 0.03
    }
  }
  for (const t of world.tiles) {
    if (t.door === 'magic' && t.doorHp > 0 && t.doorHp < t.doorMax) t.doorHp = Math.min(t.doorMax, t.doorHp + 7 * dt)
    if (t.trapCd > 0) t.trapCd = Math.max(0, t.trapCd - dt)
    if (t.hazard > 0) t.hazard = Math.max(0, t.hazard - dt)
  }
}

function tickPayday(world: World, dt: number): void {
  for (const k of world.keepers) {
    if (!k || !k.alive) continue
    k.paydayT -= dt
    if (k.paydayT > 0) continue
    k.paydayT = world.level.payday
    let broke = false
    let paid = 0
    for (const c of world.creatures) {
      if (c.owner !== k.id || c.dead || c.kind === 'imp' || c.imprisoned) continue
      const wage = Math.round(species(c.kind).wage * (1 + (c.level - 1) * 0.45))
      if (wage <= 0) continue
      if (k.gold >= wage) {
        k.gold -= wage
        paid++
        c.happiness = Math.min(100, c.happiness + 5)
        c.anger = Math.max(0, c.anger - 8)
      } else {
        broke = true
        c.happiness = Math.max(0, c.happiness - 16)
        c.anger += 14
      }
    }
    if (paid > 0) say(world, 'payday', 'Payday. Your creatures take their wages.', null, k.heart, 8)
    if (broke) say(world, 'unpaid', 'Your creatures are unpaid. They will not forget.', 'unpaid', k.heart, 20)
    if (k.gold < 180) say(world, 'low_gold', 'Your gold is running thin.', 'low_gold', k.heart, 25)
  }
}

function libraryRate(world: World, k: Keeper): number {
  const room = bestRoom(world, k.id, 'library')
  if (!room) return 0
  let warlocks = 0
  for (const c of world.creatures) {
    if (c.owner === k.id && c.kind === 'warlock' && !c.dead && c.mode === 'research') warlocks++
  }
  return (0.42 + warlocks * 1.2) * Math.max(0.2, room.efficiency) * world.level.research
}

function tickResearch(world: World, dt: number): void {
  for (const k of world.keepers) {
    if (!k || !k.alive || !k.researchTarget) continue
    if (k.unlocked.includes(k.researchTarget)) {
      k.researchTarget = ''
      continue
    }
    const def = RESEARCH_BY_ID[k.researchTarget]
    if (!def) continue
    if (def.requires.some((r) => !k.unlocked.includes(r))) continue
    const rate = libraryRate(world, k)
    if (rate <= 0) continue
    k.research[def.id] = (k.research[def.id] ?? 0) + rate * dt
    if ((k.research[def.id] ?? 0) >= def.cost) {
      k.unlocked.push(def.id)
      k.researchTarget = ''
      say(world, 'research', `${def.name} is yours.`, 'research_done', k.heart, 4)
      ping(world, 'ui')
    }
  }
}

function tickCraft(world: World, dt: number): void {
  for (const k of world.keepers) {
    if (!k || !k.alive) continue
    const order = k.orders.find((o) => o.status === 'building')
    if (!order) continue
    const room = bestRoom(world, k.id, 'workshop')
    if (!room) continue
    let trolls = 0
    for (const c of world.creatures) {
      if (c.owner === k.id && c.kind === 'troll' && c.mode === 'craft' && !c.dead) trolls++
    }
    const gear = GEAR[order.item]
    if (!gear) continue
    const rate = (0.32 + trolls * 1.05) * Math.max(0.25, room.efficiency)
    order.progress += rate * dt
    if (order.progress >= gear.craft) {
      order.status = 'ready'
      say(world, 'crafted', `The workshop finishes a ${gear.name}.`, 'crafted', order.tile, 6)
      ping(world, 'build')
    }
  }
}

function meetsAttraction(world: World, k: Keeper, id: string): boolean {
  const spec = species(id)
  const rule = spec.attraction
  if (!rule) return false
  for (const req of rule.rooms) if (countRoom(world, k.id, req.id) < req.tiles) return false
  if (rule.evil && k.evil < rule.evil) return false
  if (rule.corpses) {
    let corpses = 0
    for (const r of world.rooms) if (r.owner === k.id && r.type === 'graveyard') corpses += r.corpses
    if (corpses < rule.corpses) return false
  }
  return countKind(world, k.id, id) < spec.cap
}

function tryAttract(world: World, k: Keeper): void {
  if (!k.alive || k.portal < 0) return
  const beds = countRoom(world, k.id, 'lair')
  if (beds <= population(world, k.id)) {
    if (beds > 0) say(world, 'lair_full', 'Your lair is full.', 'lair_full', k.portal, 22)
    return
  }
  const options = Object.values(SPECIES).filter((s) => s.side === 'keeper' && s.attraction && meetsAttraction(world, k, s.id))
  if (!options.length) return
  let total = 0
  for (const s of options) total += s.attraction!.weight
  let roll = world.rand.next() * total
  let pickId = options[0]!.id
  for (const s of options) {
    roll -= s.attraction!.weight
    if (roll <= 0) {
      pickId = s.id
      break
    }
  }
  const p = k.portal
  spawnCreature(world, pickId, k.id, gx(world.width, p) + 0.5, gy(world.width, p) + 0.5)
  world.stats.attracted++
  const name = species(pickId).name
  say(world, `join_${pickId}`, `A ${name} joins your dungeon.`, 'arrived', p, 4)
  ping(world, 'arrive')
}

function tickAttract(world: World, dt: number): void {
  for (const k of world.keepers) {
    if (!k || !k.alive) continue
    k.attractT -= dt * world.level.attract
    if (k.attractT > 0) continue
    k.attractT = 20
    tryAttract(world, k)
  }
}

function tickScavenge(world: World, dt: number): void {
  for (const k of world.keepers) {
    if (!k || !k.alive || !k.scavenge) continue
    if (countRoom(world, k.id, 'scavenger') < 1) continue
    k.scavengeT -= dt
    if (k.scavengeT > 0) continue
    k.scavengeT = 36
    if (k.gold < 250) continue
    if (population(world, k.id) >= countRoom(world, k.id, 'lair')) continue
    const targetKind = k.scavenge
    if (!species(targetKind) || species(targetKind).side !== 'keeper' || targetKind === 'imp' || targetKind === 'reaper') continue
    k.gold -= 250
    const rival = world.creatures.find((c) => c.kind === targetKind && c.owner !== k.id && c.owner !== 0 && !c.dead && !c.imprisoned)
    if (rival) {
      rival.owner = k.id
      rival.happiness = 30
      rival.x = gx(world.width, k.portal) + 0.5
      rival.y = gy(world.width, k.portal) + 0.5
    } else if (k.portal >= 0) {
      spawnCreature(world, targetKind, k.id, gx(world.width, k.portal) + 0.5, gy(world.width, k.portal) + 0.5)
    }
    say(world, 'scavenger', 'The scavenger drags a creature into your halls.', 'scavenger', k.portal, 8)
  }
}

function tickWaves(world: World, dt: number): void {
  for (let i = 0; i < world.level.waves.length; i++) {
    const wave = world.level.waves[i]!
    if (world.waveOn[i] || world.time < wave.at) continue
    world.waveOn[i] = true
    const narration = wave.narration ?? (wave.party.some((p) => p.id === 'lord') ? 'lord' : 'heroes')
    const gate = world.gates[wave.gate] ?? world.gates[1] ?? -1
    say(world, narration === 'lord' ? 'lord' : 'heroes', wave.text, narration, gate, 0)
    ping(world, narration === 'lord' ? 'heart' : 'ui')
    let delay = 0
    for (const part of wave.party) {
      for (let n = 0; n < part.n; n++) {
        world.spawnQ.push({ kind: part.id, gate: wave.gate, at: world.time + delay })
        delay += 0.65
      }
    }
  }
  const remain: typeof world.spawnQ = []
  for (const s of world.spawnQ) {
    if (world.time < s.at) {
      remain.push(s)
      continue
    }
    const gate = world.gates[s.gate] ?? -1
    if (gate < 0) continue
    const c = spawnCreature(world, s.kind, 0, gx(world.width, gate) + 0.5, gy(world.width, gate) + 0.5)
    c.x += world.rand.next() * 0.4 - 0.2
    c.y += world.rand.next() * 0.4 - 0.2
  }
  world.spawnQ = remain
  void dt
}

function tickBoulders(world: World, dt: number): void {
  const next: typeof world.boulders = []
  for (const b of world.boulders) {
    b.x += b.dx * 6 * dt
    b.y += b.dy * 6 * dt
    b.left -= 6 * dt
    let hit = false
    for (const c of world.creatures) {
      if (!living(c) || c.owner === b.owner) continue
      if (Math.hypot(c.x - b.x, c.y - b.y) < 0.55) {
        c.hp -= b.dmg
        if (c.hp <= 0) down(world, c)
        hit = true
        ping(world, 'hit')
        break
      }
    }
    const t = tileAt(world, Math.floor(b.x), Math.floor(b.y))
    if (!t || !canStand(t, false)) hit = true
    if (!hit && b.left > 0) next.push(b)
  }
  world.boulders = next
}

function tickClouds(world: World, dt: number): void {
  const next: typeof world.clouds = []
  for (const cl of world.clouds) {
    cl.t -= dt
    for (const c of world.creatures) {
      if (!living(c) || c.owner === cl.owner) continue
      if (Math.hypot(c.x - cl.x, c.y - cl.y) <= cl.r) {
        c.hp -= cl.dps * dt
        if (c.hp <= 0) down(world, c)
      }
    }
    if (cl.t > 0) next.push(cl)
  }
  world.clouds = next
}

function recomputeVis(world: World): void {
  const w = world.width
  const h = world.height
  const dist = new Int16Array(w * h)
  dist.fill(-1)
  const q: number[] = []
  const push = (i: number, d: number) => {
    if (i < 0 || i >= w * h || d > 9) return
    if (dist[i]! !== -1 && dist[i]! <= d) return
    dist[i] = d
    q.push(i)
  }
  for (let i = 0; i < world.tiles.length; i++) {
    const t = world.tiles[i]!
    if (t.owner === 1 && canStand(t, false)) push(i, 0)
  }
  for (const c of world.creatures) {
    if (c.owner === 1 && !c.dead && !c.held) {
      const i = tindex(world, c)
      const bonus = c.guard >= 0 ? -2 : 0
      if (i >= 0) push(i, bonus)
    }
  }
  for (const s of world.sights) {
    if (s.until < world.time) continue
    forRadius(world, s.x, s.y, s.r, (i) => push(i, 0))
  }
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi]!
    const d = dist[cur]!
    const t = world.tiles[cur]!
    if (!canStand(t, true) && d > 0) continue
    const x = gx(w, cur)
    const y = gy(w, cur)
    for (const [dx, dy] of DIR4) {
      const nx = x + dx
      const ny = y + dy
      if (!inMap(w, h, nx, ny)) continue
      const ni = ix(w, nx, ny)
      const nb = world.tiles[ni]!
      if (!canStand(nb, true)) continue
      push(ni, d + 1)
    }
  }
  const next = new Uint8Array(w * h)
  let changed = false
  for (let i = 0; i < world.tiles.length; i++) {
    if (dist[i]! >= 0) {
      next[i] = 1
      world.revealed[i] = 1
      const x = gx(w, i)
      const y = gy(w, i)
      for (const [dx, dy] of DIR4) {
        if (!inMap(w, h, x + dx, y + dy)) continue
        const ni = ix(w, x + dx, y + dy)
        next[ni] = 1
        if (!world.revealed[ni]) {
          world.revealed[ni] = 1
          changed = true
        }
      }
    }
  }
  for (let i = 0; i < next.length; i++) if (next[i] !== world.visible[i]) changed = true
  world.visible = next
  if (changed) world.visRevision++
}

function powerOf(world: World, owner: number): number {
  let p = 20
  for (const c of world.creatures) {
    if (c.owner === owner && !c.dead && c.kind !== 'imp') p += c.hp * 0.4 + c.level * 12
  }
  return p
}

function tickAi(world: World, k: Keeper, dt: number): void {
  k.aiThink -= dt
  if (k.aiThink > 0) return
  k.aiThink = 1.5
  const imps = countKind(world, k.id, 'imp')
  const price = impPrice(world, k.id)
  if (imps < Math.min(12, 4 + Math.floor(countRoom(world, k.id, 'lair') / 4)) && k.gold >= price) summonImp(world, k.id)
  if (!k.researchTarget || k.unlocked.includes(k.researchTarget)) {
    const options = RESEARCH.filter((r) => !k.unlocked.includes(r.id) && r.requires.every((req) => k.unlocked.includes(req)))
    options.sort((a, b) => (a.kind === 'room' ? 0 : 1) - (b.kind === 'room' ? 0 : 1) || a.cost - b.cost)
    const next = options[0]
    if (next && countRoom(world, k.id, 'library') > 0) k.researchTarget = next.id
  }
  const plan: [string, number][] = [
    ['treasury', 9],
    ['lair', 10],
    ['hatchery', 8],
    ['training', 6],
    ['library', 9],
    ['workshop', 6],
    ['guard', 1],
    ['prison', 3],
    ['barracks', 4],
  ]
  for (const [type, want] of plan) {
    if (!k.unlocked.includes(type)) continue
    if (countRoom(world, k.id, type) >= want) continue
    if (tryGrowRoom(world, k, type)) break
  }
  const player = keeper(world, 1)
  if (!player) return
  const mine = k.gold < 2200 || countRoom(world, k.id, 'treasury') < 6
  if (!mine && world.time > 70 && powerOf(world, k.id) > powerOf(world, 1) * 0.8) tagToward(world, k, player.heart)
  else {
    const gold = nearestGold(world, k)
    if (gold >= 0) tagToward(world, k, gold)
    else tagFrontier(world, k)
  }
  if (k.unlocked.includes('wooden') && countRoom(world, k.id, 'workshop') > 0 && k.orders.filter((o) => o.status !== 'done').length < 1) {
    const spot = corridorTile(world, k.id)
    if (spot >= 0 && k.gold >= (GEAR.wooden?.cost ?? 999)) queueBuild(world, k.id, 'door', 'wooden', gx(world.width, spot), gy(world.width, spot))
  }
}

function tryGrowRoom(world: World, k: Keeper, type: string): boolean {
  let best = -1
  let bestScore = -1
  const w = world.width
  for (let i = 0; i < world.tiles.length; i++) {
    if (!canPlace(world, k.id, type, gx(w, i), gy(w, i))) continue
    let score = 0
    const x = gx(w, i)
    const y = gy(w, i)
    for (const [dx, dy] of DIR4) {
      const nb = tileAt(world, x + dx, y + dy)
      if (nb && nb.room === type && nb.owner === k.id) score += 5
      if (nb && nb.owner === k.id) score += 1
    }
    score -= manhattan(x, y, gx(w, k.heart), gy(w, k.heart)) * 0.05
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  if (best < 0) return false
  return placeRoom(world, k.id, type, gx(w, best), gy(w, best))
}

function nearestGold(world: World, k: Keeper): number {
  let best = -1
  let bestD = 1e9
  const hx = gx(world.width, k.heart)
  const hy = gy(world.width, k.heart)
  for (let i = 0; i < world.tiles.length; i++) {
    const t = world.tiles[i]!
    const isSeam = t.terrain === Terrain.Gold || t.terrain === Terrain.Gem
    const isPile = t.terrain === Terrain.Floor && t.gold > 0 && t.owner !== 1
    if (!isSeam && !isPile) continue
    const d = manhattan(hx, hy, gx(world.width, i), gy(world.width, i))
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

function tagFrontier(world: World, k: Keeper): void {
  const w = world.width
  for (let i = 0; i < world.tiles.length; i++) {
    const t = world.tiles[i]!
    if (t.terrain !== Terrain.Earth || t.tag) continue
    const x = gx(w, i)
    const y = gy(w, i)
    for (const [dx, dy] of DIR4) {
      const nb = tileAt(world, x + dx, y + dy)
      if (nb && nb.owner === k.id && canStand(nb, false)) {
        t.tag = 1
        t.tagOwner = k.id
        return
      }
    }
  }
}

function tagToward(world: World, k: Keeper, goal: number): void {
  const path = findPath(world.width, world.height, k.heart, goal, (i) => attackCost(world, k.id, i))
  if (!path) return
  for (const i of path) {
    const t = world.tiles[i]!
    if (t.terrain === Terrain.Earth || t.terrain === Terrain.Gold || t.terrain === Terrain.Gem) {
      t.tag = 1
      t.tagOwner = k.id
      const stand = standNear(world, k.id, i, gx(world.width, k.heart), gy(world.width, k.heart))
      if (stand >= 0) {
        k.rallyX = gx(world.width, stand)
        k.rallyY = gy(world.width, stand)
        k.rallyT = 10
      }
      return
    }
    if ((t.terrain === Terrain.Water || t.terrain === Terrain.Lava) && !t.bridge && k.unlocked.includes('bridge')) {
      if (placeRoom(world, k.id, 'bridge', gx(world.width, i), gy(world.width, i))) return
    }
    if (t.terrain === Terrain.Rock || (t.door && t.doorOwner !== k.id)) {
      k.rallyX = gx(world.width, i)
      k.rallyY = gy(world.width, i)
      k.rallyT = 10
      return
    }
  }
}

function corridorTile(world: World, owner: number): number {
  const w = world.width
  let best = -1
  let bestWalls = 0
  for (let i = 0; i < world.tiles.length; i++) {
    const t = world.tiles[i]!
    if (t.owner !== owner || t.terrain !== Terrain.Floor || t.room || t.door || t.heart || t.portal) continue
    let walls = 0
    const x = gx(w, i)
    const y = gy(w, i)
    for (const [dx, dy] of DIR4) {
      const nb = tileAt(world, x + dx, y + dy)
      if (nb && isSolid(nb.terrain)) walls++
    }
    if (walls >= 2 && walls > bestWalls) {
      bestWalls = walls
      best = i
    }
  }
  return best
}

function evalObjective(world: World, o: { type: string; amount?: number; room?: string; tiles?: number; count?: number }): boolean {
  switch (o.type) {
    case 'goldMined':
      return world.stats.goldMined >= (o.amount ?? 0)
    case 'room':
      return countRoom(world, 1, o.room ?? '') >= (o.tiles ?? 1)
    case 'population':
      return population(world, 1) >= (o.count ?? 1)
    case 'waves':
      return world.waveOn.every(Boolean) && !world.creatures.some((c) => c.owner === 0 && !c.dead)
    case 'lord':
      return world.stats.lordDead
    case 'heart':
      return world.stats.enemyHeartDead
    default:
      return false
  }
}

function tickObjectives(world: World): void {
  if (world.outcome !== 'playing') return
  const player = keeper(world, 1)
  if (player && !player.alive) {
    world.outcome = 'defeat'
    return
  }
  let all = world.objectives.length > 0
  for (const o of world.objectives) {
    const was = o.done
    o.done = evalObjective(world, o)
    if (!was && o.done) say(world, `obj_${o.id}`, o.text, null, -1, 0)
    if (!o.done) all = false
  }
  if (all) {
    world.outcome = 'victory'
    say(world, 'victory', 'It is done. The deep is yours.', 'victory', player?.heart ?? -1, 0)
    ping(world, 'win')
  }
}

export function step(world: World, dt: number): void {
  world.time += dt
  if (world.heartAlarm > 0) world.heartAlarm = Math.max(0, world.heartAlarm - dt)
  if (world.possessId && world.time > world.possessUntil) {
    const c = world.creature(world.possessId)
    if (c) c.possessed = false
    world.possessId = 0
  }
  tickWaves(world, dt)
  tickPayday(world, dt)
  tickRooms(world, dt)
  tickResearch(world, dt)
  tickCraft(world, dt)
  tickAttract(world, dt)
  tickScavenge(world, dt)
  world.assignAcc += dt
  if (world.assignAcc >= 0.3) {
    world.assignAcc = 0
    assignJobs(world)
  }
  for (const c of [...world.creatures]) tickCreature(world, c, dt)
  tickBoulders(world, dt)
  tickClouds(world, dt)
  world.visAcc += dt
  if (world.visAcc >= 0.3) {
    world.visAcc = 0
    recomputeVis(world)
  }
  for (const k of world.keepers) if (k?.ai && k.alive) tickAi(world, k, dt)
  tickObjectives(world)
  if (Math.floor(world.time) !== Math.floor(world.time - dt)) {
    world.creatures = world.creatures.filter((c) => !c.dead)
  }
  if (world.sights.length) world.sights = world.sights.filter((s) => s.until >= world.time)
}

export function boot(world: World): void {
  recomputeVis(world)
  const k = keeper(world, 1)
  if (k) {
    const x = gx(world.width, k.heart)
    const y = gy(world.width, k.heart)
    forRadius(world, x, y, 6, (i) => {
      world.revealed[i] = 1
    })
    say(world, 'welcome', world.level.briefing, world.level.id, k.heart, 0)
  }
  assignJobs(world)
}

function canPlace(world: World, owner: number, type: string, x: number, y: number): boolean {
  const t = tileAt(world, x, y)
  if (!t) return false
  if (type === 'bridge') {
    if (t.terrain !== Terrain.Water && t.terrain !== Terrain.Lava) return false
    if (t.bridge) return false
    let touch = false
    for (const [dx, dy] of DIR4) {
      const nb = tileAt(world, x + dx, y + dy)
      if (!nb) continue
      if ((nb.owner === owner && canStand(nb, false)) || nb.bridge) touch = true
    }
    return touch
  }
  if (t.terrain !== Terrain.Floor || t.owner !== owner || t.room || t.heart || t.portal || t.door) return false
  return true
}

export function placeRoom(world: World, owner: number, type: string, x: number, y: number): boolean {
  const k = keeper(world, owner)
  const def = ROOMS[type]
  if (!k || !def) return false
  if (!k.unlocked.includes(type)) {
    say(world, 'locked', 'You have not researched that yet.', 'locked', -1, 4)
    return false
  }
  if (!canPlace(world, owner, type, x, y)) return false
  if (k.gold < def.cost) {
    say(world, 'low_gold', 'Not enough gold.', 'low_gold', -1, 3)
    return false
  }
  const t = tileAt(world, x, y)!
  k.gold -= def.cost
  if (type === 'bridge') {
    t.bridge = true
    t.owner = owner
  }
  t.room = type
  rebuildRooms(world, owner)
  touch(world)
  ping(world, 'build')
  return true
}

export function sellTile(world: World, owner: number, x: number, y: number): boolean {
  const t = tileAt(world, x, y)
  const k = keeper(world, owner)
  if (!t || !k || t.owner !== owner) return false
  if (t.room) {
    const def = ROOMS[t.room]
    t.room = ''
    if (t.bridge && (t.terrain === Terrain.Water || t.terrain === Terrain.Lava)) {
      t.bridge = false
      t.owner = 0
    }
    if (def) k.gold += Math.round(def.cost * 0.5)
    rebuildRooms(world, owner)
    touch(world)
    ping(world, 'dig')
    return true
  }
  if (t.door && t.doorOwner === owner) {
    const gear = GEAR[t.door]
    t.door = ''
    t.doorHp = 0
    t.doorOwner = 0
    if (gear) k.gold += Math.round(gear.cost * 0.5)
    touch(world)
    return true
  }
  if (t.trap && t.trapOwner === owner) {
    const gear = GEAR[t.trap]
    t.trap = ''
    if (gear) k.gold += Math.round(gear.cost * 0.5)
    touch(world)
    return true
  }
  if (t.tag && t.tagOwner === owner) {
    t.tag = 0
    t.tagOwner = 0
    return true
  }
  return false
}

export function tagTiles(world: World, owner: number, x0: number, y0: number, x1: number, y1: number, mode: 'toggle' | 'set'): void {
  const xa = Math.min(x0, x1)
  const xb = Math.max(x0, x1)
  const ya = Math.min(y0, y1)
  const yb = Math.max(y0, y1)
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const t = tileAt(world, x, y)
      if (!t || !world.revealed[ix(world.width, x, y)]) continue
      const diggable = t.terrain === Terrain.Earth || t.terrain === Terrain.Gold || t.terrain === Terrain.Gem
      const wall = t.terrain === Terrain.Rock
      if (diggable) {
        if (mode === 'toggle' && t.tag === 1 && t.tagOwner === owner) {
          t.tag = 0
          t.tagOwner = 0
        } else {
          t.tag = 1
          t.tagOwner = owner
        }
      } else if (wall) {
        if (mode === 'toggle' && t.tag === 2 && t.tagOwner === owner) {
          t.tag = 0
          t.tagOwner = 0
        } else {
          t.tag = 2
          t.tagOwner = owner
        }
      }
    }
  }
  world.animDirty = true
  world.mapRevision++
  world.assignAcc = 1
}

export function summonImp(world: World, owner: number): boolean {
  const k = keeper(world, owner)
  if (!k || !k.alive) return false
  if (!k.unlocked.includes('create_imp')) {
    say(world, 'locked', 'You have not researched that yet.', 'locked', -1, 3)
    return false
  }
  const n = countKind(world, owner, 'imp')
  if (n >= 16) {
    say(world, 'imps', 'No more imps will answer.', null, k.heart, 6)
    return false
  }
  const cost = impPrice(world, owner)
  if (k.gold < cost) {
    say(world, 'low_gold', 'Not enough gold.', 'low_gold', -1, 3)
    return false
  }
  k.gold -= cost
  const hx = gx(world.width, k.heart)
  const hy = gy(world.width, k.heart)
  spawnCreature(world, 'imp', owner, hx + 0.5, hy + 0.5)
  ping(world, 'arrive')
  say(world, 'imps', 'Another imp crawls from the heart.', 'imps', k.heart, 6)
  return true
}

export function slap(world: World, id: number): void {
  const c = world.creature(id)
  if (!c || c.dead || c.unconscious > 0) return
  c.slap = 8
  c.happiness = Math.max(0, c.happiness - 12)
  c.anger = Math.min(100, c.anger + 17)
  ping(world, 'slap')
  say(world, `slap_${c.id}`, `You slap the ${species(c.kind).name}.`, null, tindex(world, c), 0.35)
  if (c.anger > 78) say(world, 'angry', `${species(c.kind).name} is furious.`, 'angry', tindex(world, c), 8)
}

export function holdCreature(world: World, id: number): void {
  const c = world.creature(id)
  if (!c || c.dead || c.owner === 0 && c.unconscious <= 0) {
    if (!c || c.dead) return
  }
  if (!c || c.dead) return
  if (c.owner !== 1 && c.unconscious <= 0 && c.owner !== 0) return
  if (c.kind === 'imp' || c.owner === 1 || c.unconscious > 0) {
    dropCarry(world, c)
    c.held = true
    c.path = []
    c.job = ''
    c.bash = -1
    c.mode = ''
    ping(world, 'pickup')
  }
}

export function dropCreature(world: World, id: number, x: number, y: number, sacrificeIt: boolean): boolean {
  const c = world.creature(id)
  if (!c) return false
  c.held = false
  const t = tileAt(world, x, y)
  if (!t || !canStand(t, species(c.kind).flying)) {
    const k = keeper(world, 1)
    if (k) {
      c.x = gx(world.width, k.heart) + 0.5
      c.y = gy(world.width, k.heart) + 0.5
    }
    return false
  }
  if (sacrificeIt && t.room === 'temple' && t.owner === c.owner && c.kind !== 'imp' && !species(c.kind).boss) {
    if (countRoom(world, c.owner, 'temple') < 9) {
      say(world, 'sacrifice', 'The temple is too small to drink a soul.', null, ix(world.width, x, y), 4)
    } else {
      const k = keeper(world, c.owner)
      c.dead = true
      if (k) k.evil += 8 + c.level * 4
      ping(world, 'spell')
      say(world, 'sacrifice', 'The temple drinks deep.', 'sacrifice', ix(world.width, x, y), 2)
      if (k && !world.creatures.some((o) => o.kind === 'reaper' && o.owner === k.id && !o.dead) && world.rand.next() < 0.62) {
        spawnCreature(world, 'reaper', k.id, x + 0.5, y + 0.5)
        say(world, 'reaper', 'The Horned Reaper walks your halls.', 'reaper', ix(world.width, x, y), 2)
      }
      return true
    }
  }
  c.x = x + 0.5
  c.y = y + 0.5
  c.guard = t.room === 'guard' && t.owner === c.owner ? ix(world.width, x, y) : -1
  if ((t.terrain === Terrain.Lava || t.terrain === Terrain.Water) && !t.bridge && !species(c.kind).flying) kill(world, c)
  ping(world, 'drop')
  return true
}

export function setResearch(world: World, owner: number, id: string): void {
  const k = keeper(world, owner)
  if (!k) return
  if (k.unlocked.includes(id)) return
  const def = RESEARCH_BY_ID[id]
  if (!def) return
  if (def.requires.some((r) => !k.unlocked.includes(r))) {
    say(world, 'locked', 'Something else must be researched first.', 'locked', -1, 3)
    return
  }
  k.researchTarget = id
}

export function shiftJob(world: World, owner: number, job: string, dir: -1 | 1): void {
  const k = keeper(world, owner)
  if (!k) return
  const i = k.jobs.indexOf(job)
  const j = i + dir
  if (i < 0 || j < 0 || j >= k.jobs.length) return
  const a = k.jobs[i]!
  k.jobs[i] = k.jobs[j]!
  k.jobs[j] = a
}

export function queueBuild(world: World, owner: number, kind: 'trap' | 'door', item: string, x: number, y: number): boolean {
  const k = keeper(world, owner)
  const gear = GEAR[item]
  const t = tileAt(world, x, y)
  if (!k || !gear || gear.kind !== kind || !t) return false
  if (!k.unlocked.includes(item)) {
    say(world, 'locked', 'You have not researched that yet.', 'locked', -1, 3)
    return false
  }
  if (countRoom(world, owner, 'workshop') < 1) {
    say(world, 'workshop', 'Build a workshop first.', null, -1, 4)
    return false
  }
  if (t.owner !== owner || t.terrain !== Terrain.Floor || t.heart || t.portal || t.door || t.trap || t.room) return false
  if (k.gold < gear.cost) {
    say(world, 'low_gold', 'Not enough gold.', 'low_gold', -1, 3)
    return false
  }
  k.gold -= gear.cost
  k.orders.push({ id: k.nextOrder++, kind, item, tile: ix(world.width, x, y), status: 'building', progress: 0, gold: gear.cost })
  ping(world, 'ui')
  return true
}

export function cancelOrder(world: World, owner: number, orderId: number): boolean {
  const k = keeper(world, owner)
  if (!k) return false
  const i = k.orders.findIndex((o) => o.id === orderId)
  if (i < 0) return false
  const order = k.orders[i]!
  if (order.status === 'carrying' || order.status === 'done') return false
  k.gold += order.gold
  k.orders.splice(i, 1)
  return true
}

export function setScavenge(world: World, owner: number, id: string): void {
  const k = keeper(world, owner)
  if (!k) return
  if (id && (species(id).side !== 'keeper' || id === 'imp' || id === 'reaper')) return
  k.scavenge = id
}

export function mendHeart(world: World, owner: number): boolean {
  const k = keeper(world, owner)
  if (!k || k.heart < 0) return false
  const t = world.tiles[k.heart]!
  if (t.hp >= t.maxHp) return false
  if (k.gold < 150) {
    say(world, 'low_gold', 'Not enough gold.', 'low_gold', -1, 3)
    return false
  }
  k.gold -= 150
  t.hp = Math.min(t.maxHp, t.hp + 320)
  ping(world, 'spell')
  say(world, 'mend', 'The heart knits, at a price.', 'mend', k.heart, 6)
  return true
}

export function castSpell(world: World, owner: number, id: string, x: number, y: number, creatureId = 0): boolean {
  const k = keeper(world, owner)
  const spell = SPELLS[id]
  if (!k || !spell) return false
  if (!k.unlocked.includes(id)) {
    say(world, 'locked', 'You have not researched that yet.', 'locked', -1, 3)
    return false
  }
  if (id === 'create_imp') return summonImp(world, owner)
  const cost = spell.cost
  if (k.gold < cost) {
    say(world, 'low_gold', 'Not enough gold.', 'low_gold', -1, 3)
    return false
  }
  const target = creatureId ? world.creature(creatureId) : creatureAt(world, x, y)
  let ok = false
  if (id === 'sight') {
    world.sights.push({ x, y, r: 8, until: world.time + 14 })
    forRadius(world, x, y, 8, (i) => {
      world.revealed[i] = 1
    })
    world.visAcc = 1
    ok = true
  } else if (id === 'speed' && target && target.owner === owner && !target.dead) {
    target.speedT = 16
    ok = true
  } else if (id === 'call_to_arms') {
    k.rallyX = x
    k.rallyY = y
    k.rallyT = 36
    ok = true
  } else if (id === 'possess' && target && target.owner === owner && living(target) && target.kind !== 'imp') {
    if (world.possessId) {
      const prev = world.creature(world.possessId)
      if (prev) prev.possessed = false
    }
    target.possessed = true
    world.possessId = target.id
    world.possessUntil = world.time + 28
    say(world, 'possess', 'You see through its eyes.', 'possess', tindex(world, target), 4)
    ok = true
  } else if (id === 'cave_in') {
    forRadius(world, x, y, 1.7, (i, t) => {
      if (t.heart || t.portal) return
      if (t.terrain === Terrain.Floor && !t.bridge) {
        for (const c of world.creatures) {
          if (tindex(world, c) === i && !c.dead) {
            c.hp -= 55
            if (c.hp <= 0) down(world, c)
          }
        }
        t.terrain = Terrain.Earth
        t.room = ''
        t.owner = 0
        t.hp = t.maxHp = 80
        t.gold = 0
        t.door = ''
        t.trap = ''
      }
    })
    rebuildRooms(world, owner)
    ok = true
    say(world, 'cavein', 'The ceiling answers.', 'cavein', ix(world.width, x, y), 4)
  } else if (id === 'heal' && target && target.owner === owner && !target.dead) {
    if (target.unconscious > 0) {
      target.unconscious = 0
      target.hp = target.maxHp * 0.45
    } else target.hp = Math.min(target.maxHp, target.hp + target.maxHp * 0.5)
    ok = true
  } else if (id === 'lightning') {
    hurtHostiles(world, owner, x + 0.5, y + 0.5, 2.15, 64)
    ok = true
    ping(world, 'thunder')
  } else if (id === 'protect' && target && target.owner === owner && !target.dead) {
    target.shield = 100
    ok = true
  } else if (id === 'hold_audience') {
    for (const c of world.creatures) {
      if (c.owner === owner && !c.dead && c.kind !== 'imp') {
        c.happiness = Math.min(100, c.happiness + 24)
        c.anger = Math.max(0, c.anger - 14)
      }
    }
    say(world, 'audience', 'For a moment, they adore you.', 'audience', k.heart, 6)
    ok = true
  } else if (id === 'chicken' && target && target.owner !== owner && living(target)) {
    if (species(target.kind).boss || target.kind === 'reaper') {
      say(world, 'chicken', 'The spell slides off.', null, tindex(world, target), 4)
      return false
    }
    target.chickenHp = target.maxHp
    target.chicken = 12
    target.maxHp = 14
    target.hp = 14
    target.path = []
    ok = true
  } else if (id === 'disease' && target && target.owner !== owner && living(target)) {
    target.disease = 10
    target.spread = false
    ok = true
  } else if (id === 'destroy_walls') {
    forRadius(world, x, y, 2.1, (i, t) => {
      if (isSolid(t.terrain)) damageTile(world, i, 240, null)
    })
    ok = true
  } else if (id === 'armageddon') {
    for (const c of world.creatures) {
      if (c.dead || c.kind === 'imp') continue
      c.berserk = 22
      if (c.imprisoned) {
        c.imprisoned = false
        c.unconscious = 0
        c.hp = Math.max(10, c.maxHp * 0.4)
      }
    }
    say(world, 'armageddon', 'Armageddon. Every soul answers in blood.', 'armageddon', k.heart, 4)
    ok = true
  }
  if (!ok) return false
  k.gold -= cost
  ping(world, id === 'lightning' || id === 'destroy_walls' ? 'thunder' : 'spell')
  touch(world)
  return true
}

function creatureAt(world: World, x: number, y: number): Creature | undefined {
  let best: Creature | undefined
  let bestD = 0.7
  for (const c of world.creatures) {
    if (c.dead) continue
    const d = Math.hypot(c.x - (x + 0.5), c.y - (y + 0.5))
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best
}
